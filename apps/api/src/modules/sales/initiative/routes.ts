import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';
import { initiativeDocumentRouter } from './document.routes.js';

const INITIATIVE_STATUSES = ['DRAFT', 'ACTIVE', 'ON_HOLD', 'COMPLETED', 'CANCELLED'] as const;

const IdParams = z.object({ id: z.string().min(1).max(26) });

const CreateInput = z.object({
  title: z.string().min(1).max(255),
  description: z.string().nullable().optional(),
  businessUnitId: z.string().min(1).max(26),
  ownerUserId: z.string().min(1).max(26),
  status: z.enum(INITIATIVE_STATUSES).default('DRAFT'),
  targetValuePaise: z.coerce.number().int().nonnegative().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  accountIds: z.array(z.string().min(1).max(26)).optional(),
  contactIds: z.array(z.string().min(1).max(26)).optional(),
  leadIds: z.array(z.string().min(1).max(26)).optional(),
  opportunityIds: z.array(z.string().min(1).max(26)).optional(),
});

const UpdateInput = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().nullable().optional(),
  businessUnitId: z.string().min(1).max(26).optional(),
  ownerUserId: z.string().min(1).max(26).optional(),
  status: z.enum(INITIATIVE_STATUSES).optional(),
  targetValuePaise: z.coerce.number().int().nonnegative().nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  accountIds: z.array(z.string().min(1).max(26)).optional(),
  contactIds: z.array(z.string().min(1).max(26)).optional(),
  leadIds: z.array(z.string().min(1).max(26)).optional(),
  opportunityIds: z.array(z.string().min(1).max(26)).optional(),
});

const ListQuery = z.object({
  buId: z.string().optional(),
  status: z.string().optional(),
  ownerUserId: z.string().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

const INITIATIVE_INCLUDE = {
  businessUnit: { select: { name: true } },
  owner: { select: { fullName: true } },
  initiativeAccounts: { include: { account: { select: { id: true, name: true } } } },
  initiativeContacts: { include: { contact: { select: { id: true, firstName: true, lastName: true } } } },
  initiativeLeads: { include: { lead: { select: { id: true, title: true, status: true } } } },
  initiativeOpportunities: {
    include: { opportunity: { select: { id: true, title: true, stage: true, contractValuePaise: true } } },
  },
} as const;

function toDto(r: Record<string, unknown>) {
  const row = r as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date; targetValuePaise?: bigint | null;
    businessUnit?: { name: string } | null;
    owner?: { fullName: string } | null;
    initiativeAccounts?: Array<{ account: { id: string; name: string } }>;
    initiativeContacts?: Array<{ contact: { id: string; firstName: string; lastName: string | null } }>;
    initiativeLeads?: Array<{ lead: { id: string; title: string; status: string } }>;
    initiativeOpportunities?: Array<{ opportunity: { id: string; title: string; stage: string; contractValuePaise: bigint | null } }>;
  };
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? null,
    status: row.status,
    targetValuePaise: row.targetValuePaise != null ? Number(row.targetValuePaise) : null,
    startDate: row.startDate ?? null,
    endDate: row.endDate ?? null,
    businessUnitId: row.businessUnitId,
    businessUnitName: row.businessUnit?.name ?? null,
    ownerUserId: row.ownerUserId,
    ownerName: row.owner?.fullName ?? null,
    accounts: (row.initiativeAccounts ?? []).map((ia) => ({
      id: ia.account.id, name: ia.account.name,
    })),
    contacts: (row.initiativeContacts ?? []).map((ic) => ({
      id: ic.contact.id,
      name: `${ic.contact.firstName}${ic.contact.lastName ? ' ' + ic.contact.lastName : ''}`,
    })),
    leads: (row.initiativeLeads ?? []).map((il) => ({
      id: il.lead.id, title: il.lead.title, status: il.lead.status,
    })),
    opportunities: (row.initiativeOpportunities ?? []).map((io) => ({
      id: io.opportunity.id, title: io.opportunity.title, stage: io.opportunity.stage,
      contractValuePaise: io.opportunity.contractValuePaise != null ? Number(io.opportunity.contractValuePaise) : null,
    })),
    accountCount: (row.initiativeAccounts ?? []).length,
    leadCount: (row.initiativeLeads ?? []).length,
    opportunityCount: (row.initiativeOpportunities ?? []).length,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// M:M sync helpers (delete-all + recreate)
// ---------------------------------------------------------------------------

async function syncAccounts(initiativeId: string, accountIds: string[]): Promise<void> {
  await prisma.initiativeAccount.deleteMany({ where: { initiativeId } });
  if (accountIds.length > 0) {
    await prisma.initiativeAccount.createMany({
      data: accountIds.map((accountId) => ({ id: newId(), initiativeId, accountId })),
    });
  }
}

async function syncContacts(initiativeId: string, contactIds: string[]): Promise<void> {
  await prisma.initiativeContact.deleteMany({ where: { initiativeId } });
  if (contactIds.length > 0) {
    await prisma.initiativeContact.createMany({
      data: contactIds.map((contactId) => ({ id: newId(), initiativeId, contactId })),
    });
  }
}

async function syncLeads(initiativeId: string, leadIds: string[]): Promise<void> {
  await prisma.initiativeLead.deleteMany({ where: { initiativeId } });
  if (leadIds.length > 0) {
    await prisma.initiativeLead.createMany({
      data: leadIds.map((leadId) => ({ id: newId(), initiativeId, leadId })),
    });
  }
}

async function syncOpportunities(initiativeId: string, opportunityIds: string[]): Promise<void> {
  await prisma.initiativeOpportunity.deleteMany({ where: { initiativeId } });
  if (opportunityIds.length > 0) {
    await prisma.initiativeOpportunity.createMany({
      data: opportunityIds.map((opportunityId) => ({ id: newId(), initiativeId, opportunityId })),
    });
  }
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const initiativeRouter: ExpressRouter = Router();
initiativeRouter.use(requireAuth);

/* GET / — list initiatives */
initiativeRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.buId) where.businessUnitId = q.buId;
    if (q.status) where.status = q.status;
    if (q.ownerUserId) where.ownerUserId = q.ownerUserId;
    if (q.q) where.title = { contains: q.q };

    const take = q.limit + 1;
    const args: Record<string, unknown> = {
      where, orderBy: { createdAt: 'desc' }, take, include: INITIATIVE_INCLUDE,
    };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.initiative.findMany(args as Parameters<typeof prisma.initiative.findMany>[0]);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    res.json({
      data: page.map((r) => toDto(r as unknown as Record<string, unknown>)),
      meta: { next_cursor: nextCursor, limit: q.limit },
    });
  }),
);

