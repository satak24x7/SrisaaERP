import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';

const IdParams = z.object({ id: z.string().min(1).max(26) });

const CreateInput = z.object({
  name: z.string().min(1).max(128),
  registrationId: z.string().min(1).max(128),
  portalUrl: z.string().max(512).optional(),
  login: z.string().max(255).optional(),
  password: z.string().max(255).optional(),
  mobile: z.string().max(32).optional(),
  email: z.string().email().max(255).optional(),
});

const UpdateInput = CreateInput.partial();

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

/** Public DTO — sensitive fields masked */
function toPublicDto(r: {
  id: string; name: string; registrationId: string; portalUrl: string | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: r.id, name: r.name, registrationId: r.registrationId,
    portalUrl: r.portalUrl,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

/** Full DTO — includes sensitive fields */
function toFullDto(r: {
  id: string; name: string; registrationId: string; portalUrl: string | null;
  login: string | null; password: string | null; mobile: string | null; email: string | null;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    ...toPublicDto(r),
    login: r.login, password: r.password, mobile: r.mobile, email: r.email,
  };
}

export const statutoryRouter: ExpressRouter = Router();
statutoryRouter.use(requireAuth);

/* GET / — list all (public fields only) */
statutoryRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.statutoryRegistration.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ data: rows.map(toPublicDto) });
  }),
);

/* GET /:id — single registration. Query ?reveal=true to include sensitive fields */
statutoryRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.statutoryRegistration.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
    });
    if (!row) throw errors.notFound('Registration not found');

    const reveal = req.query.reveal === 'true';
    res.json({ data: reveal ? toFullDto(row) : toPublicDto(row) });
  }),
);

/* POST / */
statutoryRouter.post(
  '/',
  validate({ body: CreateInput }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateInput>;
    const actor = actorId(req);
    const row = await prisma.statutoryRegistration.create({
      data: {
        id: newId(),
        name: body.name,
        registrationId: body.registrationId,
        portalUrl: body.portalUrl ?? null,
        login: body.login ?? null,
        password: body.password ?? null,
        mobile: body.mobile ?? null,
        email: body.email ?? null,
        createdBy: actor,
        updatedBy: actor,
      },
    });
    await recordAudit(req, {
      action: 'CREATE', resourceType: 'statutory_registration', resourceId: row.id,
      after: { name: row.name, registrationId: row.registrationId },
    });
    res.status(201).json({ data: toFullDto(row) });
  }),
);

/* PATCH /:id */
statutoryRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateInput }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.statutoryRegistration.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Registration not found');

    const body = req.body as z.infer<typeof UpdateInput>;
    const data: Record<string, unknown> = { updatedBy: actorId(req) };
    if (body.name !== undefined) data.name = body.name;
    if (body.registrationId !== undefined) data.registrationId = body.registrationId;
    if (body.portalUrl !== undefined) data.portalUrl = body.portalUrl;
    if (body.login !== undefined) data.login = body.login;
    if (body.password !== undefined) data.password = body.password;
    if (body.mobile !== undefined) data.mobile = body.mobile;
    if (body.email !== undefined) data.email = body.email;

    const updated = await prisma.statutoryRegistration.update({ where: { id: existing.id }, data });
    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'statutory_registration', resourceId: existing.id,
      before: { name: existing.name }, after: { name: updated.name },
    });
    res.json({ data: toFullDto(updated) });
  }),
);

/* DELETE /:id */
statutoryRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.statutoryRegistration.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Registration not found');

    await prisma.statutoryRegistration.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, {
      action: 'DELETE', resourceType: 'statutory_registration', resourceId: existing.id,
      before: { name: existing.name },
    });
    res.status(204).end();
  }),
);
