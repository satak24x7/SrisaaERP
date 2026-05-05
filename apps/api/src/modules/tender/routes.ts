import { Router } from 'express';
import path from 'path';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { prisma } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';
import { analyzeRfp } from '../../lib/gemini.js';
import { logger } from '../../lib/logger.js';
import { tenderDocumentRouter } from './document.routes.js';

const UPLOAD_DIR = path.resolve(process.cwd(), '../../uploads/tender-docs');

const ListQuery = z.object({
  tenderStatus: z.string().optional(),
  tenderType: z.string().optional(),
  buId: z.string().optional(),
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

export const tenderListRouter = Router();
tenderListRouter.use(requireAuth);

/* GET /tenders — list all tenders with opportunity info */
tenderListRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListQuery>;

    const where: Record<string, unknown> = { deletedAt: null };
    if (q.tenderStatus) where.tenderStatus = q.tenderStatus;
    if (q.tenderType) where.tenderType = q.tenderType;
    if (q.buId) where.opportunity = { businessUnitId: q.buId, deletedAt: null };
    if (q.q) {
      where.OR = [
        { tenderNumber: { contains: q.q } },
        { tenderTitle: { contains: q.q } },
        { publishingAuthority: { contains: q.q } },
      ];
    }

    const take = q.limit + 1;
    const args: Record<string, unknown> = {
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        opportunity: {
          select: {
            id: true,
            title: true,
            stage: true,
            closedStatus: true,
            businessUnit: { select: { name: true } },
            owner: { select: { fullName: true } },
            contractValuePaise: true,
          },
        },
      },
    };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.tender.findMany(args as Parameters<typeof prisma.tender.findMany>[0]);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;

    const data = page.map((t) => {
      const opp = t.opportunity as unknown as {
        id: string; title: string; stage: string; closedStatus: string | null;
        businessUnit: { name: string }; owner: { fullName: string } | null;
        contractValuePaise: bigint | null;
      };
      return {
        id: t.id,
        tenderNumber: t.tenderNumber,
        tenderTitle: t.tenderTitle,
        tenderType: t.tenderType,
        tenderCategory: t.tenderCategory,
        tenderStatus: t.tenderStatus,
        portalName: t.portalName,
        publishDate: t.publishDate,
        submissionDeadlineOnline: t.submissionDeadlineOnline,
        estimatedValuePaise: t.estimatedValuePaise != null ? Number(t.estimatedValuePaise) : null,
        emdAmountPaise: t.emdAmountPaise != null ? Number(t.emdAmountPaise) : null,
        publishingAuthority: t.publishingAuthority,
        projectLocation: t.projectLocation,
        createdAt: t.createdAt,
        // Opportunity info
        opportunityId: opp.id,
        opportunityTitle: opp.title,
        opportunityStage: opp.stage,
        opportunityClosedStatus: opp.closedStatus,
        businessUnitName: opp.businessUnit.name,
        ownerName: opp.owner?.fullName ?? null,
        contractValuePaise: opp.contractValuePaise != null ? Number(opp.contractValuePaise) : null,
      };
    });

    res.json({
      data,
      meta: { next_cursor: hasMore ? page[page.length - 1].id : null, limit: q.limit },
    });
  }),
);

/* GET /tenders/:id — single tender with full details + opportunity info */
const IdParams = z.object({ id: z.string().min(1).max(26) });

tenderListRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const tender = await prisma.tender.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        opportunity: {
          select: {
            id: true, title: true, stage: true, closedStatus: true, entryPath: true,
            contractValuePaise: true, probabilityPct: true, submissionDue: true,
            businessUnitId: true,
            businessUnit: { select: { name: true } },
            account: { select: { id: true, name: true } },
            endClient: { select: { id: true, name: true } },
            owner: { select: { id: true, fullName: true } },
          },
        },
      },
    });

    if (!tender) {
      const { errors: errFactory } = await import('../../middleware/error-handler.js');
      throw errFactory.notFound('Tender not found');
    }

    // Convert BigInts to Numbers
    const bigIntFields = ['estimatedValuePaise', 'emdAmountPaise', 'tenderFeePaise',
      'documentCostPaise', 'turnoverRequirementPaise', 'similarWorkValuePaise'] as const;
    const dto: Record<string, unknown> = { ...tender };
    for (const f of bigIntFields) {
      if (dto[f] != null) dto[f] = Number(dto[f] as bigint);
    }

    const opp = tender.opportunity as unknown as Record<string, unknown> & {
      contractValuePaise?: bigint | null;
    };
    dto.opportunity = {
      ...opp,
      contractValuePaise: opp.contractValuePaise != null ? Number(opp.contractValuePaise) : null,
    };

    res.json({ data: dto });
  }),
);

