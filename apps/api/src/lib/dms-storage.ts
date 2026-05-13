import path from 'path';
import fs from 'fs';
import { prisma } from './prisma.js';
import { logger } from './logger.js';

// ===== Storage Interface =====

export interface StorageResult {
  storagePath: string; // identifier: local path or Drive file ID
}

interface StorageBackend {
  upload(file: Express.Multer.File, folderPath: string): Promise<StorageResult>;
  download(storagePath: string): Promise<{ stream: NodeJS.ReadableStream; contentType?: string }>;
  delete(storagePath: string): Promise<void>;
  createFolder(name: string, parentPath: string | null): Promise<string>; // returns folder identifier
}

// ===== Config Helpers =====

async function getConfig(): Promise<{
  type: 'LOCAL' | 'GOOGLE_DRIVE';
  localPath: string;
  googleCredentials: string | null;
  googleFolderId: string | null;
}> {
  const rows = await prisma.appConfig.findMany({
    where: { key: { in: ['dms_storage_type', 'dms_local_path', 'dms_google_credentials', 'dms_google_folder_id'] } },
  });
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  return {
    type: (cfg.dms_storage_type === 'GOOGLE_DRIVE' ? 'GOOGLE_DRIVE' : 'LOCAL') as 'LOCAL' | 'GOOGLE_DRIVE',
    localPath: cfg.dms_local_path || path.resolve(process.cwd(), '../../uploads/documents'),
    googleCredentials: cfg.dms_google_credentials || null,
    googleFolderId: cfg.dms_google_folder_id || null,
  };
}

// ===== Local Storage Backend =====

const localBackend: StorageBackend = {
  async upload(file, _folderPath) {
    const cfg = await getConfig();
    const uploadDir = cfg.localPath;
    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

    const destName = path.basename(file.path);
    const destPath = path.join(uploadDir, destName);

    // If multer already saved to the right place, no move needed
    if (file.path !== destPath) {
      fs.copyFileSync(file.path, destPath);
      fs.unlinkSync(file.path);
    }

    return { storagePath: destName };
  },

  async download(storagePath) {
    const cfg = await getConfig();
    const filePath = path.join(cfg.localPath, storagePath);
    if (!fs.existsSync(filePath)) throw new Error('File not found on disk');
    return { stream: fs.createReadStream(filePath) };
  },

  async delete(storagePath) {
    const cfg = await getConfig();
    const filePath = path.join(cfg.localPath, storagePath);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  },

  async createFolder(_name, _parentPath) {
    // Local storage doesn't create real folders — files are flat with ULID names
    return 'local';
  },
};

// ===== Google Drive Storage Backend =====

async function getDriveAuth() {
  const cfg = await getConfig();
  if (!cfg.googleCredentials) throw new Error('Google Drive credentials not configured. Go to System → Configuration.');
  const { google } = await import('googleapis');

  let credentials;
  try {
    credentials = JSON.parse(cfg.googleCredentials);
  } catch {
    throw new Error('Google Drive credentials JSON is invalid. Check System → Configuration.');
  }

  let auth;
  if (credentials.type === 'service_account') {
    // Service account auth (works with Workspace / Shared Drives)
    auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
  } else if (credentials.client_id && credentials.client_secret && credentials.refresh_token) {
    // OAuth 2.0 with refresh token (works with personal Google accounts)
    const oauth2 = new google.auth.OAuth2(
      credentials.client_id,
      credentials.client_secret,
    );
    oauth2.setCredentials({ refresh_token: credentials.refresh_token });
    auth = oauth2;
  } else {
    throw new Error('Invalid credentials format. Provide either a service account JSON key or OAuth credentials with client_id, client_secret, and refresh_token.');
  }

  const drive = google.drive({ version: 'v3', auth });
  return { drive, rootFolderId: cfg.googleFolderId };
}

function handleDriveError(err: unknown): never {
  const msg = (err as { message?: string })?.message ?? String(err);
  if (msg.includes('has not been used in project') || msg.includes('is disabled')) {
    throw new Error('Google Drive API is not enabled in your Google Cloud project. Enable it at console.cloud.google.com → APIs & Services → Enable Drive API.');
  }
  if (msg.includes('storage quota') || msg.includes('do not have storage')) {
    throw new Error('Service accounts cannot upload files to personal Google Drive (no storage quota). Use OAuth credentials instead: provide a JSON with client_id, client_secret, and refresh_token in System → Configuration. See docs/guides/external-services-setup.md.');
  }
  if (msg.includes('403') || msg.includes('Forbidden')) {
    throw new Error('Google Drive access denied. Ensure the account has access to the target folder and Drive API is enabled.');
  }
  if (msg.includes('404') || msg.includes('not found')) {
    throw new Error('Google Drive folder not found. Check the Root Folder ID in System → Configuration.');
  }
  logger.error({ err: msg }, 'Google Drive error');
  throw new Error(`Google Drive error: ${msg}`);
}

