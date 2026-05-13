import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';
import { actorId, bn, nextSequenceNo } from './shared.js';
import { submitForApproval, getApprovalStatus } from '../approval/service.js';

export const materialRequestRouter: ExpressRouter = Router();
materialRequestRouter.use(requireAuth);

// ===== Schemas =====

const IdParams = z.object({ id: z.string().min(1).max(26) });
const LineIdParams = z.object({ id: z.string().min(1).max(26), lineId: z.string().min(1).max(26) });

const optStr = (max = 255) => z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.string().max(max).optional(),
);

const LineSchema = z.object({
  itemId: optStr(26),
  description: z.string().min(1).max(500),
  uom: z.string().min(1).max(16).default('NOS'),
  qtyRequested: z.number().positive(),
  estimatedRatePaise: z.number().int().min(0).optional().nullable(),
  remarks: optStr(5000),
});

const CreateBody = z.object({
  title: z.string().min(1).max(255),
  businessUnitId: z.string().min(1).max(26),
  projectId: optStr(26),
  priority: z.enum(['NORMAL', 'URGENT', 'EMERGENCY']).default('NORMAL'),
  requiredBy: z.string(), // ISO date
  justification: optStr(5000),
  source: z.enum(['STOCK', 'PURCHASE', 'FABRICATION', 'MAINTENANCE', 'EMERGENCY']).optional(),
  lines: z.array(LineSchema).min(1),
});

const UpdateBody = z.object({
  title: optStr(255),
  projectId: optStr(26),
  priority: z.enum(['NORMAL', 'URGENT', 'EMERGENCY']).optional(),
  requiredBy: z.string().optional(),
  justification: optStr(5000),
  source: z.enum(['STOCK', 'PURCHASE', 'FABRICATION', 'MAINTENANCE', 'EMERGENCY']).optional(),
});

const ListQuery = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  projectId: z.string().optional(),
  businessUnitId: z.string().optional(),
  requesterUserId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ===== Status Machine =====

const VALID_TRANSITIONS: Record<string, Array<{ to: string; action: string }>> = {
  DRAFT: [{ to: 'SUBMITTED', action: 'submit' }],
  SUBMITTED: [{ to: 'PM_APPROVED', action: 'approve' }, { to: 'REJECTED', action: 'reject' }, { to: 'DRAFT', action: 'return' }],
  PM_APPROVED: [{ to: 'BU_HEAD_APPROVED', action: 'approve' }, { to: 'REJECTED', action: 'reject' }, { to: 'DRAFT', action: 'return' }],
  BU_HEAD_APPROVED: [{ to: 'INDENTED', action: 'indent' }],
  INDENTED: [{ to: 'PO_RAISED', action: 'po_raised' }],
  // PARTIALLY_FULFILLED and FULFILLED are set by PO/GRN flows
};

const LINE_EDITABLE_STATES = new Set(['DRAFT']);

// ===== Routes =====

/* GET / — list material requests */
materialRequestRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.projectId) where.projectId = q.projectId;
    if (q.businessUnitId) where.businessUnitId = q.businessUnitId;
    if (q.requesterUserId) where.requesterUserId = q.requesterUserId;
    if (q.q) {
      where.OR = [
        { mrNo: { contains: q.q } },
        { title: { contains: q.q } },
      ];
    }

    const take = q.limit + 1;
    const rows = await prisma.materialRequest.findMany({
      where,
      include: {
        lines: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        businessUnit: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > q.limit;
    if (hasMore) rows.pop();

    const data = rows.map((r) => ({
      ...r,
      lines: r.lines.map((l) => ({
        ...l,
        qtyRequested: Number(l.qtyRequested),
        qtyApproved: l.qtyApproved !== null ? Number(l.qtyApproved) : null,
        qtyFulfilled: Number(l.qtyFulfilled),
        estimatedRatePaise: l.estimatedRatePaise !== null ? Number(l.estimatedRatePaise) : null,
      })),
      estimatedTotalPaise: r.lines.reduce((sum, l) => {
        if (l.estimatedRatePaise !== null) {
          return sum + Number(l.estimatedRatePaise) * Number(l.qtyRequested);
        }
        return sum;
      }, 0),
    }));

    res.json({
      data,
      meta: { next_cursor: hasMore ? rows[rows.length - 1]!.id : null, limit: q.limit },
    });
  }),
);

