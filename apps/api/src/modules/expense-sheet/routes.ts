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

const LEGACY_DIR = path.resolve(process.cwd(), '../../uploads/expense-sheets');
const TEMP_DIR = path.join(os.tmpdir(), 'govprojects-expense');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEMP_DIR),
    filename: (_req, file, cb) => cb(null, `${newId()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 10 * 1024 * 1024 },
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function toBigNum(v: bigint | null | undefined): number {
  return v != null ? Number(v) : 0;
}

async function resolveMyUserId(req: import('express').Request): Promise<string | null> {
  const sub = req.user?.id;
  if (!sub) return null;
  const user = await prisma.user.findUnique({ where: { externalId: sub }, select: { id: true } });
  if (user) return user.id;
  // Might already be a ULID
  const byId = await prisma.user.findUnique({ where: { id: sub }, select: { id: true } });
  return byId?.id ?? null;
}

// --- Zod schemas ---

const IdParams = z.object({ id: z.string().min(1).max(26) });
const LineIdParams = z.object({ id: z.string().min(1).max(26), lineId: z.string().min(1).max(26) });

const SHEET_TYPES = ['PRE_PROJECT', 'DURING_PROJECT', 'ADMIN_GENERAL', 'REIMBURSEMENT'] as const;
const PAYMENT_MODES = ['NEFT', 'CHEQUE', 'CASH', 'UPI', 'CARD', 'OTHER'] as const;

const CreateSheet = z.object({
  title: z.string().min(1).max(255),
  sheetType: z.enum(SHEET_TYPES).default('ADMIN_GENERAL'),
  businessUnitId: z.string().max(26).nullable().optional(),
  claimantUserId: z.string().min(1).max(26),
  opportunityId: z.string().max(26).nullable().optional(),
  projectId: z.string().max(26).nullable().optional(),
  costCentre: z.string().max(32).nullable().optional(),
  periodFrom: z.string().min(1),
  periodTo: z.string().min(1),
  notes: z.string().nullable().optional(),
});

const UpdateSheet = z.object({
  title: z.string().min(1).max(255).optional(),
  sheetType: z.enum(SHEET_TYPES).optional(),
  businessUnitId: z.string().max(26).nullable().optional(),
  claimantUserId: z.string().min(1).max(26).optional(),
  opportunityId: z.string().max(26).nullable().optional(),
  projectId: z.string().max(26).nullable().optional(),
  costCentre: z.string().max(32).nullable().optional(),
  periodFrom: z.string().min(1).optional(),
  periodTo: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
});

const ListQuery = z.object({
  status: z.string().optional(),
  sheetType: z.string().optional(),
  claimantUserId: z.string().optional(),
  mine: z.string().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const CreateLine = z.object({
  expenseDate: z.string().min(1),
  category: z.string().min(1).max(64),
  vendorName: z.string().max(255).optional(),
  description: z.string().min(1).max(500),
  amountPaise: z.coerce.number().int().nonnegative(),
  gstPaise: z.coerce.number().int().nonnegative().default(0),
  paymentMode: z.enum(PAYMENT_MODES).default('NEFT'),
});

// --- Includes ---

const SHEET_INCLUDE = {
  claimant: { select: { id: true, fullName: true } },
  businessUnit: { select: { id: true, name: true } },
  lines: { where: { deletedAt: null }, orderBy: { expenseDate: 'asc' as const } },
} as const;

// --- DTO ---

function sheetToDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date; periodFrom: Date; periodTo: Date;
    totalPaise: bigint; paymentPaise: bigint; paymentDate: Date | null;
    claimant: { id: string; fullName: string };
    businessUnit?: { id: string; name: string } | null;
    lines: Array<Record<string, unknown>>;
  };

  const linesTotal = r.lines.reduce((s, l) => s + toBigNum((l as { amountPaise: bigint }).amountPaise), 0);
  const gstTotal = r.lines.reduce((s, l) => s + toBigNum((l as { gstPaise: bigint }).gstPaise), 0);

  return {
    id: r.id, title: r.title, sheetType: r.sheetType, status: r.status,
    claimantId: r.claimant.id, claimantName: r.claimant.fullName,
    businessUnitId: r.businessUnit?.id ?? null, businessUnitName: r.businessUnit?.name ?? null,
    opportunityId: r.opportunityId ?? null, projectId: r.projectId ?? null,
    costCentre: r.costCentre ?? null,
    periodFrom: r.periodFrom.toISOString().slice(0, 10),
    periodTo: r.periodTo.toISOString().slice(0, 10),
    notes: r.notes ?? null,
    totalPaise: toBigNum(r.totalPaise),
    linesTotal, gstTotal, grandTotal: linesTotal + gstTotal,
    lineCount: r.lines.length,
    paymentPaise: toBigNum(r.paymentPaise),
    paymentDate: r.paymentDate ? r.paymentDate.toISOString().slice(0, 10) : null,
    paymentRef: r.paymentRef ?? null,
    lines: r.lines.map((l: Record<string, unknown>) => ({
      id: l.id, category: l.category, vendorName: l.vendorName ?? null,
      expenseDate: (l.expenseDate as Date).toISOString().slice(0, 10),
      description: l.description, amountPaise: toBigNum(l.amountPaise as bigint),
      gstPaise: toBigNum(l.gstPaise as bigint), paymentMode: l.paymentMode,
      attachmentName: l.attachmentName ?? null, attachmentPath: l.attachmentPath ?? null,
    })),
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

function sheetListDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; periodFrom: Date; periodTo: Date;
    totalPaise: bigint;
    claimant: { fullName: string };
    lines: Array<{ amountPaise: bigint }>;
  };
  const linesTotal = r.lines.reduce((s, l) => s + toBigNum(l.amountPaise), 0);
  return {
    id: r.id, title: r.title, sheetType: r.sheetType, status: r.status,
    claimantName: r.claimant.fullName,
    periodFrom: r.periodFrom.toISOString().slice(0, 10),
    periodTo: r.periodTo.toISOString().slice(0, 10),
    lineCount: r.lines.length, linesTotal,
    createdAt: r.createdAt.toISOString(),
  };
}

async function recalcTotal(sheetId: string): Promise<void> {
  const agg = await prisma.expenseLine.aggregate({
    where: { sheetId, deletedAt: null },
    _sum: { amountPaise: true, gstPaise: true },
  });
  const total = (agg._sum.amountPaise ?? BigInt(0)) + (agg._sum.gstPaise ?? BigInt(0));
  await prisma.expenseSheet.update({ where: { id: sheetId }, data: { totalPaise: total } });
}

// --- Router ---

export const expenseSheetRouter: ExpressRouter = Router();
expenseSheetRouter.use(requireAuth);

/* GET / — list */
expenseSheetRouter.get('/', validate({ query: ListQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.infer<typeof ListQuery>;
  const where: Record<string, unknown> = { deletedAt: null };
  if (q.status) where.status = q.status;
  if (q.sheetType) where.sheetType = q.sheetType;
  if (q.mine === 'true') {
    const myId = await resolveMyUserId(req);
    if (myId) where.claimantUserId = myId;
  } else if (q.claimantUserId) {
    where.claimantUserId = q.claimantUserId;
  }
  if (q.q) where.title = { contains: q.q };

  const take = q.limit + 1;
  const args: Record<string, unknown> = {
    where, orderBy: { createdAt: 'desc' }, take,
    include: {
      claimant: { select: { fullName: true } },
      lines: { where: { deletedAt: null }, select: { amountPaise: true } },
    },
  };
  if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

  const rows = await prisma.expenseSheet.findMany(args as Parameters<typeof prisma.expenseSheet.findMany>[0]);
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

  res.json({ data: page.map((r) => sheetListDto(r as unknown as Record<string, unknown>)), meta: { next_cursor: nextCursor, limit: q.limit } });
}));

/* GET /:id — single with lines */
expenseSheetRouter.get('/:id', validate({ params: IdParams }), asyncHandler(async (req, res) => {
  const row = await prisma.expenseSheet.findFirst({ where: { id: req.params.id as string, deletedAt: null }, include: SHEET_INCLUDE });
  if (!row) throw errors.notFound('Expense sheet not found');
  res.json({ data: sheetToDto(row as unknown as Record<string, unknown>) });
}));

/* POST / — create */
expenseSheetRouter.post('/', validate({ body: CreateSheet }), asyncHandler(async (req, res) => {
  const body = req.body as z.infer<typeof CreateSheet>;
  const actor = actorId(req);
  const id = newId();
  await prisma.expenseSheet.create({
    data: {
      id, title: body.title, sheetType: body.sheetType,
      claimantUserId: body.claimantUserId,
      businessUnitId: body.businessUnitId ?? null,
      opportunityId: body.opportunityId ?? null,
      projectId: body.projectId ?? null,
      costCentre: body.costCentre ?? null,
      periodFrom: new Date(body.periodFrom), periodTo: new Date(body.periodTo),
      notes: body.notes ?? null,
      createdBy: actor, updatedBy: actor,
    },
  });
  const row = await prisma.expenseSheet.findUniqueOrThrow({ where: { id }, include: SHEET_INCLUDE });
  await recordAudit(req, { action: 'CREATE', resourceType: 'expense_sheet', resourceId: id, after: { title: body.title } });
  res.status(201).json({ data: sheetToDto(row as unknown as Record<string, unknown>) });
}));

/* PATCH /:id — update (only DRAFT) */
expenseSheetRouter.patch('/:id', validate({ params: IdParams, body: UpdateSheet }), asyncHandler(async (req, res) => {
  const existing = await prisma.expenseSheet.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!existing) throw errors.notFound('Expense sheet not found');
  if (existing.status !== 'DRAFT') throw errors.businessRule('NOT_EDITABLE', 'Only DRAFT sheets can be edited');

  const body = req.body as z.infer<typeof UpdateSheet>;
  const actor = actorId(req);
  const data: Record<string, unknown> = { updatedBy: actor };
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    if (k === 'periodFrom' || k === 'periodTo') { data[k] = new Date(v as string); continue; }
    data[k] = v;
  }

  await prisma.expenseSheet.update({ where: { id: existing.id }, data });
  const row = await prisma.expenseSheet.findUniqueOrThrow({ where: { id: existing.id }, include: SHEET_INCLUDE });
  await recordAudit(req, { action: 'UPDATE', resourceType: 'expense_sheet', resourceId: existing.id });
  res.json({ data: sheetToDto(row as unknown as Record<string, unknown>) });
}));

/* DELETE /:id — soft delete */
expenseSheetRouter.delete('/:id', validate({ params: IdParams }), asyncHandler(async (req, res) => {
  const existing = await prisma.expenseSheet.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!existing) throw errors.notFound('Expense sheet not found');
  await prisma.expenseSheet.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  await recordAudit(req, { action: 'DELETE', resourceType: 'expense_sheet', resourceId: existing.id });
  res.status(204).end();
}));

/* --- Status transitions --- */

const VALID_TRANSITIONS: Record<string, { to: string; action: string }[]> = {
  DRAFT: [{ to: 'SUBMITTED', action: 'submit' }],
  SUBMITTED: [{ to: 'APPROVED', action: 'approve' }, { to: 'REJECTED', action: 'reject' }],
  APPROVED: [{ to: 'PAID', action: 'pay' }],
  REJECTED: [{ to: 'DRAFT', action: 'revise' }],
};

const TransitionParams = z.object({ id: z.string().min(1).max(26), action: z.string().min(1) });
const TransitionBody = z.object({ reason: z.string().optional(), paymentDate: z.string().optional(), paymentRef: z.string().optional(), paymentPaise: z.coerce.number().int().nonnegative().optional() }).optional();

expenseSheetRouter.post('/:id/:action', validate({ params: TransitionParams, body: TransitionBody }), asyncHandler(async (req, res, next) => {
  const actionName = req.params.action as string;
  const knownActions = ['submit', 'approve', 'reject', 'revise', 'pay'];
  if (!knownActions.includes(actionName)) { next(); return; }

  const sheet = await prisma.expenseSheet.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!sheet) throw errors.notFound('Expense sheet not found');

  const allowed = VALID_TRANSITIONS[sheet.status];
  const transition = allowed?.find((t) => t.action === actionName);
  if (!transition) throw errors.businessRule('INVALID_STATUS', `Cannot ${actionName} a ${sheet.status} expense sheet`);

  const data: Record<string, unknown> = { status: transition.to, updatedBy: actorId(req) };
  const body = req.body as Record<string, unknown> | undefined;

  if (actionName === 'pay') {
    if (body?.paymentDate) data.paymentDate = new Date(body.paymentDate as string);
    if (body?.paymentRef) data.paymentRef = body.paymentRef;
    if (body?.paymentPaise) data.paymentPaise = BigInt(body.paymentPaise as number);
  }
  if (actionName === 'revise') {
    // Reset back to draft for editing
  }

  await prisma.expenseSheet.update({ where: { id: sheet.id }, data });

  // Record event
  await prisma.expenseSheetEvent.create({
    data: {
      id: newId(), sheetId: sheet.id,
      fromStatus: sheet.status, toStatus: transition.to,
      actorUserId: actorId(req), actorRole: req.user?.roles?.[0] ?? 'USER',
      comment: body?.reason as string ?? null,
    },
  });

  await recordAudit(req, { action: 'UPDATE', resourceType: 'expense_sheet', resourceId: sheet.id, after: { status: transition.to } });
  res.json({ data: { status: transition.to } });
}));

/* --- Lines --- */

/* POST /:id/lines — add line with optional file */
expenseSheetRouter.post('/:id/lines', upload.single('file'), asyncHandler(async (req, res) => {
  const sheetId = req.params.id as string;
  if (!sheetId || sheetId.length > 26) throw errors.validation('Invalid sheet ID');
  const sheet = await prisma.expenseSheet.findFirst({ where: { id: sheetId, deletedAt: null } });
  if (!sheet) throw errors.notFound('Expense sheet not found');
  if (sheet.status !== 'DRAFT') { if (req.file) fs.unlinkSync(req.file.path); throw errors.businessRule('NOT_EDITABLE', 'Lines can only be added to DRAFT sheets'); }

  const body = req.body as Record<string, string>;
  const parsed = CreateLine.safeParse({
    expenseDate: body.expenseDate, category: body.category, vendorName: body.vendorName,
    description: body.description, amountPaise: body.amountPaise ? Number(body.amountPaise) : undefined,
    gstPaise: body.gstPaise ? Number(body.gstPaise) : 0, paymentMode: body.paymentMode || 'NEFT',
  });
  if (!parsed.success) { if (req.file) fs.unlinkSync(req.file.path); throw errors.validation(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')); }

  const actor = actorId(req);
  let attachmentPath: string | null = null;
  if (req.file) {
    const result = await storageUpload(req.file, `expense:${sheetId}`);
    attachmentPath = result.storagePath;
  }
  const row = await prisma.expenseLine.create({
    data: {
      id: newId(), sheetId, category: parsed.data.category,
      expenseDate: new Date(parsed.data.expenseDate),
      vendorName: parsed.data.vendorName ?? null, description: parsed.data.description,
      amountPaise: BigInt(parsed.data.amountPaise), gstPaise: BigInt(parsed.data.gstPaise),
      paymentMode: parsed.data.paymentMode,
      attachmentName: req.file?.originalname ?? null, attachmentPath,
      createdBy: actor, updatedBy: actor,
    },
  });
  await recalcTotal(sheetId);
  res.status(201).json({ data: { id: row.id } });
}));

/* PATCH /:id/lines/:lineId — update line with optional file */
expenseSheetRouter.patch('/:id/lines/:lineId', upload.single('file'), asyncHandler(async (req, res) => {
  const sheetId = req.params.id as string;
  const lineId = req.params.lineId as string;
  const line = await prisma.expenseLine.findFirst({ where: { id: lineId, sheetId, deletedAt: null } });
  if (!line) throw errors.notFound('Line not found');

  const sheet = await prisma.expenseSheet.findFirst({ where: { id: sheetId, deletedAt: null } });
  if (sheet && sheet.status !== 'DRAFT') { if (req.file) fs.unlinkSync(req.file.path); throw errors.businessRule('NOT_EDITABLE', 'Lines can only be edited on DRAFT sheets'); }

  const body = req.body as Record<string, string>;
  const data: Record<string, unknown> = { updatedBy: actorId(req) };
  if (body.expenseDate !== undefined) data.expenseDate = new Date(body.expenseDate);
  if (body.category !== undefined) data.category = body.category;
  if (body.vendorName !== undefined) data.vendorName = body.vendorName || null;
  if (body.description !== undefined) data.description = body.description;
  if (body.amountPaise !== undefined) data.amountPaise = BigInt(Number(body.amountPaise));
  if (body.gstPaise !== undefined) data.gstPaise = BigInt(Number(body.gstPaise));
  if (body.paymentMode !== undefined) data.paymentMode = body.paymentMode;

  if (req.file) {
    if (line.attachmentPath) { try { await deleteFileWithFallback(line.attachmentPath, LEGACY_DIR); } catch { /* best effort */ } }
    const result = await storageUpload(req.file, `expense:${sheetId}`);
    data.attachmentName = req.file.originalname; data.attachmentPath = result.storagePath;
  }
  if (body.removeAttachment === 'true' && !req.file) {
    if (line.attachmentPath) { try { await deleteFileWithFallback(line.attachmentPath, LEGACY_DIR); } catch { /* best effort */ } }
    data.attachmentName = null; data.attachmentPath = null;
  }

  await prisma.expenseLine.update({ where: { id: line.id }, data });
  await recalcTotal(sheetId);
  res.json({ data: { id: line.id } });
}));

/* DELETE /:id/lines/:lineId */
expenseSheetRouter.delete('/:id/lines/:lineId', validate({ params: LineIdParams }), asyncHandler(async (req, res) => {
  const line = await prisma.expenseLine.findFirst({ where: { id: req.params.lineId as string, sheetId: req.params.id as string, deletedAt: null } });
  if (!line) throw errors.notFound('Line not found');
  if (line.attachmentPath) { try { await deleteFileWithFallback(line.attachmentPath, LEGACY_DIR); } catch { /* best effort */ } }
  await prisma.expenseLine.update({ where: { id: line.id }, data: { deletedAt: new Date() } });
  await recalcTotal(line.sheetId);
  res.status(204).end();
}));

/* GET /:id/lines/:lineId/download */
expenseSheetRouter.get('/:id/lines/:lineId/download', validate({ params: LineIdParams }), asyncHandler(async (req, res) => {
  const line = await prisma.expenseLine.findFirst({ where: { id: req.params.lineId as string, sheetId: req.params.id as string, deletedAt: null } });
  if (!line) throw errors.notFound('Line not found');
  if (!line.attachmentPath) throw errors.notFound('No attachment');
  const fileName = line.attachmentName ?? line.attachmentPath;
  res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
  const { stream } = await downloadFileWithFallback(line.attachmentPath, LEGACY_DIR);
  (stream as NodeJS.ReadableStream).pipe(res);
}));
