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
import { extractBillData } from '../../lib/gemini.js';
import { logger } from '../../lib/logger.js';

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
const SUPPLY_TYPES = ['INTRA', 'INTER', 'EXEMPT'] as const;
const GST_RATES_BPS = [0, 500, 1200, 1800, 2800] as const;
const ENTITY_TYPES = ['OPPORTUNITY', 'PROJECT', 'INITIATIVE', 'LEAD', 'ACCOUNT', 'CONTACT', 'INFLUENCER'] as const;

const AssociationInput = z.object({ entityType: z.enum(ENTITY_TYPES), entityId: z.string().min(1).max(26) });

const CreateSheet = z.object({
  title: z.string().min(1).max(255),
  sheetType: z.enum(SHEET_TYPES).default('ADMIN_GENERAL'),
  businessUnitId: z.string().max(26).nullable().optional(),
  claimantUserId: z.string().min(1).max(26),
  opportunityId: z.string().max(26).nullable().optional(),
  projectId: z.string().max(26).nullable().optional(),
  initiativeId: z.string().max(26).nullable().optional(),
  costCentre: z.string().max(32).nullable().optional(),
  periodFrom: z.string().min(1),
  periodTo: z.string().min(1),
  notes: z.string().nullable().optional(),
  advanceAmountPaise: z.coerce.number().int().nonnegative().default(0),
  advanceStatus: z.string().default('NOT_REQUESTED'),
  associations: z.array(AssociationInput).optional(),
});

