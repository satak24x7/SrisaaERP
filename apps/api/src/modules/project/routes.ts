import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';
import { milestoneRouter } from './milestone.routes.js';
import { taskRouter } from './task.routes.js';
import { budgetRouter } from './budget.routes.js';
import { inflowRouter } from './inflow.routes.js';
import { cashFlowRouter } from './cashflow.routes.js';
import { pbgRouter } from './pbg.routes.js';
import { riskRouter } from './risk.routes.js';
import { healthRouter as projectHealthRouter } from './health.routes.js';

// --- Zod schemas ---

const IdParams = z.object({ id: z.string().min(1).max(26) });

const PROJECT_STATUSES = ['DRAFT', 'ACTIVE', 'ON_HOLD', 'CLOSED'] as const;

const CreateProject = z.object({
  projectCode: z.string().max(32).nullable().optional(),
  businessUnitId: z.string().min(1).max(26),
  opportunityId: z.string().max(26).nullable().optional(),
  name: z.string().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  clientName: z.string().min(1).max(255),
  workOrderRef: z.string().max(128).nullable().optional(),
  contractValuePaise: z.coerce.number().int().nonnegative(),
  startDate: z.string().min(1), // ISO date
  endDate: z.string().min(1),
  location: z.string().max(255).nullable().optional(),
  category: z.string().max(64).nullable().optional(),
  sponsorUserId: z.string().max(26).nullable().optional(),
  projectManagerId: z.string().min(1).max(26),
  status: z.enum(PROJECT_STATUSES).default('DRAFT'),
});

const UpdateProject = z.object({
  projectCode: z.string().max(32).nullable().optional(),
  businessUnitId: z.string().min(1).max(26).optional(),
  opportunityId: z.string().max(26).nullable().optional(),
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  clientName: z.string().min(1).max(255).optional(),
  workOrderRef: z.string().max(128).nullable().optional(),
  contractValuePaise: z.coerce.number().int().nonnegative().optional(),
  startDate: z.string().min(1).optional(),
  endDate: z.string().min(1).optional(),
  location: z.string().max(255).nullable().optional(),
  category: z.string().max(64).nullable().optional(),
  sponsorUserId: z.string().max(26).nullable().optional(),
  projectManagerId: z.string().min(1).max(26).optional(),
  status: z.enum(PROJECT_STATUSES).optional(),
});

const ListProjectsQuery = z.object({
  buId: z.string().optional(),
  status: z.string().optional(),
  projectManagerId: z.string().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// --- Helpers ---

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function projectToDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date; startDate: Date; endDate: Date;
    contractValuePaise: bigint;
  };
  return {
    id: r.id, projectCode: r.projectCode ?? null,
    businessUnitId: r.businessUnitId, opportunityId: r.opportunityId ?? null,
    name: r.name, description: r.description ?? null,
    clientName: r.clientName, workOrderRef: r.workOrderRef ?? null,
    contractValuePaise: Number(r.contractValuePaise),
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    location: r.location ?? null, category: r.category ?? null,
    sponsorUserId: r.sponsorUserId ?? null,
    projectManagerId: r.projectManagerId, status: r.status,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

function projectListDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date; startDate: Date; endDate: Date;
    contractValuePaise: bigint;
    businessUnit?: { id: string; name: string };
  };
  return {
    id: r.id, projectCode: r.projectCode ?? null,
    name: r.name, clientName: r.clientName,
    contractValuePaise: Number(r.contractValuePaise),
    startDate: r.startDate.toISOString().slice(0, 10),
    endDate: r.endDate.toISOString().slice(0, 10),
    status: r.status,
    businessUnitId: r.businessUnitId,
    businessUnitName: r.businessUnit?.name ?? null,
    projectManagerId: r.projectManagerId,
    projectManagerName: null as string | null,
    createdAt: r.createdAt.toISOString(),
  };
}

// --- Router ---

export const projectRouter: ExpressRouter = Router();
projectRouter.use(requireAuth);

/* GET / — list projects */
projectRouter.get(
  '/',
  validate({ query: ListProjectsQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListProjectsQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.buId) where.businessUnitId = q.buId;
    if (q.status) where.status = q.status;
    if (q.projectManagerId) where.projectManagerId = q.projectManagerId;
    if (q.q) where.name = { contains: q.q };

    const take = q.limit + 1;
    const args: Record<string, unknown> = {
      where, orderBy: { createdAt: 'desc' }, take,
      include: {
        businessUnit: { select: { id: true, name: true } },
      },
    };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.project.findMany(args as Parameters<typeof prisma.project.findMany>[0]);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    // Resolve PM names (projectManagerId has no Prisma relation)
    const pmIds = [...new Set(page.map((r) => r.projectManagerId))];
    const pmUsers = pmIds.length > 0
      ? await prisma.user.findMany({ where: { id: { in: pmIds } }, select: { id: true, fullName: true } })
      : [];
    const pmMap = new Map(pmUsers.map((u) => [u.id, u.fullName]));

    res.json({
      data: page.map((r) => {
        const dto = projectListDto(r as unknown as Record<string, unknown>);
        return { ...dto, projectManagerName: pmMap.get(r.projectManagerId) ?? null };
      }),
      meta: { next_cursor: nextCursor, limit: q.limit },
    });
  }),
);

