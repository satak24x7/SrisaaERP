import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';

const LeadStatusEnum = z.enum(['NEW', 'CONTACTED', 'QUALIFIED', 'CONVERTED', 'LOST']);
const LeadSourceEnum = z.enum(['WEBSITE', 'REFERRAL', 'CONFERENCE', 'GEM_PORTAL', 'CPPP', 'COLD_OUTREACH', 'EXISTING_ACCOUNT', 'OTHER']);

const IdParams = z.object({ id: z.string().min(1).max(26) });

const CreateInput = z.object({
  title: z.string().min(1).max(255),
  accountId: z.string().max(26).optional(),
  contactId: z.string().max(26).optional(),
  businessUnitId: z.string().min(1).max(26),
  source: LeadSourceEnum,
  description: z.string().optional(),
  estimatedValuePaise: z.coerce.number().int().nonnegative().optional(),
  expectedClosureDate: z.string().optional(), // ISO date string
  ownerUserId: z.string().max(26).optional(),
});

const UpdateInput = z.object({
  title: z.string().min(1).max(255).optional(),
  accountId: z.string().max(26).optional(),
  contactId: z.string().max(26).optional(),
  businessUnitId: z.string().max(26).optional(),
  source: LeadSourceEnum.optional(),
  status: LeadStatusEnum.optional(),
  description: z.string().optional(),
  estimatedValuePaise: z.coerce.number().int().nonnegative().optional(),
  expectedClosureDate: z.string().optional(),
  ownerUserId: z.string().max(26).optional(),
  lostReason: z.string().optional(),
});

const ListQuery = z.object({
  status: LeadStatusEnum.optional(),
  source: LeadSourceEnum.optional(),
  buId: z.string().optional(),
  accountId: z.string().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const ConvertInput = z.object({
  title: z.string().min(1).max(255).optional(),
  businessUnitId: z.string().max(26).optional(),
  entryPath: z.string().max(64).optional(),
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function toDto(r: Record<string, unknown>) {
  const row = r as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date;
    account?: { name: string } | null;
    contact?: { firstName: string; lastName: string | null } | null;
    estimatedValuePaise?: bigint | null;
  };
  return {
    ...r,
    accountName: row.account?.name ?? null,
    contactName: row.contact ? `${row.contact.firstName}${row.contact.lastName ? ' ' + row.contact.lastName : ''}` : null,
    estimatedValuePaise: row.estimatedValuePaise != null ? Number(row.estimatedValuePaise) : null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: undefined,
    createdBy: undefined,
    updatedBy: undefined,
    account: undefined,
    contact: undefined,
  };
}

const LEAD_INCLUDE = {
  account: { select: { name: true } },
  contact: { select: { firstName: true, lastName: true } },
} as const;

export const leadRouter: ExpressRouter = Router();
leadRouter.use(requireAuth);

/* GET / */
leadRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.source) where.source = q.source;
    if (q.buId) where.businessUnitId = q.buId;
    if (q.accountId) where.accountId = q.accountId;
    if (q.q) where.title = { contains: q.q };

    const take = q.limit + 1;
    const args: Record<string, unknown> = { where, orderBy: { id: 'asc' }, take, include: LEAD_INCLUDE };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.lead.findMany(args as Parameters<typeof prisma.lead.findMany>[0]);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    res.json({
      data: page.map((r) => toDto(r as unknown as Record<string, unknown>)),
      meta: { next_cursor: nextCursor, limit: q.limit },
    });
  }),
);

/* GET /:id */
leadRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.lead.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: LEAD_INCLUDE,
    });
    if (!row) throw errors.notFound('Lead not found');
    res.json({ data: toDto(row as unknown as Record<string, unknown>) });
  }),
);

/* POST / */
leadRouter.post(
  '/',
  validate({ body: CreateInput }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateInput>;
    const actor = actorId(req);
    const row = await prisma.lead.create({
      data: {
        id: newId(),
        title: body.title,
        accountId: body.accountId ?? null,
        contactId: body.contactId ?? null,
        businessUnitId: body.businessUnitId ?? null,
        source: body.source,
        description: body.description ?? null,
        estimatedValuePaise: body.estimatedValuePaise != null ? BigInt(body.estimatedValuePaise) : null,
        expectedClosureDate: body.expectedClosureDate ? new Date(body.expectedClosureDate) : null,
        ownerUserId: body.ownerUserId ?? null,
        createdBy: actor,
        updatedBy: actor,
      },
      include: LEAD_INCLUDE,
    });
    await recordAudit(req, { action: 'CREATE', resourceType: 'lead', resourceId: row.id, after: { title: row.title } });
    res.status(201).json({ data: toDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:id */
leadRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateInput }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.lead.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Lead not found');

    const body = req.body as z.infer<typeof UpdateInput>;
    const data: Record<string, unknown> = { updatedBy: actorId(req) };
    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === 'estimatedValuePaise') { data[k] = v != null ? BigInt(v as number) : null; continue; }
      if (k === 'expectedClosureDate') { data[k] = v ? new Date(v as string) : null; continue; }
      data[k] = v;
    }

    const updated = await prisma.lead.update({ where: { id: existing.id }, data, include: LEAD_INCLUDE });
    await recordAudit(req, { action: 'UPDATE', resourceType: 'lead', resourceId: existing.id });
    res.json({ data: toDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /:id */
leadRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.lead.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Lead not found');

    await prisma.lead.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'lead', resourceId: existing.id, before: { title: existing.title } });
    res.status(204).end();
  }),
);

/* POST /:id/convert — Convert lead to opportunity */
leadRouter.post(
  '/:id/convert',
  validate({ params: IdParams, body: ConvertInput }),
  asyncHandler(async (req, res) => {
    const lead = await prisma.lead.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: { account: { select: { name: true } } },
    });
    if (!lead) throw errors.notFound('Lead not found');
    if (lead.status === 'CONVERTED') {
      throw errors.businessRule('LEAD_ALREADY_CONVERTED', 'This lead has already been converted to an opportunity');
    }
    if (lead.status === 'LOST') {
      throw errors.businessRule('LEAD_IS_LOST', 'Cannot convert a lost lead');
    }

    const body = req.body as z.infer<typeof ConvertInput>;
    const actor = actorId(req);
    const buId = body.businessUnitId ?? lead.businessUnitId;
    if (!buId) throw errors.validation('businessUnitId is required for conversion (not set on lead or in request body)');

    const oppId = newId();
    const clientName = lead.account?.name ?? lead.title;

    const [opp] = await prisma.$transaction([
      prisma.opportunity.create({
        data: {
          id: oppId,
          businessUnitId: buId,
          accountId: lead.accountId,
          title: body.title ?? lead.title,
          clientName,
          stage: 'CAPTURE',
          entryPath: body.entryPath ?? 'STANDARD_TENDER',
          contractValuePaise: lead.estimatedValuePaise,
          createdBy: actor,
          updatedBy: actor,
        },
      }),
      prisma.lead.update({
        where: { id: lead.id },
        data: {
          status: 'CONVERTED',
          convertedOpportunityId: oppId,
          updatedBy: actor,
        },
      }),
    ]);

    await recordAudit(req, {
      action: 'CONVERT',
      resourceType: 'lead',
      resourceId: lead.id,
      after: { opportunityId: oppId, title: opp.title },
    });

    res.status(201).json({
      data: {
        id: opp.id,
        title: opp.title,
        stage: opp.stage,
        entryPath: opp.entryPath,
        businessUnitId: opp.businessUnitId,
        clientName: opp.clientName,
        createdAt: opp.createdAt.toISOString(),
      },
    });
  }),
);
