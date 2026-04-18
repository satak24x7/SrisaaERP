import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';

const GovTypeEnum = z.enum(['NATIONAL', 'STATE']);
const IdParams = z.object({ id: z.string().min(1).max(26) });

const CODE_REGEX = /^\S{5}$/;

const CreateInput = z.object({
  code: z.string().min(1).max(5).regex(/^\S+$/, 'No spaces allowed').toUpperCase(),
  name: z.string().min(1).max(255),
  governmentType: GovTypeEnum,
  country: z.string().min(1).max(128),
  capital: z.string().max(128).optional(),
  notes: z.string().optional(),
});

const UpdateInput = CreateInput.partial();

const ListQuery = z.object({
  governmentType: GovTypeEnum.optional(),
  country: z.string().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function toDto(r: {
  id: string; code: string; name: string; governmentType: string; country: string;
  capital: string | null; notes: string | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: r.id, code: r.code, name: r.name, governmentType: r.governmentType, country: r.country,
    capital: r.capital, notes: r.notes,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

export const governmentRouter: ExpressRouter = Router();
governmentRouter.use(requireAuth);

/* GET / */
governmentRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.governmentType) where.governmentType = q.governmentType;
    if (q.country) where.country = { contains: q.country };
    if (q.q) where.name = { contains: q.q };

    const take = q.limit + 1;
    const args: Record<string, unknown> = { where, orderBy: { name: 'asc' }, take };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.government.findMany(args as Parameters<typeof prisma.government.findMany>[0]);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    res.json({ data: page.map(toDto), meta: { next_cursor: nextCursor, limit: q.limit } });
  }),
);

/* GET /:id */
governmentRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.government.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!row) throw errors.notFound('Government not found');
    res.json({ data: toDto(row) });
  }),
);

/* POST / */
governmentRouter.post(
  '/',
  validate({ body: CreateInput }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateInput>;
    const actor = actorId(req);
    const row = await prisma.government.create({
      data: {
        id: newId(), code: body.code, name: body.name, governmentType: body.governmentType,
        country: body.country,
        capital: body.capital ?? null, notes: body.notes ?? null,
        createdBy: actor, updatedBy: actor,
      },
    });
    await recordAudit(req, { action: 'CREATE', resourceType: 'government', resourceId: row.id, after: { name: row.name } });
    res.status(201).json({ data: toDto(row) });
  }),
);

/* PATCH /:id */
governmentRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateInput }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.government.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Government not found');
    const body = req.body as z.infer<typeof UpdateInput>;
    const data: Record<string, unknown> = { updatedBy: actorId(req) };
    for (const [k, v] of Object.entries(body)) { if (v !== undefined) data[k] = v; }
    const updated = await prisma.government.update({ where: { id: existing.id }, data });
    await recordAudit(req, { action: 'UPDATE', resourceType: 'government', resourceId: existing.id, before: { name: existing.name }, after: { name: updated.name } });
    res.json({ data: toDto(updated) });
  }),
);

/* DELETE /:id */
governmentRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.government.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Government not found');
    const influencerCount = await prisma.influencer.count({ where: { governmentId: existing.id, deletedAt: null } });
    if (influencerCount > 0) {
      throw errors.businessRule('GOVERNMENT_HAS_INFLUENCERS', `Cannot delete — ${influencerCount} influencer(s) linked. Remove them first.`, { influencers: influencerCount });
    }
    await prisma.government.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'government', resourceId: existing.id, before: { name: existing.name } });
    res.status(204).end();
  }),
);
