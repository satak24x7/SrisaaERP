import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';

// --- Zod schemas ---

const ENTITY_TYPES = ['OPPORTUNITY', 'LEAD', 'ACCOUNT', 'CONTACT', 'INFLUENCER', 'PROJECT'] as const;
const TICKET_TYPES = ['FLIGHT', 'TRAIN', 'BUS', 'CAB', 'OTHER'] as const;
const EXPENSE_CATEGORIES = ['TICKET', 'HOTEL', 'FOOD', 'LOCAL_TRANSPORT', 'COMMUNICATION', 'OTHER'] as const;

const IdParams = z.object({ id: z.string().min(1).max(26) });
const SubIdParams = z.object({ id: z.string().min(1).max(26), subId: z.string().min(1).max(26) });

const AssociationInput = z.object({ entityType: z.enum(ENTITY_TYPES), entityId: z.string().min(1).max(26) });

const CreateTravelPlan = z.object({
  title: z.string().min(1).max(255),
  purpose: z.string().min(1).max(64),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  leadTravellerId: z.string().min(1).max(26),
  businessUnitId: z.string().max(26).nullable().optional(),
  advanceAmountPaise: z.coerce.number().int().nonnegative().default(0),
  advanceStatus: z.string().default('NOT_REQUESTED'),
  notes: z.string().nullable().optional(),
  travellerIds: z.array(z.string().min(1).max(26)).optional(),
  associations: z.array(AssociationInput).optional(),
});

const UpdateTravelPlan = z.object({
  title: z.string().min(1).max(255).optional(),
  purpose: z.string().min(1).max(64).optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  leadTravellerId: z.string().min(1).max(26).optional(),
  businessUnitId: z.string().max(26).nullable().optional(),
  advanceAmountPaise: z.coerce.number().int().nonnegative().optional(),
  advanceStatus: z.string().optional(),
  reimbursementStatus: z.string().optional(),
  reimbursementPaidPaise: z.coerce.number().int().nonnegative().optional(),
  reimbursementRef: z.string().max(255).nullable().optional(),
  notes: z.string().nullable().optional(),
  travellerIds: z.array(z.string().min(1).max(26)).optional(),
  associations: z.array(AssociationInput).optional(),
});

