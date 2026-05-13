import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';
import { handleApprovalAction } from './service.js';

export const approvalRouter: ExpressRouter = Router();
approvalRouter.use(requireAuth);

// ===== Schemas =====

const IdParams = z.object({ id: z.string().min(1).max(26) });

const optStr = (max = 255) => z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.string().max(max).optional(),
);

const StepSchema = z.object({
  stepOrder: z.number().int().min(1),
  stepName: z.string().min(1).max(128),
  approverRoleName: optStr(64),
  specificUserId: optStr(26),
  minValuePaise: z.number().int().min(0).optional().nullable(),
  maxValuePaise: z.number().int().min(0).optional().nullable(),
});

const CreateWorkflowBody = z.object({
  entityType: z.string().min(1).max(64),
  name: z.string().min(1).max(255),
  isActive: z.boolean().default(true),
  steps: z.array(StepSchema).min(1),
});

const UpdateWorkflowBody = z.object({
  name: optStr(255),
  isActive: z.boolean().optional(),
  steps: z.array(StepSchema).min(1).optional(),
});

const ListWorkflowQuery = z.object({
  entityType: z.string().optional(),
  isActive: z.preprocess((v) => v === 'true' ? true : v === 'false' ? false : undefined, z.boolean().optional()),
});

const ListRequestQuery = z.object({
  entityType: z.string().optional(),
  status: z.string().optional(),
  myPending: z.preprocess((v) => v === 'true', z.boolean().default(false)),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const ActionBody = z.object({
  action: z.enum(['APPROVE', 'REJECT', 'RETURN']),
  comment: z.string().optional(),
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

// ==========================================================================
// Workflow CRUD
// ==========================================================================

/* GET /approval-workflows — list */
approvalRouter.get(
  '/workflows',
  validate({ query: ListWorkflowQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof ListWorkflowQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.entityType) where.entityType = q.entityType;
    if (q.isActive !== undefined) where.isActive = q.isActive;

    const rows = await prisma.approvalWorkflow.findMany({
      where,
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    res.json({ data: rows });
  }),
);

/* GET /approval-workflows/:id — single */
approvalRouter.get(
  '/workflows/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const wf = await prisma.approvalWorkflow.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });
    if (!wf) throw errors.notFound('Workflow not found');
    res.json({ data: wf });
  }),
);

/* POST /approval-workflows — create */
approvalRouter.post(
  '/workflows',
  validate({ body: CreateWorkflowBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateWorkflowBody>;
    const actor = actorId(req);

    const wf = await prisma.approvalWorkflow.create({
      data: {
        id: newId(),
        entityType: body.entityType,
        name: body.name,
        isActive: body.isActive,
        createdBy: actor,
        updatedBy: actor,
        steps: {
          create: body.steps.map((s) => ({
            id: newId(),
            stepOrder: s.stepOrder,
            stepName: s.stepName,
            approverRoleName: s.approverRoleName ?? null,
            specificUserId: s.specificUserId ?? null,
            minValuePaise: s.minValuePaise != null ? BigInt(s.minValuePaise) : null,
            maxValuePaise: s.maxValuePaise != null ? BigInt(s.maxValuePaise) : null,
          })),
        },
      },
      include: { steps: { orderBy: { stepOrder: 'asc' } } },
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'approval_workflow', resourceId: wf.id, after: { name: wf.name, entityType: wf.entityType } });
    res.status(201).json({ data: wf });
  }),
);

/* PATCH /approval-workflows/:id — update */
approvalRouter.patch(
  '/workflows/:id',
  validate({ params: IdParams, body: UpdateWorkflowBody }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.approvalWorkflow.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Workflow not found');

    const body = req.body as z.infer<typeof UpdateWorkflowBody>;
    const actor = actorId(req);

    const wf = await prisma.$transaction(async (tx) => {
      // Update workflow header
      const updated = await tx.approvalWorkflow.update({
        where: { id: existing.id },
        data: {
          ...(body.name !== undefined ? { name: body.name } : {}),
          ...(body.isActive !== undefined ? { isActive: body.isActive } : {}),
          updatedBy: actor,
        },
      });

      // Replace steps if provided
      if (body.steps) {
        await tx.approvalWorkflowStep.deleteMany({ where: { workflowId: existing.id } });
        for (const s of body.steps) {
          await tx.approvalWorkflowStep.create({
            data: {
              id: newId(),
              workflowId: existing.id,
              stepOrder: s.stepOrder,
              stepName: s.stepName,
              approverRoleName: s.approverRoleName ?? null,
              specificUserId: s.specificUserId ?? null,
              minValuePaise: s.minValuePaise != null ? BigInt(s.minValuePaise) : null,
              maxValuePaise: s.maxValuePaise != null ? BigInt(s.maxValuePaise) : null,
            },
          });
        }
      }

      return tx.approvalWorkflow.findUnique({
        where: { id: existing.id },
        include: { steps: { orderBy: { stepOrder: 'asc' } } },
      });
    });

    await recordAudit(req, { action: 'UPDATE', resourceType: 'approval_workflow', resourceId: existing.id, before: { name: existing.name }, after: { name: body.name ?? existing.name } });
    res.json({ data: wf });
  }),
);

/* DELETE /approval-workflows/:id — soft delete */
approvalRouter.delete(
  '/workflows/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.approvalWorkflow.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Workflow not found');

    // Check for pending requests
    const pendingCount = await prisma.approvalRequest.count({
      where: { workflowId: existing.id, status: 'PENDING' },
    });
    if (pendingCount > 0) {
      throw errors.conflict(`Workflow has ${pendingCount} pending request(s). Cannot delete.`);
    }

    await prisma.approvalWorkflow.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'approval_workflow', resourceId: existing.id, before: { name: existing.name } });
    res.status(204).end();
  }),
);

