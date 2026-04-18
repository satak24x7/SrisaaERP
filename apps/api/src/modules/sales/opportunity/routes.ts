import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';
import { costOfSaleRouter } from './cost-of-sale.routes.js';
import { Prisma } from '@prisma/client';

const IdParams = z.object({ id: z.string().min(1).max(26) });

const CreateInput = z.object({
  title: z.string().min(1).max(255),
  businessUnitId: z.string().min(1).max(26),
  accountId: z.string().max(26).optional(),
  endClientAccountId: z.string().max(26).optional(),
  stage: z.string().min(1).max(64).default('CAPTURE'),
  entryPath: z.string().min(1).max(64),
  contractValuePaise: z.coerce.number().int().nonnegative().optional(),
  probabilityPct: z.coerce.number().int().min(0).max(100).optional(),
  submissionDue: z.string().optional(),
  ownerUserId: z.string().max(26).optional(),
  contactIds: z.array(z.string().min(1).max(26)).optional(),
});

const UpdateInput = z.object({
  title: z.string().min(1).max(255).optional(),
  businessUnitId: z.string().min(1).max(26).optional(),
  accountId: z.string().max(26).nullable().optional(),
  endClientAccountId: z.string().max(26).nullable().optional(),
  stage: z.string().min(1).max(64).optional(),
  entryPath: z.string().min(1).max(64).optional(),
  contractValuePaise: z.coerce.number().int().nonnegative().nullable().optional(),
  probabilityPct: z.coerce.number().int().min(0).max(100).nullable().optional(),
  submissionDue: z.string().nullable().optional(),
  ownerUserId: z.string().max(26).nullable().optional(),
  contactIds: z.array(z.string().min(1).max(26)).optional(),
});

const ListQuery = z.object({
  buId: z.string().optional(),
  stage: z.string().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

const OPP_INCLUDE = {
  account: { select: { name: true } },
  endClient: { select: { name: true } },
  businessUnit: { select: { name: true } },
  owner: { select: { fullName: true } },
  opportunityContacts: { include: { contact: { select: { id: true, firstName: true, lastName: true } } } },
  opportunityInfluencers: { include: { influencer: { select: { id: true, name: true, rating: true } } } },
} as const;

function toDto(r: Record<string, unknown>) {
  const row = r as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date; contractValuePaise?: bigint | null;
    account?: { name: string } | null; endClient?: { name: string } | null;
    businessUnit?: { name: string } | null;
    owner?: { fullName: string } | null;
    opportunityContacts?: Array<{ contact: { id: string; firstName: string; lastName: string | null } }>;
    opportunityInfluencers?: Array<{ influencer: { id: string; name: string; rating: number | null } }>;
  };
  return {
    id: row.id, title: row.title, stage: row.stage, entryPath: row.entryPath,
    contractValuePaise: row.contractValuePaise != null ? Number(row.contractValuePaise) : null,
    probabilityPct: row.probabilityPct, submissionDue: row.submissionDue,
    businessUnitId: row.businessUnitId, businessUnitName: row.businessUnit?.name ?? null,
    accountId: row.accountId, accountName: row.account?.name ?? null,
    endClientAccountId: row.endClientAccountId, endClientName: row.endClient?.name ?? null,
    ownerUserId: row.ownerUserId, ownerName: row.owner?.fullName ?? null,
    contacts: (row.opportunityContacts ?? []).map((oc) => ({
      id: oc.contact.id,
      name: `${oc.contact.firstName}${oc.contact.lastName ? ' ' + oc.contact.lastName : ''}`,
    })),
    influencers: (row.opportunityInfluencers ?? []).map((oi) => ({
      id: oi.influencer.id, name: oi.influencer.name, rating: oi.influencer.rating,
    })),
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

async function syncContacts(opportunityId: string, contactIds: string[]): Promise<void> {
  await prisma.opportunityContact.deleteMany({ where: { opportunityId } });
  if (contactIds.length > 0) {
    await prisma.opportunityContact.createMany({
      data: contactIds.map((contactId) => ({ id: newId(), opportunityId, contactId })),
    });
  }
}

export const opportunityRouter: ExpressRouter = Router();
opportunityRouter.use(requireAuth);

/* GET / */
opportunityRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.buId) where.businessUnitId = q.buId;
    if (q.stage) where.stage = q.stage;
    if (q.q) where.title = { contains: q.q };

    const take = q.limit + 1;
    const args: Record<string, unknown> = { where, orderBy: { createdAt: 'desc' }, take, include: OPP_INCLUDE };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.opportunity.findMany(args as Parameters<typeof prisma.opportunity.findMany>[0]);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    res.json({ data: page.map((r) => toDto(r as unknown as Record<string, unknown>)), meta: { next_cursor: nextCursor, limit: q.limit } });
  }),
);