const ListQuery = z.object({
  status: z.string().optional(),
  purpose: z.string().optional(),
  leadTravellerId: z.string().optional(),
  mine: z.string().optional(), // "true" to filter by current user (lead or member)
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const CreateTicket = z.object({
  ticketType: z.enum(TICKET_TYPES),
  fromLocation: z.string().min(1).max(255),
  toLocation: z.string().min(1).max(255),
  travelDate: z.string().min(1),
  returnDate: z.string().nullable().optional(),
  bookingRef: z.string().max(128).nullable().optional(),
  amountPaise: z.coerce.number().int().nonnegative(),
  notes: z.string().max(500).nullable().optional(),
  attachmentName: z.string().max(255).nullable().optional(),
  attachmentPath: z.string().max(512).nullable().optional(),
});
const UpdateTicket = CreateTicket.partial();

const CreateHotel = z.object({
  hotelName: z.string().min(1).max(255),
  location: z.string().min(1).max(255),
  checkIn: z.string().min(1),
  checkOut: z.string().min(1),
  bookingRef: z.string().max(128).nullable().optional(),
  amountPaise: z.coerce.number().int().nonnegative(),
  notes: z.string().max(500).nullable().optional(),
  attachmentName: z.string().max(255).nullable().optional(),
  attachmentPath: z.string().max(512).nullable().optional(),
});
const UpdateHotel = CreateHotel.partial();

const CreateExpense = z.object({
  category: z.enum(EXPENSE_CATEGORIES),
  expenseDate: z.string().min(1),
  description: z.string().min(1).max(500),
  amountPaise: z.coerce.number().int().nonnegative(),
  receiptRef: z.string().max(255).nullable().optional(),
});
const UpdateExpense = CreateExpense.partial();

// --- Helpers ---

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

async function resolveMyUserId(req: import('express').Request): Promise<string | null> {
  const sub = req.user?.id;
  if (!sub) return null;
  const user = await prisma.user.findUnique({ where: { externalId: sub }, select: { id: true } });
  return user?.id ?? null;
}

const PLAN_INCLUDE = {
  leadTraveller: { select: { id: true, fullName: true } },
  businessUnit: { select: { id: true, name: true } },
  travellers: { include: { user: { select: { id: true, fullName: true } } } },
  associations: true,
  tickets: { where: { deletedAt: null }, orderBy: { travelDate: 'asc' as const } },
  hotels: { where: { deletedAt: null }, orderBy: { checkIn: 'asc' as const } },
  expenses: { where: { deletedAt: null }, orderBy: { expenseDate: 'asc' as const } },
} as const;

async function resolveEntityNames(associations: Array<{ entityType: string; entityId: string }>): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const byType: Record<string, Set<string>> = {};
  for (const a of associations) {
    if (!byType[a.entityType]) byType[a.entityType] = new Set();
    byType[a.entityType]!.add(a.entityId);
  }
  const lookups: Promise<void>[] = [];
  if (byType['OPPORTUNITY']?.size) lookups.push(prisma.opportunity.findMany({ where: { id: { in: [...byType['OPPORTUNITY']!] } }, select: { id: true, title: true } }).then((r) => r.forEach((x) => names.set(`OPPORTUNITY:${x.id}`, x.title))));
  if (byType['LEAD']?.size) lookups.push(prisma.lead.findMany({ where: { id: { in: [...byType['LEAD']!] } }, select: { id: true, title: true } }).then((r) => r.forEach((x) => names.set(`LEAD:${x.id}`, x.title))));
  if (byType['ACCOUNT']?.size) lookups.push(prisma.account.findMany({ where: { id: { in: [...byType['ACCOUNT']!] } }, select: { id: true, name: true } }).then((r) => r.forEach((x) => names.set(`ACCOUNT:${x.id}`, x.name))));
  if (byType['CONTACT']?.size) lookups.push(prisma.contact.findMany({ where: { id: { in: [...byType['CONTACT']!] } }, select: { id: true, firstName: true, lastName: true } }).then((r) => r.forEach((x) => names.set(`CONTACT:${x.id}`, `${x.firstName}${x.lastName ? ' ' + x.lastName : ''}`))));
  if (byType['INFLUENCER']?.size) lookups.push(prisma.influencer.findMany({ where: { id: { in: [...byType['INFLUENCER']!] } }, select: { id: true, name: true } }).then((r) => r.forEach((x) => names.set(`INFLUENCER:${x.id}`, x.name))));
  if (byType['PROJECT']?.size) lookups.push(prisma.project.findMany({ where: { id: { in: [...byType['PROJECT']!] } }, select: { id: true, name: true } }).then((r) => r.forEach((x) => names.set(`PROJECT:${x.id}`, x.name))));
  await Promise.all(lookups);
  return names;
}

function toBigNum(v: bigint | null | undefined): number { return v != null ? Number(v) : 0; }

function planToDto(row: Record<string, unknown>, entityNames: Map<string, string>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date; startDate: Date; endDate: Date;
    advanceAmountPaise: bigint; reimbursementPaidPaise: bigint;
    leadTraveller: { id: string; fullName: string };
    businessUnit?: { id: string; name: string } | null;
    travellers: Array<{ user: { id: string; fullName: string } }>;
    associations: Array<{ id: string; entityType: string; entityId: string }>;
    tickets: Array<Record<string, unknown>>;
    hotels: Array<Record<string, unknown>>;
    expenses: Array<Record<string, unknown>>;
  };

  const ticketsTotal = r.tickets.reduce((s, t) => s + toBigNum((t as { amountPaise: bigint }).amountPaise), 0);
  const hotelsTotal = r.hotels.reduce((s, h) => s + toBigNum((h as { amountPaise: bigint }).amountPaise), 0);
  const expensesTotal = r.expenses.reduce((s, e) => s + toBigNum((e as { amountPaise: bigint }).amountPaise), 0);
  const costOfTravel = ticketsTotal + hotelsTotal + expensesTotal; // Total cost (company + traveller)
  const advanceAmount = toBigNum(r.advanceAmountPaise);
  const reimbursementDue = Math.max(0, expensesTotal - advanceAmount); // Only expenses are reimbursable (tickets/hotels are company-paid)
  const reimbursementPaid = toBigNum(r.reimbursementPaidPaise);
  const reimbursementBalance = reimbursementDue - reimbursementPaid;
  const numLinkedObjects = r.associations.length || 1;

  return {
    id: r.id, title: r.title, purpose: r.purpose, status: r.status,
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    leadTravellerId: r.leadTraveller.id, leadTravellerName: r.leadTraveller.fullName,
    businessUnitId: r.businessUnit?.id ?? null, businessUnitName: r.businessUnit?.name ?? null,
    advanceAmountPaise: advanceAmount,
    advanceStatus: r.advanceStatus, reimbursementStatus: r.reimbursementStatus,
    reimbursementPaidPaise: reimbursementPaid,
    reimbursementRef: r.reimbursementRef ?? null,
    notes: r.notes ?? null, rejectionReason: r.rejectionReason ?? null,
    travellers: r.travellers.map((t) => ({ id: t.user.id, name: t.user.fullName })),
    associations: r.associations.map((a) => ({
      id: a.id, entityType: a.entityType, entityId: a.entityId,
      entityName: entityNames.get(`${a.entityType}:${a.entityId}`) ?? null,
    })),
    tickets: r.tickets.map((t: Record<string, unknown>) => ({
      id: t.id, ticketType: t.ticketType, fromLocation: t.fromLocation, toLocation: t.toLocation,
      travelDate: (t.travelDate as Date).toISOString().slice(0, 10),
      returnDate: t.returnDate ? (t.returnDate as Date).toISOString().slice(0, 10) : null,
      bookingRef: t.bookingRef ?? null, amountPaise: toBigNum(t.amountPaise as bigint),
      notes: t.notes ?? null,
      attachmentName: t.attachmentName ?? null, attachmentPath: t.attachmentPath ?? null,
    })),
    hotels: r.hotels.map((h: Record<string, unknown>) => ({
      id: h.id, hotelName: h.hotelName, location: h.location,
      checkIn: (h.checkIn as Date).toISOString().slice(0, 10),
      checkOut: (h.checkOut as Date).toISOString().slice(0, 10),
      bookingRef: h.bookingRef ?? null, amountPaise: toBigNum(h.amountPaise as bigint),
      notes: h.notes ?? null,
      attachmentName: h.attachmentName ?? null, attachmentPath: h.attachmentPath ?? null,
    })),
    expenses: r.expenses.map((e: Record<string, unknown>) => ({
      id: e.id, category: e.category,
      expenseDate: (e.expenseDate as Date).toISOString().slice(0, 10),
      description: e.description, amountPaise: toBigNum(e.amountPaise as bigint),
      receiptRef: e.receiptRef ?? null,
    })),
    summary: {
      ticketsTotal, hotelsTotal, expensesTotal, costOfTravel,
      advanceAmountPaise: advanceAmount,
      reimbursementDue, reimbursementPaid, reimbursementBalance,
      perObjectShare: Math.round(costOfTravel / numLinkedObjects),
      travellersCount: r.travellers.length,
    },
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

function planListDto(r: Record<string, unknown>) {
  const row = r as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date; startDate: Date; endDate: Date; advanceAmountPaise: bigint;
    leadTraveller: { fullName: string };
    travellers: Array<unknown>;
    tickets: Array<{ amountPaise: bigint }>;
    hotels: Array<{ amountPaise: bigint }>;
    expenses: Array<{ amountPaise: bigint }>;
  };
  const total = row.tickets.reduce((s, t) => s + toBigNum(t.amountPaise), 0)
    + row.hotels.reduce((s, h) => s + toBigNum(h.amountPaise), 0)
    + row.expenses.reduce((s, e) => s + toBigNum(e.amountPaise), 0);
  return {
    id: row.id, title: row.title, purpose: row.purpose, status: row.status,
    startDate: row.startDate.toISOString().slice(0, 10),
    endDate: row.endDate.toISOString().slice(0, 10),
    leadTravellerName: row.leadTraveller.fullName,
    travellersCount: row.travellers.length,
    totalPaise: total,
    createdAt: row.createdAt.toISOString(),
  };
}

async function syncTravellers(planId: string, userIds: string[]): Promise<void> {
  await prisma.travelPlanTraveller.deleteMany({ where: { travelPlanId: planId } });
  if (userIds.length > 0) {
    await prisma.travelPlanTraveller.createMany({ data: userIds.map((userId) => ({ id: newId(), travelPlanId: planId, userId })) });
  }
}

async function syncTravelAssociations(planId: string, associations: z.infer<typeof AssociationInput>[]): Promise<void> {
  await prisma.travelPlanAssociation.deleteMany({ where: { travelPlanId: planId } });
  if (associations.length > 0) {
    await prisma.travelPlanAssociation.createMany({ data: associations.map((a) => ({ id: newId(), travelPlanId: planId, entityType: a.entityType, entityId: a.entityId })) });
  }
}

// --- Router ---

export const travelRouter: ExpressRouter = Router();
travelRouter.use(requireAuth);

/* GET / — list */
travelRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.purpose) where.purpose = q.purpose;
    if (q.mine === 'true') {
      const myId = await resolveMyUserId(req);
      if (myId) {
        where.OR = [
          { leadTravellerId: myId },
          { travellers: { some: { userId: myId } } },
        ];
      }
    } else if (q.leadTravellerId) {
      where.leadTravellerId = q.leadTravellerId;
    }
    if (q.q) where.title = { contains: q.q };

    const take = q.limit + 1;
    const args: Record<string, unknown> = {
      where, orderBy: { createdAt: 'desc' }, take,
      include: {
        leadTraveller: { select: { fullName: true } },
        travellers: true,
        tickets: { where: { deletedAt: null }, select: { amountPaise: true } },
        hotels: { where: { deletedAt: null }, select: { amountPaise: true } },
        expenses: { where: { deletedAt: null }, select: { amountPaise: true } },
      },
    };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.travelPlan.findMany(args as Parameters<typeof prisma.travelPlan.findMany>[0]);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    res.json({ data: page.map((r) => planListDto(r as unknown as Record<string, unknown>)), meta: { next_cursor: nextCursor, limit: q.limit } });
  }),
);

