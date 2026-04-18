import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';

const InfluenceLevelEnum = z.enum(['LOW', 'MEDIUM', 'HIGH', 'CHAMPION']);
const IdParams = z.object({ id: z.string().min(1).max(26) });

const CreateInput = z.object({
  firstName: z.string().min(1).max(128),
  lastName: z.string().max(128).optional(),
  designation: z.string().max(128).optional(),
  department: z.string().max(255).optional(),
  email: z.string().email().max(255).optional(),
  phone: z.string().max(32).optional(),
  mobile: z.string().max(32).optional(),
  influenceLevel: InfluenceLevelEnum.optional(),
  notes: z.string().optional(),
  accountIds: z.array(z.string().min(1).max(26)).optional(),
});

const UpdateInput = CreateInput.partial();

const ListQuery = z.object({
  accountId: z.string().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

const CONTACT_INCLUDE = {
  accountContacts: {
    include: { account: { select: { id: true, name: true } } },
  },
} as const;

function toDto(r: Record<string, unknown>) {
  const row = r as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date;
    accountContacts?: Array<{ account: { id: string; name: string } }>;
  };
  return {
    id: row.id,
    firstName: row.firstName,
    lastName: row.lastName,
    designation: row.designation,
    department: row.department,
    email: row.email,
    phone: row.phone,
    mobile: row.mobile,
    influenceLevel: row.influenceLevel,
    notes: row.notes,
    accounts: (row.accountContacts ?? []).map((ac) => ({ id: ac.account.id, name: ac.account.name })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export const contactRouter: ExpressRouter = Router();
contactRouter.use(requireAuth);

/* GET / */
contactRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.accountId) {
      where.accountContacts = { some: { accountId: q.accountId } };
    }
    if (q.q) {
      where.OR = [
        { firstName: { contains: q.q } },
        { lastName: { contains: q.q } },
        { email: { contains: q.q } },
      ];
    }

    const take = q.limit + 1;
    const args: Record<string, unknown> = {
      where, orderBy: { id: 'asc' }, take,
      include: CONTACT_INCLUDE,
    };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.contact.findMany(args as Parameters<typeof prisma.contact.findMany>[0]);
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
contactRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.contact.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: CONTACT_INCLUDE,
    });
    if (!row) throw errors.notFound('Contact not found');
    res.json({ data: toDto(row as unknown as Record<string, unknown>) });
  }),
);

/* POST / */
contactRouter.post(
  '/',
  validate({ body: CreateInput }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateInput>;
    const actor = actorId(req);
    const contactId = newId();

    const row = await prisma.contact.create({
      data: {
        id: contactId,
        firstName: body.firstName,
        lastName: body.lastName ?? null,
        designation: body.designation ?? null,
        department: body.department ?? null,
        email: body.email ?? null,
        phone: body.phone ?? null,
        mobile: body.mobile ?? null,
        influenceLevel: body.influenceLevel ?? null,
        notes: body.notes ?? null,
        createdBy: actor,
        updatedBy: actor,
      },
      include: CONTACT_INCLUDE,
    });

    // Link to accounts
    if (body.accountIds && body.accountIds.length > 0) {
      await prisma.accountContact.createMany({
        data: body.accountIds.map((accountId) => ({
          id: newId(),
          accountId,
          contactId,
        })),
      });
    }

    // Re-fetch with accounts
    const full = await prisma.contact.findUniqueOrThrow({
      where: { id: contactId },
      include: CONTACT_INCLUDE,
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'contact', resourceId: contactId, after: { firstName: full.firstName } });
    res.status(201).json({ data: toDto(full as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:id */
contactRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateInput }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.contact.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Contact not found');

    const body = req.body as z.infer<typeof UpdateInput>;
    const data: Record<string, unknown> = { updatedBy: actorId(req) };
    const { accountIds, ...fields } = body;
    for (const [k, v] of Object.entries(fields)) { if (v !== undefined) data[k] = v; }

    await prisma.contact.update({ where: { id: existing.id }, data });

    // Sync accounts if provided
    if (accountIds !== undefined) {
      await prisma.accountContact.deleteMany({ where: { contactId: existing.id } });
      if (accountIds.length > 0) {
        await prisma.accountContact.createMany({
          data: accountIds.map((accountId) => ({
            id: newId(),
            accountId,
            contactId: existing.id,
          })),
        });
      }
    }

    const updated = await prisma.contact.findUniqueOrThrow({
      where: { id: existing.id },
      include: CONTACT_INCLUDE,
    });
    await recordAudit(req, { action: 'UPDATE', resourceType: 'contact', resourceId: existing.id });
    res.json({ data: toDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /:id */
contactRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.contact.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Contact not found');

    await prisma.contact.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'contact', resourceId: existing.id, before: { firstName: existing.firstName } });
    res.status(204).end();
  }),
);
