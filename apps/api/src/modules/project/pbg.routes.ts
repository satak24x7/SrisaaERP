import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';

// --- Zod schemas ---

const IdParams = z.object({ id: z.string().min(1).max(26) });
const SubIdParams = z.object({ id: z.string().min(1).max(26), pid: z.string().min(1).max(26) });

const PBG_TYPES = ['PBG', 'RETENTION'] as const;
const PBG_STATUSES = ['ACTIVE', 'RELEASED', 'EXPIRED'] as const;

const CreatePbg = z.object({
  type: z.enum(PBG_TYPES),
  description: z.string().min(1).max(500),
  amountPaise: z.coerce.number().int().nonnegative(),
  bankName: z.string().max(255).nullable().optional(),
  bgNumber: z.string().max(128).nullable().optional(),
  issuedDate: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  status: z.enum(PBG_STATUSES).default('ACTIVE'),
  releaseDate: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

const UpdatePbg = z.object({
  type: z.enum(PBG_TYPES).optional(),
  description: z.string().min(1).max(500).optional(),
  amountPaise: z.coerce.number().int().nonnegative().optional(),
  bankName: z.string().max(255).nullable().optional(),
  bgNumber: z.string().max(128).nullable().optional(),
  issuedDate: z.string().nullable().optional(),
  expiryDate: z.string().nullable().optional(),
  status: z.enum(PBG_STATUSES).optional(),
  releaseDate: z.string().nullable().optional(),
  notes: z.string().max(5000).nullable().optional(),
});

// --- Helpers ---

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function pbgToDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date;
    amountPaise: bigint;
    issuedDate: Date | null; expiryDate: Date | null; releaseDate: Date | null;
  };
  return {
    id: r.id, projectId: r.projectId, type: r.type,
    description: r.description, amountPaise: Number(r.amountPaise),
    bankName: r.bankName ?? null, bgNumber: r.bgNumber ?? null,
    issuedDate: r.issuedDate ? r.issuedDate.toISOString().slice(0, 10) : null,
    expiryDate: r.expiryDate ? r.expiryDate.toISOString().slice(0, 10) : null,
    status: r.status,
    releaseDate: r.releaseDate ? r.releaseDate.toISOString().slice(0, 10) : null,
    notes: r.notes ?? null,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

async function assertProjectExists(projectId: string): Promise<void> {
  const count = await prisma.project.count({ where: { id: projectId, deletedAt: null } });
  if (count === 0) throw errors.notFound('Project not found');
}

// --- Router ---

export const pbgRouter: ExpressRouter = Router({ mergeParams: true });
pbgRouter.use(requireAuth);

/* GET / — list PBG & retention records */
pbgRouter.get(
  '/',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const rows = await prisma.pbgRecord.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });

    res.json({
      data: rows.map((r) => pbgToDto(r as unknown as Record<string, unknown>)),
    });
  }),
);

/* POST / — create PBG record */
pbgRouter.post(
  '/',
  validate({ params: IdParams, body: CreatePbg }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const body = req.body as z.infer<typeof CreatePbg>;
    const actor = actorId(req);
    const recordId = newId();

    const row = await prisma.pbgRecord.create({
      data: {
        id: recordId, projectId,
        type: body.type, description: body.description,
        amountPaise: BigInt(body.amountPaise),
        bankName: body.bankName ?? null, bgNumber: body.bgNumber ?? null,
        issuedDate: body.issuedDate ? new Date(body.issuedDate) : null,
        expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
        status: body.status,
        releaseDate: body.releaseDate ? new Date(body.releaseDate) : null,
        notes: body.notes ?? null,
        createdBy: actor, updatedBy: actor,
      },
    });

    await recordAudit(req, {
      action: 'CREATE', resourceType: 'pbg_record', resourceId: recordId,
      after: { type: body.type, amountPaise: body.amountPaise },
    });
    res.status(201).json({ data: pbgToDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:pid — update PBG record */
pbgRouter.patch(
  '/:pid',
  validate({ params: SubIdParams, body: UpdatePbg }),
  asyncHandler(async (req, res) => {
    const { id: projectId, pid } = req.params as unknown as z.infer<typeof SubIdParams>;

    const existing = await prisma.pbgRecord.findFirst({
      where: { id: pid, projectId, deletedAt: null },
    });
    if (!existing) throw errors.notFound('PBG record not found');

    const body = req.body as z.infer<typeof UpdatePbg>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === 'amountPaise') { data[k] = BigInt(v as number); continue; }
      if (k === 'issuedDate' || k === 'expiryDate' || k === 'releaseDate') {
        data[k] = v ? new Date(v as string) : null;
        continue;
      }
      data[k] = v;
    }

    const updated = await prisma.pbgRecord.update({ where: { id: pid }, data });

    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'pbg_record', resourceId: pid,
      before: { status: existing.status },
      after: { status: updated.status },
    });
    res.json({ data: pbgToDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /:pid — soft delete */
pbgRouter.delete(
  '/:pid',
  validate({ params: SubIdParams }),
  asyncHandler(async (req, res) => {
    const { id: projectId, pid } = req.params as unknown as z.infer<typeof SubIdParams>;

    const existing = await prisma.pbgRecord.findFirst({
      where: { id: pid, projectId, deletedAt: null },
    });
    if (!existing) throw errors.notFound('PBG record not found');

    await prisma.pbgRecord.update({ where: { id: pid }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'pbg_record', resourceId: pid });
    res.status(204).end();
  }),
);