/* GET /:id — single with lines */
materialRequestRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const mr = await prisma.materialRequest.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        lines: {
          where: { deletedAt: null },
          orderBy: { sortOrder: 'asc' },
          include: { item: { select: { id: true, sku: true, name: true, uom: true, category: true } } },
        },
        businessUnit: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    });
    if (!mr) throw errors.notFound('Material Request not found');

    // Get approval status if not DRAFT
    let approvalStatus = null;
    if (mr.status !== 'DRAFT') {
      approvalStatus = await getApprovalStatus('MATERIAL_REQUEST', mr.id);
    }

    res.json({
      data: {
        ...mr,
        lines: mr.lines.map((l) => ({
          ...l,
          qtyRequested: Number(l.qtyRequested),
          qtyApproved: l.qtyApproved !== null ? Number(l.qtyApproved) : null,
          qtyFulfilled: Number(l.qtyFulfilled),
          estimatedRatePaise: l.estimatedRatePaise !== null ? Number(l.estimatedRatePaise) : null,
        })),
        approvalStatus,
      },
    });
  }),
);

/* POST / — create with lines */
materialRequestRouter.post(
  '/',
  validate({ body: CreateBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateBody>;
    const actor = actorId(req);

    // Validate BU exists
    const bu = await prisma.businessUnit.findFirst({ where: { id: body.businessUnitId, deletedAt: null } });
    if (!bu) throw errors.notFound('Business Unit not found');

    // Validate project if provided
    if (body.projectId) {
      const proj = await prisma.project.findFirst({ where: { id: body.projectId, deletedAt: null } });
      if (!proj) throw errors.notFound('Project not found');
    }

    const mrNo = await nextSequenceNo('MR');

    const mr = await prisma.materialRequest.create({
      data: {
        id: newId(),
        mrNo,
        title: body.title,
        businessUnitId: body.businessUnitId,
        projectId: body.projectId ?? null,
        requesterUserId: actor,
        priority: body.priority,
        requiredBy: new Date(body.requiredBy),
        justification: body.justification ?? null,
        source: body.source ?? null,
        status: 'DRAFT',
        createdBy: actor,
        updatedBy: actor,
        lines: {
          create: body.lines.map((l, i) => ({
            id: newId(),
            itemId: l.itemId ?? null,
            description: l.description,
            uom: l.uom,
            qtyRequested: l.qtyRequested,
            estimatedRatePaise: l.estimatedRatePaise != null ? BigInt(l.estimatedRatePaise) : null,
            remarks: l.remarks ?? null,
            sortOrder: i,
          })),
        },
      },
      include: {
        lines: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
        businessUnit: { select: { id: true, name: true } },
        project: { select: { id: true, name: true, code: true } },
      },
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'material_request', resourceId: mr.id, after: { mrNo, title: body.title } });
    res.status(201).json({
      data: {
        ...mr,
        lines: mr.lines.map((l) => ({
          ...l,
          qtyRequested: Number(l.qtyRequested),
          qtyApproved: l.qtyApproved !== null ? Number(l.qtyApproved) : null,
          qtyFulfilled: Number(l.qtyFulfilled),
          estimatedRatePaise: l.estimatedRatePaise !== null ? Number(l.estimatedRatePaise) : null,
        })),
      },
    });
  }),
);

