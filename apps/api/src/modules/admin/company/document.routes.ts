import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';

const UPLOAD_DIR = path.resolve(process.cwd(), '../../uploads/company-docs');

// Ensure upload dir exists
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
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB
});

const IdParams = z.object({
  id: z.string().min(1).max(26),
});

const ReorderBody = z.object({
  ids: z.array(z.string().min(1).max(26)).min(1),
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function docDto(r: { id: string; name: string; fileName: string; mimeType: string; fileSize: number; sortOrder: number; createdAt: Date; updatedAt: Date }) {
  return {
    id: r.id,
    name: r.name,
    fileName: r.fileName,
    mimeType: r.mimeType,
    fileSize: r.fileSize,
    sortOrder: r.sortOrder,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export const companyDocumentRouter: ExpressRouter = Router();
companyDocumentRouter.use(requireAuth);

/* GET /  — list all company documents ordered by sortOrder */
companyDocumentRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.companyDocument.findMany({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({ data: rows.map(docDto) });
  }),
);

/* POST /  — upload a document (appended to end) */
companyDocumentRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) {
      throw errors.validation('File is required');
    }
    const name = (req.body as Record<string, string>).name;
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      fs.unlinkSync(file.path);
      throw errors.validation('Document name is required');
    }

    // Find max sortOrder to append at end
    const last = await prisma.companyDocument.findFirst({
      where: { deletedAt: null },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });
    const nextOrder = (last?.sortOrder ?? -1) + 1;

    const docId = newId();
    const actor = actorId(req);
    const row = await prisma.companyDocument.create({
      data: {
        id: docId,
        name: name.trim(),
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        storagePath: path.basename(file.path),
        sortOrder: nextOrder,
        createdBy: actor,
        updatedBy: actor,
      },
    });

    await recordAudit(req, {
      action: 'CREATE',
      resourceType: 'company_document',
      resourceId: docId,
      after: { name: row.name, fileName: row.fileName },
    });

    res.status(201).json({ data: docDto(row) });
  }),
);

/* PUT /reorder  — bulk update sort order */
companyDocumentRouter.put(
  '/reorder',
  validate({ body: ReorderBody }),
  asyncHandler(async (req, res) => {
    const { ids } = req.body as z.infer<typeof ReorderBody>;

    // Update each doc's sortOrder to match its index in the array
    await prisma.$transaction(
      ids.map((id, idx) =>
        prisma.companyDocument.update({
          where: { id },
          data: { sortOrder: idx },
        }),
      ),
    );

    res.json({ data: { ok: true } });
  }),
);

/* GET /:id/download  — download file */
companyDocumentRouter.get(
  '/:id/download',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const doc = await prisma.companyDocument.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
    });
    if (!doc) throw errors.notFound('Document not found');

    const filePath = path.join(UPLOAD_DIR, doc.storagePath);
    if (!fs.existsSync(filePath)) {
      throw errors.notFound('File not found on disk');
    }

    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    res.setHeader('Content-Type', doc.mimeType);
    res.sendFile(filePath);
  }),
);

/* PATCH /:id  — replace file and/or rename */
companyDocumentRouter.patch(
  '/:id',
  upload.single('file'),
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const doc = await prisma.companyDocument.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
    });
    if (!doc) {
      if (req.file) fs.unlinkSync(req.file.path);
      throw errors.notFound('Document not found');
    }

    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };
    const body = req.body as Record<string, string>;

    if (body.name && body.name.trim().length > 0) {
      data.name = body.name.trim();
    }

    if (req.file) {
      const oldPath = path.join(UPLOAD_DIR, doc.storagePath);
      if (fs.existsSync(oldPath)) fs.unlinkSync(oldPath);

      data.fileName = req.file.originalname;
      data.mimeType = req.file.mimetype;
      data.fileSize = req.file.size;
      data.storagePath = path.basename(req.file.path);
    }

    const updated = await prisma.companyDocument.update({
      where: { id: doc.id },
      data,
    });

    await recordAudit(req, {
      action: 'UPDATE',
      resourceType: 'company_document',
      resourceId: doc.id,
      before: { name: doc.name, fileName: doc.fileName },
      after: { name: updated.name, fileName: updated.fileName },
    });

    res.json({ data: docDto(updated) });
  }),
);

/* DELETE /:id */
companyDocumentRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const doc = await prisma.companyDocument.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
    });
    if (!doc) throw errors.notFound('Document not found');

    await prisma.companyDocument.update({
      where: { id: doc.id },
      data: { deletedAt: new Date() },
    });

    await recordAudit(req, {
      action: 'DELETE',
      resourceType: 'company_document',
      resourceId: doc.id,
      before: { name: doc.name, fileName: doc.fileName },
    });

    res.status(204).end();
  }),
);