/* GET /:id — single with all details */
travelRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.travelPlan.findFirst({ where: { id: req.params.id as string, deletedAt: null }, include: PLAN_INCLUDE });
    if (!row) throw errors.notFound('Travel plan not found');
    const entityNames = await resolveEntityNames(row.associations as Array<{ entityType: string; entityId: string }>);
    res.json({ data: planToDto(row as unknown as Record<string, unknown>, entityNames) });
  }),
);

/* POST / — create */
travelRouter.post(
  '/',
  validate({ body: CreateTravelPlan }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateTravelPlan>;
    const actor = actorId(req);
    const planId = newId();

    await prisma.travelPlan.create({
      data: {
        id: planId, title: body.title, purpose: body.purpose,
        startDate: new Date(body.startDate), endDate: new Date(body.endDate),
        leadTravellerId: body.leadTravellerId,
        businessUnitId: body.businessUnitId ?? null,
        advanceAmountPaise: BigInt(body.advanceAmountPaise),
        advanceStatus: body.advanceStatus,
        notes: body.notes ?? null,
        createdBy: actor, updatedBy: actor,
      },
    });

    // Always include lead traveller
    const travellerIds = new Set(body.travellerIds ?? []);
    travellerIds.add(body.leadTravellerId);
    await syncTravellers(planId, [...travellerIds]);

    if (body.associations && body.associations.length > 0) {
      await syncTravelAssociations(planId, body.associations);
    }

    const row = await prisma.travelPlan.findUniqueOrThrow({ where: { id: planId }, include: PLAN_INCLUDE });
    const entityNames = await resolveEntityNames(row.associations as Array<{ entityType: string; entityId: string }>);
    await recordAudit(req, { action: 'CREATE', resourceType: 'travel_plan', resourceId: planId, after: { title: body.title } });
    res.status(201).json({ data: planToDto(row as unknown as Record<string, unknown>, entityNames) });
  }),
);