/* POST /:tenderId/analyze — analyze RFP documents with Gemini AI */
tenderListRouter.post(
  '/:tenderId/analyze',
  requireAuth,
  asyncHandler(async (req, res) => {
    const tenderId = req.params.tenderId as string;
    const tender = await prisma.tender.findFirst({ where: { id: tenderId, deletedAt: null } });
    if (!tender) throw errors.notFound('Tender not found');

    // Get RFP-type documents (or all if no RFP docs)
    let docs = await prisma.tenderDocument.findMany({
      where: { tenderId, deletedAt: null, docType: 'RFP' },
      orderBy: { sortOrder: 'asc' },
    });

    // If no RFP docs, try all documents
    if (docs.length === 0) {
      docs = await prisma.tenderDocument.findMany({
        where: { tenderId, deletedAt: null },
        orderBy: { sortOrder: 'asc' },
        take: 5,
      });
    }

    if (docs.length === 0) {
      throw errors.businessRule('NO_DOCUMENTS', 'No documents found to analyze. Upload RFP documents first.');
    }

    // Build file references for Gemini (supports GDrive and local)
    const filePaths = docs.map((d) => ({
      storagePath: d.storagePath,
      mimeType: d.mimeType,
    }));

    let analysis;
    try {
      analysis = await analyzeRfp(filePaths);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.error({ tenderId, fileCount: filePaths.length, storagePaths: filePaths.map((f) => f.storagePath), err: msg }, 'RFP analysis failed');
      throw errors.businessRule('ANALYSIS_FAILED', msg);
    }

    // Store the analysis in the tender
    await prisma.tender.update({
      where: { id: tenderId },
      data: {
        aiAnalysis: analysis as unknown as Prisma.InputJsonValue,
        aiAnalyzedAt: new Date(),
      },
    });

    res.json({ data: analysis });
  }),
);

// ===== Bid Evaluation =====

const TenderIdParam = z.object({ tenderId: z.string().min(1).max(26) });

const BidEvaluationBody = z.object({
  pqAssessment: z.array(z.object({
    criteriaId: z.string(),
    meetsRequirement: z.boolean().nullable(),
    remarks: z.string().default(''),
    evidence: z.string().default(''),
  })).optional(),
  technicalScoring: z.array(z.object({
    sectionId: z.string(),
    expectedScore: z.number().min(0).nullable(),
    remarks: z.string().default(''),
  })).optional(),
  goNoGoDecision: z.enum(['GO', 'NO_GO', 'CONDITIONAL']).nullable().optional(),
  decisionRemarks: z.string().optional(),
});

/* GET /:tenderId/bid-evaluation */
tenderListRouter.get(
  '/:tenderId/bid-evaluation',
  requireAuth,
  validate({ params: TenderIdParam }),
  asyncHandler(async (req, res) => {
    const tender = await prisma.tender.findFirst({
      where: { id: req.params.tenderId as string, deletedAt: null },
      select: { aiAnalysis: true, aiAnalyzedAt: true, bidEvaluation: true },
    });
    if (!tender) throw errors.notFound('Tender not found');

    const ai = tender.aiAnalysis as Record<string, unknown> | null;

    res.json({
      data: {
        aiPreQualification: (ai?.preQualification as unknown[]) ?? [],
        aiTechnicalEvaluation: (ai?.technicalEvaluation as unknown) ?? null,
        aiRecommendation: (ai?.recommendation as string) ?? null,
        aiAnalyzedAt: tender.aiAnalyzedAt?.toISOString() ?? null,
        bidEvaluation: tender.bidEvaluation ?? null,
      },
    });
  }),
);

/* PUT /:tenderId/bid-evaluation */
tenderListRouter.put(
  '/:tenderId/bid-evaluation',
  requireAuth,
  validate({ params: TenderIdParam, body: BidEvaluationBody }),
  asyncHandler(async (req, res) => {
    const tender = await prisma.tender.findFirst({
      where: { id: req.params.tenderId as string, deletedAt: null },
    });
    if (!tender) throw errors.notFound('Tender not found');

    const body = req.body as z.infer<typeof BidEvaluationBody>;
    const actor = req.user?.id ?? 'usr_anonymous';
    const actorTrimmed = actor.length <= 26 ? actor : actor.slice(0, 26);

    const evaluation = {
      pqAssessment: body.pqAssessment ?? [],
      technicalScoring: body.technicalScoring ?? [],
      goNoGoDecision: body.goNoGoDecision ?? null,
      decisionRemarks: body.decisionRemarks ?? '',
      decidedBy: body.goNoGoDecision ? actorTrimmed : null,
      decidedAt: body.goNoGoDecision ? new Date().toISOString() : null,
    };

    await prisma.tender.update({
      where: { id: tender.id },
      data: {
        bidEvaluation: evaluation as unknown as Prisma.InputJsonValue,
        updatedBy: actorTrimmed,
      },
    });

    res.json({ data: evaluation });
  }),
);

