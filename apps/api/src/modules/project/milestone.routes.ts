import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';

// --- Zod schemas ---

const IdParams = z.object({ id: z.string().min(1).max(26) });
const SubIdParams = z.object({ id: z.string().min(1).max(26), mid: z.string().min(1).max(26) });

const MILESTONE_STATUSES = ['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'INVOICED'] as const;

const CreateMilestone = z.object({
  name: z.string().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  deliverable: z.string().max(500).nullable().optional(),
  plannedDate: z.string().min(1), // ISO date
  actualDate: z.string().nullable().optional(),
  percentOfContract: z.coerce.number().min(0).max(100).optional(),
  invoiceAmountPaise: z.coerce.number().int().nonnegative().optional(),
  status: z.enum(MILESTONE_STATUSES).default('NOT_STARTED'),
  sortOrder: z.coerce.number().int().default(0),
});

const UpdateMilestone = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  deliverable: z.string().max(500).nullable().optional(),
  plannedDate: z.string().min(1).optional(),
  actualDate: z.string().nullable().optional(),
  percentOfContract: z.coerce.number().min(0).max(100).nullable().optional(),
  invoiceAmountPaise: z.coerce.number().int().nonnegative().nullable().optional(),
  status: z.enum(MILESTONE_STATUSES).optional(),
  sortOrder: z.coerce.number().int().optional(),
});

// --- Helpers ---

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function milestoneToDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date; plannedDate: Date; actualDate: Date | null;
    invoiceAmountPaise: bigint | null; percentOfContract: unknown;
  };
  return {
    id: r.id, projectId: r.projectId, name: r.name,
    description: r.description ?? null, deliverable: r.deliverable ?? null,
    plannedDate: r.plannedDate.toISOString().slice(0, 10),
    actualDate: r.actualDate ? r.actualDate.toISOString().slice(0, 10) : null,
    percentOfContract: r.percentOfContract != null ? Number(r.percentOfContract) : null,
    invoiceAmountPaise: r.invoiceAmountPaise != null ? Number(r.invoiceAmountPaise) : null,
    status: r.status, sortOrder: r.sortOrder,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

async function assertProjectExists(projectId: string): Promise<void> {
  const count = await prisma.project.count({ where: { id: projectId, deletedAt: null } });
  if (count === 0) throw errors.notFound('Project not found');
}

// --- Router ---

export const milestoneRouter: ExpressRouter = Router({ mergeParams: true });
milestoneRouter.use(requireAuth);

/* GET / — list milestones for project */
milestoneRouter.get(
  '/',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const rows = await prisma.milestone.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { sortOrder: 'asc' },
    });

    res.json({
      data: rows.map((r) => milestoneToDto(r as unknown as Record<string, unknown>)),
    });
  }),
);

/* POST / — create milestone */
milestoneRouter.post(
  '/',
  validate({ params: IdParams, body: CreateMilestone }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const body = req.body as z.infer<typeof CreateMilestone>;
    const actor = actorId(req);
    const milestoneId = newId();

    const row = await prisma.milestone.create({
      data: {
        id: milestoneId, projectId,
        name: body.name, description: body.description ?? null,
        deliverable: body.deliverable ?? null,
        plannedDate: new Date(body.plannedDate),
        actualDate: body.actualDate ? new Date(body.actualDate) : null,
        percentOfContract: body.percentOfContract ?? null,
        invoiceAmountPaise: body.invoiceAmountPaise != null ? BigInt(body.invoiceAmountPaise) : null,
        status: body.status, sortOrder: body.sortOrder,
        createdBy: actor, updatedBy: actor,
      },
    });

    await recordAudit(req, {
      action: 'CREATE', resourceType: 'milestone', resourceId: milestoneId,
      after: { name: body.name, projectId },
    });
    res.status(201).json({ data: milestoneToDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:mid — update milestone */
milestoneRouter.patch(
  '/:mid',
  validate({ params: SubIdParams, body: UpdateMilestone }),
  asyncHandler(async (req, res) => {
    const { id: projectId, mid } = req.params as unknown as z.infer<typeof SubIdParams>;

    const existing = await prisma.milestone.findFirst({
      where: { id: mid, projectId, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Milestone not found');

    const body = req.body as z.infer<typeof UpdateMilestone>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === 'plannedDate' || k === 'actualDate') { data[k] = v ? new Date(v as string) : null; continue; }
      if (k === 'invoiceAmountPaise') { data[k] = v != null ? BigInt(v as number) : null; continue; }
      data[k] = v;
    }

    const updated = await prisma.milestone.update({ where: { id: mid }, data });

    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'milestone', resourceId: mid,
      before: { name: existing.name, status: existing.status },
      after: { name: updated.name, status: updated.status },
    });
    res.json({ data: milestoneToDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /:mid — soft delete */
milestoneRouter.delete(
  '/:mid',
  validate({ params: SubIdParams }),
  asyncHandler(async (req, res) => {
    const { id: projectId, mid } = req.params as unknown as z.infer<typeof SubIdParams>;

    const existing = await prisma.milestone.findFirst({
      where: { id: mid, projectId, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Milestone not found');

    await prisma.milestone.update({ where: { id: mid }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'milestone', resourceId: mid });
    res.status(204).end();
  }),
);