/* PATCH /:id — update */
travelRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateTravelPlan }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.travelPlan.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Travel plan not found');

    const body = req.body as z.infer<typeof UpdateTravelPlan>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    const { travellerIds, associations, ...fields } = body;
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      if (k === 'startDate' || k === 'endDate') { data[k] = new Date(v as string); continue; }
      if (k === 'advanceAmountPaise' || k === 'reimbursementPaidPaise') { data[k] = BigInt(v as number); continue; }
      data[k] = v;
    }

    await prisma.travelPlan.update({ where: { id: existing.id }, data });

    if (travellerIds !== undefined) {
      const ids = new Set(travellerIds);
      ids.add(body.leadTravellerId ?? existing.leadTravellerId);
      await syncTravellers(existing.id, [...ids]);
    }
    if (associations !== undefined) {
      await syncTravelAssociations(existing.id, associations);
    }

    const row = await prisma.travelPlan.findUniqueOrThrow({ where: { id: existing.id }, include: PLAN_INCLUDE });
    const entityNames = await resolveEntityNames(row.associations as Array<{ entityType: string; entityId: string }>);
    await recordAudit(req, { action: 'UPDATE', resourceType: 'travel_plan', resourceId: existing.id });
    res.json({ data: planToDto(row as unknown as Record<string, unknown>, entityNames) });
  }),
);