/* GET /:tenderId/cash-flow-plan — extracted BoQ, payment terms, milestones for cash flow planning */
tenderListRouter.get(
  '/:tenderId/cash-flow-plan',
  requireAuth,
  validate({ params: TenderIdParam }),
  asyncHandler(async (req, res) => {
    const tender = await prisma.tender.findFirst({
      where: { id: req.params.tenderId as string, deletedAt: null },
      select: { aiAnalysis: true, aiAnalyzedAt: true, cashFlowPlan: true, completionPeriodDays: true, estimatedValuePaise: true },
    });
    if (!tender) throw errors.notFound('Tender not found');

    const ai = tender.aiAnalysis as Record<string, unknown> | null;

    res.json({
      data: {
        boqItems: (ai?.boqItems as unknown[]) ?? [],
        paymentTerms: (ai?.paymentTerms as unknown) ?? null,
        milestones: (ai?.milestones as unknown[]) ?? [],
        completionPeriodDays: tender.completionPeriodDays,
        estimatedValuePaise: tender.estimatedValuePaise != null ? Number(tender.estimatedValuePaise) : null,
        aiAnalyzedAt: tender.aiAnalyzedAt?.toISOString() ?? null,
        cashFlowPlan: tender.cashFlowPlan ?? null,
      },
    });
  }),
);

/* PUT /:tenderId/cash-flow-plan — save user-edited cash flow plan */
const CashFlowPlanBody = z.object({
  boqItems: z.array(z.object({
    id: z.string(),
    description: z.string(),
    unit: z.string().nullable().optional(),
    quantity: z.number().nullable().optional(),
    unitRate: z.number().nullable().optional(),
    total: z.number().nullable().optional(),
    estimatedAmountText: z.string().nullable().optional(),
  })).optional(),
  paymentTerms: z.object({
    summary: z.string().optional(),
    advancePct: z.number().nullable().optional(),
    retentionPct: z.number().nullable().optional(),
    retentionRelease: z.string().nullable().optional(),
    defectLiabilityPeriodMonths: z.number().nullable().optional(),
    paymentCycleDays: z.number().nullable().optional(),
    schedule: z.array(z.object({
      id: z.string(),
      milestone: z.string(),
      percentageOfContract: z.number().nullable().optional(),
      conditions: z.string().nullable().optional(),
      estimatedMonth: z.number().nullable().optional(),
    })).optional(),
  }).nullable().optional(),
  milestones: z.array(z.object({
    id: z.string(),
    name: z.string(),
    durationMonths: z.number().nullable().optional(),
    percentageOfWork: z.number().nullable().optional(),
    paymentLinked: z.boolean().optional(),
    paymentPct: z.number().nullable().optional(),
    deliverables: z.array(z.string()).optional(),
  })).optional(),
  anticipatedStartDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
});

tenderListRouter.put(
  '/:tenderId/cash-flow-plan',
  requireAuth,
  validate({ params: TenderIdParam, body: CashFlowPlanBody }),
  asyncHandler(async (req, res) => {
    const tender = await prisma.tender.findFirst({
      where: { id: req.params.tenderId as string, deletedAt: null },
    });
    if (!tender) throw errors.notFound('Tender not found');

    const actor = req.user?.id ?? 'usr_anonymous';
    const actorTrimmed = actor.length <= 26 ? actor : actor.slice(0, 26);

    const plan = {
      ...req.body,
      updatedAt: new Date().toISOString(),
      updatedBy: actorTrimmed,
    };

    await prisma.tender.update({
      where: { id: tender.id },
      data: {
        cashFlowPlan: plan as unknown as Prisma.InputJsonValue,
        updatedBy: actorTrimmed,
      },
    });

    res.json({ data: plan });
  }),
);

/* Mount document sub-router */
tenderListRouter.use('/:tenderId/documents', tenderDocumentRouter);
