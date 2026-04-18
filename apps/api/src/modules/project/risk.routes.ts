import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';

// --- Zod schemas ---

const IdParams = z.object({ id: z.string().min(1).max(26) });
const RiskIdParams = z.object({ id: z.string().min(1).max(26), rid: z.string().min(1).max(26) });
const IssueIdParams = z.object({ id: z.string().min(1).max(26), iid: z.string().min(1).max(26) });

const PROBABILITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
const IMPACT_LEVELS = ['LOW', 'MEDIUM', 'HIGH'] as const;
const RISK_STATUSES = ['OPEN', 'MITIGATED', 'CLOSED'] as const;
const SEVERITY_LEVELS = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
const ISSUE_STATUSES = ['OPEN', 'IN_PROGRESS', 'RESOLVED', 'CLOSED'] as const;

// -- Risk schemas --
const CreateRisk = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  probability: z.enum(PROBABILITY_LEVELS),
  impact: z.enum(IMPACT_LEVELS),
  mitigation: z.string().max(5000).nullable().optional(),
  status: z.enum(RISK_STATUSES).default('OPEN'),
  ownerId: z.string().max(26).nullable().optional(),
});

const UpdateRisk = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  probability: z.enum(PROBABILITY_LEVELS).optional(),
  impact: z.enum(IMPACT_LEVELS).optional(),
  mitigation: z.string().max(5000).nullable().optional(),
  status: z.enum(RISK_STATUSES).optional(),
  ownerId: z.string().max(26).nullable().optional(),
});

// -- Issue schemas --
const CreateIssue = z.object({
  title: z.string().min(1).max(255),
  description: z.string().max(5000).nullable().optional(),
  severity: z.enum(SEVERITY_LEVELS),
  resolution: z.string().max(5000).nullable().optional(),
  status: z.enum(ISSUE_STATUSES).default('OPEN'),
  ownerId: z.string().max(26).nullable().optional(),
});

const UpdateIssue = z.object({
  title: z.string().min(1).max(255).optional(),
  description: z.string().max(5000).nullable().optional(),
  severity: z.enum(SEVERITY_LEVELS).optional(),
  resolution: z.string().max(5000).nullable().optional(),
  status: z.enum(ISSUE_STATUSES).optional(),
  ownerId: z.string().max(26).nullable().optional(),
});

// --- Helpers ---

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function riskToDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date;
    owner?: { id: string; fullName: string } | null;
  };
  return {
    id: r.id, projectId: r.projectId, title: r.title,
    description: r.description ?? null,
    probability: r.probability, impact: r.impact,
    mitigation: r.mitigation ?? null,
    status: r.status,
    ownerId: r.ownerId ?? null, ownerName: r.owner?.fullName ?? null,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

function issueToDto(row: Record<string, unknown>) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date;
    owner?: { id: string; fullName: string } | null;
  };
  return {
    id: r.id, projectId: r.projectId, title: r.title,
    description: r.description ?? null,
    severity: r.severity, resolution: r.resolution ?? null,
    status: r.status,
    ownerId: r.ownerId ?? null, ownerName: r.owner?.fullName ?? null,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

async function assertProjectExists(projectId: string): Promise<void> {
  const count = await prisma.project.count({ where: { id: projectId, deletedAt: null } });
  if (count === 0) throw errors.notFound('Project not found');
}

// --- Router ---

export const riskRouter: ExpressRouter = Router({ mergeParams: true });
riskRouter.use(requireAuth);

// ===========================
// RISKS
// ===========================

/* GET /risks — list risks */
riskRouter.get(
  '/risks',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const rows = await prisma.risk.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { id: true, fullName: true } } },
    });

    res.json({
      data: rows.map((r) => riskToDto(r as unknown as Record<string, unknown>)),
    });
  }),
);

