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
const LineIdParams = z.object({ id: z.string().min(1).max(26), lid: z.string().min(1).max(26) });

const BUDGET_CATEGORIES = [
  'MANPOWER', 'HARDWARE', 'LICENCES', 'SUBCONTRACT', 'TRAVEL', 'OVERHEADS', 'OTHER',
] as const;

const CreateBudget = z.object({
  totalEstimatedPaise: z.coerce.number().int().nonnegative().default(0),
  notes: z.string().max(5000).nullable().optional(),
});

const CreateBudgetLine = z.object({
  category: z.enum(BUDGET_CATEGORIES),
  description: z.string().max(500).nullable().optional(),
  estimatedPaise: z.coerce.number().int().nonnegative().default(0),
  committedPaise: z.coerce.number().int().nonnegative().default(0),
  actualPaise: z.coerce.number().int().nonnegative().default(0),
});

const UpdateBudgetLine = z.object({
  category: z.enum(BUDGET_CATEGORIES).optional(),
  description: z.string().max(500).nullable().optional(),
  estimatedPaise: z.coerce.number().int().nonnegative().optional(),
  committedPaise: z.coerce.number().int().nonnegative().optional(),
  actualPaise: z.coerce.number().int().nonnegative().optional(),
});

// --- Helpers ---

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function toBigNum(v: bigint | null | undefined): number { return v != null ? Number(v) : 0; }

async function assertProjectExists(projectId: string): Promise<void> {
  const count = await prisma.project.count({ where: { id: projectId, deletedAt: null } });
  if (count === 0) throw errors.notFound('Project not found');
}

function budgetToDto(budget: Record<string, unknown>, lines: Array<Record<string, unknown>>) {
  const b = budget as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date; totalEstimatedPaise: bigint;
  };

  let totalEstimated = 0;
  let totalCommitted = 0;
  let totalActual = 0;

  const lineDtos = lines.map((l) => {
    const line = l as Record<string, unknown> & {
      createdAt: Date; updatedAt: Date;
      estimatedPaise: bigint; committedPaise: bigint; actualPaise: bigint;
    };
    const est = toBigNum(line.estimatedPaise);
    const com = toBigNum(line.committedPaise);
    const act = toBigNum(line.actualPaise);
    totalEstimated += est;
    totalCommitted += com;
    totalActual += act;
    return {
      id: line.id, budgetId: line.budgetId, category: line.category,
      description: line.description ?? null,
      estimatedPaise: est, committedPaise: com, actualPaise: act,
      createdAt: line.createdAt.toISOString(), updatedAt: line.updatedAt.toISOString(),
    };
  });

  const variance = totalEstimated - totalActual;

  return {
    id: b.id, projectId: b.projectId,
    totalEstimatedPaise: toBigNum(b.totalEstimatedPaise),
    notes: b.notes ?? null,
    lines: lineDtos,
    totals: { totalEstimated, totalCommitted, totalActual, variance },
    createdAt: b.createdAt.toISOString(), updatedAt: b.updatedAt.toISOString(),
  };
}

// --- Router ---

export const budgetRouter: ExpressRouter = Router({ mergeParams: true });
budgetRouter.use(requireAuth);

/* GET / — get budget for project */
budgetRouter.get(
  '/',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const budget = await prisma.budget.findUnique({
      where: { projectId },
      include: { lines: { orderBy: { createdAt: 'asc' } } },
    });
    if (!budget) throw errors.notFound('Budget not found for this project');

    res.json({
      data: budgetToDto(
        budget as unknown as Record<string, unknown>,
        budget.lines as unknown as Array<Record<string, unknown>>,
      ),
    });
  }),
);

/* POST / — create budget (one per project) */
budgetRouter.post(
  '/',
  validate({ params: IdParams, body: CreateBudget }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const body = req.body as z.infer<typeof CreateBudget>;
    const actor = actorId(req);
    const budgetId = newId();

    try {
      const budget = await prisma.budget.create({
        data: {
          id: budgetId, projectId,
          totalEstimatedPaise: BigInt(body.totalEstimatedPaise),
          notes: body.notes ?? null,
          createdBy: actor, updatedBy: actor,
        },
        include: { lines: true },
      });

      await recordAudit(req, {
        action: 'CREATE', resourceType: 'budget', resourceId: budgetId,
        after: { projectId },
      });
      res.status(201).json({
        data: budgetToDto(
          budget as unknown as Record<string, unknown>,
          budget.lines as unknown as Array<Record<string, unknown>>,
        ),
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === 'P2002') {
        throw errors.conflict('A budget already exists for this project');
      }
      throw err;
    }
  }),
);