/* GET /pipeline — aggregated pipeline dashboard data */
const PipelineQuery = z.object({
  buId: z.string().optional(),
  stage: z.string().optional(),
  ownerUserId: z.string().optional(),
});

opportunityRouter.get(
  '/pipeline',
  validate({ query: PipelineQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof PipelineQuery>;

    // Build WHERE clause for raw queries
    const conditions: string[] = ['o.deleted_at IS NULL'];
    const params: unknown[] = [];
    if (q.buId) { conditions.push('o.business_unit_id = ?'); params.push(q.buId); }
    if (q.stage) { conditions.push('o.stage = ?'); params.push(q.stage); }
    if (q.ownerUserId) { conditions.push('o.owner_user_id = ?'); params.push(q.ownerUserId); }
    const whereClause = conditions.join(' AND ');

    // Summary
    const summaryRows = await prisma.$queryRawUnsafe<Array<{
      total_opportunities: bigint; total_contract_value_paise: bigint | null; weighted_pipeline_value_paise: bigint | null;
    }>>(
      `SELECT COUNT(*) AS total_opportunities,
              COALESCE(SUM(o.contract_value_paise), 0) AS total_contract_value_paise,
              COALESCE(SUM(o.contract_value_paise * COALESCE(o.probability_pct, 0) / 100), 0) AS weighted_pipeline_value_paise
       FROM opportunity o WHERE ${whereClause}`,
      ...params,
    );
    const s = summaryRows[0]!;

    // By stage
    const byStage = await prisma.$queryRawUnsafe<Array<{
      stage: string; count: bigint; total_value_paise: bigint | null; weighted_value_paise: bigint | null;
    }>>(
      `SELECT o.stage,
              COUNT(*) AS count,
              COALESCE(SUM(o.contract_value_paise), 0) AS total_value_paise,
              COALESCE(SUM(o.contract_value_paise * COALESCE(o.probability_pct, 0) / 100), 0) AS weighted_value_paise
       FROM opportunity o WHERE ${whereClause}
       GROUP BY o.stage ORDER BY count DESC`,
      ...params,
    );

    // By BU
    const byBu = await prisma.$queryRawUnsafe<Array<{
      business_unit_id: string; bu_name: string; count: bigint; total_value_paise: bigint | null;
    }>>(
      `SELECT o.business_unit_id, bu.name AS bu_name,
              COUNT(*) AS count,
              COALESCE(SUM(o.contract_value_paise), 0) AS total_value_paise
       FROM opportunity o JOIN business_unit bu ON bu.id = o.business_unit_id
       WHERE ${whereClause}
       GROUP BY o.business_unit_id, bu.name ORDER BY count DESC`,
      ...params,
    );

    // Opportunity list (with includes for the table)
    const oppWhere: Record<string, unknown> = { deletedAt: null };
    if (q.buId) oppWhere.businessUnitId = q.buId;
    if (q.stage) oppWhere.stage = q.stage;
    if (q.ownerUserId) oppWhere.ownerUserId = q.ownerUserId;

    const opportunities = await prisma.opportunity.findMany({
      where: oppWhere,
      include: OPP_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    res.json({
      data: {
        summary: {
          totalOpportunities: Number(s.total_opportunities),
          totalContractValuePaise: Number(s.total_contract_value_paise ?? 0),
          weightedPipelineValuePaise: Number(s.weighted_pipeline_value_paise ?? 0),
        },
        byStage: byStage.map((r) => ({
          stage: r.stage,
          count: Number(r.count),
          totalValuePaise: Number(r.total_value_paise ?? 0),
          weightedValuePaise: Number(r.weighted_value_paise ?? 0),
        })),
        byBu: byBu.map((r) => ({
          buId: r.business_unit_id,
          buName: r.bu_name,
          count: Number(r.count),
          totalValuePaise: Number(r.total_value_paise ?? 0),
        })),
        opportunities: opportunities.map((r) => toDto(r as unknown as Record<string, unknown>)),
      },
    });
  }),
);

/* GET /:id */
opportunityRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.opportunity.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: OPP_INCLUDE,
    });
    if (!row) throw errors.notFound('Opportunity not found');
    res.json({ data: toDto(row as unknown as Record<string, unknown>) });
  }),
);