const driveBackend: StorageBackend = {
  async upload(file, folderDriveId) {
    const { drive, rootFolderId } = await getDriveAuth();
    const fileStream = fs.createReadStream(file.path);

    // Use the folder's Drive ID if available, otherwise fall back to root
    const targetFolderId = folderDriveId?.replace('gdrive:', '') || rootFolderId;
    const parents = targetFolderId ? [targetFolderId] : [];
    let res;
    try {
      res = await drive.files.create({
        requestBody: {
          name: file.originalname,
          parents,
        },
        media: {
          mimeType: file.mimetype,
          body: fileStream,
        },
        fields: 'id',
      });
    } catch (err) {
      fs.unlinkSync(file.path);
      handleDriveError(err);
    }

    // Clean up temp file
    fs.unlinkSync(file.path);

    const driveFileId = res.data.id!;
    logger.info({ driveFileId, fileName: file.originalname }, 'Uploaded to Google Drive');
    return { storagePath: `gdrive:${driveFileId}` };
  },

  async download(storagePath) {
    const fileId = storagePath.replace('gdrive:', '');
    const { drive } = await getDriveAuth();

    const res = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' },
    );

    return { stream: res.data as unknown as NodeJS.ReadableStream };
  },

  async delete(storagePath) {
    const fileId = storagePath.replace('gdrive:', '');
    const { drive } = await getDriveAuth();
    try {
      await drive.files.delete({ fileId });
      logger.info({ fileId }, 'Deleted from Google Drive');
    } catch (err) {
      logger.warn({ fileId, err }, 'Failed to delete from Google Drive');
    }
  },

  async createFolder(name, parentPath) {
    const { drive, rootFolderId } = await getDriveAuth();
    const parents = parentPath && parentPath !== 'local'
      ? [parentPath.replace('gdrive:', '')]
      : rootFolderId ? [rootFolderId] : [];

    try {
      const res = await drive.files.create({
        requestBody: {
          name,
          mimeType: 'application/vnd.google-apps.folder',
          parents,
        },
        fields: 'id',
      });

      logger.info({ driveId: res.data.id, name }, 'Created folder in Google Drive');
      return `gdrive:${res.data.id}`;
    } catch (err) {
      handleDriveError(err);
    }
  },
};

// ===== Folder Resolution =====

/**
 * Resolve a folder hint to a GDrive folder ID.
 * Hints: 'company', 'tender:{id}', 'project:{id}', 'opportunity:{id}', 'expense:{id}',
 *        'travel:{id}:tickets', 'travel:{id}:hotels', 'travel:{id}:expenses'
 * For DMS docs, the hint is the folder's driveId directly (gdrive:xxx or empty).
 * Falls back to root folder if resolution fails.
 */