/* DELETE /:id — soft delete */
travelRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.travelPlan.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Travel plan not found');
    await prisma.travelPlan.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'travel_plan', resourceId: existing.id });
    res.status(204).end();
  }),
);

/*
 * Travel Plan Status Workflow:
 *   DRAFT → SUBMITTED (Requester submits for approval)
 *   SUBMITTED → APPROVED (Approver approves) | REJECTED (Approver rejects)
 *   REJECTED → DRAFT (Requester can revise and resubmit)
 *   APPROVED → BOOKING (Admin begins booking tickets/hotels)
 *   BOOKING → IN_PROGRESS (Travel begins)
 *   IN_PROGRESS → EXPENSE_SUBMITTED (Requester submits expenses for reimbursement)
 *   EXPENSE_SUBMITTED → COMPLETED (Approver approves reimbursement)
 *
 * Roles:
 *   Requester: creates plan, adds expenses, submits, submits expenses
 *   Approver: approves/rejects plan, approves reimbursement
 *   Admin: books tickets/hotels, manages booking status
 */

const VALID_TRANSITIONS: Record<string, { to: string; action: string }[]> = {
  DRAFT: [{ to: 'SUBMITTED', action: 'submit' }],
  SUBMITTED: [{ to: 'APPROVED', action: 'approve' }, { to: 'REJECTED', action: 'reject' }],
  REJECTED: [{ to: 'DRAFT', action: 'revise' }],
  APPROVED: [{ to: 'BOOKING', action: 'start-booking' }],
  BOOKING: [{ to: 'IN_PROGRESS', action: 'start-travel' }],
  IN_PROGRESS: [{ to: 'EXPENSE_SUBMITTED', action: 'submit-expenses' }],
  EXPENSE_SUBMITTED: [{ to: 'COMPLETED', action: 'complete' }],
};

/* POST /:id/:action — unified status transition */
const TransitionParams = z.object({ id: z.string().min(1).max(26), action: z.string().min(1) });
const TransitionBody = z.object({ reason: z.string().optional() }).optional();