/* POST / */
opportunityRouter.post(
  '/',
  validate({ body: CreateInput }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateInput>;
    const actor = actorId(req);

    let clientName: string | null = null;
    if (body.endClientAccountId) {
      const ec = await prisma.account.findUnique({ where: { id: body.endClientAccountId }, select: { name: true } });
      clientName = ec?.name ?? null;
    }

    const oppId = newId();
    await prisma.opportunity.create({
      data: {
        id: oppId, title: body.title, businessUnitId: body.businessUnitId,
        accountId: body.accountId ?? null, endClientAccountId: body.endClientAccountId ?? null,
        clientName, stage: body.stage, entryPath: body.entryPath,
        contractValuePaise: body.contractValuePaise != null ? BigInt(body.contractValuePaise) : null,
        probabilityPct: body.probabilityPct ?? null,
        submissionDue: body.submissionDue ? new Date(body.submissionDue) : null,
        ownerUserId: body.ownerUserId ?? null,
        createdBy: actor, updatedBy: actor,
      },
    });

    if (body.contactIds && body.contactIds.length > 0) {
      await syncContacts(oppId, body.contactIds);
    }

    const row = await prisma.opportunity.findUniqueOrThrow({ where: { id: oppId }, include: OPP_INCLUDE });
    await recordAudit(req, { action: 'CREATE', resourceType: 'opportunity', resourceId: oppId, after: { title: row.title } });
    res.status(201).json({ data: toDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:id */
opportunityRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateInput }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.opportunity.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Opportunity not found');

    const body = req.body as z.infer<typeof UpdateInput>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    const { contactIds, ...fields } = body;
    for (const [k, v] of Object.entries(fields)) {
      if (v === undefined) continue;
      if (k === 'contractValuePaise') { data[k] = v != null ? BigInt(v as number) : null; continue; }
      if (k === 'submissionDue') { data[k] = v ? new Date(v as string) : null; continue; }
      data[k] = v;
    }

    if (body.endClientAccountId !== undefined) {
      if (body.endClientAccountId) {
        const ec = await prisma.account.findUnique({ where: { id: body.endClientAccountId }, select: { name: true } });
        data.clientName = ec?.name ?? null;
      } else {
        data.clientName = null;
      }
    }

    await prisma.opportunity.update({ where: { id: existing.id }, data });

    if (contactIds !== undefined) {
      await syncContacts(existing.id, contactIds);
    }

    const updated = await prisma.opportunity.findUniqueOrThrow({ where: { id: existing.id }, include: OPP_INCLUDE });
    await recordAudit(req, { action: 'UPDATE', resourceType: 'opportunity', resourceId: existing.id });
    res.json({ data: toDto(updated as unknown as Record<string, unknown>) });
  }),
);

const LinkInfluencerBody = z.object({ influencerId: z.string().min(1).max(26) });

/* POST /:id/influencers */
opportunityRouter.post(
  '/:id/influencers',
  validate({ params: IdParams, body: LinkInfluencerBody }),
  asyncHandler(async (req, res) => {
    const opp = await prisma.opportunity.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!opp) throw errors.notFound('Opportunity not found');
    const { influencerId } = req.body as z.infer<typeof LinkInfluencerBody>;
    const existing = await prisma.opportunityInfluencer.findUnique({
      where: { opportunityId_influencerId: { opportunityId: opp.id, influencerId } },
    });
    if (existing) { res.json({ data: { linked: true } }); return; }
    await prisma.opportunityInfluencer.create({ data: { id: newId(), opportunityId: opp.id, influencerId } });
    res.status(201).json({ data: { linked: true } });
  }),
);

/* DELETE /:id/influencers/:influencerId */
opportunityRouter.delete(
  '/:id/influencers/:influencerId',
  asyncHandler(async (req, res) => {
    const link = await prisma.opportunityInfluencer.findUnique({
      where: { opportunityId_influencerId: { opportunityId: req.params.id as string, influencerId: req.params.influencerId as string } },
    });
    if (!link) throw errors.notFound('Link not found');
    await prisma.opportunityInfluencer.delete({ where: { id: link.id } });
    res.status(204).end();
  }),
);

/* Mount nested sub-routers */
opportunityRouter.use('/:id/cost-of-sale', costOfSaleRouter);
