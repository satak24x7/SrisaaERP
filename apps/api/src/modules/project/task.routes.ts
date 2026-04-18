import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { TaskStatus } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';

// --- Zod schemas ---

const IdParams = z.object({ id: z.string().min(1).max(26) });
const TaskIdParams = z.object({ id: z.string().min(1).max(26), tid: z.string().min(1).max(26) });

const TASK_STATUSES = ['BACKLOG', 'TO_DO', 'IN_PROGRESS', 'BLOCKED', 'IN_REVIEW', 'DONE'] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const KANBAN_COLUMNS = ['BACKLOG', 'TODO', 'IN_PROGRESS', 'IN_REVIEW', 'DONE'] as const;

const CreateTask = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  kanbanColumn: z.enum(KANBAN_COLUMNS).default('BACKLOG'),
  labels: z.string().max(500).nullable().optional(),
  milestoneId: z.string().min(1).max(26),
  parentId: z.string().max(26).nullable().optional(),
  ownerId: z.string().max(26).nullable().optional(),
  estimateHours: z.coerce.number().min(0).optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  sortOrder: z.coerce.number().int().default(0),
});

const UpdateTask = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  priority: z.enum(PRIORITIES).optional(),
  kanbanColumn: z.enum(KANBAN_COLUMNS).optional(),
  status: z.enum(TASK_STATUSES).optional(),
  labels: z.string().max(500).nullable().optional(),
  milestoneId: z.string().min(1).max(26).optional(),
  parentId: z.string().max(26).nullable().optional(),
  ownerId: z.string().max(26).nullable().optional(),
  estimateHours: z.coerce.number().min(0).nullable().optional(),
  startDate: z.string().nullable().optional(),
  endDate: z.string().nullable().optional(),
  sortOrder: z.coerce.number().int().optional(),
});