/* GET /:id — single project with includes */
projectRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.project.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        businessUnit: { select: { id: true, name: true } },
        opportunity: { select: { id: true, title: true } },
      },
    });
    if (!row) throw errors.notFound('Project not found');

    // Fetch summary counts in parallel
    const [milestoneStats, taskStats, budget, pmUser] = await Promise.all([
      // Milestones: count + status summary
      prisma.milestone.groupBy({
        by: ['status'],
        where: { projectId: row.id, deletedAt: null },
        _count: { id: true },
      }),
      // Tasks: count by kanbanColumn
      prisma.task.groupBy({
        by: ['kanbanColumn'],
        where: { projectId: row.id, deletedAt: null },
        _count: { id: true },
      }),
      // Budget summary
      prisma.budget.findUnique({
        where: { projectId: row.id },
        include: { lines: { select: { estimatedPaise: true, committedPaise: true, actualPaise: true } } },
      }),
      // Project manager name
      prisma.user.findUnique({
        where: { id: row.projectManagerId },
        select: { id: true, fullName: true },
      }),
    ]);

    const milestoneTotal = milestoneStats.reduce((s, g) => s + g._count.id, 0);
    const milestoneSummary: Record<string, number> = {};
    for (const g of milestoneStats) { milestoneSummary[g.status] = g._count.id; }

    const taskTotal = taskStats.reduce((s, g) => s + g._count.id, 0);
    const taskByColumn: Record<string, number> = {};
    for (const g of taskStats) { taskByColumn[g.kanbanColumn] = g._count.id; }

    let budgetSummary: { totalEstimated: number; totalCommitted: number; totalActual: number } | null = null;
    if (budget) {
      let est = 0, com = 0, act = 0;
      for (const l of budget.lines) {
        est += Number(l.estimatedPaise);
        com += Number(l.committedPaise);
        act += Number(l.actualPaise);
      }
      budgetSummary = { totalEstimated: est, totalCommitted: com, totalActual: act };
    }

    const dto = projectToDto(row as unknown as Record<string, unknown>);
    res.json({
      data: {
        ...dto,
        businessUnitName: (row as unknown as Record<string, { name: string }>).businessUnit?.name ?? null,
        opportunityTitle: (row as unknown as Record<string, { title: string }>).opportunity?.title ?? null,
        projectManagerName: pmUser?.fullName ?? null,
        milestones: { total: milestoneTotal, byStatus: milestoneSummary },
        tasks: { total: taskTotal, byColumn: taskByColumn },
        budget: budgetSummary,
      },
    });
  }),
);

/* POST / — create project */
projectRouter.post(
  '/',
  validate({ body: CreateProject }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateProject>;
    const actor = actorId(req);
    const projectId = newId();

    // Validate BU exists
    const buCount = await prisma.businessUnit.count({ where: { id: body.businessUnitId, deletedAt: null } });
    if (buCount === 0) throw errors.notFound('Business Unit not found');

    // Validate PM exists
    const pmCount = await prisma.user.count({ where: { id: body.projectManagerId, deletedAt: null } });
    if (pmCount === 0) throw errors.notFound('Project Manager (user) not found');

    const row = await prisma.project.create({
      data: {
        id: projectId,
        projectCode: body.projectCode ?? null,
        businessUnitId: body.businessUnitId,
        opportunityId: body.opportunityId ?? null,
        name: body.name, description: body.description ?? null,
        clientName: body.clientName, workOrderRef: body.workOrderRef ?? null,
        contractValuePaise: BigInt(body.contractValuePaise),
        startDate: new Date(body.startDate), endDate: new Date(body.endDate),
        location: body.location ?? null, category: body.category ?? null,
        sponsorUserId: body.sponsorUserId ?? null,
        projectManagerId: body.projectManagerId,
        status: body.status,
        createdBy: actor, updatedBy: actor,
      },
    });

    await recordAudit(req, {
      action: 'CREATE', resourceType: 'project', resourceId: projectId,
      after: { name: body.name, businessUnitId: body.businessUnitId },
    });
    res.status(201).json({ data: projectToDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:id — update project */
projectRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateProject }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.project.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Project not found');

    const body = req.body as z.infer<typeof UpdateProject>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === 'startDate' || k === 'endDate') { data[k] = new Date(v as string); continue; }
      if (k === 'contractValuePaise') { data[k] = BigInt(v as number); continue; }
      data[k] = v;
    }

    const updated = await prisma.project.update({ where: { id: existing.id }, data });

    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'project', resourceId: existing.id,
      before: { name: existing.name, status: existing.status },
      after: { name: updated.name, status: updated.status },
    });
    res.json({ data: projectToDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /:id — soft delete (guard: check tasks, milestones) */
projectRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.project.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Project not found');

    // Refs guard: check for active tasks and milestones
    const [taskCount, milestoneCount] = await Promise.all([
      prisma.task.count({ where: { projectId: existing.id, deletedAt: null } }),
      prisma.milestone.count({ where: { projectId: existing.id, deletedAt: null } }),
    ]);

    if (taskCount > 0) {
      throw errors.businessRule(
        'HAS_TASKS',
        `Cannot delete project with ${taskCount} active task(s). Delete or archive them first.`,
      );
    }
    if (milestoneCount > 0) {
      throw errors.businessRule(
        'HAS_MILESTONES',
        `Cannot delete project with ${milestoneCount} active milestone(s). Delete or archive them first.`,
      );
    }

    await prisma.project.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'project', resourceId: existing.id });
    res.status(204).end();
  }),
);

// --- Mount sub-routers ---

projectRouter.use('/:id/milestones', milestoneRouter);
projectRouter.use('/:id/tasks', taskRouter);
projectRouter.use('/:id/budget', budgetRouter);
projectRouter.use('/:id/inflows', inflowRouter);
projectRouter.use('/:id/cash-flows', cashFlowRouter);
projectRouter.use('/:id/pbg', pbgRouter);
projectRouter.use('/:id/risk-issues', riskRouter);
projectRouter.use('/:id/health', projectHealthRouter);
