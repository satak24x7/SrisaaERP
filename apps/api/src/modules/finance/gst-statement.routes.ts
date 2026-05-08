import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { prisma } from '../../lib/prisma.js';

const QueryParams = z.object({
  month: z.string().regex(/^\d{4}-\d{2}$/, 'Format: YYYY-MM'),
  businessUnitId: z.string().max(26).optional(),
  entityType: z.enum(['PROJECT', 'OPPORTUNITY', 'INITIATIVE']).optional(),
  entityId: z.string().max(26).optional(),
});

function toBigNum(v: bigint | null | undefined): number {
  return v != null ? Number(v) : 0;
}

export const gstStatementRouter: ExpressRouter = Router();
gstStatementRouter.use(requireAuth);

/* GET / — GST statement for a given month */
gstStatementRouter.get('/', validate({ query: QueryParams }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.infer<typeof QueryParams>;
  const [year, month] = q.month.split('-').map(Number);
  const from = new Date(year!, month! - 1, 1);
  const to = new Date(year!, month!, 1); // first of next month

  // Build sheet-level where
  const sheetWhere: Record<string, unknown> = {
    deletedAt: null,
    status: { in: ['APPROVED', 'IN_PROGRESS', 'EXPENSE_SUBMITTED', 'COMPLETED'] },
  };
  if (q.businessUnitId) sheetWhere.businessUnitId = q.businessUnitId;
  if (q.entityType === 'PROJECT' && q.entityId) sheetWhere.projectId = q.entityId;
  if (q.entityType === 'OPPORTUNITY' && q.entityId) sheetWhere.opportunityId = q.entityId;
  if (q.entityType === 'INITIATIVE' && q.entityId) sheetWhere.initiativeId = q.entityId;

  // Get all matching lines
  const lines = await prisma.expenseLine.findMany({
    where: {
      deletedAt: null,
      expenseDate: { gte: from, lt: to },
      sheet: sheetWhere,
    },
    include: {
      sheet: {
        select: {
          id: true, title: true, businessUnitId: true,
          opportunityId: true, projectId: true, initiativeId: true,
        },
      },
    },
    orderBy: { expenseDate: 'asc' },
  });

  let totalTaxable = 0;
  let totalCgst = 0;
  let totalSgst = 0;
  let totalIgst = 0;
  let totalGst = 0;
  let totalItcEligible = 0;

  const lineItems = lines.map((l) => {
    const taxable = toBigNum(l.amountPaise);
    const cgst = toBigNum(l.cgstPaise);
    const sgst = toBigNum(l.sgstPaise);
    const igst = toBigNum(l.igstPaise);
    const gst = toBigNum(l.gstPaise);

    totalTaxable += taxable;
    totalCgst += cgst;
    totalSgst += sgst;
    totalIgst += igst;
    totalGst += gst;
    if (l.itcEligible) totalItcEligible += gst;

    return {
      lineId: l.id,
      sheetId: l.sheet.id,
      sheetTitle: l.sheet.title,
      expenseDate: l.expenseDate.toISOString().slice(0, 10),
      invoiceDate: l.invoiceDate ? l.invoiceDate.toISOString().slice(0, 10) : null,
      category: l.category,
      vendorName: l.vendorName,
      vendorGstin: l.vendorGstin,
      invoiceNumber: l.invoiceNumber,
      hsnSacCode: l.hsnSacCode,
      description: l.description,
      taxableValuePaise: taxable,
      gstRateBps: l.gstRateBps,
      supplyType: l.supplyType,
      cgstPaise: cgst,
      sgstPaise: sgst,
      igstPaise: igst,
      totalGstPaise: gst,
      itcEligible: l.itcEligible,
      reverseCharge: l.reverseCharge,
    };
  });

  res.json({
    data: {
      period: q.month,
      totalTaxableValuePaise: totalTaxable,
      cgstPaise: totalCgst,
      sgstPaise: totalSgst,
      igstPaise: totalIgst,
      totalGstPaise: totalGst,
      itcEligiblePaise: totalItcEligible,
      netPayablePaise: totalGst - totalItcEligible,
      lineCount: lineItems.length,
      lineItems,
    },
  });
}));
