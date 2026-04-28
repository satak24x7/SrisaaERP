import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
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

const PLAN_INCLUDE = {
  leadTraveller: { select: { id: true, fullName: true } },
  businessUnit: { select: { id: true, name: true } },
  travellers: { include: { user: { select: { id: true, fullName: true } } } },
  tickets: { where: { deletedAt: null }, select: { amountPaise: true } },
  hotels: { where: { deletedAt: null }, select: { amountPaise: true } },
  expenses: { where: { deletedAt: null }, select: { amountPaise: true } },
} as const;

function planToFinanceDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date; startDate: Date; endDate: Date;
    advanceAmountPaise: bigint; reimbursementPaidPaise: bigint;
    advancePaidPaise: bigint | null; advancePaidDate: Date | null;
    reimbursementPaidDate: Date | null;
    leadTraveller: { id: string; fullName: string };
    businessUnit?: { id: string; name: string } | null;
    travellers: Array<{ user: { id: string; fullName: string } }>;
    tickets: Array<{ amountPaise: bigint }>;
    hotels: Array<{ amountPaise: bigint }>;
    expenses: Array<{ amountPaise: bigint }>;
  };

  const ticketsTotal = r.tickets.reduce((s, t) => s + toBigNum(t.amountPaise), 0);
  const hotelsTotal = r.hotels.reduce((s, h) => s + toBigNum(h.amountPaise), 0);
  const expensesTotal = r.expenses.reduce((s, e) => s + toBigNum(e.amountPaise), 0);
  const costOfTravel = ticketsTotal + hotelsTotal + expensesTotal;
  const advanceRequested = toBigNum(r.advanceAmountPaise);
  const advancePaid = toBigNum(r.advancePaidPaise);
  const reimbursementDue = Math.max(0, expensesTotal - advanceRequested);
  const reimbursementPaid = toBigNum(r.reimbursementPaidPaise);

  return {
    id: r.id, title: r.title, purpose: r.purpose, status: r.status,
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    leadTravellerName: r.leadTraveller.fullName,
    businessUnitName: r.businessUnit?.name ?? null,
    travellersCount: r.travellers.length,
    advanceStatus: r.advanceStatus,
    advanceRequested,
    advancePaid,
    advancePaidDate: r.advancePaidDate ? r.advancePaidDate.toISOString().slice(0, 10) : null,
    advanceRef: r.advanceRef ?? null,
    advancePending: Math.max(0, advanceRequested - advancePaid),
    reimbursementStatus: r.reimbursementStatus,
    reimbursementDue,
    reimbursementPaid,
    reimbursementPaidDate: r.reimbursementPaidDate ? r.reimbursementPaidDate.toISOString().slice(0, 10) : null,
    reimbursementRef: r.reimbursementRef ?? null,
    reimbursementBalance: Math.max(0, reimbursementDue - reimbursementPaid),
    costOfTravel,
    ticketsTotal, hotelsTotal, expensesTotal,
    createdAt: r.createdAt.toISOString(),
  };
}

export const finTravelExpensesRouter: ExpressRouter = Router();
finTravelExpensesRouter.use(requireAuth);

/* GET / — list travel plans needing finance action */
finTravelExpensesRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListQuery>;

    const where: Record<string, unknown> = { deletedAt: null };

    if (q.tab === 'advance') {
      // Approved+ plans that have advance requested > 0
      where.status = { in: ['APPROVED', 'BOOKING', 'IN_PROGRESS', 'EXPENSE_SUBMITTED', 'COMPLETED'] };
      where.advanceAmountPaise = { gt: 0 };
    } else {
      // Plans with expenses submitted or completed
      where.status = { in: ['EXPENSE_SUBMITTED', 'COMPLETED'] };
    }

    const take = q.limit + 1;
    const args: Record<string, unknown> = {
      where, orderBy: { createdAt: 'desc' }, take,
      include: PLAN_INCLUDE,
    };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.travelPlan.findMany(args as Parameters<typeof prisma.travelPlan.findMany>[0]);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    res.json({
      data: page.map((r) => planToFinanceDto(r as unknown as Record<string, unknown>)),
      meta: { next_cursor: nextCursor, limit: q.limit },
    });
  }),
);

/* PATCH /:id/advance — record advance disbursement */
finTravelExpensesRouter.patch(
  '/:id/advance',
  validate({ params: IdParams, body: RecordAdvanceInput }),
  asyncHandler(async (req, res) => {
    const plan = await prisma.travelPlan.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!plan) throw errors.notFound('Travel plan not found');

    const body = req.body as z.infer<typeof RecordAdvanceInput>;
    await prisma.travelPlan.update({
      where: { id: plan.id },
      data: {
        advancePaidPaise: BigInt(body.advancePaidPaise),
        advancePaidDate: new Date(body.advancePaidDate),
        advanceRef: body.advanceRef ?? null,
        advanceStatus: 'DISBURSED',
        updatedBy: actorId(req),
      },
    });

    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'travel_plan', resourceId: plan.id,
      after: { advanceStatus: 'DISBURSED', advancePaidPaise: body.advancePaidPaise },
    });

    res.json({ data: { success: true } });
  }),
);

/* PATCH /:id/reimbursement — record reimbursement payment */
finTravelExpensesRouter.patch(
  '/:id/reimbursement',
  validate({ params: IdParams, body: RecordReimbursementInput }),
  asyncHandler(async (req, res) => {
    const plan = await prisma.travelPlan.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!plan) throw errors.notFound('Travel plan not found');

    const body = req.body as z.infer<typeof RecordReimbursementInput>;
    await prisma.travelPlan.update({
      where: { id: plan.id },
      data: {
        reimbursementPaidPaise: BigInt(body.reimbursementPaidPaise),
        reimbursementPaidDate: new Date(body.reimbursementPaidDate),
        reimbursementRef: body.reimbursementRef ?? null,
        reimbursementStatus: 'PAID',
        updatedBy: actorId(req),
      },
    });

    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'travel_plan', resourceId: plan.id,
      after: { reimbursementStatus: 'PAID', reimbursementPaidPaise: body.reimbursementPaidPaise },
    });

    res.json({ data: { success: true } });
  }),
);