const UpdateSheet = z.object({
  title: z.string().min(1).max(255).optional(),
  sheetType: z.enum(SHEET_TYPES).optional(),
  businessUnitId: z.string().max(26).nullable().optional(),
  claimantUserId: z.string().min(1).max(26).optional(),
  opportunityId: z.string().max(26).nullable().optional(),
  projectId: z.string().max(26).nullable().optional(),
  initiativeId: z.string().max(26).nullable().optional(),
  costCentre: z.string().max(32).nullable().optional(),
  periodFrom: z.string().min(1).optional(),
  periodTo: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  advanceAmountPaise: z.coerce.number().int().nonnegative().optional(),
  advanceStatus: z.string().optional(),
  associations: z.array(AssociationInput).optional(),
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

const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;

const CreateLine = z.object({
  expenseDate: z.string().min(1),
  category: z.string().min(1).max(64),
  vendorName: z.string().max(255).optional(),
  description: z.string().min(1).max(500),
  amountPaise: z.coerce.number().int().nonnegative(),
  gstPaise: z.coerce.number().int().nonnegative().default(0), // kept for backward compat; overridden by computed
  paymentMode: z.enum(PAYMENT_MODES).default('NEFT'),
  // GST compliance fields
  vendorGstin: z.string().max(15).regex(GSTIN_REGEX, 'Invalid GSTIN format').optional().or(z.literal('')),
  invoiceNumber: z.string().max(64).optional().or(z.literal('')),
  invoiceDate: z.string().optional().or(z.literal('')),
  hsnSacCode: z.string().max(8).optional().or(z.literal('')),
  gstRateBps: z.coerce.number().int().nonnegative().default(0),
  supplyType: z.string().default('INTRA'),
  reverseCharge: z.string().or(z.boolean()).default('false'),
  itcEligible: z.string().or(z.boolean()).default('false'),
});

// --- GST computation ---

function computeGst(amountPaise: bigint, gstRateBps: number, supplyType: string) {
  if (supplyType === 'EXEMPT' || gstRateBps === 0) {
    return { cgst: BigInt(0), sgst: BigInt(0), igst: BigInt(0), total: BigInt(0) };
  }
  const totalGst = (amountPaise * BigInt(gstRateBps)) / BigInt(10000);
  if (supplyType === 'INTER') {
    return { cgst: BigInt(0), sgst: BigInt(0), igst: totalGst, total: totalGst };
  }
  // INTRA: split 50/50
  const half = totalGst / BigInt(2);
  const remainder = totalGst - half * BigInt(2);
  return { cgst: half, sgst: half + remainder, igst: BigInt(0), total: totalGst };
}

function parseBool(v: string | boolean | undefined): boolean {
  if (typeof v === 'boolean') return v;
  return v === 'true' || v === '1';
}

// --- Entity name resolution (same pattern as travel) ---

async function resolveEntityNames(associations: Array<{ entityType: string; entityId: string }>): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const byType: Record<string, Set<string>> = {};
  for (const a of associations) {
    if (!byType[a.entityType]) byType[a.entityType] = new Set();
    byType[a.entityType]!.add(a.entityId);
  }
  const lookups: Promise<void>[] = [];
  if (byType['OPPORTUNITY']?.size) lookups.push(prisma.opportunity.findMany({ where: { id: { in: [...byType['OPPORTUNITY']!] } }, select: { id: true, title: true } }).then((r) => r.forEach((x) => names.set(`OPPORTUNITY:${x.id}`, x.title))));
  if (byType['PROJECT']?.size) lookups.push(prisma.project.findMany({ where: { id: { in: [...byType['PROJECT']!] } }, select: { id: true, name: true } }).then((r) => r.forEach((x) => names.set(`PROJECT:${x.id}`, x.name))));
  if (byType['INITIATIVE']?.size) lookups.push(prisma.initiative.findMany({ where: { id: { in: [...byType['INITIATIVE']!] } }, select: { id: true, title: true } }).then((r) => r.forEach((x) => names.set(`INITIATIVE:${x.id}`, x.title))));
  if (byType['LEAD']?.size) lookups.push(prisma.lead.findMany({ where: { id: { in: [...byType['LEAD']!] } }, select: { id: true, title: true } }).then((r) => r.forEach((x) => names.set(`LEAD:${x.id}`, x.title))));
  if (byType['ACCOUNT']?.size) lookups.push(prisma.account.findMany({ where: { id: { in: [...byType['ACCOUNT']!] } }, select: { id: true, name: true } }).then((r) => r.forEach((x) => names.set(`ACCOUNT:${x.id}`, x.name))));
  if (byType['CONTACT']?.size) lookups.push(prisma.contact.findMany({ where: { id: { in: [...byType['CONTACT']!] } }, select: { id: true, firstName: true, lastName: true } }).then((r) => r.forEach((x) => names.set(`CONTACT:${x.id}`, `${x.firstName}${x.lastName ? ' ' + x.lastName : ''}`))));
  if (byType['INFLUENCER']?.size) lookups.push(prisma.influencer.findMany({ where: { id: { in: [...byType['INFLUENCER']!] } }, select: { id: true, name: true } }).then((r) => r.forEach((x) => names.set(`INFLUENCER:${x.id}`, x.name))));
  await Promise.all(lookups);
  return names;
}

async function syncAssociations(sheetId: string, associations: z.infer<typeof AssociationInput>[]): Promise<void> {
  await prisma.expenseSheetAssociation.deleteMany({ where: { sheetId } });
  if (associations.length > 0) {
    await prisma.expenseSheetAssociation.createMany({ data: associations.map((a) => ({ id: newId(), sheetId, entityType: a.entityType, entityId: a.entityId })) });
  }
}

// --- Includes ---

const SHEET_INCLUDE = {
  claimant: { select: { id: true, fullName: true } },
  businessUnit: { select: { id: true, name: true } },
  lines: { where: { deletedAt: null }, orderBy: { expenseDate: 'asc' as const } },
  associations: true,
} as const;

// --- DTO ---

async function sheetToDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date; periodFrom: Date; periodTo: Date;
    totalPaise: bigint; paymentPaise: bigint; paymentDate: Date | null;
    claimant: { id: string; fullName: string };
    businessUnit?: { id: string; name: string } | null;
    lines: Array<Record<string, unknown>>;
    associations: Array<{ id: string; entityType: string; entityId: string }>;
  };

  const entityNames = await resolveEntityNames(r.associations);

  const linesTotal = r.lines.reduce((s, l) => s + toBigNum((l as { amountPaise: bigint }).amountPaise), 0);
  const gstTotal = r.lines.reduce((s, l) => s + toBigNum((l as { gstPaise: bigint }).gstPaise), 0);
  const cgstTotal = r.lines.reduce((s, l) => s + toBigNum((l as { cgstPaise: bigint }).cgstPaise), 0);
  const sgstTotal = r.lines.reduce((s, l) => s + toBigNum((l as { sgstPaise: bigint }).sgstPaise), 0);
  const igstTotal = r.lines.reduce((s, l) => s + toBigNum((l as { igstPaise: bigint }).igstPaise), 0);
  const itcEligibleTotal = r.lines.filter((l) => (l as { itcEligible: boolean }).itcEligible).reduce((s, l) => s + toBigNum((l as { gstPaise: bigint }).gstPaise), 0);

  return {
    id: r.id, title: r.title, sheetType: r.sheetType, status: r.status,
    claimantId: r.claimant.id, claimantName: r.claimant.fullName,
    businessUnitId: r.businessUnit?.id ?? null, businessUnitName: r.businessUnit?.name ?? null,
    opportunityId: r.opportunityId ?? null, projectId: r.projectId ?? null,
    initiativeId: r.initiativeId ?? null,
    costCentre: r.costCentre ?? null,
    rejectionReason: r.rejectionReason ?? null,
    periodFrom: r.periodFrom.toISOString().slice(0, 10),
    periodTo: r.periodTo.toISOString().slice(0, 10),
    notes: r.notes ?? null,
    totalPaise: toBigNum(r.totalPaise),
    linesTotal, gstTotal, cgstTotal, sgstTotal, igstTotal, itcEligibleTotal,
    grandTotal: linesTotal + gstTotal,
    lineCount: r.lines.length,
    // Advance
    advanceAmountPaise: toBigNum(r.advanceAmountPaise as bigint),
    advanceStatus: r.advanceStatus ?? 'NOT_REQUESTED',
    advancePaidPaise: toBigNum(r.advancePaidPaise as bigint),
    advancePaidDate: r.advancePaidDate ? (r.advancePaidDate as Date).toISOString().slice(0, 10) : null,
    advanceRef: r.advanceRef ?? null,
    advancePending: Math.max(0, toBigNum(r.advanceAmountPaise as bigint) - toBigNum(r.advancePaidPaise as bigint)),
    // Reimbursement
    reimbursementStatus: r.reimbursementStatus ?? 'PENDING',
    reimbursementDue: Math.max(0, (linesTotal + gstTotal) - toBigNum(r.advanceAmountPaise as bigint)),
    reimbursementPaidPaise: toBigNum(r.reimbursementPaidPaise as bigint),
    reimbursementPaidDate: r.reimbursementPaidDate ? (r.reimbursementPaidDate as Date).toISOString().slice(0, 10) : null,
    reimbursementRef: r.reimbursementRef ?? null,
    reimbursementBalance: Math.max(0, (linesTotal + gstTotal) - toBigNum(r.advanceAmountPaise as bigint) - toBigNum(r.reimbursementPaidPaise as bigint)),
    // Legacy
    paymentPaise: toBigNum(r.paymentPaise),
    paymentDate: r.paymentDate ? r.paymentDate.toISOString().slice(0, 10) : null,
    paymentRef: r.paymentRef ?? null,
    lines: r.lines.map((l: Record<string, unknown>) => ({
      id: l.id, category: l.category, vendorName: l.vendorName ?? null,
      expenseDate: (l.expenseDate as Date).toISOString().slice(0, 10),
      description: l.description, amountPaise: toBigNum(l.amountPaise as bigint),
      gstPaise: toBigNum(l.gstPaise as bigint), paymentMode: l.paymentMode,
      // GST compliance fields
      vendorGstin: l.vendorGstin ?? null,
      invoiceNumber: l.invoiceNumber ?? null,
      invoiceDate: l.invoiceDate ? (l.invoiceDate as Date).toISOString().slice(0, 10) : null,
      hsnSacCode: l.hsnSacCode ?? null,
      gstRateBps: l.gstRateBps ?? 0,
      supplyType: l.supplyType ?? 'INTRA',
      cgstPaise: toBigNum(l.cgstPaise as bigint),
      sgstPaise: toBigNum(l.sgstPaise as bigint),
      igstPaise: toBigNum(l.igstPaise as bigint),
      reverseCharge: l.reverseCharge ?? false,
      itcEligible: l.itcEligible ?? false,
      attachmentName: l.attachmentName ?? null, attachmentPath: l.attachmentPath ?? null,
    })),
    associations: r.associations.map((a) => ({
      id: a.id, entityType: a.entityType, entityId: a.entityId,
      entityName: entityNames.get(`${a.entityType}:${a.entityId}`) ?? a.entityId,
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
  res.json({ data: await sheetToDto(row as unknown as Record<string, unknown>) });
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
      initiativeId: body.initiativeId ?? null,
      costCentre: body.costCentre ?? null,
      periodFrom: new Date(body.periodFrom), periodTo: new Date(body.periodTo),
      notes: body.notes ?? null,
      advanceAmountPaise: BigInt(body.advanceAmountPaise),
      advanceStatus: body.advanceStatus,
      createdBy: actor, updatedBy: actor,
    },
  });
  if (body.associations && body.associations.length > 0) {
    await syncAssociations(id, body.associations);
  }
  const row = await prisma.expenseSheet.findUniqueOrThrow({ where: { id }, include: SHEET_INCLUDE });
  await recordAudit(req, { action: 'CREATE', resourceType: 'expense_sheet', resourceId: id, after: { title: body.title } });
  res.status(201).json({ data: await sheetToDto(row as unknown as Record<string, unknown>) });
}));

