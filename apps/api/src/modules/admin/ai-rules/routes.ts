import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';

const SeverityEnum = z.enum(['HIGH', 'MEDIUM', 'LOW']);
const IdParams = z.object({ id: z.string().min(1).max(26) });

const CreateInput = z.object({
  title: z.string().min(1).max(255),
  ruleText: z.string().min(1),
  category: z.string().min(1).max(64),
  severity: SeverityEnum,
  enabled: z.boolean().nullable().default(true).transform((v) => v ?? true),
  sortOrder: z.coerce.number().int().min(0).optional().default(0),
});

const UpdateInput = z.object({
  title: z.string().min(1).max(255).optional(),
  ruleText: z.string().min(1).optional(),
  category: z.string().min(1).max(64).optional(),
  severity: SeverityEnum.optional(),
  enabled: z.boolean().nullable().optional().transform((v) => v ?? undefined),
  sortOrder: z.coerce.number().int().min(0).optional(),
});

const ListQuery = z.object({
  category: z.string().optional(),
  severity: SeverityEnum.optional(),
  enabled: z.enum(['true', 'false']).optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function toDto(r: Record<string, unknown>) {
  const row = r as Record<string, unknown> & { createdAt: Date; updatedAt: Date };
  return {
    id: row.id, title: row.title, ruleText: row.ruleText,
    category: row.category, severity: row.severity,
    enabled: row.enabled, sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}

export const aiRulesRouter: ExpressRouter = Router();
aiRulesRouter.use(requireAuth);

/* GET / — list with filters */
aiRulesRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.category) where.category = q.category;
    if (q.severity) where.severity = q.severity;
    if (q.enabled !== undefined) where.enabled = q.enabled === 'true';
    if (q.q) where.title = { contains: q.q };

    const take = q.limit + 1;
    const args: Record<string, unknown> = { where, orderBy: [{ sortOrder: 'asc' }, { title: 'asc' }], take };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.aiAnalysisRule.findMany(args as Parameters<typeof prisma.aiAnalysisRule.findMany>[0]);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    res.json({ data: page.map((r) => toDto(r as unknown as Record<string, unknown>)), meta: { next_cursor: nextCursor, limit: q.limit } });
  }),
);

/* GET /:id */
aiRulesRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.aiAnalysisRule.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!row) throw errors.notFound('AI rule not found');
    res.json({ data: toDto(row as unknown as Record<string, unknown>) });
  }),
);

/* POST / */
aiRulesRouter.post(
  '/',
  validate({ body: CreateInput }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateInput>;
    const actor = actorId(req);
    const row = await prisma.aiAnalysisRule.create({
      data: {
        id: newId(), title: body.title, ruleText: body.ruleText,
        category: body.category, severity: body.severity,
        enabled: body.enabled, sortOrder: body.sortOrder,
        createdBy: actor, updatedBy: actor,
      },
    });
    await recordAudit(req, { action: 'CREATE', resourceType: 'ai_analysis_rule', resourceId: row.id, after: { title: row.title } });
    res.status(201).json({ data: toDto(row as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:id */
aiRulesRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateInput }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.aiAnalysisRule.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('AI rule not found');
    const body = req.body as z.infer<typeof UpdateInput>;
    const data: Record<string, unknown> = { updatedBy: actorId(req) };
    for (const [k, v] of Object.entries(body)) { if (v !== undefined) data[k] = v; }
    const updated = await prisma.aiAnalysisRule.update({ where: { id: existing.id }, data });
    await recordAudit(req, { action: 'UPDATE', resourceType: 'ai_analysis_rule', resourceId: existing.id });
    res.json({ data: toDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* PATCH /:id/toggle — quick enable/disable */
aiRulesRouter.patch(
  '/:id/toggle',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.aiAnalysisRule.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('AI rule not found');
    const updated = await prisma.aiAnalysisRule.update({
      where: { id: existing.id },
      data: { enabled: !existing.enabled, updatedBy: actorId(req) },
    });
    await recordAudit(req, { action: 'UPDATE', resourceType: 'ai_analysis_rule', resourceId: existing.id, after: { enabled: updated.enabled } });
    res.json({ data: toDto(updated as unknown as Record<string, unknown>) });
  }),
);

/* DELETE /:id */
aiRulesRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.aiAnalysisRule.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('AI rule not found');
    await prisma.aiAnalysisRule.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'ai_analysis_rule', resourceId: existing.id, before: { title: existing.title } });
    res.status(204).end();
  }),
);
