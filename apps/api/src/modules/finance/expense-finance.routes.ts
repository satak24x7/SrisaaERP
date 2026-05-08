import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function toBigNum(v: bigint | null | undefined): number {
  return v != null ? Number(v) : 0;
}

const IdParams = z.object({ id: z.string().min(1).max(26) });

const ListQuery = z.object({
  tab: z.enum(['advance', 'reimbursement']).default('advance'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const RecordAdvanceInput = z.object({
  advancePaidPaise: z.coerce.number().int().nonnegative(),
  advancePaidDate: z.string().min(1),
  advanceRef: z.string().max(255).optional(),
});

const RecordReimbursementInput = z.object({
  reimbursementPaidPaise: z.coerce.number().int().nonnegative(),
  reimbursementPaidDate: z.string().min(1),
  reimbursementRef: z.string().max(255).optional(),
});

const SHEET_INCLUDE = {
  claimant: { select: { id: true, fullName: true } },
  businessUnit: { select: { id: true, name: true } },
  lines: { where: { deletedAt: null }, select: { amountPaise: true, gstPaise: true } },
} as const;

function sheetToFinanceDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; periodFrom: Date; periodTo: Date;
    advanceAmountPaise: bigint; advancePaidPaise: bigint; advancePaidDate: Date | null;
    reimbursementPaidPaise: bigint; reimbursementPaidDate: Date | null;
    claimant: { id: string; fullName: string };
    businessUnit?: { id: string; name: string } | null;
    lines: Array<{ amountPaise: bigint; gstPaise: bigint }>;
  };

  const linesTotal = r.lines.reduce((s, l) => s + toBigNum(l.amountPaise), 0);
  const gstTotal = r.lines.reduce((s, l) => s + toBigNum(l.gstPaise), 0);
  const grandTotal = linesTotal + gstTotal;
  const advanceRequested = toBigNum(r.advanceAmountPaise);
  const advancePaid = toBigNum(r.advancePaidPaise);
  const advancePending = Math.max(0, advanceRequested - advancePaid);
  const reimbursementDue = Math.max(0, grandTotal - advanceRequested);
  const reimbursementPaid = toBigNum(r.reimbursementPaidPaise);
  const reimbursementBalance = Math.max(0, reimbursementDue - reimbursementPaid);

  return {
    id: r.id, title: r.title, sheetType: r.sheetType, status: r.status,
    claimantName: r.claimant.fullName,
    businessUnitName: r.businessUnit?.name ?? null,
    periodFrom: r.periodFrom.toISOString().slice(0, 10),
    periodTo: r.periodTo.toISOString().slice(0, 10),
    lineCount: r.lines.length, linesTotal, gstTotal, grandTotal,
    advanceStatus: r.advanceStatus, advanceRequested, advancePaid,
    advancePaidDate: r.advancePaidDate ? r.advancePaidDate.toISOString().slice(0, 10) : null,
    advanceRef: r.advanceRef ?? null, advancePending,
    reimbursementStatus: r.reimbursementStatus, reimbursementDue, reimbursementPaid,
    reimbursementPaidDate: r.reimbursementPaidDate ? r.reimbursementPaidDate.toISOString().slice(0, 10) : null,
    reimbursementRef: r.reimbursementRef ?? null, reimbursementBalance,
    createdAt: r.createdAt.toISOString(),
  };
}

export const expenseFinanceRouter: ExpressRouter = Router();
expenseFinanceRouter.use(requireAuth);

/* GET / — list expense sheets for finance (advance or reimbursement tab) */
expenseFinanceRouter.get('/', validate({ query: ListQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.infer<typeof ListQuery>;

  const where: Record<string, unknown> = { deletedAt: null };

  if (q.tab === 'advance') {
    // Show sheets past approval that have an advance requested
    where.status = { in: ['APPROVED', 'IN_PROGRESS', 'EXPENSE_SUBMITTED', 'COMPLETED'] };
    where.advanceAmountPaise = { gt: 0 };
  } else {
    // Show sheets with expenses submitted or completed (reimbursement = grandTotal - advance)
    where.status = { in: ['EXPENSE_SUBMITTED', 'COMPLETED'] };
  }

  const take = q.limit + 1;
  const args: Record<string, unknown> = {
    where, orderBy: { createdAt: 'desc' as const }, take,
    include: SHEET_INCLUDE,
  };
  if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

  const rows = await prisma.expenseSheet.findMany(args as Parameters<typeof prisma.expenseSheet.findMany>[0]);
  const hasMore = rows.length > q.limit;
  const page = hasMore ? rows.slice(0, q.limit) : rows;
  const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

  res.json({
    data: page.map((r) => sheetToFinanceDto(r as unknown as Record<string, unknown>)),
    meta: { next_cursor: nextCursor, limit: q.limit },
  });
}));

/* POST /:id/record-advance — finance records advance payment */
expenseFinanceRouter.post('/:id/record-advance', validate({ params: IdParams, body: RecordAdvanceInput }), asyncHandler(async (req, res) => {
  const sheet = await prisma.expenseSheet.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!sheet) throw errors.notFound('Expense sheet not found');
  if (!['APPROVED', 'IN_PROGRESS', 'EXPENSE_SUBMITTED', 'COMPLETED'].includes(sheet.status)) throw errors.businessRule('NOT_APPROVED', 'Sheet must be approved first');

  const body = req.body as z.infer<typeof RecordAdvanceInput>;
  await prisma.expenseSheet.update({
    where: { id: sheet.id },
    data: {
      advancePaidPaise: BigInt(body.advancePaidPaise),
      advancePaidDate: new Date(body.advancePaidDate),
      advanceRef: body.advanceRef ?? null,
      advanceStatus: 'DISBURSED',
      updatedBy: actorId(req),
    },
  });
  await recordAudit(req, { action: 'UPDATE', resourceType: 'expense_sheet', resourceId: sheet.id, after: { advanceStatus: 'DISBURSED' } });
  res.json({ data: { status: 'DISBURSED' } });
}));

/* POST /:id/record-reimbursement — finance records reimbursement payment */
expenseFinanceRouter.post('/:id/record-reimbursement', validate({ params: IdParams, body: RecordReimbursementInput }), asyncHandler(async (req, res) => {
  const sheet = await prisma.expenseSheet.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!sheet) throw errors.notFound('Expense sheet not found');
  if (!['APPROVED', 'IN_PROGRESS', 'EXPENSE_SUBMITTED', 'COMPLETED'].includes(sheet.status)) throw errors.businessRule('NOT_APPROVED', 'Sheet must be approved first');

  const body = req.body as z.infer<typeof RecordReimbursementInput>;
  await prisma.expenseSheet.update({
    where: { id: sheet.id },
    data: {
      reimbursementPaidPaise: BigInt(body.reimbursementPaidPaise),
      reimbursementPaidDate: new Date(body.reimbursementPaidDate),
      reimbursementRef: body.reimbursementRef ?? null,
      reimbursementStatus: 'PAID',
      updatedBy: actorId(req),
    },
  });
  await recordAudit(req, { action: 'UPDATE', resourceType: 'expense_sheet', resourceId: sheet.id, after: { reimbursementStatus: 'PAID' } });
  res.json({ data: { status: 'PAID' } });
}));
