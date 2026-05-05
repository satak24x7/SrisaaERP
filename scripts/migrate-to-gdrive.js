#!/usr/bin/env node
/**
 * migrate-to-gdrive.js
 *
 * One-time migration script that:
 *   1. Creates the full GDrive folder structure under the configured root folder
 *   2. Uploads all existing local files to the correct GDrive folders
 *   3. Updates DB storagePath from local filenames to gdrive:{fileId}
 *
 * Usage:
 *   node scripts/migrate-to-gdrive.js [--dry-run] [--folders-only] [--skip-folders]
 *
 * Options:
 *   --dry-run       Print what would happen without making changes
 *   --folders-only  Only create folders, don't upload files
 *   --skip-folders  Skip folder creation, only upload files (folders must exist)
 *
 * Prerequisites:
 *   - Google Drive OAuth credentials configured in app_config (dms_google_credentials)
 *   - Root folder ID configured in app_config (dms_google_folder_id)
 *   - Storage type set to GOOGLE_DRIVE in app_config (dms_storage_type)
 *   - MySQL running and accessible via DATABASE_URL
 */

const fs = require('fs');
const path = require('path');

// Resolve modules from the API workspace where they're installed
const apiNodeModules = path.resolve(__dirname, '../apps/api/node_modules');
const rootNodeModules = path.resolve(__dirname, '../node_modules');

function requireFrom(mod) {
  // Try API workspace first, then root
  try { return require(path.join(apiNodeModules, mod)); } catch {}
  try { return require(path.join(rootNodeModules, mod)); } catch {}
  return require(mod); // fallback to normal resolution
}

const { PrismaClient } = requireFrom('@prisma/client');
const { google } = requireFrom('googleapis');

const prisma = new PrismaClient();

// Parse CLI args
const args = process.argv.slice(2);
const DRY_RUN = args.includes('--dry-run');
const FOLDERS_ONLY = args.includes('--folders-only');
const SKIP_FOLDERS = args.includes('--skip-folders');

// Local upload directories (relative to project root)
const PROJECT_ROOT = path.resolve(__dirname, '..');
const LOCAL_DIRS = {
  company: path.join(PROJECT_ROOT, 'uploads/company-docs'),
  tender: path.join(PROJECT_ROOT, 'uploads/tender-docs'),
  project: path.join(PROJECT_ROOT, 'uploads/project-docs'),
  expense: path.join(PROJECT_ROOT, 'uploads/expense-sheets'),
  travelTickets: path.join(PROJECT_ROOT, 'uploads/travel/tickets'),
  travelHotels: path.join(PROJECT_ROOT, 'uploads/travel/hotels'),
  travelExpenses: path.join(PROJECT_ROOT, 'uploads/travel/expenses'),
  travelExpensesAlt: path.join(PROJECT_ROOT, 'uploads/travel-expenses'),
  documents: path.join(PROJECT_ROOT, 'uploads/documents'),
};

// Track created folder IDs for reuse
const folderIdCache = new Map(); // key: path string -> value: GDrive folder ID

// ===== Google Drive Auth =====

async function getDriveClient() {
  const rows = await prisma.appConfig.findMany({
    where: { key: { in: ['dms_google_credentials', 'dms_google_folder_id', 'dms_storage_type'] } },
  });
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));

  if (cfg.dms_storage_type !== 'GOOGLE_DRIVE') {
    throw new Error('Storage type is not GOOGLE_DRIVE. Set dms_storage_type to GOOGLE_DRIVE in app_config first.');
  }
  if (!cfg.dms_google_credentials) {
    throw new Error('Google Drive credentials not configured in app_config.');
  }
  if (!cfg.dms_google_folder_id) {
    throw new Error('Google Drive root folder ID not configured in app_config.');
  }

  const creds = JSON.parse(cfg.dms_google_credentials);
  let auth;
  if (creds.client_id && creds.client_secret && creds.refresh_token) {
    const oauth2 = new google.auth.OAuth2(creds.client_id, creds.client_secret);
    oauth2.setCredentials({ refresh_token: creds.refresh_token });
    auth = oauth2;
  } else if (creds.type === 'service_account') {
    auth = new google.auth.GoogleAuth({ credentials: creds, scopes: ['https://www.googleapis.com/auth/drive'] });
  } else {
    throw new Error('Invalid credentials format.');
  }

  const drive = google.drive({ version: 'v3', auth });
  return { drive, rootFolderId: cfg.dms_google_folder_id };
}

// ===== Folder Creation =====

