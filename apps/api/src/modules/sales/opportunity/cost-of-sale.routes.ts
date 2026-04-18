import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';

const COS_CATEGORIES = [
  'TRAVEL', 'ACCOMMODATION', 'DEMO_PRESENTATION', 'CONSULTING',
  'DOCUMENTATION', 'STATIONERY_PRINTING', 'COMMUNICATION', 'OTHER',
] as const;

const COS_STATUSES = ['SPENT', 'COMMITTED', 'PROJECTED'] as const;

const EntryIdParams = z.object({ entryId: z.string().min(1).max(26) });

const CreateCosInput = z.object({
  category: z.enum(COS_CATEGORIES),
  entryDate: z.string().min(1), // ISO date
  description: z.string().min(1).max(500),
  amountPaise: z.coerce.number().int().nonnegative(),
  status: z.enum(COS_STATUSES).default('SPENT'),
  receiptRef: z.string().max(255).optional(),
});

const UpdateCosInput = z.object({
  category: z.enum(COS_CATEGORIES).optional(),
  entryDate: z.string().min(1).optional(),
  description: z.string().min(1).max(500).optional(),
  amountPaise: z.coerce.number().int().nonnegative().optional(),
  status: z.enum(COS_STATUSES).optional(),
  receiptRef: z.string().max(255).nullable().optional(),
});

const ListCosQuery = z.object({
  category: z.string().optional(),
  status: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function entryToDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date; entryDate: Date; amountPaise: bigint;
  };
  return {
    id: r.id, opportunityId: r.opportunityId, category: r.category,
    entryDate: r.entryDate.toISOString().slice(0, 10),
    description: r.description, amountPaise: Number(r.amountPaise),
    status: r.status, receiptRef: r.receiptRef ?? null,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

export const costOfSaleRouter: ExpressRouter = Router({ mergeParams: true });
costOfSaleRouter.use(requireAuth);

/* GET / — list entries + summary */
costOfSaleRouter.get(
  '/',
  validate({ query: ListCosQuery }),
  asyncHandler(async (req, res) => {
    const oppId = req.params.id as string;
    const q = req.query as unknown as z.infer<typeof ListCosQuery>;

    // Verify opportunity exists
    const opp = await prisma.opportunity.findFirst({ where: { id: oppId, deletedAt: null } });
    if (!opp) throw errors.notFound('Opportunity not found');

    const where: Record<string, unknown> = { opportunityId: oppId, deletedAt: null };
    if (q.category) where.category = q.category;
    if (q.status) where.status = q.status;

    const take = q.limit + 1;
    const args: Record<string, unknown> = { where, orderBy: { entryDate: 'desc' }, take };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.costOfSaleEntry.findMany(args as Parameters<typeof prisma.costOfSaleEntry.findMany>[0]);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    // Summary: aggregate all entries for this opportunity (not just current page)
    const allEntries = await prisma.costOfSaleEntry.findMany({
      where: { opportunityId: oppId, deletedAt: null },
      select: { category: true, status: true, amountPaise: true },
    });

    const byCategory: Record<string, number> = {};
    const byStatus: Record<string, number> = {};
    let grandTotal = 0;
    for (const e of allEntries) {
      const amt = Number(e.amountPaise);
      byCategory[e.category] = (byCategory[e.category] ?? 0) + amt;
      byStatus[e.status] = (byStatus[e.status] ?? 0) + amt;
      grandTotal += amt;
    }

    res.json({
      data: page.map((r) => entryToDto(r as unknown as Record<string, unknown>)),
      meta: { next_cursor: nextCursor, limit: q.limit },
      summary: { byCategory, byStatus, grandTotal },
    });
  }),
);

/* POST / — create entry */
costOfSaleRouter.post(
  '/',
  validate({ body: CreateCosInput }),
  asyncHandler(async (req, res) => {
    const oppId = req.params.id as string;
    const opp = await prisma.opportunity.findFirst({ where: { id: oppId, deletedAt: null } });
    if (!opp) throw errors.notFound('Opportunity not found');

    const body = req.body as z.infer<typeof CreateCosInput>;
    const actor = actorId(req);
    const entryId = newId();

    const row = await prisma.costOfSaleEntry.create({
      data: {
        id: entryId, opportunityId: oppId,
        category: body.category, entryDate: new Date(body.entryDate),
        description: body.description, amountPaise: BigInt(body.amountPaise),
        status: body.status, receiptRef: body.receiptRef ?? null,
        createdBy: actor, updatedBy: actor,
      },
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'cost_of_sale_entry', resourceId: entryId, after: { category: body.category, amountPaise: body.amountPaise } });
    res.status(201).json({ data: entryToDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:entryId — update entry */
costOfSaleRouter.patch(
  '/:entryId',
  validate({ params: EntryIdParams, body: UpdateCosInput }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.costOfSaleEntry.findFirst({
      where: { id: req.params.entryId as string, opportunityId: req.params.id as string, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Cost of Sale entry not found');

    const body = req.body as z.infer<typeof UpdateCosInput>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === 'amountPaise') { data[k] = BigInt(v as number); continue; }
      if (k === 'entryDate') { data[k] = new Date(v as string); continue; }
      data[k] = v;
    }

    const updated = await prisma.costOfSaleEntry.update({ where: { id: existing.id }, data });
    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'cost_of_sale_entry', resourceId: existing.id,
      before: { category: existing.category, amountPaise: Number(existing.amountPaise) },
      after: { category: updated.category, amountPaise: Number(updated.amountPaise) },
    });
    res.json({ data: entryToDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /:entryId — soft delete */
costOfSaleRouter.delete(
  '/:entryId',
  validate({ params: EntryIdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.costOfSaleEntry.findFirst({
      where: { id: req.params.entryId as string, opportunityId: req.params.id as string, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Cost of Sale entry not found');

    await prisma.costOfSaleEntry.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'cost_of_sale_entry', resourceId: existing.id });
    res.status(204).end();
  }),
);
