import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';
import { actorId, bn, nextSequenceNo } from './shared.js';

export const rateComparisonRouter: ExpressRouter = Router();
rateComparisonRouter.use(requireAuth);

// ===== Schemas =====

const IdParams = z.object({ id: z.string().min(1).max(26) });

const CreateBody = z.object({
  title: z.string().min(1).max(255),
  quotationIds: z.array(z.string().min(1).max(26)).min(2).max(5),
  notes: z.string().optional(),
});

const UpdateBody = z.object({
  title: z.string().min(1).max(255).optional(),
  selectedVendorId: z.string().max(26).optional(),
  selectionReason: z.string().optional(),
  notes: z.string().optional(),
  status: z.enum(['DRAFT', 'FINALIZED']).optional(),
});

const ListQuery = z.object({
  status: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ===== Routes =====

/* GET / — list */
rateComparisonRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.status) where.status = q.status;

    const take = q.limit + 1;
    const rows = await prisma.rateComparison.findMany({
      where,
      include: { quotations: { select: { id: true, quotationNo: true, vendorId: true, vendor: { select: { name: true } }, grandTotalPaise: true } } },
      orderBy: { createdAt: 'desc' },
      take,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > q.limit;
    if (hasMore) rows.pop();

    res.json({
      data: rows.map((r) => ({
        id: r.id, comparisonNo: r.comparisonNo, title: r.title,
        status: r.status, selectedVendorId: r.selectedVendorId,
        quotationCount: r.quotations.length,
        quotations: r.quotations.map((q) => ({
          id: q.id, quotationNo: q.quotationNo, vendorName: q.vendor.name,
          grandTotalPaise: bn(q.grandTotalPaise),
        })),
      })),
      meta: { next_cursor: hasMore ? rows[rows.length - 1]!.id : null, limit: q.limit },
    });
  }),
);

/* GET /:id — detail with linked quotations side-by-side */
rateComparisonRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.rateComparison.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        quotations: {
          where: { deletedAt: null },
          include: {
            vendor: { select: { id: true, name: true, gstin: true } },
            lines: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' } },
          },
        },
      },
    });
    if (!row) throw errors.notFound('Rate comparison not found');

    // Find L1 (lowest grand total)
    let l1VendorId: string | null = null;
    let l1Total = BigInt(Number.MAX_SAFE_INTEGER);
    for (const q of row.quotations) {
      if (q.grandTotalPaise < l1Total) {
        l1Total = q.grandTotalPaise;
        l1VendorId = q.vendorId;
      }
    }

    res.json({
      data: {
        id: row.id, comparisonNo: row.comparisonNo, title: row.title,
        status: row.status, selectedVendorId: row.selectedVendorId,
        selectionReason: row.selectionReason, notes: row.notes,
        l1VendorId,
        quotations: row.quotations.map((q) => ({
          id: q.id, quotationNo: q.quotationNo,
          vendorId: q.vendorId, vendor: q.vendor,
          totalPaise: bn(q.totalPaise), gstTotalPaise: bn(q.gstTotalPaise),
          grandTotalPaise: bn(q.grandTotalPaise),
          paymentTermsDays: q.paymentTermsDays, deliveryDays: q.deliveryDays,
          isL1: q.vendorId === l1VendorId,
          lines: q.lines.map((l) => ({
            id: l.id, description: l.description, uom: l.uom,
            qty: Number(l.qty), ratePaise: bn(l.ratePaise),
            discountPct: Number(l.discountPct), gstRateBps: l.gstRateBps,
            lineTotalPaise: bn(l.lineTotalPaise),
          })),
        })),
      },
    });
  }),
);

/* POST / — create comparison, link quotation IDs */
rateComparisonRouter.post(
  '/',
  validate({ body: CreateBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateBody>;
    const actor = actorId(req);

    // Validate quotations exist
    const quotations = await prisma.vendorQuotation.findMany({
      where: { id: { in: body.quotationIds }, deletedAt: null },
    });
    if (quotations.length !== body.quotationIds.length) throw errors.validation('One or more quotations not found');

    const comparisonNo = await nextSequenceNo('RC');

    const comparison = await prisma.rateComparison.create({
      data: {
        id: newId(),
        comparisonNo,
        title: body.title,
        notes: body.notes ?? null,
        createdBy: actor,
        updatedBy: actor,
      },
    });

    // Link quotations
    await prisma.vendorQuotation.updateMany({
      where: { id: { in: body.quotationIds } },
      data: { rateComparisonId: comparison.id },
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'rate_comparison', resourceId: comparison.id, after: { comparisonNo, quotationIds: body.quotationIds } });
    res.status(201).json({ data: { id: comparison.id, comparisonNo } });
  }),
);

/* PATCH /:id — update selection / finalize */
rateComparisonRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateBody }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.rateComparison.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Rate comparison not found');

    const body = req.body as z.infer<typeof UpdateBody>;
    const updated = await prisma.rateComparison.update({
      where: { id: existing.id },
      data: { ...body, updatedBy: actorId(req) },
    });

    await recordAudit(req, { action: 'UPDATE', resourceType: 'rate_comparison', resourceId: updated.id });
    res.json({ data: { id: updated.id, comparisonNo: updated.comparisonNo, status: updated.status } });
  }),
);

/* DELETE /:id — soft delete */
rateComparisonRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.rateComparison.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Rate comparison not found');
    // Unlink quotations
    await prisma.vendorQuotation.updateMany({ where: { rateComparisonId: existing.id }, data: { rateComparisonId: null } });
    await prisma.rateComparison.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'rate_comparison', resourceId: existing.id });
    res.status(204).end();
  }),
);