/* POST /lines — add budget line */
budgetRouter.post(
  '/lines',
  validate({ params: IdParams, body: CreateBudgetLine }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const budget = await prisma.budget.findUnique({ where: { projectId } });
    if (!budget) throw errors.notFound('Budget not found for this project');

    const body = req.body as z.infer<typeof CreateBudgetLine>;
    const actor = actorId(req);
    const lineId = newId();

    const line = await prisma.budgetLine.create({
      data: {
        id: lineId, budgetId: budget.id,
        category: body.category, description: body.description ?? null,
        estimatedPaise: BigInt(body.estimatedPaise),
        committedPaise: BigInt(body.committedPaise),
        actualPaise: BigInt(body.actualPaise),
        createdBy: actor, updatedBy: actor,
      },
    });

    await recordAudit(req, {
      action: 'CREATE', resourceType: 'budget_line', resourceId: lineId,
      after: { category: body.category, budgetId: budget.id },
    });

    const l = line as unknown as Record<string, unknown> & {
      createdAt: Date; updatedAt: Date;
      estimatedPaise: bigint; committedPaise: bigint; actualPaise: bigint;
    };
    res.status(201).json({
      data: {
        id: l.id, budgetId: l.budgetId, category: l.category,
        description: l.description ?? null,
        estimatedPaise: toBigNum(l.estimatedPaise),
        committedPaise: toBigNum(l.committedPaise),
        actualPaise: toBigNum(l.actualPaise),
        createdAt: l.createdAt.toISOString(), updatedAt: l.updatedAt.toISOString(),
      },
    });
  }),
);

/* PATCH /lines/:lid — update budget line */
budgetRouter.patch(
  '/lines/:lid',
  validate({ params: LineIdParams, body: UpdateBudgetLine }),
  asyncHandler(async (req, res) => {
    const { id: projectId, lid } = req.params as unknown as z.infer<typeof LineIdParams>;
    await assertProjectExists(projectId);

    const budget = await prisma.budget.findUnique({ where: { projectId } });
    if (!budget) throw errors.notFound('Budget not found for this project');

    const existing = await prisma.budgetLine.findFirst({
      where: { id: lid, budgetId: budget.id },
    });
    if (!existing) throw errors.notFound('Budget line not found');

    const body = req.body as z.infer<typeof UpdateBudgetLine>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === 'estimatedPaise' || k === 'committedPaise' || k === 'actualPaise') {
        data[k] = BigInt(v as number);
        continue;
      }
      data[k] = v;
    }

    const updated = await prisma.budgetLine.update({ where: { id: lid }, data });

    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'budget_line', resourceId: lid,
      before: { category: existing.category },
      after: { category: updated.category },
    });

    const l = updated as unknown as Record<string, unknown> & {
      createdAt: Date; updatedAt: Date;
      estimatedPaise: bigint; committedPaise: bigint; actualPaise: bigint;
    };
    res.json({
      data: {
        id: l.id, budgetId: l.budgetId, category: l.category,
        description: l.description ?? null,
        estimatedPaise: toBigNum(l.estimatedPaise),
        committedPaise: toBigNum(l.committedPaise),
        actualPaise: toBigNum(l.actualPaise),
        createdAt: l.createdAt.toISOString(), updatedAt: l.updatedAt.toISOString(),
      },
    });
  }),
);

/* DELETE /lines/:lid — hard delete (BudgetLine has no deletedAt) */
budgetRouter.delete(
  '/lines/:lid',
  validate({ params: LineIdParams }),
  asyncHandler(async (req, res) => {
    const { id: projectId, lid } = req.params as unknown as z.infer<typeof LineIdParams>;
    await assertProjectExists(projectId);

    const budget = await prisma.budget.findUnique({ where: { projectId } });
    if (!budget) throw errors.notFound('Budget not found for this project');

    const existing = await prisma.budgetLine.findFirst({
      where: { id: lid, budgetId: budget.id },
    });
    if (!existing) throw errors.notFound('Budget line not found');

    await prisma.budgetLine.delete({ where: { id: lid } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'budget_line', resourceId: lid });
    res.status(204).end();
  }),
);
