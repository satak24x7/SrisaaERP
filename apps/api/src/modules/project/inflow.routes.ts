import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';

// --- Zod schemas ---

const IdParams = z.object({ id: z.string().min(1).max(26) });
const SubIdParams = z.object({ id: z.string().min(1).max(26), iid: z.string().min(1).max(26) });

const INFLOW_STATUSES = ['PLANNED', 'INVOICED', 'RECEIVED'] as const;

const CreateInflow = z.object({
  milestoneId: z.string().max(26).nullable().optional(),
  description: z.string().min(1).max(500),
  invoiceDate: z.string().min(1), // ISO date
  amountPaise: z.coerce.number().int().nonnegative(),
  gstPct: z.coerce.number().min(0).max(100).default(0),
  retentionPct: z.coerce.number().min(0).max(100).default(0),
  status: z.enum(INFLOW_STATUSES).default('PLANNED'),
});

const UpdateInflow = z.object({
  milestoneId: z.string().max(26).nullable().optional(),
  description: z.string().min(1).max(500).optional(),
  invoiceDate: z.string().min(1).optional(),
  amountPaise: z.coerce.number().int().nonnegative().optional(),
  gstPct: z.coerce.number().min(0).max(100).optional(),
  retentionPct: z.coerce.number().min(0).max(100).optional(),
  status: z.enum(INFLOW_STATUSES).optional(),
});

// --- Helpers ---

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function inflowToDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date; invoiceDate: Date;
    amountPaise: bigint; gstPct: unknown; retentionPct: unknown;
    milestone?: { id: string; name: string } | null;
  };
  return {
    id: r.id, projectId: r.projectId,
    milestoneId: r.milestoneId ?? null,
    milestoneName: r.milestone?.name ?? null,
    description: r.description,
    invoiceDate: r.invoiceDate.toISOString().slice(0, 10),
    amountPaise: Number(r.amountPaise),
    gstPct: Number(r.gstPct), retentionPct: Number(r.retentionPct),
    status: r.status,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

async function assertProjectExists(projectId: string): Promise<void> {
  const count = await prisma.project.count({ where: { id: projectId, deletedAt: null } });
  if (count === 0) throw errors.notFound('Project not found');
}

// --- Router ---

export const inflowRouter: ExpressRouter = Router({ mergeParams: true });
inflowRouter.use(requireAuth);

/* GET / — list inflow items */
inflowRouter.get(
  '/',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const rows = await prisma.inflowPlanItem.findMany({
      where: { projectId },
      orderBy: { invoiceDate: 'asc' },
      include: { milestone: { select: { id: true, name: true } } },
    });

    res.json({
      data: rows.map((r) => inflowToDto(r as unknown as Record<string, unknown>)),
    });
  }),
);

/* POST / — create inflow item */
inflowRouter.post(
  '/',
  validate({ params: IdParams, body: CreateInflow }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const body = req.body as z.infer<typeof CreateInflow>;
    const actor = actorId(req);
    const itemId = newId();

    const row = await prisma.inflowPlanItem.create({
      data: {
        id: itemId, projectId,
        milestoneId: body.milestoneId ?? null,
        description: body.description,
        invoiceDate: new Date(body.invoiceDate),
        amountPaise: BigInt(body.amountPaise),
        gstPct: body.gstPct, retentionPct: body.retentionPct,
        status: body.status,
        createdBy: actor, updatedBy: actor,
      },
      include: { milestone: { select: { id: true, name: true } } },
    });

    await recordAudit(req, {
      action: 'CREATE', resourceType: 'inflow_plan_item', resourceId: itemId,
      after: { description: body.description, amountPaise: body.amountPaise },
    });
    res.status(201).json({ data: inflowToDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:iid — update inflow item */
inflowRouter.patch(
  '/:iid',
  validate({ params: SubIdParams, body: UpdateInflow }),
  asyncHandler(async (req, res) => {
    const { id: projectId, iid } = req.params as unknown as z.infer<typeof SubIdParams>;

    const existing = await prisma.inflowPlanItem.findFirst({
      where: { id: iid, projectId },
    });
    if (!existing) throw errors.notFound('Inflow plan item not found');

    const body = req.body as z.infer<typeof UpdateInflow>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === 'invoiceDate') { data[k] = new Date(v as string); continue; }
      if (k === 'amountPaise') { data[k] = BigInt(v as number); continue; }
      data[k] = v;
    }

    const updated = await prisma.inflowPlanItem.update({
      where: { id: iid }, data,
      include: { milestone: { select: { id: true, name: true } } },
    });

    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'inflow_plan_item', resourceId: iid,
    });
    res.json({ data: inflowToDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /:iid — hard delete (InflowPlanItem has no deletedAt) */
inflowRouter.delete(
  '/:iid',
  validate({ params: SubIdParams }),
  asyncHandler(async (req, res) => {
    const { id: projectId, iid } = req.params as unknown as z.infer<typeof SubIdParams>;

    const existing = await prisma.inflowPlanItem.findFirst({
      where: { id: iid, projectId },
    });
    if (!existing) throw errors.notFound('Inflow plan item not found');

    await prisma.inflowPlanItem.delete({ where: { id: iid } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'inflow_plan_item', resourceId: iid });
    res.status(204).end();
  }),
);
