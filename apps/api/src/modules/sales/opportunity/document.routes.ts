import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';
import { uploadFile as storageUpload, downloadFileWithFallback, deleteFileWithFallback } from '../../../lib/dms-storage.js';

const LEGACY_DIR = path.resolve(process.cwd(), '../../uploads/opportunity-docs');
const TEMP_DIR = path.join(os.tmpdir(), 'srisaa-opp-docs');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEMP_DIR),
    filename: (_req, file, cb) => cb(null, `${newId()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

const IdParams = z.object({ id: z.string().min(1).max(26) });
const DocIdParams = z.object({ id: z.string().min(1).max(26), did: z.string().min(1).max(26) });
const ReorderBody = z.object({ ids: z.array(z.string().min(1).max(26)).min(1) });

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function docDto(r: { id: string; opportunityId: string; name: string; fileName: string; mimeType: string; fileSize: number; sortOrder: number; createdAt: Date; updatedAt: Date }) {
  return {
    id: r.id, opportunityId: r.opportunityId,
    name: r.name, fileName: r.fileName, mimeType: r.mimeType,
    fileSize: r.fileSize, sortOrder: r.sortOrder,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

async function assertOppExists(id: string): Promise<void> {
  const count = await prisma.opportunity.count({ where: { id, deletedAt: null } });
  if (count === 0) throw errors.notFound('Opportunity not found');
}

export const opportunityDocumentRouter: ExpressRouter = Router({ mergeParams: true });
opportunityDocumentRouter.use(requireAuth);

/* GET / — list documents */
opportunityDocumentRouter.get('/', validate({ params: IdParams }), asyncHandler(async (req, res) => {
  const oppId = req.params.id as string;
  await assertOppExists(oppId);
  const rows = await prisma.opportunityDocument.findMany({
    where: { opportunityId: oppId, deletedAt: null },
    orderBy: { sortOrder: 'asc' },
  });
  res.json({ data: rows.map(docDto) });
}));

/* POST / — upload */
opportunityDocumentRouter.post('/', upload.single('file'), asyncHandler(async (req, res) => {
  const oppId = req.params.id as string;
  await assertOppExists(oppId);

  const file = req.file;
  if (!file) throw errors.validation('File is required');
  const name = (req.body as Record<string, string>).name;
  if (!name?.trim()) { fs.unlinkSync(file.path); throw errors.validation('Document name is required'); }

  const last = await prisma.opportunityDocument.findFirst({
    where: { opportunityId: oppId, deletedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const docId = newId();
  const actor = actorId(req);
  const result = await storageUpload(file, `opportunity:${oppId}`);
  const row = await prisma.opportunityDocument.create({
    data: {
      id: docId, opportunityId: oppId,
      name: name.trim(), fileName: file.originalname,
      mimeType: file.mimetype, fileSize: file.size,
      storagePath: result.storagePath,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      createdBy: actor, updatedBy: actor,
    },
  });

  await recordAudit(req, { action: 'CREATE', resourceType: 'opportunity_document', resourceId: docId, after: { name: row.name, oppId } });
  res.status(201).json({ data: docDto(row) });
}));

/* PUT /reorder */
opportunityDocumentRouter.put('/reorder', validate({ params: IdParams, body: ReorderBody }), asyncHandler(async (req, res) => {
  const { ids } = req.body as z.infer<typeof ReorderBody>;
  await prisma.$transaction(ids.map((id, idx) => prisma.opportunityDocument.update({ where: { id }, data: { sortOrder: idx } })));
  res.json({ data: { ok: true } });
}));

/* GET /:did/download */
opportunityDocumentRouter.get('/:did/download', validate({ params: DocIdParams }), asyncHandler(async (req, res) => {
  const doc = await prisma.opportunityDocument.findFirst({
    where: { id: req.params.did as string, opportunityId: req.params.id as string, deletedAt: null },
  });
  if (!doc) throw errors.notFound('Document not found');

  res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
  res.setHeader('Content-Type', doc.mimeType);
  const { stream } = await downloadFileWithFallback(doc.storagePath, LEGACY_DIR);
  (stream as NodeJS.ReadableStream).pipe(res);
}));

/* DELETE /:did */
opportunityDocumentRouter.delete('/:did', validate({ params: DocIdParams }), asyncHandler(async (req, res) => {
  const doc = await prisma.opportunityDocument.findFirst({
    where: { id: req.params.did as string, opportunityId: req.params.id as string, deletedAt: null },
  });
  if (!doc) throw errors.notFound('Document not found');

  await prisma.opportunityDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
  await recordAudit(req, { action: 'DELETE', resourceType: 'opportunity_document', resourceId: doc.id, before: { name: doc.name } });
  res.status(204).end();
}));