// ==========================================================================
// Approval Requests
// ==========================================================================

/* GET /approval-requests — list (with myPending filter) */
approvalRouter.get(
  '/requests',
  validate({ query: ListRequestQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof ListRequestQuery>;
    const actor = actorId(req);
    const roles = req.user?.roles ?? [];

    const where: Record<string, unknown> = {};
    if (q.entityType) where.entityType = q.entityType;
    if (q.status) where.status = q.status;

    const take = q.limit + 1;
    let rows = await prisma.approvalRequest.findMany({
      where,
      include: {
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        actions: { orderBy: { occurredAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    // If myPending, filter to requests where the current step matches actor's role or id
    if (q.myPending) {
      rows = rows.filter((r) => {
        if (r.status !== 'PENDING') return false;
        const step = r.workflow.steps.find((s) => s.stepOrder === r.currentStepOrder);
        if (!step) return false;
        if (step.specificUserId === actor) return true;
        if (step.approverRoleName && roles.includes(step.approverRoleName)) return true;
        return false;
      });
    }

    const hasMore = rows.length > q.limit;
    if (hasMore) rows.pop();

    // Serialize BigInt values
    const data = rows.map((r) => ({
      ...r,
      valuePaise: Number(r.valuePaise),
      workflow: {
        ...r.workflow,
        steps: r.workflow.steps.map((s) => ({
          ...s,
          minValuePaise: s.minValuePaise !== null ? Number(s.minValuePaise) : null,
          maxValuePaise: s.maxValuePaise !== null ? Number(s.maxValuePaise) : null,
        })),
      },
    }));

    res.json({
      data,
      meta: { next_cursor: hasMore ? rows[rows.length - 1]!.id : null, limit: q.limit },
    });
  }),
);

/* GET /approval-requests/:id — single with actions */
approvalRouter.get(
  '/requests/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.approvalRequest.findUnique({
      where: { id: req.params.id as string },
      include: {
        workflow: { include: { steps: { orderBy: { stepOrder: 'asc' } } } },
        actions: { orderBy: { occurredAt: 'asc' } },
      },
    });
    if (!row) throw errors.notFound('Approval request not found');

    res.json({
      data: {
        ...row,
        valuePaise: Number(row.valuePaise),
        workflow: {
          ...row.workflow,
          steps: row.workflow.steps.map((s) => ({
            ...s,
            minValuePaise: s.minValuePaise !== null ? Number(s.minValuePaise) : null,
            maxValuePaise: s.maxValuePaise !== null ? Number(s.maxValuePaise) : null,
          })),
        },
      },
    });
  }),
);

/* POST /approval-requests/:id/act — approve / reject / return */
approvalRouter.post(
  '/requests/:id/act',
  validate({ params: IdParams, body: ActionBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof ActionBody>;
    const actor = actorId(req);
    const roles = req.user?.roles ?? [];

    const result = await handleApprovalAction(
      req.params.id as string,
      actor,
      roles,
      body.action,
      body.comment,
    );

    if (!result.success) {
      throw errors.businessRule('APPROVAL_ACTION_FAILED', result.error ?? 'Action failed');
    }

    await recordAudit(req, {
      action: body.action,
      resourceType: 'approval_request',
      resourceId: req.params.id as string,
      after: { status: result.newStatus, stepOrder: result.currentStepOrder },
    });

    res.json({ data: { status: result.newStatus, currentStepOrder: result.currentStepOrder } });
  }),
);
