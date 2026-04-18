import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';

const UPLOAD_DIR = path.resolve(process.cwd(), '../../uploads/project-docs');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, `${newId()}${ext}`);
    },
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

const IdParams = z.object({ id: z.string().min(1).max(26) });
const DocIdParams = z.object({ id: z.string().min(1).max(26), did: z.string().min(1).max(26) });
const ReorderBody = z.object({ ids: z.array(z.string().min(1).max(26)).min(1) });

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function docDto(r: { id: string; projectId: string; name: string; fileName: string; mimeType: string; fileSize: number; sortOrder: number; createdAt: Date; updatedAt: Date }) {
  return {
    id: r.id, projectId: r.projectId,
    name: r.name, fileName: r.fileName, mimeType: r.mimeType,
    fileSize: r.fileSize, sortOrder: r.sortOrder,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

async function assertProjectExists(projectId: string): Promise<void> {
  const count = await prisma.project.count({ where: { id: projectId, deletedAt: null } });
  if (count === 0) throw errors.notFound('Project not found');
}

export const projectDocumentRouter: ExpressRouter = Router({ mergeParams: true });
projectDocumentRouter.use(requireAuth);

/* GET / — list project documents */
projectDocumentRouter.get(
  '/',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);
    const rows = await prisma.projectDocument.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ data: rows.map(docDto) });
  }),
);

/* POST / — upload document */
projectDocumentRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const file = req.file;
    if (!file) throw errors.validation('File is required');
    const name = (req.body as Record<string, string>).name;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      fs.unlinkSync(file.path);
      throw errors.validation('Document name is required');
    }

    const last = await prisma.projectDocument.findFirst({
      where: { projectId, deletedAt: null },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const nextOrder = (last?.sortOrder ?? -1) + 1;

    const docId = newId();
    const actor = actorId(req);
    const row = await prisma.projectDocument.create({
      data: {
        id: docId, projectId,
        name: name.trim(), fileName: file.originalname,
        mimeType: file.mimetype, fileSize: file.size,
        storagePath: path.basename(file.path),
        sortOrder: nextOrder,
        createdBy: actor, updatedBy: actor,
      },
    });

    await recordAudit(req, {
      action: 'CREATE', resourceType: 'project_document', resourceId: docId,
      after: { name: row.name, fileName: row.fileName, projectId },
    });
    res.status(201).json({ data: docDto(row) });
  }),
);

/* PUT /reorder — bulk update sort order */
projectDocumentRouter.put(
  '/reorder',
  validate({ params: IdParams, body: ReorderBody }),
  asyncHandler(async (req, res) => {
    const { ids } = req.body as z.infer<typeof ReorderBody>;
    await prisma.$transaction(
      ids.map((id, idx) => prisma.projectDocument.update({ where: { id }, data: { sortOrder: idx } })),
    );
    res.json({ data: { ok: true } });
  }),
);

/* GET /:did/download — download file */
projectDocumentRouter.get(
  '/:did/download',
  validate({ params: DocIdParams }),
  asyncHandler(async (req, res) => {
    const doc = await prisma.projectDocument.findFirst({
      where: { id: req.params.did as string, projectId: req.params.id as string, deletedAt: null },
    });
    if (!doc) throw errors.notFound('Document not found');

    const filePath = path.join(UPLOAD_DIR, doc.storagePath);
    if (!fs.existsSync(filePath)) throw errors.notFound('File not found on disk');

    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    res.setHeader('Content-Type', doc.mimeType);
    res.sendFile(filePath);
  }),
);

/* PATCH /:did — replace file and/or rename */
projectDocumentRouter.patch(
  '/:did',
  upload.single('file'),
  validate({ params: DocIdParams }),
  asyncHandler(async (req, res) => {
    const doc = await prisma.projectDocument.findFirst({
      where: { id: req.params.did as string, projectId: req.params.id as string, deletedAt: null },
    });
    if (!doc) {
      if (req.file) fs.unlinkSync(req.file.path);
      throw errors.notFound('Document not found');
    }

    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };
    const body = req.body as Record<string, string>;

    if (body.name && body.name.trim().length > 0) data.name = body.name.trim();

    if (req.file) {
      const oldPath = path.join(UPLOAD_DIR, doc.storagePath);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);
      data.fileName = req.file.originalname;
      data.mimeType = req.file.mimetype;
      data.fileSize = req.file.size;
      data.storagePath = path.basename(req.file.path);
    }

    const updated = await prisma.projectDocument.update({ where: { id: doc.id }, data });
    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'project_document', resourceId: doc.id,
      before: { name: doc.name, fileName: doc.fileName },
      after: { name: updated.name, fileName: updated.fileName },
    });
    res.json({ data: docDto(updated) });
  }),
);

/* DELETE /:did */
projectDocumentRouter.delete(
  '/:did',
  validate({ params: DocIdParams }),
  asyncHandler(async (req, res) => {
    const doc = await prisma.projectDocument.findFirst({
      where: { id: req.params.did as string, projectId: req.params.id as string, deletedAt: null },
    });
    if (!doc) throw errors.notFound('Document not found');

    await prisma.projectDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, {
      action: 'DELETE', resourceType: 'project_document', resourceId: doc.id,
      before: { name: doc.name, fileName: doc.fileName },
    });
    res.status(204).end();
  }),
);