async function resolveFolderHint(hint: string): Promise<string> {
  if (!hint || hint === 'local') return '';
  if (hint.startsWith('gdrive:')) return hint; // already a drive ID

  const { drive, rootFolderId } = await getDriveAuth();
  if (!rootFolderId) return '';

  async function findSubfolder(parentId: string, name: string): Promise<string | null> {
    try {
      const res = await drive.files.list({
        q: `'${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false and name contains '${name.replace(/'/g, "\\'")}'`,
        fields: 'files(id,name)',
        spaces: 'drive',
      });
      return res.data.files?.[0]?.id ?? null;
    } catch {
      return null;
    }
  }

  try {
    const sharedId = await findSubfolder(rootFolderId, 'Shared');
    if (!sharedId) return rootFolderId;

    if (hint === 'company') {
      const id = await findSubfolder(sharedId, 'Company');
      return id ? `gdrive:${id}` : `gdrive:${sharedId}`;
    }

    const parts = hint.split(':');

    // Auto-create entity subfolders: Shared/{EntityType}/{id}/
    const ENTITY_FOLDERS: Record<string, string> = {
      tender: 'Tenders',
      project: 'Projects',
      opportunity: 'Opportunities',
      initiative: 'Initiatives',
      expense: 'Expenses',
      po: 'PurchaseOrders',
      grn: 'GRN',
      quotation: 'Quotations',
    };

    if (ENTITY_FOLDERS[parts[0]!] && parts[1]) {
      const parentName = ENTITY_FOLDERS[parts[0]!]!;
      let parentId = await findSubfolder(sharedId, parentName);
      if (!parentId) {
        // Auto-create the parent folder (e.g. "Opportunities")
        const res = await drive.files.create({
          requestBody: { name: parentName, mimeType: 'application/vnd.google-apps.folder', parents: [sharedId] },
          fields: 'id',
        });
        parentId = res.data.id!;
        logger.info({ parentName, parentId }, 'Auto-created GDrive entity folder');
      }
      let entityFolder = await findSubfolder(parentId, parts[1]);
      if (!entityFolder) {
        // Auto-create the per-ID folder (e.g. "Opportunities/01KP...")
        const res = await drive.files.create({
          requestBody: { name: parts[1], mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
          fields: 'id',
        });
        entityFolder = res.data.id!;
        logger.info({ entityType: parts[0], entityId: parts[1], folderId: entityFolder }, 'Auto-created GDrive entity subfolder');
      }
      return `gdrive:${entityFolder}`;
    }

    if (parts[0] === 'travel' && parts[1]) {
      const travelId = await findSubfolder(sharedId, 'Travel');
      if (!travelId) return `gdrive:${sharedId}`;
      const planFolder = await findSubfolder(travelId, parts[1]);
      if (!planFolder) return `gdrive:${travelId}`;
      if (parts[2]) {
        // Sub-folder: tickets, hotels, expenses
        const subName = parts[2].charAt(0).toUpperCase() + parts[2].slice(1);
        const subFolder = await findSubfolder(planFolder, subName);
        return subFolder ? `gdrive:${subFolder}` : `gdrive:${planFolder}`;
      }
      return `gdrive:${planFolder}`;
    }
  } catch (err) {
    logger.warn({ hint, err }, 'Failed to resolve folder hint, falling back to root');
  }

  return '';
}

// ===== Public API =====

async function getBackend(): Promise<StorageBackend> {
  const cfg = await getConfig();
  return cfg.type === 'GOOGLE_DRIVE' ? driveBackend : localBackend;
}

export async function uploadFile(file: Express.Multer.File, folderPath: string = ''): Promise<StorageResult> {
  const backend = await getBackend();
  // Resolve folder hints to actual GDrive folder IDs
  const cfg = await getConfig();
  let resolvedFolder = folderPath;
  if (cfg.type === 'GOOGLE_DRIVE' && folderPath && !folderPath.startsWith('gdrive:')) {
    resolvedFolder = await resolveFolderHint(folderPath);
  }
  return backend.upload(file, resolvedFolder);
}

export async function downloadFile(storagePath: string): Promise<{ stream: NodeJS.ReadableStream; contentType?: string }> {
  const backend = await getBackend();
  return backend.download(storagePath);
}

export async function deleteFile(storagePath: string): Promise<void> {
  const backend = await getBackend();
  return backend.delete(storagePath);
}

export async function createDriveFolder(name: string, parentPath: string | null): Promise<string> {
  const backend = await getBackend();
  return backend.createFolder(name, parentPath);
}

export async function getStorageType(): Promise<'LOCAL' | 'GOOGLE_DRIVE'> {
  const cfg = await getConfig();
  return cfg.type;
}

/**
 * Smart download that handles both legacy local paths and gdrive: paths.
 * For legacy local paths, falls back to a specific local directory.
 */
export async function downloadFileWithFallback(
  storagePath: string,
  legacyLocalDir: string,
): Promise<{ stream: NodeJS.ReadableStream; contentType?: string }> {
  if (storagePath.startsWith('gdrive:')) {
    const backend = await getBackend();
    return backend.download(storagePath);
  }
  // Legacy local file — read from the original directory
  const filePath = path.join(legacyLocalDir, storagePath);
  if (!fs.existsSync(filePath)) throw new Error('File not found on disk');
  return { stream: fs.createReadStream(filePath) };
}

/**
 * Smart delete that handles both legacy local paths and gdrive: paths.
 */
export async function deleteFileWithFallback(
  storagePath: string,
  legacyLocalDir: string,
): Promise<void> {
  if (storagePath.startsWith('gdrive:')) {
    const backend = await getBackend();
    return backend.delete(storagePath);
  }
  // Legacy local file
  const filePath = path.join(legacyLocalDir, storagePath);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}