/* PATCH /:id — update (only DRAFT) */
expenseSheetRouter.patch('/:id', validate({ params: IdParams, body: UpdateSheet }), asyncHandler(async (req, res) => {
  const existing = await prisma.expenseSheet.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!existing) throw errors.notFound('Expense sheet not found');
  if (existing.status !== 'DRAFT') throw errors.businessRule('NOT_EDITABLE', 'Only DRAFT sheets can be edited (header)');

  const body = req.body as z.infer<typeof UpdateSheet>;
  const actor = actorId(req);
  const data: Record<string, unknown> = { updatedBy: actor };
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined || k === 'associations') continue;
    if (k === 'periodFrom' || k === 'periodTo') { data[k] = new Date(v as string); continue; }
    data[k] = v;
  }

  await prisma.expenseSheet.update({ where: { id: existing.id }, data });
  if (body.associations !== undefined) {
    await syncAssociations(existing.id, body.associations ?? []);
  }
  const row = await prisma.expenseSheet.findUniqueOrThrow({ where: { id: existing.id }, include: SHEET_INCLUDE });
  await recordAudit(req, { action: 'UPDATE', resourceType: 'expense_sheet', resourceId: existing.id });
  res.json({ data: await sheetToDto(row as unknown as Record<string, unknown>) });
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
  DRAFT:             [{ to: 'SUBMITTED', action: 'submit' }],
  SUBMITTED:         [{ to: 'APPROVED', action: 'approve' }, { to: 'REJECTED', action: 'reject' }],
  REJECTED:          [{ to: 'DRAFT', action: 'revise' }],
  APPROVED:          [{ to: 'IN_PROGRESS', action: 'start' }],
  IN_PROGRESS:       [{ to: 'EXPENSE_SUBMITTED', action: 'submit-expenses' }],
  EXPENSE_SUBMITTED: [{ to: 'COMPLETED', action: 'complete' }, { to: 'IN_PROGRESS', action: 'return-expenses' }],
};