async function createDriveFolder(drive, name, parentId) {
  const cacheKey = `${parentId}/${name}`;
  if (folderIdCache.has(cacheKey)) return folderIdCache.get(cacheKey);

  if (DRY_RUN) {
    const fakeId = `dry_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    console.log(`  [DRY] Would create folder: ${name} under ${parentId}`);
    folderIdCache.set(cacheKey, fakeId);
    return fakeId;
  }

  // Check if folder already exists (idempotent)
  const existing = await drive.files.list({
    q: `name='${name.replace(/'/g, "\\'")}' and '${parentId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: 'files(id,name)',
    spaces: 'drive',
  });

  if (existing.data.files && existing.data.files.length > 0) {
    const id = existing.data.files[0].id;
    console.log(`  [EXISTS] ${name} -> ${id}`);
    folderIdCache.set(cacheKey, id);
    return id;
  }

  const res = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id',
  });

  const id = res.data.id;
  console.log(`  [CREATED] ${name} -> ${id}`);
  folderIdCache.set(cacheKey, id);
  return id;
}

async function createFolderTree(drive, rootFolderId) {
  console.log('\n=== Creating GDrive Folder Structure ===\n');
  console.log(`Root folder: ${rootFolderId}`);

  // Level 1: Shared & Private
  const sharedId = await createDriveFolder(drive, 'Shared', rootFolderId);
  const privateId = await createDriveFolder(drive, 'Private', rootFolderId);

  // Level 2 under Shared: category folders
  const companyId = await createDriveFolder(drive, 'Company', sharedId);
  const tendersId = await createDriveFolder(drive, 'Tenders', sharedId);
  const projectsId = await createDriveFolder(drive, 'Projects', sharedId);
  const expensesId = await createDriveFolder(drive, 'Expenses', sharedId);
  const travelId = await createDriveFolder(drive, 'Travel', sharedId);
  const generalId = await createDriveFolder(drive, 'General', sharedId);

  // Level 3: Per-tender folders
  console.log('\n--- Tender folders ---');
  const tenders = await prisma.tender.findMany({
    where: { deletedAt: null },
    select: { id: true, tenderNumber: true, tenderTitle: true },
  });
  const tenderFolderMap = new Map(); // tenderId -> driveId
  for (const t of tenders) {
    const name = `${t.id} - ${(t.tenderTitle || t.tenderNumber || 'Untitled').slice(0, 80)}`;
    const fid = await createDriveFolder(drive, sanitizeName(name), tendersId);
    tenderFolderMap.set(t.id, fid);
  }

  // Level 3: Per-project folders
  console.log('\n--- Project folders ---');
  const projects = await prisma.project.findMany({
    where: { deletedAt: null },
    select: { id: true, projectCode: true, name: true },
  });
  const projectFolderMap = new Map(); // projectId -> driveId
  for (const p of projects) {
    const name = `${p.id} - ${(p.projectCode ? p.projectCode + ' ' : '')}${p.name}`.slice(0, 100);
    const fid = await createDriveFolder(drive, sanitizeName(name), projectsId);
    projectFolderMap.set(p.id, fid);
  }

  // Level 3: Per-expense-sheet folders
  console.log('\n--- Expense sheet folders ---');
  const sheets = await prisma.expenseSheet.findMany({
    where: { deletedAt: null },
    select: { id: true, title: true },
  });
  const expenseFolderMap = new Map();
  for (const s of sheets) {
    const name = `${s.id} - ${(s.title || 'Untitled').slice(0, 80)}`;
    const fid = await createDriveFolder(drive, sanitizeName(name), expensesId);
    expenseFolderMap.set(s.id, fid);
  }

  // Level 3: Per-travel-plan folders with sub-folders
  console.log('\n--- Travel plan folders ---');
  const plans = await prisma.travelPlan.findMany({
    where: { deletedAt: null },
    select: { id: true, title: true },
  });
  const travelFolderMap = new Map(); // travelPlanId -> { root, tickets, hotels, expenses }
  for (const tp of plans) {
    const name = `${tp.id} - ${(tp.title || 'Untitled').slice(0, 80)}`;
    const tpId = await createDriveFolder(drive, sanitizeName(name), travelId);
    const ticketsId = await createDriveFolder(drive, 'Tickets', tpId);
    const hotelsId = await createDriveFolder(drive, 'Hotels', tpId);
    const expId = await createDriveFolder(drive, 'Expenses', tpId);
    travelFolderMap.set(tp.id, { root: tpId, tickets: ticketsId, hotels: hotelsId, expenses: expId });
  }

  // Level 3: Per-user private folders
  console.log('\n--- Private user folders ---');
  const users = await prisma.user.findMany({
    where: { deletedAt: null },
    select: { id: true, fullName: true, email: true },
  });
  const userFolderMap = new Map(); // userId -> driveId
  for (const u of users) {
    const name = `${u.fullName || u.email || 'User'} (${u.id})`;
    const fid = await createDriveFolder(drive, sanitizeName(name), privateId);
    userFolderMap.set(u.id, fid);
  }

  // Update DMS DocumentFolder records with driveId for existing shared folders
  console.log('\n--- Updating DMS folder driveIds ---');
  const dmsFolders = await prisma.documentFolder.findMany({ where: { deletedAt: null } });
  for (const df of dmsFolders) {
    if (df.driveId) continue; // already has a driveId

    let parentDriveId;
    if (df.scope === 'SHARED') {
      parentDriveId = df.parentId
        ? dmsFolders.find((f) => f.id === df.parentId)?.driveId || generalId
        : generalId;
    } else {
      // PERSONAL — create under user's private folder
      parentDriveId = df.ownerUserId ? userFolderMap.get(df.ownerUserId) : privateId;
      if (!parentDriveId) parentDriveId = privateId;
    }

    const driveFolderId = await createDriveFolder(drive, sanitizeName(df.name), parentDriveId);
    if (!DRY_RUN) {
      await prisma.documentFolder.update({ where: { id: df.id }, data: { driveId: driveFolderId } });
    }
    // Update in-memory for child folders
    df.driveId = driveFolderId;
  }

  return {
    sharedId, privateId, companyId, tendersId, projectsId, expensesId, travelId, generalId,
    tenderFolderMap, projectFolderMap, expenseFolderMap, travelFolderMap, userFolderMap,
  };
}