travelRouter.post('/:id/:action', validate({ params: TransitionParams, body: TransitionBody }), asyncHandler(async (req, res, next) => {
  const actionName = req.params.action as string;
  // Only handle known transition actions; pass through to nested routes otherwise
  const knownActions = ['submit', 'approve', 'reject', 'revise', 'start-booking', 'start-travel', 'submit-expenses', 'complete'];
  if (!knownActions.includes(actionName)) { next(); return; }

  const plan = await prisma.travelPlan.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!plan) throw errors.notFound('Travel plan not found');

  const allowed = VALID_TRANSITIONS[plan.status];
  const transition = allowed?.find((t) => t.action === actionName);
  if (!transition) throw errors.businessRule('INVALID_STATUS', `Cannot ${actionName} a ${plan.status} travel plan`);

  const data: Record<string, unknown> = { status: transition.to, updatedBy: actorId(req) };
  if (actionName === 'reject') {
    const body = req.body as { reason?: string } | undefined;
    data.rejectionReason = body?.reason ?? null;
  }
  if (actionName === 'revise') {
    data.rejectionReason = null;
  }

  await prisma.travelPlan.update({ where: { id: plan.id }, data });
  await recordAudit(req, { action: 'UPDATE', resourceType: 'travel_plan', resourceId: plan.id, after: { status: transition.to } });
  res.json({ data: { status: transition.to } });
}));

// --- Nested: Tickets ---

travelRouter.post('/:id/tickets', validate({ params: IdParams, body: CreateTicket }), asyncHandler(async (req, res) => {
  const plan = await prisma.travelPlan.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!plan) throw errors.notFound('Travel plan not found');
  const body = req.body as z.infer<typeof CreateTicket>;
  const actor = actorId(req);
  const row = await prisma.travelPlanTicket.create({
    data: {
      id: newId(), travelPlanId: plan.id, ticketType: body.ticketType,
      fromLocation: body.fromLocation, toLocation: body.toLocation,
      travelDate: new Date(body.travelDate), returnDate: body.returnDate ? new Date(body.returnDate) : null,
      bookingRef: body.bookingRef ?? null, amountPaise: BigInt(body.amountPaise),
      notes: body.notes ?? null, createdBy: actor, updatedBy: actor,
    },
  });
  res.status(201).json({ data: { id: row.id } });
}));

travelRouter.patch('/:id/tickets/:subId', validate({ params: SubIdParams, body: UpdateTicket }), asyncHandler(async (req, res) => {
  const ticket = await prisma.travelPlanTicket.findFirst({ where: { id: req.params.subId as string, travelPlanId: req.params.id as string, deletedAt: null } });
  if (!ticket) throw errors.notFound('Ticket not found');
  const body = req.body as z.infer<typeof UpdateTicket>;
  const data: Record<string, unknown> = { updatedBy: actorId(req) };
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    if (k === 'travelDate' || k === 'returnDate') { data[k] = v ? new Date(v as string) : null; continue; }
    if (k === 'amountPaise') { data[k] = BigInt(v as number); continue; }
    data[k] = v;
  }
  await prisma.travelPlanTicket.update({ where: { id: ticket.id }, data });
  res.json({ data: { id: ticket.id } });
}));

travelRouter.delete('/:id/tickets/:subId', validate({ params: SubIdParams }), asyncHandler(async (req, res) => {
  const ticket = await prisma.travelPlanTicket.findFirst({ where: { id: req.params.subId as string, travelPlanId: req.params.id as string, deletedAt: null } });
  if (!ticket) throw errors.notFound('Ticket not found');
  await prisma.travelPlanTicket.update({ where: { id: ticket.id }, data: { deletedAt: new Date() } });
  res.status(204).end();
}));

// --- Nested: Hotels ---

