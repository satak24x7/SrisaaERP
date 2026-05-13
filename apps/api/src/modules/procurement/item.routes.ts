import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';
import { actorId } from './shared.js';

export const itemRouter: ExpressRouter = Router();
itemRouter.use(requireAuth);

// ===== Schemas =====

const IdParams = z.object({ id: z.string().min(1).max(26) });

const CreateItemBody = z.object({
  sku: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  description: z.string().max(512).default(''),
  uom: z.string().min(1).max(16),
  category: z.string().max(128).optional(),
  hsn: z.string().max(16).optional(),
  sacCode: z.string().max(16).optional(),
  defaultGstRateBps: z.number().int().min(0).max(5000).default(0),
  specifications: z.any().optional(),
  makeModel: z.string().max(128).optional(),
});

const UpdateItemBody = CreateItemBody.partial();

const ListQuery = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ===== Routes =====

/* GET / — list items */
itemRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.category) where.category = q.category;
    if (q.q) where.OR = [
      { name: { contains: q.q } },
      { sku: { contains: q.q } },
      { description: { contains: q.q } },
    ];

    const take = q.limit + 1;
    const rows = await prisma.item.findMany({
      where,
      orderBy: { name: 'asc' },
      take,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > q.limit;
    if (hasMore) rows.pop();

    // Count OEM catalog items per master item (safe even if table doesn't exist yet in client)
    let oemCounts: Record<string, number> = {};
    try {
      const itemIds = rows.map(r => r.id);
      if (itemIds.length > 0) {
        const counts = await prisma.oemCatalogItem.groupBy({
          by: ['masterItemId'],
          where: { masterItemId: { in: itemIds }, deletedAt: null },
          _count: true,
        });
        oemCounts = Object.fromEntries(counts.map(c => [c.masterItemId, c._count]));
      }
    } catch { /* oemCatalogItem table may not exist yet */ }

    res.json({
      data: rows.map((r) => ({
        id: r.id, sku: r.sku, name: r.name, description: r.description,
        uom: r.uom, category: r.category, hsn: r.hsn, sacCode: r.sacCode,
        defaultGstRateBps: r.defaultGstRateBps, makeModel: r.makeModel,
        lastPurchasedRatePaise: Number(r.lastPurchasedRatePaise ?? 0),
        oemCatalogItemCount: oemCounts[r.id] ?? 0,
      })),
      meta: { next_cursor: hasMore ? rows[rows.length - 1]!.id : null, limit: q.limit },
    });
  }),
);

/* GET /:id — single item */
itemRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const item = await prisma.item.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
    });
    if (!item) throw errors.notFound('Item not found');
    res.json({
      data: {
        ...item,
        lastPurchasedRatePaise: Number(item.lastPurchasedRatePaise ?? 0),
      },
    });
  }),
);

/* POST / — create item */
itemRouter.post(
  '/',
  validate({ body: CreateItemBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateItemBody>;
    const actor = actorId(req);

    // Check SKU uniqueness
    const existing = await prisma.item.findUnique({ where: { sku: body.sku } });
    if (existing && !existing.deletedAt) throw errors.conflict('SKU already exists');

    const item = await prisma.item.create({
      data: { id: newId(), ...body, createdBy: actor, updatedBy: actor },
    });
    await recordAudit(req, { action: 'CREATE', resourceType: 'item', resourceId: item.id, after: { sku: item.sku, name: item.name } });
    res.status(201).json({ data: item });
  }),
);

/* PATCH /:id — update item */
itemRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateItemBody }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.item.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Item not found');
    const body = req.body as z.infer<typeof UpdateItemBody>;

    if (body.sku && body.sku !== existing.sku) {
      const dup = await prisma.item.findUnique({ where: { sku: body.sku } });
      if (dup && !dup.deletedAt && dup.id !== existing.id) throw errors.conflict('SKU already exists');
    }

    const item = await prisma.item.update({
      where: { id: existing.id },
      data: { ...body, updatedBy: actorId(req) },
    });
    await recordAudit(req, { action: 'UPDATE', resourceType: 'item', resourceId: item.id, before: { sku: existing.sku }, after: { sku: item.sku } });
    res.json({ data: item });
  }),
);

/* DELETE /:id — soft delete */
itemRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.item.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Item not found');

    await prisma.item.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'item', resourceId: existing.id, before: { sku: existing.sku, name: existing.name } });
    res.status(204).end();
  }),
);