// ===== File Upload =====

async function uploadFileToDrive(drive, localPath, fileName, mimeType, parentFolderId) {
  if (!fs.existsSync(localPath)) {
    console.log(`    [SKIP] File not found: ${localPath}`);
    return null;
  }

  if (DRY_RUN) {
    console.log(`    [DRY] Would upload: ${fileName} -> folder ${parentFolderId}`);
    return `gdrive:dry_${Date.now()}`;
  }

  const fileStream = fs.createReadStream(localPath);
  const res = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [parentFolderId],
    },
    media: {
      mimeType: mimeType || 'application/octet-stream',
      body: fileStream,
    },
    fields: 'id',
  });

  const driveFileId = res.data.id;
  console.log(`    [UPLOADED] ${fileName} -> gdrive:${driveFileId}`);
  return `gdrive:${driveFileId}`;
}

async function migrateFiles(drive, folders) {
  console.log('\n=== Migrating Files to GDrive ===\n');

  let uploaded = 0;
  let skipped = 0;
  let errors = 0;

  // --- 1. Company Documents ---
  console.log('--- Company Documents ---');
  const companyDocs = await prisma.companyDocument.findMany({ where: { deletedAt: null } });
  for (const doc of companyDocs) {
    if (doc.storagePath.startsWith('gdrive:')) { skipped++; continue; }
    try {
      const localPath = path.join(LOCAL_DIRS.company, doc.storagePath);
      const driveId = await uploadFileToDrive(drive, localPath, doc.fileName, doc.mimeType, folders.companyId);
      if (driveId && !DRY_RUN) {
        await prisma.companyDocument.update({ where: { id: doc.id }, data: { storagePath: driveId } });
      }
      uploaded++;
    } catch (e) {
      console.error(`    [ERROR] ${doc.fileName}: ${e.message}`);
      errors++;
    }
  }

  // --- 2. Tender Documents ---
  console.log('\n--- Tender Documents ---');
  const tenderDocs = await prisma.tenderDocument.findMany({ where: { deletedAt: null }, include: { tender: { select: { id: true } } } });
  for (const doc of tenderDocs) {
    if (doc.storagePath.startsWith('gdrive:')) { skipped++; continue; }
    try {
      const folderId = folders.tenderFolderMap.get(doc.tenderId);
      if (!folderId) { console.log(`    [SKIP] No folder for tender ${doc.tenderId}`); skipped++; continue; }
      const localPath = path.join(LOCAL_DIRS.tender, doc.storagePath);
      const driveId = await uploadFileToDrive(drive, localPath, doc.fileName, doc.mimeType, folderId);
      if (driveId && !DRY_RUN) {
        await prisma.tenderDocument.update({ where: { id: doc.id }, data: { storagePath: driveId } });
      }
      uploaded++;
    } catch (e) {
      console.error(`    [ERROR] ${doc.fileName}: ${e.message}`);
      errors++;
    }
  }

  // --- 3. Project Documents ---
  console.log('\n--- Project Documents ---');
  const projectDocs = await prisma.projectDocument.findMany({ where: { deletedAt: null } });
  for (const doc of projectDocs) {
    if (doc.storagePath.startsWith('gdrive:')) { skipped++; continue; }
    try {
      const folderId = folders.projectFolderMap.get(doc.projectId);
      if (!folderId) { console.log(`    [SKIP] No folder for project ${doc.projectId}`); skipped++; continue; }
      const localPath = path.join(LOCAL_DIRS.project, doc.storagePath);
      const driveId = await uploadFileToDrive(drive, localPath, doc.fileName, doc.mimeType, folderId);
      if (driveId && !DRY_RUN) {
        await prisma.projectDocument.update({ where: { id: doc.id }, data: { storagePath: driveId } });
      }
      uploaded++;
    } catch (e) {
      console.error(`    [ERROR] ${doc.fileName}: ${e.message}`);
      errors++;
    }
  }

  // --- 4. Expense Line Attachments ---
  console.log('\n--- Expense Line Attachments ---');
  const expenseLines = await prisma.expenseLine.findMany({
    where: { deletedAt: null, attachmentPath: { not: null } },
    include: { sheet: { select: { id: true } } },
  });
  for (const line of expenseLines) {
    if (!line.attachmentPath || line.attachmentPath.startsWith('gdrive:')) { skipped++; continue; }
    try {
      const folderId = folders.expenseFolderMap.get(line.sheetId);
      if (!folderId) { console.log(`    [SKIP] No folder for sheet ${line.sheetId}`); skipped++; continue; }
      const localPath = path.join(LOCAL_DIRS.expense, line.attachmentPath);
      const driveId = await uploadFileToDrive(drive, localPath, line.attachmentName || line.attachmentPath, 'application/octet-stream', folderId);
      if (driveId && !DRY_RUN) {
        await prisma.expenseLine.update({ where: { id: line.id }, data: { attachmentPath: driveId } });
      }
      uploaded++;
    } catch (e) {
      console.error(`    [ERROR] Expense line ${line.id}: ${e.message}`);
      errors++;
    }
  }

  // --- 5. Travel Plan Tickets ---
  console.log('\n--- Travel Tickets ---');
  const tickets = await prisma.travelPlanTicket.findMany({
    where: { deletedAt: null, attachmentPath: { not: null } },
  });
  for (const t of tickets) {
    if (!t.attachmentPath || t.attachmentPath.startsWith('gdrive:')) { skipped++; continue; }
    try {
      const travelFolders = folders.travelFolderMap.get(t.travelPlanId);
      if (!travelFolders) { console.log(`    [SKIP] No folder for travel plan ${t.travelPlanId}`); skipped++; continue; }
      const localPath = path.join(LOCAL_DIRS.travelTickets, t.attachmentPath);
      const driveId = await uploadFileToDrive(drive, localPath, t.attachmentName || t.attachmentPath, 'application/octet-stream', travelFolders.tickets);
      if (driveId && !DRY_RUN) {
        await prisma.travelPlanTicket.update({ where: { id: t.id }, data: { attachmentPath: driveId } });
      }
      uploaded++;
    } catch (e) {
      console.error(`    [ERROR] Ticket ${t.id}: ${e.message}`);
      errors++;
    }
  }

  // --- 6. Travel Plan Hotels ---
  console.log('\n--- Travel Hotels ---');
  const hotels = await prisma.travelPlanHotel.findMany({
    where: { deletedAt: null, attachmentPath: { not: null } },
  });
  for (const h of hotels) {
    if (!h.attachmentPath || h.attachmentPath.startsWith('gdrive:')) { skipped++; continue; }
    try {
      const travelFolders = folders.travelFolderMap.get(h.travelPlanId);
      if (!travelFolders) { console.log(`    [SKIP] No folder for travel plan ${h.travelPlanId}`); skipped++; continue; }
      const localPath = path.join(LOCAL_DIRS.travelHotels, h.attachmentPath);
      const driveId = await uploadFileToDrive(drive, localPath, h.attachmentName || h.attachmentPath, 'application/octet-stream', travelFolders.hotels);
      if (driveId && !DRY_RUN) {
        await prisma.travelPlanHotel.update({ where: { id: h.id }, data: { attachmentPath: driveId } });
      }
      uploaded++;
    } catch (e) {
      console.error(`    [ERROR] Hotel ${h.id}: ${e.message}`);
      errors++;
    }
  }

  // --- 7. Travel Plan Expenses ---
  console.log('\n--- Travel Expenses ---');
  const travelExpenses = await prisma.travelPlanExpense.findMany({
    where: { deletedAt: null, attachmentPath: { not: null } },
  });
  for (const te of travelExpenses) {
    if (!te.attachmentPath || te.attachmentPath.startsWith('gdrive:')) { skipped++; continue; }
    try {
      const travelFolders = folders.travelFolderMap.get(te.travelPlanId);
      if (!travelFolders) { console.log(`    [SKIP] No folder for travel plan ${te.travelPlanId}`); skipped++; continue; }
      // Try both possible local directories
      let localPath = path.join(LOCAL_DIRS.travelExpenses, te.attachmentPath);
      if (!fs.existsSync(localPath)) {
        localPath = path.join(LOCAL_DIRS.travelExpensesAlt, te.attachmentPath);
      }
      const driveId = await uploadFileToDrive(drive, localPath, te.attachmentName || te.attachmentPath, 'application/octet-stream', travelFolders.expenses);
      if (driveId && !DRY_RUN) {
        await prisma.travelPlanExpense.update({ where: { id: te.id }, data: { attachmentPath: driveId } });
      }
      uploaded++;
    } catch (e) {
      console.error(`    [ERROR] Travel expense ${te.id}: ${e.message}`);
      errors++;
    }
  }

  // --- 8. DMS Documents (already in document table) ---
  console.log('\n--- DMS Documents ---');
  const dmsDocuments = await prisma.document.findMany({
    where: { deletedAt: null },
    include: { folder: { select: { id: true, driveId: true } } },
  });
  for (const doc of dmsDocuments) {
    if (doc.storagePath.startsWith('gdrive:')) { skipped++; continue; }
    try {
      const targetFolderId = doc.folder.driveId;
      if (!targetFolderId) { console.log(`    [SKIP] No driveId for folder ${doc.folderId}`); skipped++; continue; }
      const localPath = path.join(LOCAL_DIRS.documents, doc.storagePath);
      const driveId = await uploadFileToDrive(drive, localPath, doc.fileName, doc.mimeType, targetFolderId.replace('gdrive:', ''));
      if (driveId && !DRY_RUN) {
        await prisma.document.update({ where: { id: doc.id }, data: { storagePath: driveId } });
      }
      uploaded++;
    } catch (e) {
      console.error(`    [ERROR] DMS doc ${doc.id}: ${e.message}`);
      errors++;
    }
  }

  return { uploaded, skipped, errors };
}