travelRouter.post('/:id/hotels', validate({ params: IdParams, body: CreateHotel }), asyncHandler(async (req, res) => {
  const plan = await prisma.travelPlan.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!plan) throw errors.notFound('Travel plan not found');
  const body = req.body as z.infer<typeof CreateHotel>;
  const actor = actorId(req);
  const row = await prisma.travelPlanHotel.create({
    data: {
      id: newId(), travelPlanId: plan.id, hotelName: body.hotelName, location: body.location,
      checkIn: new Date(body.checkIn), checkOut: new Date(body.checkOut),
      bookingRef: body.bookingRef ?? null, amountPaise: BigInt(body.amountPaise),
      notes: body.notes ?? null, createdBy: actor, updatedBy: actor,
    },
  });
  res.status(201).json({ data: { id: row.id } });
}));

travelRouter.patch('/:id/hotels/:subId', validate({ params: SubIdParams, body: UpdateHotel }), asyncHandler(async (req, res) => {
  const hotel = await prisma.travelPlanHotel.findFirst({ where: { id: req.params.subId as string, travelPlanId: req.params.id as string, deletedAt: null } });
  if (!hotel) throw errors.notFound('Hotel not found');
  const body = req.body as z.infer<typeof UpdateHotel>;
  const data: Record<string, unknown> = { updatedBy: actorId(req) };
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    if (k === 'checkIn' || k === 'checkOut') { data[k] = new Date(v as string); continue; }
    if (k === 'amountPaise') { data[k] = BigInt(v as number); continue; }
    data[k] = v;
  }
  await prisma.travelPlanHotel.update({ where: { id: hotel.id }, data });
  res.json({ data: { id: hotel.id } });
}));

travelRouter.delete('/:id/hotels/:subId', validate({ params: SubIdParams }), asyncHandler(async (req, res) => {
  const hotel = await prisma.travelPlanHotel.findFirst({ where: { id: req.params.subId as string, travelPlanId: req.params.id as string, deletedAt: null } });
  if (!hotel) throw errors.notFound('Hotel not found');
  await prisma.travelPlanHotel.update({ where: { id: hotel.id }, data: { deletedAt: new Date() } });
  res.status(204).end();
}));

// --- Nested: Expenses ---

travelRouter.post('/:id/expenses', validate({ params: IdParams, body: CreateExpense }), asyncHandler(async (req, res) => {
  const plan = await prisma.travelPlan.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
  if (!plan) throw errors.notFound('Travel plan not found');
  const body = req.body as z.infer<typeof CreateExpense>;
  const actor = actorId(req);
  const row = await prisma.travelPlanExpense.create({
    data: {
      id: newId(), travelPlanId: plan.id, category: body.category,
      expenseDate: new Date(body.expenseDate), description: body.description,
      amountPaise: BigInt(body.amountPaise), receiptRef: body.receiptRef ?? null,
      createdBy: actor, updatedBy: actor,
    },
  });
  res.status(201).json({ data: { id: row.id } });
}));

travelRouter.patch('/:id/expenses/:subId', validate({ params: SubIdParams, body: UpdateExpense }), asyncHandler(async (req, res) => {
  const expense = await prisma.travelPlanExpense.findFirst({ where: { id: req.params.subId as string, travelPlanId: req.params.id as string, deletedAt: null } });
  if (!expense) throw errors.notFound('Expense not found');
  const body = req.body as z.infer<typeof UpdateExpense>;
  const data: Record<string, unknown> = { updatedBy: actorId(req) };
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    if (k === 'expenseDate') { data[k] = new Date(v as string); continue; }
    if (k === 'amountPaise') { data[k] = BigInt(v as number); continue; }
    data[k] = v;
  }
  await prisma.travelPlanExpense.update({ where: { id: expense.id }, data });
  res.json({ data: { id: expense.id } });
}));

travelRouter.delete('/:id/expenses/:subId', validate({ params: SubIdParams }), asyncHandler(async (req, res) => {
  const expense = await prisma.travelPlanExpense.findFirst({ where: { id: req.params.subId as string, travelPlanId: req.params.id as string, deletedAt: null } });
  if (!expense) throw errors.notFound('Expense not found');
  await prisma.travelPlanExpense.update({ where: { id: expense.id }, data: { deletedAt: new Date() } });
  res.status(204).end();
}));
