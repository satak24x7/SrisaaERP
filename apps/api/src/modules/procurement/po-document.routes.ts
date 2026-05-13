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
import { uploadFile as storageUpload, downloadFileWithFallback, deleteFileWithFallback } from '../../lib/dms-storage.js';
import { actorId } from './shared.js';

const TEMP_DIR = path.join(os.tmpdir(), 'govprojects-po-docs');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEMP_DIR),
    filename: (_req, file, cb) => cb(null, `${newId()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const poDocumentRouter: ExpressRouter = Router({ mergeParams: true });
poDocumentRouter.use(requireAuth);

const DocIdParams = z.object({ docId: z.string().min(1).max(26) });

/* GET / — list documents for a PO */
poDocumentRouter.get(
  '/',
  asyncHandler(async (req, res) => {
    const poId = req.params.poId as string;
    const docs = await prisma.poDocument.findMany({
      where: { poId, deletedAt: null },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    res.json({
      data: docs.map((d) => ({
        id: d.id, name: d.name, fileName: d.fileName, mimeType: d.mimeType,
        fileSize: d.fileSize, sortOrder: d.sortOrder,
        createdAt: d.createdAt.toISOString(),
      })),
    });
  }),
);

/* POST / — upload document */
poDocumentRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const poId = req.params.poId as string;
    const po = await prisma.purchaseOrder.findFirst({ where: { id: poId, deletedAt: null } });
    if (!po) throw errors.notFound('Purchase Order not found');

    const file = req.file;
    if (!file) throw errors.validation('File is required');

    const result = await storageUpload(file, `po:${poId}`);
    const name = (req.body as Record<string, string>).name?.trim() || path.parse(file.originalname).name;
    const actor = actorId(req);

    const last = await prisma.poDocument.findFirst({ where: { poId, deletedAt: null }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });

    const doc = await prisma.poDocument.create({
      data: {
        id: newId(), poId, name, fileName: file.originalname,
        mimeType: file.mimetype, fileSize: file.size,
        storagePath: result.storagePath,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        createdBy: actor, updatedBy: actor,
      },
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'po_document', resourceId: doc.id, after: { name, fileName: file.originalname } });
    res.status(201).json({ data: { id: doc.id, name: doc.name, fileName: doc.fileName } });
  }),
);

/* GET /:docId/download */
poDocumentRouter.get(
  '/:docId/download',
  validate({ params: DocIdParams }),
  asyncHandler(async (req, res) => {
    const doc = await prisma.poDocument.findFirst({ where: { id: req.params.docId as string, deletedAt: null } });
    if (!doc) throw errors.notFound('Document not found');

    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    res.setHeader('Content-Type', doc.mimeType);

    const { stream } = await downloadFileWithFallback(doc.storagePath, TEMP_DIR);
    (stream as NodeJS.ReadableStream).pipe(res);
  }),
);

/* DELETE /:docId */
poDocumentRouter.delete(
  '/:docId',
  validate({ params: DocIdParams }),
  asyncHandler(async (req, res) => {
    const doc = await prisma.poDocument.findFirst({ where: { id: req.params.docId as string, deletedAt: null } });
    if (!doc) throw errors.notFound('Document not found');

    await prisma.poDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
    try { await deleteFileWithFallback(doc.storagePath, TEMP_DIR); } catch { /* best effort */ }
    await recordAudit(req, { action: 'DELETE', resourceType: 'po_document', resourceId: doc.id, before: { name: doc.name } });
    res.status(204).end();
  }),
);