// ===== Helpers =====

function sanitizeName(name) {
  // Google Drive doesn't allow certain characters
  return name.replace(/[\\/:*?"<>|]/g, '_').trim();
}

// ===== Main =====

async function main() {
  console.log('╔══════════════════════════════════════════════╗');
  console.log('║   SrisaaERP — Migrate Documents to GDrive   ║');
  console.log('╚══════════════════════════════════════════════╝');
  if (DRY_RUN) console.log('\n⚠️  DRY RUN MODE — no changes will be made\n');

  const { drive, rootFolderId } = await getDriveClient();
  console.log(`Authenticated. Root folder: ${rootFolderId}`);

  let folderTree;
  if (!SKIP_FOLDERS) {
    folderTree = await createFolderTree(drive, rootFolderId);
    console.log('\n✅ Folder structure created.');
  }

  if (!FOLDERS_ONLY && folderTree) {
    const stats = await migrateFiles(drive, folderTree);
    console.log('\n╔═══════════════════════════════╗');
    console.log(`║ Uploaded:  ${String(stats.uploaded).padStart(5)}              ║`);
    console.log(`║ Skipped:   ${String(stats.skipped).padStart(5)}              ║`);
    console.log(`║ Errors:    ${String(stats.errors).padStart(5)}              ║`);
    console.log('╚═══════════════════════════════╝');
  }

  if (DRY_RUN) {
    console.log('\n⚠️  DRY RUN — no changes were made. Run without --dry-run to execute.');
  } else {
    console.log('\n✅ Migration complete!');
  }
}

main()
  .catch((e) => {
    console.error('\n❌ Fatal error:', e.message);
    console.error(e.stack);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