// States where expense lines can be added/edited
const LINE_EDITABLE_STATES = new Set(['DRAFT', 'IN_PROGRESS']);

const TransitionParams = z.object({ id: z.string().min(1).max(26), action: z.string().min(1) });
const TransitionBody = z.object({ reason: z.string().optional() }).optional();

expenseSheetRouter.post('/:id/:action', validate({ params: TransitionParams, body: TransitionBody }), asyncHandler(async (req, res, next) => {
  const actionName = req.params.action as string;
  const knownActions = ['submit', 'approve', 'reject', 'revise', 'start', 'submit-expenses', 'complete', 'return-expenses'];
  if (!knownActions.includes(actionName)) { next(); return; }

  const sheet = await prisma.expenseSheet.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!sheet) throw errors.notFound('Expense sheet not found');

  const allowed = VALID_TRANSITIONS[sheet.status];
  const transition = allowed?.find((t) => t.action === actionName);
  if (!transition) throw errors.businessRule('INVALID_STATUS', `Cannot ${actionName} a ${sheet.status} expense sheet`);

  const data: Record<string, unknown> = { status: transition.to, updatedBy: actorId(req) };
  const body = req.body as Record<string, unknown> | undefined;

  if (actionName === 'approve') {
    // Auto-upgrade advance status from REQUESTED to APPROVED
    if (sheet.advanceStatus === 'REQUESTED') {
      data.advanceStatus = 'APPROVED';
    }
    data.rejectionReason = null; // Clear any previous rejection reason
  }
  if (actionName === 'reject') {
    data.rejectionReason = (body?.reason as string) || null;
  }
  if (actionName === 'revise') {
    // Reset back to draft for editing — keep rejection reason visible
  }
  if (actionName === 'complete') {
    data.reimbursementStatus = 'APPROVED';
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
  if (!LINE_EDITABLE_STATES.has(sheet.status)) { if (req.file) fs.unlinkSync(req.file.path); throw errors.businessRule('NOT_EDITABLE', 'Lines can only be added in DRAFT or IN_PROGRESS'); }

  const body = req.body as Record<string, string>;
  const parsed = CreateLine.safeParse({
    expenseDate: body.expenseDate, category: body.category, vendorName: body.vendorName,
    description: body.description, amountPaise: body.amountPaise ? Number(body.amountPaise) : undefined,
    gstPaise: body.gstPaise ? Number(body.gstPaise) : 0, paymentMode: body.paymentMode || 'NEFT',
    vendorGstin: body.vendorGstin || undefined, invoiceNumber: body.invoiceNumber || undefined,
    invoiceDate: body.invoiceDate || undefined, hsnSacCode: body.hsnSacCode || undefined,
    gstRateBps: body.gstRateBps ? Number(body.gstRateBps) : 0,
    supplyType: body.supplyType || 'INTRA',
    reverseCharge: body.reverseCharge, itcEligible: body.itcEligible,
  });
  if (!parsed.success) { if (req.file) fs.unlinkSync(req.file.path); throw errors.validation(parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')); }

  // Compute GST components from amount + rate + supply type
  const amtBig = BigInt(parsed.data.amountPaise);
  const gst = computeGst(amtBig, parsed.data.gstRateBps, parsed.data.supplyType);

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
      amountPaise: amtBig, gstPaise: gst.total,
      paymentMode: parsed.data.paymentMode,
      vendorGstin: parsed.data.vendorGstin || null,
      invoiceNumber: parsed.data.invoiceNumber || null,
      invoiceDate: parsed.data.invoiceDate ? new Date(parsed.data.invoiceDate) : null,
      hsnSacCode: parsed.data.hsnSacCode || null,
      gstRateBps: parsed.data.gstRateBps,
      supplyType: parsed.data.supplyType,
      cgstPaise: gst.cgst, sgstPaise: gst.sgst, igstPaise: gst.igst,
      reverseCharge: parseBool(parsed.data.reverseCharge),
      itcEligible: parseBool(parsed.data.itcEligible),
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
  if (sheet && !LINE_EDITABLE_STATES.has(sheet.status)) { if (req.file) fs.unlinkSync(req.file.path); throw errors.businessRule('NOT_EDITABLE', 'Lines can only be edited in DRAFT or IN_PROGRESS'); }

  const body = req.body as Record<string, string>;
  const data: Record<string, unknown> = { updatedBy: actorId(req) };
  if (body.expenseDate !== undefined) data.expenseDate = new Date(body.expenseDate);
  if (body.category !== undefined) data.category = body.category;
  if (body.vendorName !== undefined) data.vendorName = body.vendorName || null;
  if (body.description !== undefined) data.description = body.description;
  if (body.amountPaise !== undefined) data.amountPaise = BigInt(Number(body.amountPaise));
  if (body.paymentMode !== undefined) data.paymentMode = body.paymentMode;
  // GST compliance fields
  if (body.vendorGstin !== undefined) data.vendorGstin = body.vendorGstin || null;
  if (body.invoiceNumber !== undefined) data.invoiceNumber = body.invoiceNumber || null;
  if (body.invoiceDate !== undefined) data.invoiceDate = body.invoiceDate ? new Date(body.invoiceDate) : null;
  if (body.hsnSacCode !== undefined) data.hsnSacCode = body.hsnSacCode || null;
  if (body.gstRateBps !== undefined) data.gstRateBps = Number(body.gstRateBps);
  if (body.supplyType !== undefined) data.supplyType = body.supplyType;
  if (body.reverseCharge !== undefined) data.reverseCharge = parseBool(body.reverseCharge);
  if (body.itcEligible !== undefined) data.itcEligible = parseBool(body.itcEligible);
  // Recompute GST components
  const finalAmount = data.amountPaise != null ? data.amountPaise as bigint : line.amountPaise;
  const finalRate = data.gstRateBps != null ? data.gstRateBps as number : line.gstRateBps;
  const finalSupply = data.supplyType != null ? data.supplyType as string : line.supplyType;
  const gst = computeGst(finalAmount, finalRate, finalSupply);
  data.cgstPaise = gst.cgst; data.sgstPaise = gst.sgst; data.igstPaise = gst.igst;
  data.gstPaise = gst.total;

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

/* --- Bills (AI import) --- */

const billUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEMP_DIR),
    filename: (_req, file, cb) => cb(null, `${newId()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 15 * 1024 * 1024 },
});

/* GET /:id/bills — list uploaded bills */
expenseSheetRouter.get('/:id/bills', validate({ params: IdParams }), asyncHandler(async (req, res) => {
  const sheetId = req.params.id as string;
  const bills = await prisma.expenseSheetBill.findMany({
    where: { sheetId },
    orderBy: { createdAt: 'asc' },
  });
  res.json({
    data: bills.map((b) => ({
      id: b.id, fileName: b.fileName, fileSize: b.fileSize, mimeType: b.mimeType,
      importStatus: b.importStatus, linkedLineId: b.linkedLineId,
      aiExtractedData: b.aiExtractedData, errorMessage: b.errorMessage,
      createdAt: b.createdAt.toISOString(),
    })),
  });
}));

/* POST /:id/bills — upload one or more bill files */
expenseSheetRouter.post('/:id/bills', billUpload.array('files', 20), asyncHandler(async (req, res) => {
  const sheetId = req.params.id as string;
  const sheet = await prisma.expenseSheet.findFirst({ where: { id: sheetId, deletedAt: null } });
  if (!sheet) throw errors.notFound('Expense sheet not found');

  const files = req.files as Express.Multer.File[];
  if (!files || files.length === 0) throw errors.validation('No files uploaded');

  const created: string[] = [];
  for (const file of files) {
    const result = await storageUpload(file, `expense-bills:${sheetId}`);
    const bill = await prisma.expenseSheetBill.create({
      data: {
        id: newId(), sheetId,
        fileName: file.originalname,
        filePath: result.storagePath,
        fileSize: file.size,
        mimeType: file.mimetype,
        importStatus: 'PENDING',
      },
    });
    created.push(bill.id);
  }

  res.status(201).json({ data: { uploaded: created.length, billIds: created } });
}));

/* POST /:id/bills/process — AI-process pending bills */
expenseSheetRouter.post('/:id/bills/process', validate({ params: IdParams }), asyncHandler(async (req, res) => {
  const sheetId = req.params.id as string;
  const sheet = await prisma.expenseSheet.findFirst({ where: { id: sheetId, deletedAt: null } });
  if (!sheet) throw errors.notFound('Expense sheet not found');
  if (!LINE_EDITABLE_STATES.has(sheet.status)) throw errors.businessRule('NOT_EDITABLE', 'Lines can only be added in DRAFT or IN_PROGRESS');

  const pendingBills = await prisma.expenseSheetBill.findMany({
    where: { sheetId, importStatus: 'PENDING' },
    orderBy: { createdAt: 'asc' },
  });

  if (pendingBills.length === 0) {
    res.json({ data: { processed: 0, message: 'No pending bills to process' } });
    return;
  }

  const actor = actorId(req);
  let successCount = 0;
  let failCount = 0;

  for (let idx = 0; idx < pendingBills.length; idx++) {
    const bill = pendingBills[idx]!;
    // Rate limit: wait 5s between bills to stay within free tier (15 RPM)
    if (idx > 0) await new Promise((r) => setTimeout(r, 5000));
    try {
      // Mark as processing
      await prisma.expenseSheetBill.update({ where: { id: bill.id }, data: { importStatus: 'PROCESSING' } });

      // Download the file
      const { stream } = await downloadFileWithFallback(bill.filePath, LEGACY_DIR);
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>) { chunks.push(chunk); }
      const fileData = Buffer.concat(chunks);

      // Call Gemini to extract bill data
      const extracted = await extractBillData(fileData, bill.mimeType);

      // Compute GST
      const gst = computeGst(BigInt(extracted.amountPaise), extracted.gstRateBps, extracted.supplyType);

      // Create expense line from extracted data
      const lineId = newId();
      await prisma.expenseLine.create({
        data: {
          id: lineId, sheetId,
          expenseDate: extracted.invoiceDate ? new Date(extracted.invoiceDate) : new Date(),
          category: extracted.category || 'Other / Miscellaneous',
          vendorName: extracted.vendorName,
          description: extracted.description,
          amountPaise: BigInt(extracted.amountPaise),
          gstPaise: gst.total,
          paymentMode: 'NEFT',
          vendorGstin: extracted.vendorGstin,
          invoiceNumber: extracted.invoiceNumber,
          invoiceDate: extracted.invoiceDate ? new Date(extracted.invoiceDate) : null,
          hsnSacCode: extracted.hsnSacCode,
          gstRateBps: extracted.gstRateBps,
          supplyType: extracted.supplyType,
          cgstPaise: gst.cgst, sgstPaise: gst.sgst, igstPaise: gst.igst,
          reverseCharge: false,
          itcEligible: extracted.vendorGstin ? true : false,
          attachmentName: bill.fileName,
          attachmentPath: bill.filePath,
          createdBy: actor, updatedBy: actor,
        },
      });

      // Mark bill as imported
      await prisma.expenseSheetBill.update({
        where: { id: bill.id },
        data: {
          importStatus: 'IMPORTED',
          linkedLineId: lineId,
          aiExtractedData: extracted as unknown as Record<string, unknown>,
        },
      });

      successCount++;
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : 'Unknown error';
      logger.error({ billId: bill.id, err: errMsg }, 'Bill processing failed');
      await prisma.expenseSheetBill.update({
        where: { id: bill.id },
        data: { importStatus: 'FAILED', errorMessage: errMsg },
      });
      failCount++;
    }
  }

  // Recalc sheet total
  await recalcTotal(sheetId);

  res.json({ data: { processed: pendingBills.length, success: successCount, failed: failCount } });
}));

/* POST /:id/bills/:billId/retry — retry a failed bill */
expenseSheetRouter.post('/:id/bills/:billId/retry', asyncHandler(async (req, res) => {
  const billId = req.params.billId as string;
  const bill = await prisma.expenseSheetBill.findFirst({ where: { id: billId, sheetId: req.params.id as string } });
  if (!bill) throw errors.notFound('Bill not found');
  if (bill.importStatus !== 'FAILED') throw errors.businessRule('NOT_FAILED', 'Only failed bills can be retried');
  await prisma.expenseSheetBill.update({ where: { id: bill.id }, data: { importStatus: 'PENDING', errorMessage: null } });
  res.json({ data: { id: bill.id, importStatus: 'PENDING' } });
}));

/* DELETE /:id/bills/:billId */
expenseSheetRouter.delete('/:id/bills/:billId', asyncHandler(async (req, res) => {
  const bill = await prisma.expenseSheetBill.findFirst({ where: { id: req.params.billId as string, sheetId: req.params.id as string } });
  if (!bill) throw errors.notFound('Bill not found');
  try { await deleteFileWithFallback(bill.filePath, LEGACY_DIR); } catch { /* best effort */ }
  await prisma.expenseSheetBill.delete({ where: { id: bill.id } });
  res.status(204).end();
}));

/* ============================================== */
/* Expense Categories (standalone, no sheet scope) */
/* ============================================== */

export const expenseCategoryRouter: ExpressRouter = Router();
expenseCategoryRouter.use(requireAuth);

/* GET / — list all categories */
expenseCategoryRouter.get('/', asyncHandler(async (_req, res) => {
  const rows = await prisma.expenseCategory.findMany({ where: { deletedAt: null }, orderBy: { name: 'asc' } });
  res.json({
    data: rows.map((r) => ({
      id: r.id, name: r.name, sacCode: r.sacCode ?? null,
      defaultGstRateBps: r.defaultGstRateBps, capPaise: r.capPaise ? Number(r.capPaise) : null,
      reimbursable: r.reimbursable, gstInputCreditEligible: r.gstInputCreditEligible,
    })),
  });
}));