/* PATCH /:id — update (DRAFT only) */
materialRequestRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateBody }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.materialRequest.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Material Request not found');
    if (existing.status !== 'DRAFT') {
      throw errors.businessRule('NOT_EDITABLE', 'Material Request can only be edited in DRAFT status');
    }

    const body = req.body as z.infer<typeof UpdateBody>;
    const updated = await prisma.materialRequest.update({
      where: { id: existing.id },
      data: {
        ...(body.title !== undefined ? { title: body.title } : {}),
        ...(body.projectId !== undefined ? { projectId: body.projectId ?? null } : {}),
        ...(body.priority !== undefined ? { priority: body.priority } : {}),
        ...(body.requiredBy !== undefined ? { requiredBy: new Date(body.requiredBy) } : {}),
        ...(body.justification !== undefined ? { justification: body.justification ?? null } : {}),
        ...(body.source !== undefined ? { source: body.source ?? null } : {}),
        updatedBy: actorId(req),
      },
      include: {
        lines: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
      },
    });

    await recordAudit(req, { action: 'UPDATE', resourceType: 'material_request', resourceId: existing.id, before: { title: existing.title }, after: { title: body.title ?? existing.title } });
    res.json({
      data: {
        ...updated,
        lines: updated.lines.map((l) => ({
          ...l,
          qtyRequested: Number(l.qtyRequested),
          qtyApproved: l.qtyApproved !== null ? Number(l.qtyApproved) : null,
          qtyFulfilled: Number(l.qtyFulfilled),
          estimatedRatePaise: l.estimatedRatePaise !== null ? Number(l.estimatedRatePaise) : null,
        })),
      },
    });
  }),
);

/* DELETE /:id — soft delete (DRAFT only) */
materialRequestRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.materialRequest.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Material Request not found');
    if (existing.status !== 'DRAFT') {
      throw errors.businessRule('NOT_DELETABLE', 'Only DRAFT Material Requests can be deleted');
    }

    await prisma.materialRequest.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'material_request', resourceId: existing.id, before: { mrNo: existing.mrNo } });
    res.status(204).end();
  }),
);

// ===== Status Transitions =====

const TransitionBody = z.object({
  comment: z.string().optional(),
});

/* POST /:id/submit — DRAFT → SUBMITTED */
materialRequestRouter.post(
  '/:id/submit',
  validate({ params: IdParams, body: TransitionBody }),
  asyncHandler(async (req, res) => {
    const mr = await prisma.materialRequest.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: { lines: { where: { deletedAt: null } } },
    });
    if (!mr) throw errors.notFound('Material Request not found');
    if (mr.status !== 'DRAFT') {
      throw errors.businessRule('INVALID_TRANSITION', `Cannot submit from status: ${mr.status}`);
    }
    if (mr.lines.length === 0) {
      throw errors.businessRule('NO_LINES', 'Material Request must have at least one line item');
    }

    const actor = actorId(req);

    // Calculate estimated value for approval routing
    const estimatedValue = mr.lines.reduce((sum, l) => {
      if (l.estimatedRatePaise !== null) {
        return sum + l.estimatedRatePaise * BigInt(Math.round(Number(l.qtyRequested)));
      }
      return sum;
    }, BigInt(0));

    // Submit for approval
    const approvalResult = await submitForApproval({
      entityType: 'MATERIAL_REQUEST',
      entityId: mr.id,
      valuePaise: estimatedValue,
      requestedByUserId: actor,
      title: `MR ${mr.mrNo}: ${mr.title}`,
    });

    const updated = await prisma.materialRequest.update({
      where: { id: mr.id },
      data: { status: 'SUBMITTED', updatedBy: actor },
    });

    await recordAudit(req, {
      action: 'SUBMIT',
      resourceType: 'material_request',
      resourceId: mr.id,
      before: { status: 'DRAFT' },
      after: { status: 'SUBMITTED', approvalRequestId: approvalResult?.requestId },
    });

    res.json({ data: { ...updated, approvalStatus: approvalResult } });
  }),
);

