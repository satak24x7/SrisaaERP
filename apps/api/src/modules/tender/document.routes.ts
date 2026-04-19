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

const UPLOAD_DIR = path.resolve(process.cwd(), '../../uploads/tender-docs');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
    filename: (_req, file, cb) => cb(null, `${newId()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 }, // 25 MB
});

const TenderIdParams = z.object({ tenderId: z.string().min(1).max(26) });
const DocIdParams = z.object({ tenderId: z.string().min(1).max(26), docId: z.string().min(1).max(26) });

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function docDto(r: Record<string, unknown>) {
  return {
    id: r.id, tenderId: r.tenderId, name: r.name, docType: r.docType,
    fileName: r.fileName, mimeType: r.mimeType, fileSize: r.fileSize,
    sortOrder: r.sortOrder,
    createdAt: (r.createdAt as Date).toISOString(),
    updatedAt: (r.updatedAt as Date).toISOString(),
  };
}

export const tenderDocumentRouter: ExpressRouter = Router({ mergeParams: true });
tenderDocumentRouter.use(requireAuth);

/* GET / — list documents for a tender */
tenderDocumentRouter.get(
  '/',
  validate({ params: TenderIdParams }),
  asyncHandler(async (req, res) => {
    const tenderId = req.params.tenderId as string;
    const rows = await prisma.tenderDocument.findMany({
      where: { tenderId, deletedAt: null },
      orderBy: [{ docType: 'asc' }, { sortOrder: 'asc' }],
    });
    res.json({ data: rows.map((r) => docDto(r as unknown as Record<string, unknown>)) });
  }),
);

/* POST / — upload document */
tenderDocumentRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const tenderId = req.params.tenderId as string;
    const tender = await prisma.tender.findFirst({ where: { id: tenderId, deletedAt: null } });
    if (!tender) throw errors.notFound('Tender not found');

    const file = req.file;
    if (!file) throw errors.validation('File is required');

    const body = req.body as Record<string, string>;
    const name = body.name?.trim();
    const docType = body.docType || 'OTHER';
    if (!name) { fs.unlinkSync(file.path); throw errors.validation('Document name is required'); }

    const last = await prisma.tenderDocument.findFirst({
      where: { tenderId, deletedAt: null },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const actor = actorId(req);
    const row = await prisma.tenderDocument.create({
      data: {
        id: newId(), tenderId, name, docType,
        fileName: file.originalname, mimeType: file.mimetype,
        fileSize: file.size, storagePath: path.basename(file.path),
        sortOrder: (last?.sortOrder ?? -1) + 1,
        createdBy: actor, updatedBy: actor,
      },
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'tender_document', resourceId: row.id });
    res.status(201).json({ data: docDto(row as unknown as Record<string, unknown>) });
  }),
);

/* GET /:docId/download */
tenderDocumentRouter.get(
  '/:docId/download',
  validate({ params: DocIdParams }),
  asyncHandler(async (req, res) => {
    const doc = await prisma.tenderDocument.findFirst({
      where: { id: req.params.docId as string, tenderId: req.params.tenderId as string, deletedAt: null },
    });
    if (!doc) throw errors.notFound('Document not found');

    const filePath = path.join(UPLOAD_DIR, doc.storagePath);
    if (!fs.existsSync(filePath)) throw errors.notFound('File not found on disk');

    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    res.setHeader('Content-Type', doc.mimeType);
    res.sendFile(filePath);
  }),
);

/* DELETE /:docId */
tenderDocumentRouter.delete(
  '/:docId',
  validate({ params: DocIdParams }),
  asyncHandler(async (req, res) => {
    const doc = await prisma.tenderDocument.findFirst({
      where: { id: req.params.docId as string, tenderId: req.params.tenderId as string, deletedAt: null },
    });
    if (!doc) throw errors.notFound('Document not found');

    await prisma.tenderDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'tender_document', resourceId: doc.id });
    res.status(204).end();
  }),
);
