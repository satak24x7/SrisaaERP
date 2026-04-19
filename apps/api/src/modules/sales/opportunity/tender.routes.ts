import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';

const OppIdParams = z.object({ id: z.string().min(1).max(26) });

const optStr = z.string().nullable().optional();
const optNum = z.coerce.number().int().nonnegative().nullable().optional();
const optInt = z.coerce.number().int().min(0).nullable().optional();

const CreateTenderInput = z.object({
  tenderNumber: z.string().min(1).max(128),
  tenderTitle: z.string().max(500).nullable().optional(),
  referenceNumber: z.string().max(128).nullable().optional(),
  publishingAuthority: z.string().max(255).nullable().optional(),
  publishingDepartment: z.string().max(255).nullable().optional(),

  tenderType: z.enum(['OPEN', 'LIMITED', 'SINGLE_SOURCE', 'EOI', 'REVERSE_AUCTION']),
  tenderCategory: z.enum(['WORKS', 'GOODS', 'SERVICES', 'CONSULTANCY']).nullable().optional(),
  procurementMode: z.enum(['ICB', 'NCB', 'SHOPPING', 'DIRECT']).nullable().optional(),

  portalName: optStr,
  portalTenderId: optStr,
  portalUrl: optStr,

  estimatedValuePaise: optNum,
  emdAmountPaise: optNum,
  emdMode: optStr,
  tenderFeePaise: optNum,
  documentCostPaise: optNum,

  publishDate: optStr,
  preBidMeetingDate: optStr,
  clarificationDeadline: optStr,
  submissionDeadlineOnline: optStr,
  submissionDeadlinePhysical: optStr,
  technicalOpeningDate: optStr,
  financialOpeningDate: optStr,

  bidValidityDays: optInt,
  completionPeriodDays: optInt,
  projectLocation: optStr,

  eligibilityCriteria: optStr,
  turnoverRequirementPaise: optNum,
  experienceYears: optInt,
  similarWorkValuePaise: optNum,

  tenderStatus: optStr,
  notes: optStr,
  corrigendumDetails: optStr,
});

const UpdateTenderInput = CreateTenderInput.partial();

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function toBigIntOrNull(v: number | undefined | null): bigint | null {
  return v != null ? BigInt(v) : null;
}

function toDateOrNull(v: string | undefined | null): Date | null {
  return v ? new Date(v) : null;
}

function toDto(r: Record<string, unknown>) {
  const bigIntFields = ['estimatedValuePaise', 'emdAmountPaise', 'tenderFeePaise',
    'documentCostPaise', 'turnoverRequirementPaise', 'similarWorkValuePaise'] as const;
  const dto: Record<string, unknown> = { ...r };
  for (const f of bigIntFields) {
    if (dto[f] != null) dto[f] = Number(dto[f] as bigint);
  }
  return dto;
}

export const tenderRouter = Router({ mergeParams: true });

// GET /opportunities/:id/tender
tenderRouter.get(
  '/',
  validate({ params: OppIdParams }),
  asyncHandler(async (req, res) => {
    const tender = await prisma.tender.findFirst({
      where: { opportunityId: req.params.id as string, deletedAt: null },
    });
    res.json({ data: tender ? toDto(tender as unknown as Record<string, unknown>) : null });
  }),
);

