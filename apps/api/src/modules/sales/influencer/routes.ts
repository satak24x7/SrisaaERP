import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';

const InfluencerTypeEnum = z.enum(['POLITICAL', 'BUREAUCRAT', 'OTHER']);
const InfluenceLevelEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CHAMPION']);
const IdParams = z.object({ id: z.string().min(1).max(26) });

const CreateInput = z.object({
  name: z.string().min(1).max(255),
  influencerType: InfluencerTypeEnum,
  governmentId: z.string().min(1).max(26),
  partyName: z.string().max(128).optional(),
  qualifier: z.string().max(255).optional(),
  phone: z.string().max(32).optional(),
  email: z.string().email().max(255).optional(),
  influenceLevel: InfluenceLevelEnum.optional(),
  rating: z.coerce.number().int().min(1).max(5).optional(),
  notes: z.string().optional(),
});

const UpdateInput = CreateInput.partial();

const ListQuery = z.object({
  governmentId: z.string().optional(),
  influencerType: InfluencerTypeEnum.optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

const INCLUDE = {
  government: { select: { id: true, name: true, governmentType: true } },
} as const;

function toDto(r: Record<string, unknown>) {
  const row = r as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date;
    government?: { id: string; name: string; governmentType: string };
  };
  return {
    id: row.id, name: row.name, influencerType: row.influencerType,
    governmentId: row.governmentId,
    governmentName: row.government?.name ?? null,
    governmentType: row.government?.governmentType ?? null,
    partyName: row.partyName, qualifier: row.qualifier,
    phone: row.phone, email: row.email, influenceLevel: row.influenceLevel,
    rating: row.rating, notes: row.notes,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

export const influencerRouter: ExpressRouter = Router();
influencerRouter.use(requireAuth);

/* GET / */
influencerRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.governmentId) where.governmentId = q.governmentId;
    if (q.influencerType) where.influencerType = q.influencerType;
    if (q.q) where.name = { contains: q.q };

    const take = q.limit + 1;
    const args: Record<string, unknown> = { where, orderBy: { name: 'asc' }, take, include: INCLUDE };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.influencer.findMany(args as Parameters<typeof prisma.influencer.findMany>[0]);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    res.json({ data: page.map((r) => toDto(r as unknown as Record<string, unknown>)), meta: { next_cursor: nextCursor, limit: q.limit } });
  }),
);

/* GET /:id */
influencerRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.influencer.findFirst({ where: { id: req.params.id as string, deletedAt: null }, include: INCLUDE });
    if (!row) throw errors.notFound('Influencer not found');
    res.json({ data: toDto(row as unknown as Record<string, unknown>) });
  }),
);

/* POST / */
influencerRouter.post(
  '/',
  validate({ body: CreateInput }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateInput>;
    const gov = await prisma.government.findFirst({ where: { id: body.governmentId, deletedAt: null } });
    if (!gov) throw errors.businessRule('GOVERNMENT_NOT_FOUND', 'governmentId does not reference an active government');
    const actor = actorId(req);
    const row = await prisma.influencer.create({
      data: {
        id: newId(), name: body.name, influencerType: body.influencerType,
        governmentId: body.governmentId, partyName: body.partyName ?? null,
        qualifier: body.qualifier ?? null, phone: body.phone ?? null,
        email: body.email ?? null, influenceLevel: body.influenceLevel ?? null,
        rating: body.rating ?? null, notes: body.notes ?? null,
        createdBy: actor, updatedBy: actor,
      },
      include: INCLUDE,
    });
    await recordAudit(req, { action: 'CREATE', resourceType: 'influencer', resourceId: row.id, after: { name: row.name } });
    res.status(201).json({ data: toDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:id */
influencerRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateInput }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.influencer.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Influencer not found');
    const body = req.body as z.infer<typeof UpdateInput>;
    if (body.governmentId) {
      const gov = await prisma.government.findFirst({ where: { id: body.governmentId, deletedAt: null } });
      if (!gov) throw errors.businessRule('GOVERNMENT_NOT_FOUND', 'governmentId does not reference an active government');
    }
    const data: Record<string, unknown> = { updatedBy: actorId(req) };
    for (const [k, v] of Object.entries(body)) { if (v !== undefined) data[k] = v; }
    const updated = await prisma.influencer.update({ where: { id: existing.id }, data, include: INCLUDE });
    await recordAudit(req, { action: 'UPDATE', resourceType: 'influencer', resourceId: existing.id });
    res.json({ data: toDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /:id */
influencerRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.influencer.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Influencer not found');
    await prisma.influencer.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'influencer', resourceId: existing.id, before: { name: existing.name } });
    res.status(204).end();
  }),
);
