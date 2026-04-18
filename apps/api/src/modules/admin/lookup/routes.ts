import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';

const IdParams = z.object({ id: z.string().min(1).max(26) });
const CodeParams = z.object({ code: z.string().min(1).max(64) });

const CreateListInput = z.object({
  code: z.string().min(1).max(64).regex(/^[a-z][a-z0-9_]*$/, 'Lowercase alphanumeric with underscores'),
  name: z.string().min(1).max(128),
});

const UpdateListInput = z.object({
  name: z.string().min(1).max(128).optional(),
});

const CreateItemInput = z.object({
  label: z.string().min(1).max(128),
  value: z.string().min(1).max(64),
  sortOrder: z.coerce.number().int().optional(),
  isActive: z.boolean().optional(),
});

const UpdateItemInput = CreateItemInput.partial();

const ReorderBody = z.object({
  ids: z.array(z.string().min(1).max(26)).min(1),
});

export const lookupRouter: ExpressRouter = Router();
lookupRouter.use(requireAuth);

// ---- Lists ----

/* GET / — all lists */
lookupRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const lists = await prisma.lookupList.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { items: true } } },
    });
    res.json({
      data: lists.map((l) => ({
        id: l.id, code: l.code, name: l.name, itemCount: l._count.items,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  }),
);

/* POST / — create list */
lookupRouter.post(
  '/',
  validate({ body: CreateListInput }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateListInput>;
    const existing = await prisma.lookupList.findUnique({ where: { code: body.code } });
    if (existing) throw errors.conflict(`List with code "${body.code}" already exists`);
    const row = await prisma.lookupList.create({
      data: { id: newId(), code: body.code, name: body.name },
    });
    res.status(201).json({ data: { id: row.id, code: row.code, name: row.name } });
  }),
);

/* PATCH /:id — rename list */
lookupRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateListInput }),
  asyncHandler(async (req, res) => {
    const list = await prisma.lookupList.findUnique({ where: { id: req.params.id as string } });
    if (!list) throw errors.notFound('List not found');
    const body = req.body as z.infer<typeof UpdateListInput>;
    const updated = await prisma.lookupList.update({
      where: { id: list.id },
      data: { name: body.name ?? list.name },
    });
    res.json({ data: { id: updated.id, code: updated.code, name: updated.name } });
  }),
);

/* DELETE /:id — delete list + all items */
lookupRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const list = await prisma.lookupList.findUnique({ where: { id: req.params.id as string } });
    if (!list) throw errors.notFound('List not found');
    await prisma.lookupItem.deleteMany({ where: { listId: list.id } });
    await prisma.lookupList.delete({ where: { id: list.id } });
    res.status(204).end();
  }),
);

// ---- Items by list code ----

/* GET /by-code/:code/items — get items for a list (used by dropdowns across the app) */
lookupRouter.get(
  '/by-code/:code/items',
  validate({ params: CodeParams }),
  asyncHandler(async (req, res) => {
    const list = await prisma.lookupList.findUnique({ where: { code: req.params.code as string } });
    if (!list) throw errors.notFound('List not found');
    const items = await prisma.lookupItem.findMany({
      where: { listId: list.id },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({
      data: items.map((i) => ({
        id: i.id, label: i.label, value: i.value, sortOrder: i.sortOrder, isActive: i.isActive,
      })),
    });
  }),
);

// ---- Items by list ID ----

/* GET /:id/items */
lookupRouter.get(
  '/:id/items',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const items = await prisma.lookupItem.findMany({
      where: { listId: req.params.id as string },
      orderBy: { sortOrder: 'asc' },
    });
    res.json({
      data: items.map((i) => ({
        id: i.id, label: i.label, value: i.value, sortOrder: i.sortOrder, isActive: i.isActive,
      })),
    });
  }),
);

/* POST /:id/items */
lookupRouter.post(
  '/:id/items',
  validate({ params: IdParams, body: CreateItemInput }),
  asyncHandler(async (req, res) => {
    const list = await prisma.lookupList.findUnique({ where: { id: req.params.id as string } });
    if (!list) throw errors.notFound('List not found');
    const body = req.body as z.infer<typeof CreateItemInput>;

    // Auto sort order if not provided
    let sortOrder = body.sortOrder;
    if (sortOrder === undefined) {
      const last = await prisma.lookupItem.findFirst({
        where: { listId: list.id }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true },
      });
      sortOrder = (last?.sortOrder ?? -1) + 1;
    }

    const row = await prisma.lookupItem.create({
      data: {
        id: newId(), listId: list.id, label: body.label, value: body.value,
        sortOrder, isActive: body.isActive ?? true,
      },
    });
    res.status(201).json({
      data: { id: row.id, label: row.label, value: row.value, sortOrder: row.sortOrder, isActive: row.isActive },
    });
  }),
);

/* PATCH /items/:itemId */
lookupRouter.patch(
  '/items/:id',
  validate({ params: IdParams, body: UpdateItemInput }),
  asyncHandler(async (req, res) => {
    const item = await prisma.lookupItem.findUnique({ where: { id: req.params.id as string } });
    if (!item) throw errors.notFound('Item not found');
    const body = req.body as z.infer<typeof UpdateItemInput>;
    const data: Record<string, unknown> = {};
    if (body.label !== undefined) data.label = body.label;
    if (body.value !== undefined) data.value = body.value;
    if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
    if (body.isActive !== undefined) data.isActive = body.isActive;
    const updated = await prisma.lookupItem.update({ where: { id: item.id }, data });
    res.json({
      data: { id: updated.id, label: updated.label, value: updated.value, sortOrder: updated.sortOrder, isActive: updated.isActive },
    });
  }),
);

/* DELETE /items/:itemId */
lookupRouter.delete(
  '/items/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const item = await prisma.lookupItem.findUnique({ where: { id: req.params.id as string } });
    if (!item) throw errors.notFound('Item not found');
    await prisma.lookupItem.delete({ where: { id: item.id } });
    res.status(204).end();
  }),
);

/* PUT /:id/items/reorder */
lookupRouter.put(
  '/:id/items/reorder',
  validate({ params: IdParams, body: ReorderBody }),
  asyncHandler(async (req, res) => {
    const { ids } = req.body as z.infer<typeof ReorderBody>;
    await prisma.$transaction(
      ids.map((id, idx) => prisma.lookupItem.update({ where: { id }, data: { sortOrder: idx } })),
    );
    res.json({ data: { ok: true } });
  }),
);