/* POST /risks — create risk */
riskRouter.post(
  '/risks',
  validate({ params: IdParams, body: CreateRisk }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const body = req.body as z.infer<typeof CreateRisk>;
    const actor = actorId(req);
    const riskId = newId();

    const row = await prisma.risk.create({
      data: {
        id: riskId, projectId,
        title: body.title, description: body.description ?? null,
        probability: body.probability, impact: body.impact,
        mitigation: body.mitigation ?? null,
        status: body.status, ownerId: body.ownerId ?? null,
        createdBy: actor, updatedBy: actor,
      },
      include: { owner: { select: { id: true, fullName: true } } },
    });

    await recordAudit(req, {
      action: 'CREATE', resourceType: 'risk', resourceId: riskId,
      after: { title: body.title, probability: body.probability, impact: body.impact },
    });
    res.status(201).json({ data: riskToDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /risks/:rid — update risk */
riskRouter.patch(
  '/risks/:rid',
  validate({ params: RiskIdParams, body: UpdateRisk }),
  asyncHandler(async (req, res) => {
    const { id: projectId, rid } = req.params as unknown as z.infer<typeof RiskIdParams>;

    const existing = await prisma.risk.findFirst({
      where: { id: rid, projectId, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Risk not found');

    const body = req.body as z.infer<typeof UpdateRisk>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      data[k] = v;
    }

    const updated = await prisma.risk.update({
      where: { id: rid }, data,
      include: { owner: { select: { id: true, fullName: true } } },
    });

    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'risk', resourceId: rid,
      before: { status: existing.status },
      after: { status: updated.status },
    });
    res.json({ data: riskToDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /risks/:rid — soft delete */
riskRouter.delete(
  '/risks/:rid',
  validate({ params: RiskIdParams }),
  asyncHandler(async (req, res) => {
    const { id: projectId, rid } = req.params as unknown as z.infer<typeof RiskIdParams>;

    const existing = await prisma.risk.findFirst({
      where: { id: rid, projectId, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Risk not found');

    await prisma.risk.update({ where: { id: rid }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'risk', resourceId: rid });
    res.status(204).end();
  }),
);

// ===========================
// ISSUES
// ===========================

/* GET /issues — list issues */
riskRouter.get(
  '/issues',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const rows = await prisma.issue.findMany({
      where: { projectId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      include: { owner: { select: { id: true, fullName: true } } },
    });

    res.json({
      data: rows.map((r) => issueToDto(r as unknown as Record<string, unknown>)),
    });
  }),
);

/* POST /issues — create issue */
riskRouter.post(
  '/issues',
  validate({ params: IdParams, body: CreateIssue }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;
    await assertProjectExists(projectId);

    const body = req.body as z.infer<typeof CreateIssue>;
    const actor = actorId(req);
    const issueId = newId();

    const row = await prisma.issue.create({
      data: {
        id: issueId, projectId,
        title: body.title, description: body.description ?? null,
        severity: body.severity, resolution: body.resolution ?? null,
        status: body.status, ownerId: body.ownerId ?? null,
        createdBy: actor, updatedBy: actor,
      },
      include: { owner: { select: { id: true, fullName: true } } },
    });

    await recordAudit(req, {
      action: 'CREATE', resourceType: 'issue', resourceId: issueId,
      after: { title: body.title, severity: body.severity },
    });
    res.status(201).json({ data: issueToDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /issues/:iid — update issue */
riskRouter.patch(
  '/issues/:iid',
  validate({ params: IssueIdParams, body: UpdateIssue }),
  asyncHandler(async (req, res) => {
    const { id: projectId, iid } = req.params as unknown as z.infer<typeof IssueIdParams>;

    const existing = await prisma.issue.findFirst({
      where: { id: iid, projectId, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Issue not found');

    const body = req.body as z.infer<typeof UpdateIssue>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      data[k] = v;
    }

    const updated = await prisma.issue.update({
      where: { id: iid }, data,
      include: { owner: { select: { id: true, fullName: true } } },
    });

    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'issue', resourceId: iid,
      before: { status: existing.status },
      after: { status: updated.status },
    });
    res.json({ data: issueToDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /issues/:iid — soft delete */
riskRouter.delete(
  '/issues/:iid',
  validate({ params: IssueIdParams }),
  asyncHandler(async (req, res) => {
    const { id: projectId, iid } = req.params as unknown as z.infer<typeof IssueIdParams>;

    const existing = await prisma.issue.findFirst({
      where: { id: iid, projectId, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Issue not found');

    await prisma.issue.update({ where: { id: iid }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'issue', resourceId: iid });
    res.status(204).end();
  }),
);