// POST /opportunities/:id/tender
tenderRouter.post(
  '/',
  validate({ params: OppIdParams, body: CreateTenderInput }),
  asyncHandler(async (req, res) => {
    const oppId = req.params.id as string;
    const opp = await prisma.opportunity.findFirst({ where: { id: oppId, deletedAt: null } });
    if (!opp) throw errors.notFound('Opportunity not found');

    // Check if tender already exists
    const existing = await prisma.tender.findFirst({ where: { opportunityId: oppId, deletedAt: null } });
    if (existing) throw errors.conflict('Tender already exists for this opportunity');

    const body = req.body as z.infer<typeof CreateTenderInput>;
    const actor = actorId(req);

    const tender = await prisma.tender.create({
      data: {
        id: newId(),
        opportunityId: oppId,
        tenderNumber: body.tenderNumber,
        tenderTitle: body.tenderTitle ?? null,
        referenceNumber: body.referenceNumber ?? null,
        publishingAuthority: body.publishingAuthority ?? null,
        publishingDepartment: body.publishingDepartment ?? null,
        tenderType: body.tenderType,
        tenderCategory: body.tenderCategory ?? null,
        procurementMode: body.procurementMode ?? null,
        portalName: body.portalName ?? null,
        portalTenderId: body.portalTenderId ?? null,
        portalUrl: body.portalUrl ?? null,
        estimatedValuePaise: toBigIntOrNull(body.estimatedValuePaise),
        emdAmountPaise: toBigIntOrNull(body.emdAmountPaise),
        emdMode: body.emdMode ?? null,
        tenderFeePaise: toBigIntOrNull(body.tenderFeePaise),
        documentCostPaise: toBigIntOrNull(body.documentCostPaise),
        publishDate: toDateOrNull(body.publishDate),
        preBidMeetingDate: toDateOrNull(body.preBidMeetingDate),
        clarificationDeadline: toDateOrNull(body.clarificationDeadline),
        submissionDeadlineOnline: toDateOrNull(body.submissionDeadlineOnline),
        submissionDeadlinePhysical: toDateOrNull(body.submissionDeadlinePhysical),
        technicalOpeningDate: toDateOrNull(body.technicalOpeningDate),
        financialOpeningDate: toDateOrNull(body.financialOpeningDate),
        bidValidityDays: body.bidValidityDays ?? null,
        completionPeriodDays: body.completionPeriodDays ?? null,
        projectLocation: body.projectLocation ?? null,
        eligibilityCriteria: body.eligibilityCriteria ?? null,
        turnoverRequirementPaise: toBigIntOrNull(body.turnoverRequirementPaise),
        experienceYears: body.experienceYears ?? null,
        similarWorkValuePaise: toBigIntOrNull(body.similarWorkValuePaise),
        tenderStatus: body.tenderStatus ?? 'PUBLISHED',
        notes: body.notes ?? null,
        corrigendumDetails: body.corrigendumDetails ?? null,
        createdBy: actor,
        updatedBy: actor,
      },
    });

    // Mark opportunity as tender released
    await prisma.opportunity.update({ where: { id: oppId }, data: { tenderReleased: true } });

    await recordAudit(req, { action: 'CREATE', resourceType: 'tender', resourceId: tender.id });
    res.status(201).json({ data: toDto(tender as unknown as Record<string, unknown>) });
  }),
);

// PATCH /opportunities/:id/tender
tenderRouter.patch(
  '/',
  validate({ params: OppIdParams, body: UpdateTenderInput }),
  asyncHandler(async (req, res) => {
    const tender = await prisma.tender.findFirst({
      where: { opportunityId: req.params.id as string, deletedAt: null },
    });
    if (!tender) throw errors.notFound('Tender not found');

    const body = req.body as z.infer<typeof UpdateTenderInput>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    for (const [k, v] of Object.entries(body)) {
      if (v === undefined) continue;
      if (k.endsWith('Paise')) { data[k] = toBigIntOrNull(v as number); continue; }
      if (k.endsWith('Date') || k === 'clarificationDeadline') { data[k] = toDateOrNull(v as string); continue; }
      data[k] = v;
    }

    const updated = await prisma.tender.update({ where: { id: tender.id }, data });
    await recordAudit(req, { action: 'UPDATE', resourceType: 'tender', resourceId: tender.id });
    res.json({ data: toDto(updated as unknown as Record<string, unknown>) });
  }),
);

// DELETE /opportunities/:id/tender
tenderRouter.delete(
  '/',
  validate({ params: OppIdParams }),
  asyncHandler(async (req, res) => {
    const tender = await prisma.tender.findFirst({
      where: { opportunityId: req.params.id as string, deletedAt: null },
    });
    if (!tender) throw errors.notFound('Tender not found');

    await prisma.tender.update({ where: { id: tender.id }, data: { deletedAt: new Date() } });
    await prisma.opportunity.update({ where: { id: req.params.id as string }, data: { tenderReleased: false } });

    await recordAudit(req, { action: 'DELETE', resourceType: 'tender', resourceId: tender.id });
    res.status(204).send();
  }),
);
