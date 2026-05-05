import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';
import { uploadFile as storageUpload, downloadFile as storageDownload, deleteFile as storageDelete, createDriveFolder, getStorageType } from '../../lib/dms-storage.js';

// Multer uses temp dir; actual storage handled by dms-storage layer
const TEMP_DIR = path.join(os.tmpdir(), 'govprojects-dms');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEMP_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${newId()}${ext}`);
    },
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

async function resolveUserId(req: import('express').Request): Promise<string> {
  const sub = req.user?.id;
  if (!sub) throw errors.unauthorized();
  const user = await prisma.user.findUnique({ where: { externalId: sub }, select: { id: true } });
  if (user) return user.id;
  const byId = await prisma.user.findUnique({ where: { id: sub }, select: { id: true } });
  if (byId) return byId.id;
  throw errors.unauthorized();
}

export const documentRouter: ExpressRouter = Router();
documentRouter.use(requireAuth);

// ===== Folders =====

const SCOPES = ['SHARED', 'PERSONAL'] as const;

const CreateFolderBody = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().max(26).nullable().optional(),
  scope: z.enum(SCOPES),
});

const UpdateFolderBody = z.object({
  name: z.string().min(1).max(255).optional(),
  parentId: z.string().max(26).nullable().optional(),
});

const IdParams = z.object({ id: z.string().min(1).max(26) });
const ScopeQuery = z.object({ scope: z.enum(SCOPES).optional() });

/* GET /folders — full folder tree */
documentRouter.get('/folders', validate({ query: ScopeQuery }), asyncHandler(async (req, res) => {
  const userId = await resolveUserId(req);
  const scope = (req.query as { scope?: string }).scope;

  const where: Record<string, unknown> = { deletedAt: null };
  if (scope === 'PERSONAL') {
    where.scope = 'PERSONAL';
    where.ownerUserId = userId;
  } else if (scope === 'SHARED') {
    where.scope = 'SHARED';
  } else {
    // Both: shared + personal for this user
    where.OR = [
      { scope: 'SHARED' },
      { scope: 'PERSONAL', ownerUserId: userId },
    ];
    delete where.deletedAt; // Move into each OR branch
    (where.OR as Array<Record<string, unknown>>).forEach((o) => { o.deletedAt = null; });
  }
  if (!where.OR) { /* deletedAt already set */ }

  const rows = await prisma.documentFolder.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, parentId: true, scope: true, ownerUserId: true, sortOrder: true },
  });

  res.json({ data: rows });
}));

/* POST /folders — create folder */
documentRouter.post('/folders', validate({ body: CreateFolderBody }), asyncHandler(async (req, res) => {
  const userId = await resolveUserId(req);
  const body = req.body as z.infer<typeof CreateFolderBody>;
  const actor = actorId(req);

  // Validate parent exists if provided
  if (body.parentId) {
    const parent = await prisma.documentFolder.findFirst({
      where: { id: body.parentId, deletedAt: null },
    });
    if (!parent) throw errors.notFound('Parent folder not found');
  }

  const ownerUserId = body.scope === 'PERSONAL' ? userId : null;

  // Create folder in storage backend (Google Drive if configured)
  let driveId: string | null = null;
  const storageType = await getStorageType();
  if (storageType === 'GOOGLE_DRIVE') {
    // Get parent's driveId if creating a subfolder
    let parentDriveId: string | null = null;
    if (body.parentId) {
      const parentFolder = await prisma.documentFolder.findFirst({
        where: { id: body.parentId, deletedAt: null },
        select: { driveId: true },
      });
      parentDriveId = parentFolder?.driveId ?? null;
    }
    const result = await createDriveFolder(body.name.trim(), parentDriveId);
    driveId = result;
  }

  // Find max sortOrder among siblings
  const last = await prisma.documentFolder.findFirst({
    where: { parentId: body.parentId ?? null, scope: body.scope, ownerUserId, deletedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const folder = await prisma.documentFolder.create({
    data: {
      id: newId(),
      name: body.name.trim(),
      parentId: body.parentId ?? null,
      scope: body.scope,
      ownerUserId,
      driveId,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      createdBy: actor,
      updatedBy: actor,
    },
  });

  res.status(201).json({ data: { id: folder.id, name: folder.name, parentId: folder.parentId, scope: folder.scope, sortOrder: folder.sortOrder } });
}));

/* PATCH /folders/:id — rename or move */
documentRouter.patch('/folders/:id', validate({ params: IdParams, body: UpdateFolderBody }), asyncHandler(async (req, res) => {
  const folder = await prisma.documentFolder.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!folder) throw errors.notFound('Folder not found');

  const body = req.body as z.infer<typeof UpdateFolderBody>;
  const data: Record<string, unknown> = { updatedBy: actorId(req) };
  if (body.name) data.name = body.name.trim();
  if (body.parentId !== undefined) data.parentId = body.parentId;

  const updated = await prisma.documentFolder.update({ where: { id: folder.id }, data });
  res.json({ data: { id: updated.id, name: updated.name, parentId: updated.parentId, scope: updated.scope } });
}));

/* DELETE /folders/:id — soft delete (must be empty) */
documentRouter.delete('/folders/:id', validate({ params: IdParams }), asyncHandler(async (req, res) => {
  const folder = await prisma.documentFolder.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!folder) throw errors.notFound('Folder not found');

  // Check for children
  const childCount = await prisma.documentFolder.count({ where: { parentId: folder.id, deletedAt: null } });
  if (childCount > 0) throw errors.conflict('Folder has sub-folders. Delete or move them first.');

  // Check for documents
  const docCount = await prisma.document.count({ where: { folderId: folder.id, deletedAt: null } });
  if (docCount > 0) throw errors.conflict('Folder has documents. Delete or move them first.');

  await prisma.documentFolder.update({ where: { id: folder.id }, data: { deletedAt: new Date() } });

  await recordAudit(req, { action: 'DELETE', resourceType: 'document_folder', resourceId: folder.id, before: { name: folder.name } });
  res.status(204).end();
}));

// ===== Files =====

const FileQuery = z.object({ folderId: z.string().min(1).max(26) });

/* GET /files?folderId=X — list files in folder */
documentRouter.get('/files', validate({ query: FileQuery }), asyncHandler(async (req, res) => {
  const q = req.query as { folderId: string };
  const rows = await prisma.document.findMany({
    where: { folderId: q.folderId, deletedAt: null },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    include: { entityLinks: { select: { id: true, entityType: true, entityId: true } } },
  });

  res.json({
    data: rows.map((r) => ({
      id: r.id, name: r.name, fileName: r.fileName, mimeType: r.mimeType,
      fileSize: r.fileSize, sortOrder: r.sortOrder,
      createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
      entityLinks: r.entityLinks,
    })),
  });
}));

/* POST /files — upload file */
documentRouter.post('/files', upload.single('file'), asyncHandler(async (req, res) => {
  const file = req.file;
  if (!file) throw errors.validation('File is required');

  const body = req.body as Record<string, string>;
  const folderId = body.folderId;
  if (!folderId) { fs.unlinkSync(file.path); throw errors.validation('folderId is required'); }

  // Validate folder exists
  const folder = await prisma.documentFolder.findFirst({ where: { id: folderId, deletedAt: null } });
  if (!folder) { fs.unlinkSync(file.path); throw errors.notFound('Folder not found'); }

  // Upload via storage layer (local or Google Drive)
  const result = await storageUpload(file, folder.driveId ?? '');

  const name = body.name?.trim() || path.parse(file.originalname).name;
  const actor = actorId(req);

  const last = await prisma.document.findFirst({
    where: { folderId, deletedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const doc = await prisma.document.create({
    data: {
      id: newId(), folderId, name,
      fileName: file.originalname, mimeType: file.mimetype, fileSize: file.size,
      storagePath: result.storagePath,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      createdBy: actor, updatedBy: actor,
    },
  });

  await recordAudit(req, { action: 'CREATE', resourceType: 'document', resourceId: doc.id, after: { name: doc.name, fileName: doc.fileName } });
  res.status(201).json({
    data: { id: doc.id, name: doc.name, fileName: doc.fileName, mimeType: doc.mimeType, fileSize: doc.fileSize, sortOrder: doc.sortOrder, createdAt: doc.createdAt.toISOString() },
  });
}));

const UpdateFileBody = z.object({
  name: z.string().min(1).max(255).optional(),
  folderId: z.string().max(26).optional(),
});

/* PATCH /files/:id — rename or move */
documentRouter.patch('/files/:id', validate({ params: IdParams, body: UpdateFileBody }), asyncHandler(async (req, res) => {
  const doc = await prisma.document.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!doc) throw errors.notFound('Document not found');

  const body = req.body as z.infer<typeof UpdateFileBody>;
  const data: Record<string, unknown> = { updatedBy: actorId(req) };
  if (body.name) data.name = body.name.trim();
  if (body.folderId) {
    const folder = await prisma.documentFolder.findFirst({ where: { id: body.folderId, deletedAt: null } });
    if (!folder) throw errors.notFound('Target folder not found');
    data.folderId = body.folderId;
  }

  const updated = await prisma.document.update({ where: { id: doc.id }, data });
  res.json({ data: { id: updated.id, name: updated.name, folderId: updated.folderId } });
}));

/* DELETE /files/:id — soft delete */
documentRouter.delete('/files/:id', validate({ params: IdParams }), asyncHandler(async (req, res) => {
  const doc = await prisma.document.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!doc) throw errors.notFound('Document not found');

  await prisma.document.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
  // Delete from storage backend
  try { await storageDelete(doc.storagePath); } catch { /* best effort */ }
  await recordAudit(req, { action: 'DELETE', resourceType: 'document', resourceId: doc.id, before: { name: doc.name, fileName: doc.fileName } });
  res.status(204).end();
}));

/* GET /files/:id/download */
documentRouter.get('/files/:id/download', validate({ params: IdParams }), asyncHandler(async (req, res) => {
  const doc = await prisma.document.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!doc) throw errors.notFound('Document not found');

  res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
  res.setHeader('Content-Type', doc.mimeType);

  const { stream } = await storageDownload(doc.storagePath);
  (stream as NodeJS.ReadableStream).pipe(res);
}));

// ===== Entity Links =====

const LINK_ENTITY_TYPES = ['OPPORTUNITY', 'PROJECT', 'TENDER', 'INITIATIVE', 'ACCOUNT'] as const;

const CreateLinkBody = z.object({
  entityType: z.enum(LINK_ENTITY_TYPES),
  entityId: z.string().min(1).max(26),
});

const LinkIdParams = z.object({ id: z.string().min(1).max(26), linkId: z.string().min(1).max(26) });
const EntityLinkQuery = z.object({ entityType: z.enum(LINK_ENTITY_TYPES), entityId: z.string().min(1).max(26) });

/* POST /files/:id/links — link document to entity */
documentRouter.post('/files/:id/links', validate({ params: IdParams, body: CreateLinkBody }), asyncHandler(async (req, res) => {
  const doc = await prisma.document.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!doc) throw errors.notFound('Document not found');

  const body = req.body as z.infer<typeof CreateLinkBody>;
  const existing = await prisma.documentEntityLink.findUnique({
    where: { documentId_entityType_entityId: { documentId: doc.id, entityType: body.entityType, entityId: body.entityId } },
  });
  if (existing) { res.json({ data: { id: existing.id } }); return; }

  const link = await prisma.documentEntityLink.create({
    data: { id: newId(), documentId: doc.id, entityType: body.entityType, entityId: body.entityId, createdBy: actorId(req) },
  });
  res.status(201).json({ data: { id: link.id } });
}));

/* DELETE /files/:id/links/:linkId */
documentRouter.delete('/files/:id/links/:linkId', validate({ params: LinkIdParams }), asyncHandler(async (req, res) => {
  const link = await prisma.documentEntityLink.findFirst({
    where: { id: req.params.linkId as string, documentId: req.params.id as string },
  });
  if (!link) throw errors.notFound('Link not found');
  await prisma.documentEntityLink.delete({ where: { id: link.id } });
  res.status(204).end();
}));

/* GET /files/:id/links — list links for a document */
documentRouter.get('/files/:id/links', validate({ params: IdParams }), asyncHandler(async (req, res) => {
  const links = await prisma.documentEntityLink.findMany({ where: { documentId: req.params.id as string } });

  const enriched: Array<{ id: string; entityType: string; entityId: string; entityName: string | null }> = [];
  for (const link of links) {
    let name: string | null = null;
    try {
      if (link.entityType === 'OPPORTUNITY') {
        const e = await prisma.opportunity.findUnique({ where: { id: link.entityId }, select: { title: true } });
        name = e?.title ?? null;
      } else if (link.entityType === 'PROJECT') {
        const e = await prisma.project.findUnique({ where: { id: link.entityId }, select: { name: true } });
        name = e?.name ?? null;
      } else if (link.entityType === 'TENDER') {
        const e = await prisma.tender.findUnique({ where: { id: link.entityId }, select: { title: true } });
        name = e?.title ?? null;
      } else if (link.entityType === 'INITIATIVE') {
        const e = await prisma.initiative.findUnique({ where: { id: link.entityId }, select: { title: true } });
        name = e?.title ?? null;
      } else if (link.entityType === 'ACCOUNT') {
        const e = await prisma.account.findUnique({ where: { id: link.entityId }, select: { name: true } });
        name = e?.name ?? null;
      }
    } catch { /* ignore */ }
    enriched.push({ id: link.id, entityType: link.entityType, entityId: link.entityId, entityName: name });
  }

  res.json({ data: enriched });
}));

/* GET /entity-links — reverse: find documents linked to an entity */
documentRouter.get('/entity-links', validate({ query: EntityLinkQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.infer<typeof EntityLinkQuery>;
  const links = await prisma.documentEntityLink.findMany({
    where: { entityType: q.entityType, entityId: q.entityId },
    include: {
      document: { select: { id: true, name: true, fileName: true, mimeType: true, fileSize: true, createdAt: true } },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    data: links.map((l) => ({
      id: l.id, entityType: l.entityType, entityId: l.entityId,
      document: {
        id: l.document.id, name: l.document.name, fileName: l.document.fileName,
        mimeType: l.document.mimeType, fileSize: l.document.fileSize,
        createdAt: l.document.createdAt.toISOString(),
      },
    })),
  });
}));
