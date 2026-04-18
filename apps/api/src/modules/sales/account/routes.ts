import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';

// Account type comes from lookup list "account_type" — no hardcoded enum

const IdParams = z.object({ id: z.string().min(1).max(26) });

const CODE_REGEX = /^\S{5}$/;

const CreateInput = z.object({
  code: z.string().min(1).max(5).regex(/^\S+$/, 'No spaces allowed').toUpperCase(),
  name: z.string().min(1).max(255),
  shortName: z.string().max(64).optional(),
  accountType: z.string().min(1).max(64),
  parentAccountId: z.string().max(26).optional(),
  website: z.string().max(512).optional(),
  phone: z.string().max(32).optional(),
  email: z.string().email().max(255).optional(),
  address: z.string().optional(),
  city: z.string().max(128).optional(),
  state: z.string().max(64).optional(),
  pincode: z.string().max(10).optional(),
  gstin: z.string().max(15).optional(),
  notes: z.string().optional(),
  ownerUserId: z.string().max(26).optional(),
  governmentId: z.string().max(26).optional(),
});

const UpdateInput = CreateInput.partial();

const ListQuery = z.object({
  q: z.string().optional(),
  accountType: z.string().min(1).max(64).optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function toDto(r: Record<string, unknown>) {
  const row = r as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date;
    government?: { id: string; name: string } | null;
  };
  return {
    ...r,
    governmentName: row.government?.name ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    deletedAt: undefined,
    createdBy: undefined,
    updatedBy: undefined,
    government: undefined,
  };
}

export const accountRouter: ExpressRouter = Router();
accountRouter.use(requireAuth);

/* GET / */
accountRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.accountType) where.accountType = q.accountType;
    if (q.q) where.name = { contains: q.q };

    const take = q.limit + 1;
    const args: Record<string, unknown> = {
      where, orderBy: { id: 'asc' }, take,
      include: { government: { select: { id: true, name: true } } },
    };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.account.findMany(args as Parameters<typeof prisma.account.findMany>[0]);
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
accountRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.account.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        _count: { select: { accountContacts: true, opportunities: { where: { deletedAt: null } }, leads: { where: { deletedAt: null } } } },
      },
    });
    if (!row) throw errors.notFound('Account not found');
    const dto = toDto(row as unknown as Record<string, unknown>);
    res.json({ data: dto });
  }),
);

/* POST / */
accountRouter.post(
  '/',
  validate({ body: CreateInput }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateInput>;
    const actor = actorId(req);
    const row = await prisma.account.create({
      data: {
        id: newId(),
        code: body.code,
        name: body.name,
        shortName: body.shortName ?? null,
        accountType: body.accountType,
        parentAccountId: body.parentAccountId ?? null,
        website: body.website ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        address: body.address ?? null,
        city: body.city ?? null,
        state: body.state ?? null,
        pincode: body.pincode ?? null,
        gstin: body.gstin ?? null,
        notes: body.notes ?? null,
        ownerUserId: body.ownerUserId ?? null,
        governmentId: body.governmentId ?? null,
        createdBy: actor,
        updatedBy: actor,
      },
    });
    await recordAudit(req, { action: 'CREATE', resourceType: 'account', resourceId: row.id, after: { name: row.name } });
    res.status(201).json({ data: toDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:id */
accountRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateInput }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.account.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Account not found');

    const body = req.body as z.infer<typeof UpdateInput>;
    const data: Record<string, unknown> = { updatedBy: actorId(req) };
    for (const [k, v] of Object.entries(body)) { if (v !== undefined) data[k] = v; }

    const updated = await prisma.account.update({ where: { id: existing.id }, data });
    await recordAudit(req, { action: 'UPDATE', resourceType: 'account', resourceId: existing.id, before: { name: existing.name }, after: { name: updated.name } });
    res.json({ data: toDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /:id */
accountRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.account.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Account not found');

    // Refs guard
    const [opps, leads] = await Promise.all([
      prisma.opportunity.count({ where: { accountId: existing.id, deletedAt: null } }),
      prisma.lead.count({ where: { accountId: existing.id, deletedAt: null } }),
    ]);
    if (opps + leads > 0) {
      throw errors.businessRule('ACCOUNT_HAS_REFERENCES', 'Account has active opportunities or leads. Re-assign them first.', { opportunities: opps, leads });
    }

    await prisma.account.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'account', resourceId: existing.id, before: { name: existing.name } });
    res.status(204).end();
  }),
);