/* POST /:id/approve — advance status based on current step */
materialRequestRouter.post(
  '/:id/approve',
  validate({ params: IdParams, body: TransitionBody }),
  asyncHandler(async (req, res) => {
    const mr = await prisma.materialRequest.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!mr) throw errors.notFound('Material Request not found');

    const allowed = VALID_TRANSITIONS[mr.status]?.find((t) => t.action === 'approve');
    if (!allowed) {
      throw errors.businessRule('INVALID_TRANSITION', `Cannot approve from status: ${mr.status}`);
    }

    const actor = actorId(req);
    const body = req.body as z.infer<typeof TransitionBody>;

    // Set qtyApproved = qtyRequested on first approval
    if (allowed.to === 'PM_APPROVED') {
      const lines = await prisma.materialRequestLine.findMany({ where: { mrId: mr.id, deletedAt: null } });
      for (const line of lines) {
        if (line.qtyApproved === null) {
          await prisma.materialRequestLine.update({
            where: { id: line.id },
            data: { qtyApproved: line.qtyRequested },
          });
        }
      }
    }

    const updated = await prisma.materialRequest.update({
      where: { id: mr.id },
      data: { status: allowed.to as import('@prisma/client').MaterialRequestStatus, updatedBy: actor },
    });

    await recordAudit(req, {
      action: 'APPROVE',
      resourceType: 'material_request',
      resourceId: mr.id,
      before: { status: mr.status },
      after: { status: allowed.to, comment: body.comment },
    });

    res.json({ data: updated });
  }),
);

/* POST /:id/reject — SUBMITTED/PM_APPROVED → REJECTED */
materialRequestRouter.post(
  '/:id/reject',
  validate({ params: IdParams, body: TransitionBody }),
  asyncHandler(async (req, res) => {
    const mr = await prisma.materialRequest.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!mr) throw errors.notFound('Material Request not found');

    const allowed = VALID_TRANSITIONS[mr.status]?.find((t) => t.action === 'reject');
    if (!allowed) {
      throw errors.businessRule('INVALID_TRANSITION', `Cannot reject from status: ${mr.status}`);
    }

    const body = req.body as z.infer<typeof TransitionBody>;
    const updated = await prisma.materialRequest.update({
      where: { id: mr.id },
      data: { status: 'REJECTED', updatedBy: actorId(req) },
    });

    await recordAudit(req, {
      action: 'REJECT',
      resourceType: 'material_request',
      resourceId: mr.id,
      before: { status: mr.status },
      after: { status: 'REJECTED', comment: body.comment },
    });

    res.json({ data: updated });
  }),
);

/* POST /:id/return — send back to DRAFT for revision */
materialRequestRouter.post(
  '/:id/return',
  validate({ params: IdParams, body: TransitionBody }),
  asyncHandler(async (req, res) => {
    const mr = await prisma.materialRequest.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!mr) throw errors.notFound('Material Request not found');

    const allowed = VALID_TRANSITIONS[mr.status]?.find((t) => t.action === 'return');
    if (!allowed) {
      throw errors.businessRule('INVALID_TRANSITION', `Cannot return from status: ${mr.status}`);
    }

    const body = req.body as z.infer<typeof TransitionBody>;
    const updated = await prisma.materialRequest.update({
      where: { id: mr.id },
      data: { status: 'DRAFT', updatedBy: actorId(req) },
    });

    await recordAudit(req, {
      action: 'RETURN',
      resourceType: 'material_request',
      resourceId: mr.id,
      before: { status: mr.status },
      after: { status: 'DRAFT', comment: body.comment },
    });

    res.json({ data: updated });
  }),
);

// ===== Line Item CRUD (DRAFT only) =====

