import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { prisma } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';

// --- Zod schemas ---

const IdParams = z.object({ id: z.string().min(1).max(26) });

// --- Helpers ---

type RAG = 'GREEN' | 'AMBER' | 'RED';

function worstRag(...rags: RAG[]): RAG {
  if (rags.includes('RED')) return 'RED';
  if (rags.includes('AMBER')) return 'AMBER';
  return 'GREEN';
}

function toBigNum(v: bigint | null | undefined): number { return v != null ? Number(v) : 0; }

// --- Router ---

export const healthRouter: ExpressRouter = Router({ mergeParams: true });
healthRouter.use(requireAuth);

/* GET / — project health dashboard */
healthRouter.get(
  '/',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const projectId = req.params.id as string;

    const project = await prisma.project.findFirst({
      where: { id: projectId, deletedAt: null },
    });
    if (!project) throw errors.notFound('Project not found');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // --- Schedule (milestones) ---
    const milestones = await prisma.milestone.findMany({
      where: { projectId, deletedAt: null },
      select: { status: true, plannedDate: true, actualDate: true },
    });

    const totalMilestones = milestones.length;
    const completedMilestones = milestones.filter(
      (m) => m.status === 'COMPLETED' || m.status === 'INVOICED',
    ).length;
    const overdueMilestones = milestones.filter(
      (m) => m.status !== 'COMPLETED' && m.status !== 'INVOICED' && m.plannedDate < today,
    ).length;

    let scheduleRag: RAG = 'GREEN';
    if (totalMilestones > 0) {
      const overduePct = (overdueMilestones / totalMilestones) * 100;
      if (overduePct > 20) scheduleRag = 'RED';
      else if (overduePct > 0) scheduleRag = 'AMBER';
    }

    // --- Budget ---
    const budget = await prisma.budget.findUnique({
      where: { projectId },
      include: { lines: true },
    });

    let totalEstimated = 0;
    let totalCommitted = 0;
    let totalActual = 0;
    if (budget) {
      for (const line of budget.lines) {
        totalEstimated += toBigNum(line.estimatedPaise);
        totalCommitted += toBigNum(line.committedPaise);
        totalActual += toBigNum(line.actualPaise);
      }
    }

    const utilization = totalEstimated > 0
      ? Math.round((totalActual / totalEstimated) * 100)
      : 0;

    let budgetRag: RAG = 'GREEN';
    if (utilization > 100) budgetRag = 'RED';
    else if (utilization >= 80) budgetRag = 'AMBER';

    // --- Scope (tasks) ---
    const tasks = await prisma.task.findMany({
      where: { projectId, deletedAt: null },
      select: { status: true },
    });

    const totalTasks = tasks.length;
    const completedTasks = tasks.filter((t) => t.status === 'DONE').length;
    const inProgressTasks = tasks.filter((t) => t.status === 'IN_PROGRESS').length;
    const blockedTasks = tasks.filter((t) => t.status === 'BLOCKED').length;
    const completion = totalTasks > 0
      ? Math.round((completedTasks / totalTasks) * 100)
      : 0;

    let scopeRag: RAG = 'GREEN';
    if (totalTasks > 0) {
      const blockedPct = (blockedTasks / totalTasks) * 100;
      if (blockedPct > 20) scopeRag = 'RED';
      else if (blockedPct > 10) scopeRag = 'AMBER';
    }

    const overallRag = worstRag(scheduleRag, budgetRag, scopeRag);

    res.json({
      data: {
        projectId,
        schedule: {
          total: totalMilestones,
          completed: completedMilestones,
          overdue: overdueMilestones,
          rag: scheduleRag,
        },
        budget: {
          totalEstimated,
          totalActual,
          totalCommitted,
          utilization,
          rag: budgetRag,
        },
        scope: {
          totalTasks,
          completed: completedTasks,
          inProgress: inProgressTasks,
          blocked: blockedTasks,
          completion,
          rag: scopeRag,
        },
        overall: overallRag,
      },
    });
  }),
);