const ListTasksQuery = z.object({
  kanbanColumn: z.string().optional(),
  ownerId: z.string().optional(),
  milestoneId: z.string().optional(),
  parentId: z.string().optional(),
  q: z.string().optional(),
  view: z.enum(['flat', 'tree']).default('flat'),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const MoveTask = z.object({
  kanbanColumn: z.enum(KANBAN_COLUMNS),
  sortOrder: z.coerce.number().int(),
});

const LogEffort = z.object({
  logDate: z.string().min(1), // ISO date
  hours: z.coerce.number().min(0.01),
  description: z.string().max(500).nullable().optional(),
});

// --- Helpers ---

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

/** Map kanban column to TaskStatus enum */
function columnToStatus(column: string): TaskStatus {
  const map: Record<string, TaskStatus> = {
    BACKLOG: TaskStatus.BACKLOG,
    TODO: TaskStatus.TO_DO,
    IN_PROGRESS: TaskStatus.IN_PROGRESS,
    IN_REVIEW: TaskStatus.IN_REVIEW,
    DONE: TaskStatus.DONE,
  };
  return map[column] ?? TaskStatus.BACKLOG;
}

function taskToDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date;
    startDate: Date | null; endDate: Date | null;
    estimateHours: unknown; actualHours: unknown;
    owner?: { id: string; fullName: string } | null;
    milestone?: { id: string; name: string } | null;
  };
  return {
    id: r.id, projectId: r.projectId, parentId: r.parentId ?? null,
    milestoneId: r.milestoneId ?? null,
    milestoneName: r.milestone?.name ?? null,
    title: r.title, description: r.description ?? null,
    status: r.status, priority: r.priority, kanbanColumn: r.kanbanColumn,
    sortOrder: r.sortOrder, labels: r.labels ?? null,
    ownerId: r.ownerId ?? null, ownerName: r.owner?.fullName ?? null,
    estimateHours: r.estimateHours != null ? Number(r.estimateHours) : null,
    actualHours: r.actualHours != null ? Number(r.actualHours) : null,
    startDate: r.startDate ? r.startDate.toISOString().slice(0, 10) : null,
    endDate: r.endDate ? r.endDate.toISOString().slice(0, 10) : null,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

interface TaskNode {
  [key: string]: unknown;
  children: TaskNode[];
}

function buildTree(flatRows: Record<string, unknown>[]): TaskNode[] {
  const map = new Map<string, TaskNode>();
  const roots: TaskNode[] = [];

  for (const row of flatRows) {
    const dto = taskToDto(row) as unknown as TaskNode;
    dto.children = [];
    map.set(dto.id as string, dto);
  }

  for (const node of map.values()) {
    const parentId = node.parentId as string | null;
    if (parentId && map.has(parentId)) {
      map.get(parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}

async function assertProjectExists(projectId: string): Promise<void> {
  const count = await prisma.project.count({ where: { id: projectId, deletedAt: null } });
  if (count === 0) throw errors.notFound('Project not found');
}

// --- Router ---

export const taskRouter: ExpressRouter = Router({ mergeParams: true });
taskRouter.use(requireAuth);

/* GET / — list tasks for project */
taskRouter.get(
  '/',
  validate({ params: IdParams, query: ListTasksQuery }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const q = req.query as unknown as z.infer<typeof ListTasksQuery>;
    const where: Record<string, unknown> = { projectId, deletedAt: null };
    if (q.kanbanColumn) where.kanbanColumn = q.kanbanColumn;
    if (q.ownerId) where.ownerId = q.ownerId;
    if (q.milestoneId) where.milestoneId = q.milestoneId;
    if (q.parentId) where.parentId = q.parentId;
    if (q.q) where.title = { contains: q.q };

    if (q.view === 'tree') {
      // Fetch all tasks (no pagination for tree view) up to a reasonable limit
      const rows = await prisma.task.findMany({
        where,
        orderBy: { sortOrder: 'asc' },
        take: 500,
        include: {
          owner: { select: { id: true, fullName: true } },
          milestone: { select: { id: true, name: true } },
        },
      });
      const tree = buildTree(rows as unknown as Record<string, unknown>[]);
      res.json({ data: tree });
      return;
    }

    // Flat list with pagination
    const take = q.limit + 1;
    const args: Record<string, unknown> = {
      where, orderBy: { sortOrder: 'asc' }, take,
      include: {
        owner: { select: { id: true, fullName: true } },
        milestone: { select: { id: true, name: true } },
      },
    };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.task.findMany(args as Parameters<typeof prisma.task.findMany>[0]);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    res.json({
      data: page.map((r) => taskToDto(r as unknown as Record<string, unknown>)),
      meta: { next_cursor: nextCursor, limit: q.limit },
    });
  }),
);

/* POST / — create task */
taskRouter.post(
  '/',
  validate({ params: IdParams, body: CreateTask }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const body = req.body as z.infer<typeof CreateTask>;
    const actor = actorId(req);
    const taskId = newId();
    const status = columnToStatus(body.kanbanColumn);

    const row = await prisma.task.create({
      data: {
        id: taskId, projectId,
        parentId: body.parentId ?? null,
        milestoneId: body.milestoneId,
        title: body.title, description: body.description ?? null,
        status, priority: body.priority,
        kanbanColumn: body.kanbanColumn, sortOrder: body.sortOrder,
        labels: body.labels ?? null,
        ownerId: body.ownerId ?? null,
        estimateHours: body.estimateHours ?? null,
        startDate: body.startDate ? new Date(body.startDate) : null,
        endDate: body.endDate ? new Date(body.endDate) : null,
        createdBy: actor, updatedBy: actor,
      },
      include: {
        owner: { select: { id: true, fullName: true } },
        milestone: { select: { id: true, name: true } },
      },
    });

    await recordAudit(req, {
      action: 'CREATE', resourceType: 'task', resourceId: taskId,
      after: { title: body.title, projectId },
    });
    res.status(201).json({ data: taskToDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:tid — update task */
taskRouter.patch(
  '/:tid',
  validate({ params: TaskIdParams, body: UpdateTask }),
  asyncHandler(async (req, res) => {
    const { id: projectId, tid } = req.params as unknown as z.infer<typeof TaskIdParams>;

    const existing = await prisma.task.findFirst({
      where: { id: tid, projectId, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Task not found');

    const body = req.body as z.infer<typeof UpdateTask>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k === 'startDate' || k === 'endDate') { data[k] = v ? new Date(v as string) : null; continue; }
      data[k] = v;
    }

    // If kanbanColumn changed and status was NOT explicitly provided, derive status
    if (body.kanbanColumn && !body.status) {
      data.status = columnToStatus(body.kanbanColumn);
    }

    const updated = await prisma.task.update({
      where: { id: tid }, data,
      include: {
        owner: { select: { id: true, fullName: true } },
        milestone: { select: { id: true, name: true } },
      },
    });

    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'task', resourceId: tid,
      before: { title: existing.title, status: existing.status },
      after: { title: updated.title, status: updated.status },
    });
    res.json({ data: taskToDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /:tid — soft delete */
taskRouter.delete(
  '/:tid',
  validate({ params: TaskIdParams }),
  asyncHandler(async (req, res) => {
    const { id: projectId, tid } = req.params as unknown as z.infer<typeof TaskIdParams>;

    const existing = await prisma.task.findFirst({
      where: { id: tid, projectId, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Task not found');

    await prisma.task.update({ where: { id: tid }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'task', resourceId: tid });
    res.status(204).end();
  }),
);

/* POST /:tid/move — Kanban move */
taskRouter.post(
  '/:tid/move',
  validate({ params: TaskIdParams, body: MoveTask }),
  asyncHandler(async (req, res) => {
    const { id: projectId, tid } = req.params as unknown as z.infer<typeof TaskIdParams>;

    const existing = await prisma.task.findFirst({
      where: { id: tid, projectId, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Task not found');

    const body = req.body as z.infer<typeof MoveTask>;
    const newStatus = columnToStatus(body.kanbanColumn);
    const actor = actorId(req);

    const updated = await prisma.task.update({
      where: { id: tid },
      data: {
        kanbanColumn: body.kanbanColumn,
        sortOrder: body.sortOrder,
        status: newStatus,
        updatedBy: actor,
      },
      include: {
        owner: { select: { id: true, fullName: true } },
        milestone: { select: { id: true, name: true } },
      },
    });

    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'task', resourceId: tid,
      before: { kanbanColumn: existing.kanbanColumn, status: existing.status },
      after: { kanbanColumn: body.kanbanColumn, status: newStatus },
    });
    res.json({ data: taskToDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* POST /:tid/log-effort — log effort hours */
taskRouter.post(
  '/:tid/log-effort',
  validate({ params: TaskIdParams, body: LogEffort }),
  asyncHandler(async (req, res) => {
    const { id: projectId, tid } = req.params as unknown as z.infer<typeof TaskIdParams>;

    const existing = await prisma.task.findFirst({
      where: { id: tid, projectId, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Task not found');

    const body = req.body as z.infer<typeof LogEffort>;
    const actor = actorId(req);
    const logId = newId();

    // Resolve internal userId from actor (Keycloak externalId)
    const user = await prisma.user.findUnique({ where: { externalId: req.user?.id ?? '' }, select: { id: true } });
    const userId = user?.id ?? actor;

    const [log] = await prisma.$transaction([
      prisma.taskEffortLog.create({
        data: {
          id: logId, taskId: tid, userId,
          logDate: new Date(body.logDate),
          hours: body.hours,
          description: body.description ?? null,
        },
      }),
      prisma.task.update({
        where: { id: tid },
        data: {
          actualHours: {
            increment: body.hours,
          },
          updatedBy: actor,
        },
      }),
    ]);

    await recordAudit(req, {
      action: 'CREATE', resourceType: 'task_effort_log', resourceId: logId,
      after: { taskId: tid, hours: body.hours },
    });
    res.status(201).json({
      data: {
        id: log.id, taskId: log.taskId, userId: log.userId,
        logDate: log.logDate.toISOString().slice(0, 10),
        hours: Number(log.hours),
        description: log.description ?? null,
        createdAt: log.createdAt.toISOString(),
      },
    });
  }),
);

/* GET /:tid/effort-logs — list effort logs for a task */
taskRouter.get(
  '/:tid/effort-logs',
  validate({ params: TaskIdParams }),
  asyncHandler(async (req, res) => {
    const { id: projectId, tid } = req.params as unknown as z.infer<typeof TaskIdParams>;

    const task = await prisma.task.findFirst({
      where: { id: tid, projectId, deletedAt: null },
    });
    if (!task) throw errors.notFound('Task not found');

    const logs = await prisma.taskEffortLog.findMany({
      where: { taskId: tid },
      orderBy: { logDate: 'desc' },
      include: { user: { select: { id: true, fullName: true } } },
    });

    res.json({
      data: logs.map((l) => ({
        id: l.id, taskId: l.taskId,
        userId: l.userId, userName: (l as unknown as Record<string, { fullName: string }>).user?.fullName ?? null,
        logDate: l.logDate.toISOString().slice(0, 10),
        hours: Number(l.hours),
        description: l.description ?? null,
        createdAt: l.createdAt.toISOString(),
      })),
    });
  }),
);