/* GET /:id — single initiative detail */
initiativeRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.initiative.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: INITIATIVE_INCLUDE,
    });
    if (!row) throw errors.notFound('Initiative not found');
    res.json({ data: toDto(row as unknown as Record<string, unknown>) });
  }),
);

/* POST / — create initiative */
initiativeRouter.post(
  '/',
  validate({ body: CreateInput }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateInput>;
    const actor = actorId(req);
    const id = newId();

    await prisma.initiative.create({
      data: {
        id,
        title: body.title,
        description: body.description ?? null,
        businessUnitId: body.businessUnitId,
        ownerUserId: body.ownerUserId,
        status: body.status,
        targetValuePaise: body.targetValuePaise != null ? BigInt(body.targetValuePaise) : null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        createdBy: actor,
        updatedBy: actor,
      },
    });

    if (body.accountIds?.length) await syncAccounts(id, body.accountIds);
    if (body.contactIds?.length) await syncContacts(id, body.contactIds);
    if (body.leadIds?.length) await syncLeads(id, body.leadIds);
    if (body.opportunityIds?.length) await syncOpportunities(id, body.opportunityIds);

    const row = await prisma.initiative.findUniqueOrThrow({ where: { id }, include: INITIATIVE_INCLUDE });
    await recordAudit(req, { action: 'CREATE', resourceType: 'initiative', resourceId: id, after: { title: row.title } });
    res.status(201).json({ data: toDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:id — update initiative */
initiativeRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateInput }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.initiative.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Initiative not found');

    const body = req.body as z.infer<typeof UpdateInput>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    const { accountIds, contactIds, leadIds, opportunityIds, ...fields } = body;
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      if (k === 'targetValuePaise') { data[k] = v != null ? BigInt(v as number) : null; continue; }
      if (k === 'startDate' || k === 'endDate') { data[k] = v ? new Date(v as string) : null; continue; }
      data[k] = v;
    }

    await prisma.initiative.update({ where: { id: existing.id }, data });

    if (accountIds !== undefined) await syncAccounts(existing.id, accountIds);
    if (contactIds !== undefined) await syncContacts(existing.id, contactIds);
    if (leadIds !== undefined) await syncLeads(existing.id, leadIds);
    if (opportunityIds !== undefined) await syncOpportunities(existing.id, opportunityIds);

    const updated = await prisma.initiative.findUniqueOrThrow({ where: { id: existing.id }, include: INITIATIVE_INCLUDE });
    await recordAudit(req, { action: 'UPDATE', resourceType: 'initiative', resourceId: existing.id });
    res.json({ data: toDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /:id — soft delete */
initiativeRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.initiative.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Initiative not found');

    await prisma.initiative.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'initiative', resourceId: existing.id });
    res.status(204).end();
  }),
);

/* Mount document sub-router */
initiativeRouter.use('/:id/documents', initiativeDocumentRouter);
