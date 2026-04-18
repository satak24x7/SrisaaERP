import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';

// --- Zod schemas ---

const IdParams = z.object({ id: z.string().min(1).max(26) });
const SubIdParams = z.object({ id: z.string().min(1).max(26), cid: z.string().min(1).max(26) });

const CreateCashFlowPeriod = z.object({
  periodLabel: z.string().min(1).max(16),   // e.g. "2026-04"
  periodStart: z.string().min(1),           // ISO date
  periodEnd: z.string().min(1),             // ISO date
  openingBalancePaise: z.coerce.number().int().default(0),
  billedPaise: z.coerce.number().int().default(0),
  receivedPaise: z.coerce.number().int().default(0),
  outflowPaise: z.coerce.number().int().default(0),
  closingBalancePaise: z.coerce.number().int().default(0),
});

const UpdateCashFlowPeriod = z.object({
  periodLabel: z.string().min(1).max(16).optional(),
  periodStart: z.string().min(1).optional(),
  periodEnd: z.string().min(1).optional(),
  openingBalancePaise: z.coerce.number().int().optional(),
  billedPaise: z.coerce.number().int().optional(),
  receivedPaise: z.coerce.number().int().optional(),
  outflowPaise: z.coerce.number().int().optional(),
  closingBalancePaise: z.coerce.number().int().optional(),
});

// --- Helpers ---

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function toBigNum(v: bigint | null | undefined): number { return v != null ? Number(v) : 0; }

function periodToDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date; periodStart: Date; periodEnd: Date;
    openingBalancePaise: bigint; billedPaise: bigint; receivedPaise: bigint;
    outflowPaise: bigint; closingBalancePaise: bigint;
  };
  return {
    id: r.id, projectId: r.projectId, periodLabel: r.periodLabel,
    periodStart: r.periodStart.toISOString().slice(0, 10),
    periodEnd: r.periodEnd.toISOString().slice(0, 10),
    openingBalancePaise: toBigNum(r.openingBalancePaise),
    billedPaise: toBigNum(r.billedPaise),
    receivedPaise: toBigNum(r.receivedPaise),
    outflowPaise: toBigNum(r.outflowPaise),
    closingBalancePaise: toBigNum(r.closingBalancePaise),
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

async function assertProjectExists(projectId: string): Promise<void> {
  const count = await prisma.project.count({ where: { id: projectId, deletedAt: null } });
  if (count === 0) throw errors.notFound('Project not found');
}

// --- Router ---

export const cashFlowRouter: ExpressRouter = Router({ mergeParams: true });
cashFlowRouter.use(requireAuth);

/* GET / — list cash flow periods for project */
cashFlowRouter.get(
  '/',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const rows = await prisma.cashFlowPeriod.findMany({
      where: { projectId },
      orderBy: { periodStart: 'asc' },
    });

    res.json({
      data: rows.map((r) => periodToDto(r as unknown as Record<string, unknown>)),
    });
  }),
);

/* POST / — create/upsert period (unique by projectId + periodLabel) */
cashFlowRouter.post(
  '/',
  validate({ params: IdParams, body: CreateCashFlowPeriod }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const body = req.body as z.infer<typeof CreateCashFlowPeriod>;
    const actor = actorId(req);
    const periodId = newId();

    try {
      const row = await prisma.cashFlowPeriod.upsert({
        where: { projectId_periodLabel: { projectId, periodLabel: body.periodLabel } },
        create: {
          id: periodId, projectId,
          periodLabel: body.periodLabel,
          periodStart: new Date(body.periodStart),
          periodEnd: new Date(body.periodEnd),
          openingBalancePaise: BigInt(body.openingBalancePaise),
          billedPaise: BigInt(body.billedPaise),
          receivedPaise: BigInt(body.receivedPaise),
          outflowPaise: BigInt(body.outflowPaise),
          closingBalancePaise: BigInt(body.closingBalancePaise),
          createdBy: actor, updatedBy: actor,
        },
        update: {
          periodStart: new Date(body.periodStart),
          periodEnd: new Date(body.periodEnd),
          openingBalancePaise: BigInt(body.openingBalancePaise),
          billedPaise: BigInt(body.billedPaise),
          receivedPaise: BigInt(body.receivedPaise),
          outflowPaise: BigInt(body.outflowPaise),
          closingBalancePaise: BigInt(body.closingBalancePaise),
          updatedBy: actor,
        },
      });

      await recordAudit(req, {
        action: 'UPSERT', resourceType: 'cash_flow_period', resourceId: row.id,
        after: { periodLabel: body.periodLabel, projectId },
      });
      res.status(201).json({ data: periodToDto(row as unknown as Record<string, unknown>) });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError) throw err;
      throw err;
    }
  }),
);

/* PATCH /:cid — update period */
cashFlowRouter.patch(
  '/:cid',
  validate({ params: SubIdParams, body: UpdateCashFlowPeriod }),
  asyncHandler(async (req, res) => {
    const { id: projectId, cid } = req.params as unknown as z.infer<typeof SubIdParams>;
    await assertProjectExists(projectId);

    const existing = await prisma.cashFlowPeriod.findFirst({
      where: { id: cid, projectId },
    });
    if (!existing) throw errors.notFound('Cash flow period not found');

    const body = req.body as z.infer<typeof UpdateCashFlowPeriod>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === 'periodStart' || k === 'periodEnd') { data[k] = new Date(v as string); continue; }
      if (k.endsWith('Paise')) { data[k] = BigInt(v as number); continue; }
      data[k] = v;
    }

    const updated = await prisma.cashFlowPeriod.update({ where: { id: cid }, data });

    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'cash_flow_period', resourceId: cid,
    });
    res.json({ data: periodToDto(updated as unknown as Record<string, unknown>) });
  }),
);