/* POST /:id/lines — add line */
materialRequestRouter.post(
  '/:id/lines',
  validate({ params: IdParams, body: LineSchema }),
  asyncHandler(async (req, res) => {
    const mr = await prisma.materialRequest.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!mr) throw errors.notFound('Material Request not found');
    if (!LINE_EDITABLE_STATES.has(mr.status)) {
      throw errors.businessRule('NOT_EDITABLE', 'Lines can only be modified in DRAFT status');
    }

    const body = req.body as z.infer<typeof LineSchema>;

    // Get max sort order
    const maxLine = await prisma.materialRequestLine.findFirst({
      where: { mrId: mr.id, deletedAt: null },
      orderBy: { sortOrder: 'desc' },
      select: { sortOrder: true },
    });

    const line = await prisma.materialRequestLine.create({
      data: {
        id: newId(),
        mrId: mr.id,
        itemId: body.itemId ?? null,
        description: body.description,
        uom: body.uom,
        qtyRequested: body.qtyRequested,
        estimatedRatePaise: body.estimatedRatePaise != null ? BigInt(body.estimatedRatePaise) : null,
        remarks: body.remarks ?? null,
        sortOrder: (maxLine?.sortOrder ?? -1) + 1,
      },
    });

    res.status(201).json({
      data: {
        ...line,
        qtyRequested: Number(line.qtyRequested),
        qtyApproved: line.qtyApproved !== null ? Number(line.qtyApproved) : null,
        qtyFulfilled: Number(line.qtyFulfilled),
        estimatedRatePaise: line.estimatedRatePaise !== null ? Number(line.estimatedRatePaise) : null,
      },
    });
  }),
);

/* PATCH /:id/lines/:lineId — update line */
materialRequestRouter.patch(
  '/:id/lines/:lineId',
  validate({ params: LineIdParams, body: LineSchema.partial() }),
  asyncHandler(async (req, res) => {
    const mr = await prisma.materialRequest.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!mr) throw errors.notFound('Material Request not found');
    if (!LINE_EDITABLE_STATES.has(mr.status)) {
      throw errors.businessRule('NOT_EDITABLE', 'Lines can only be modified in DRAFT status');
    }

    const existing = await prisma.materialRequestLine.findFirst({
      where: { id: req.params.lineId as string, mrId: mr.id, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Line not found');

    const body = req.body as Partial<z.infer<typeof LineSchema>>;
    const line = await prisma.materialRequestLine.update({
      where: { id: existing.id },
      data: {
        ...(body.itemId !== undefined ? { itemId: body.itemId ?? null } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.uom !== undefined ? { uom: body.uom } : {}),
        ...(body.qtyRequested !== undefined ? { qtyRequested: body.qtyRequested } : {}),
        ...(body.estimatedRatePaise !== undefined ? { estimatedRatePaise: body.estimatedRatePaise != null ? BigInt(body.estimatedRatePaise) : null } : {}),
        ...(body.remarks !== undefined ? { remarks: body.remarks ?? null } : {}),
      },
    });

    res.json({
      data: {
        ...line,
        qtyRequested: Number(line.qtyRequested),
        qtyApproved: line.qtyApproved !== null ? Number(line.qtyApproved) : null,
        qtyFulfilled: Number(line.qtyFulfilled),
        estimatedRatePaise: line.estimatedRatePaise !== null ? Number(line.estimatedRatePaise) : null,
      },
    });
  }),
);

/* DELETE /:id/lines/:lineId — soft delete line */
materialRequestRouter.delete(
  '/:id/lines/:lineId',
  validate({ params: LineIdParams }),
  asyncHandler(async (req, res) => {
    const mr = await prisma.materialRequest.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!mr) throw errors.notFound('Material Request not found');
    if (!LINE_EDITABLE_STATES.has(mr.status)) {
      throw errors.businessRule('NOT_EDITABLE', 'Lines can only be modified in DRAFT status');
    }

    const existing = await prisma.materialRequestLine.findFirst({
      where: { id: req.params.lineId as string, mrId: mr.id, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Line not found');

    await prisma.materialRequestLine.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    res.status(204).end();
  }),
);
