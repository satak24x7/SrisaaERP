import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';
import { actorId, bn, nextSequenceNo, computeLineTotal } from './shared.js';
import { poDocumentRouter } from './po-document.routes.js';

export const poRouter: ExpressRouter = Router();
poRouter.use(requireAuth);

// Mount sub-routers
poRouter.use('/:poId/documents', poDocumentRouter);

// ===== Schemas =====

const IdParams = z.object({ id: z.string().min(1).max(26) });
const LineIdParams = z.object({ id: z.string().min(1).max(26), lineId: z.string().min(1).max(26) });

// Coerce nulls/empty strings to undefined for optional fields
const optStr = (max = 255) => z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : v), z.string().max(max).optional());
const optInt = () => z.preprocess((v) => {
  if (v === '' || v === null || v === undefined) return undefined;
  const n = typeof v === 'string' ? parseInt(v, 10) : v;
  return isNaN(n as number) ? undefined : n;
}, z.number().int().min(0).optional());

const LineSchema = z.object({
  itemId: optStr(26),
  description: z.string().min(1).max(500),
  uom: z.string().min(1).max(16),
  hsnSacCode: optStr(16),
  qty: z.number().positive(),
  ratePaise: z.number().int().min(0),
  discountPct: z.number().min(0).max(100).default(0),
  gstRateBps: z.number().int().min(0).max(5000).default(0),
  supplyType: z.enum(['INTRA', 'INTER', 'EXEMPT']).default('INTRA'),
  deliveryDate: optStr(32),
}).passthrough(); // allow extra fields like lineNo to pass through without error

const CreateBody = z.object({
  poType: z.enum(['ADMIN', 'MARKETING', 'PROJECT']),
  label: optStr(255),
  vendorId: z.string().min(1).max(26),
  quotationId: optStr(26),
  projectId: optStr(26),
  budgetLineId: optStr(26),
  businessUnitId: optStr(26),
  poDate: z.string(),
  expectedDelivery: optStr(32),
  deliveryAddress: optStr(5000),
  paymentTermsDays: optInt(),
  freightPaise: z.preprocess((v) => (v === null || v === undefined ? 0 : v), z.number().int().min(0).default(0)),
  notes: optStr(5000),
  lines: z.array(LineSchema).min(1),
  paymentTerms: z.array(z.string().min(1).max(500)).optional(),       // list of payment term strings
  termConditions: z.array(z.string().min(1).max(1000)).optional(),    // list of T&C strings
});

const UpdateBody = z.object({
  label: optStr(255),
  vendorId: optStr(26),
  expectedDelivery: optStr(32),
  deliveryAddress: optStr(5000),
  paymentTermsDays: optInt(),
  freightPaise: optInt(),
  notes: optStr(5000),
  paymentTerms: z.array(z.string().min(1).max(500)).optional(),
  termConditions: z.array(z.string().min(1).max(1000)).optional(),
  termsAndConditions: z.string().optional(),
});

const TransitionBody = z.object({
  comment: z.string().optional(),
  cancelledReason: z.string().optional(),
});

const ListQuery = z.object({
  q: z.string().optional(),
  status: z.string().optional(),
  poType: z.string().optional(),
  vendorId: z.string().optional(),
  projectId: z.string().optional(),
  businessUnitId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ===== Status Machine =====

const VALID_TRANSITIONS: Record<string, Array<{ to: string; action: string }>> = {
  DRAFT: [{ to: 'APPROVED', action: 'approve' }],
  APPROVED: [{ to: 'ISSUED', action: 'issue' }, { to: 'CANCELLED', action: 'cancel' }],
  ISSUED: [{ to: 'CANCELLED', action: 'cancel' }],
  // PARTIALLY_RECEIVED and COMPLETED are set automatically by GRN
};

const LINE_EDITABLE_STATES = new Set(['DRAFT']);

// ===== Helpers =====

async function recalcTotals(poId: string): Promise<void> {
  const lines = await prisma.poLine.findMany({ where: { poId, deletedAt: null } });

  let subTotal = BigInt(0);
  let cgst = BigInt(0);
  let sgst = BigInt(0);
  let igst = BigInt(0);

  for (const l of lines) {
    const gstTotal = l.cgstPaise + l.sgstPaise + l.igstPaise;
    const lineNet = l.lineTotalPaise - gstTotal;
    subTotal += lineNet;
    cgst += l.cgstPaise;
    sgst += l.sgstPaise;
    igst += l.igstPaise;
  }

  const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, select: { freightPaise: true } });
  const freight = po?.freightPaise ?? BigInt(0);
  const taxable = subTotal;
  const grandTotal = subTotal + cgst + sgst + igst + freight;

  await prisma.purchaseOrder.update({
    where: { id: poId },
    data: {
      subTotalPaise: subTotal,
      taxablePaise: taxable,
      cgstPaise: cgst,
      sgstPaise: sgst,
      igstPaise: igst,
      grandTotalPaise: grandTotal,
    },
  });
}

// ===== Routes =====

/* GET / — list POs */
poRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.poType) where.poType = q.poType;
    if (q.vendorId) where.vendorId = q.vendorId;
    if (q.projectId) where.projectId = q.projectId;
    if (q.businessUnitId) where.businessUnitId = q.businessUnitId;
    if (q.q) where.OR = [{ poNo: { contains: q.q } }, { notes: { contains: q.q } }];

    const take = q.limit + 1;
    const rows = await prisma.purchaseOrder.findMany({
      where,
      include: {
        vendor: { select: { id: true, name: true } },
        project: { select: { id: true, name: true } },
        businessUnit: { select: { id: true, name: true } },
        _count: { select: { lines: true, grns: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > q.limit;
    if (hasMore) rows.pop();

    res.json({
      data: rows.map((r) => ({
        id: r.id, poNo: r.poNo, label: r.label, poType: r.poType, status: r.status,
        vendorId: r.vendorId, vendorName: r.vendor.name,
        projectId: r.projectId, projectName: r.project?.name ?? null,
        businessUnitId: r.businessUnitId, businessUnitName: r.businessUnit?.name ?? null,
        poDate: r.poDate.toISOString().slice(0, 10),
        expectedDelivery: r.expectedDelivery?.toISOString().slice(0, 10) ?? null,
        grandTotalPaise: bn(r.grandTotalPaise),
        lineCount: r._count.lines, grnCount: r._count.grns,
      })),
      meta: { next_cursor: hasMore ? rows[rows.length - 1]!.id : null, limit: q.limit },
    });
  }),
);

/* GET /:id — single PO with lines, vendor, events */
poRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.purchaseOrder.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        vendor: { select: { id: true, name: true, gstin: true, address: true, city: true, state: true } },
        project: { select: { id: true, name: true, projectCode: true } },
        businessUnit: { select: { id: true, name: true } },
        budgetLine: { select: { id: true, category: true, description: true, estimatedPaise: true, committedPaise: true, actualPaise: true } },
        quotation: { select: { id: true, quotationNo: true } },
        lines: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, include: { item: { select: { id: true, sku: true, name: true } } } },
        events: { orderBy: { occurredAt: 'desc' } },
        paymentTerms: { orderBy: { sortOrder: 'asc' } },
        termConditions: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { grns: true, invoices: true, documents: true } },
      },
    });
    if (!row) throw errors.notFound('Purchase Order not found');

    res.json({
      data: {
        id: row.id, poNo: row.poNo, label: row.label, poType: row.poType, status: row.status,
        vendor: row.vendor, project: row.project, businessUnit: row.businessUnit,
        budgetLine: row.budgetLine ? { ...row.budgetLine, estimatedPaise: bn(row.budgetLine.estimatedPaise), committedPaise: bn(row.budgetLine.committedPaise), actualPaise: bn(row.budgetLine.actualPaise) } : null,
        quotation: row.quotation,
        poDate: row.poDate.toISOString().slice(0, 10),
        expectedDelivery: row.expectedDelivery?.toISOString().slice(0, 10) ?? null,
        deliveryAddress: row.deliveryAddress,
        paymentTermsDays: row.paymentTermsDays, paymentTermsText: row.paymentTermsText,
        freightPaise: bn(row.freightPaise), subTotalPaise: bn(row.subTotalPaise),
        discountPaise: bn(row.discountPaise), taxablePaise: bn(row.taxablePaise),
        cgstPaise: bn(row.cgstPaise), sgstPaise: bn(row.sgstPaise), igstPaise: bn(row.igstPaise),
        grandTotalPaise: bn(row.grandTotalPaise),
        notes: row.notes,
        paymentTerms: row.paymentTerms.map((t) => ({ id: t.id, description: t.description, sortOrder: t.sortOrder })),
        termConditions: row.termConditions.map((t) => ({ id: t.id, description: t.description, sortOrder: t.sortOrder })),
        approvedByUserId: row.approvedByUserId, approvedAt: row.approvedAt?.toISOString() ?? null,
        cancelledReason: row.cancelledReason,
        createdAt: row.createdAt.toISOString(),
        lines: row.lines.map((l) => ({
          id: l.id, itemId: l.itemId, item: l.item, description: l.description, uom: l.uom,
          hsnSacCode: l.hsnSacCode, qty: Number(l.qty), ratePaise: bn(l.ratePaise),
          discountPct: Number(l.discountPct), gstRateBps: l.gstRateBps, supplyType: l.supplyType,
          cgstPaise: bn(l.cgstPaise), sgstPaise: bn(l.sgstPaise), igstPaise: bn(l.igstPaise),
          lineTotalPaise: bn(l.lineTotalPaise),
          deliveryDate: l.deliveryDate?.toISOString().slice(0, 10) ?? null,
          qtyReceived: Number(l.qtyReceived), qtyAccepted: Number(l.qtyAccepted),
          sortOrder: l.sortOrder,
        })),
        events: row.events.map((e) => ({
          id: e.id, fromStatus: e.fromStatus, toStatus: e.toStatus,
          actorUserId: e.actorUserId, actorRole: e.actorRole, comment: e.comment,
          occurredAt: e.occurredAt.toISOString(),
        })),
        grnCount: row._count.grns, invoiceCount: row._count.invoices, documentCount: row._count.documents,
      },
    });
  }),
);

/* POST / — create PO */
poRouter.post(
  '/',
  validate({ body: CreateBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateBody>;
    const actor = actorId(req);

    // Validations
    const vendor = await prisma.vendor.findFirst({ where: { id: body.vendorId, deletedAt: null } });
    if (!vendor) throw errors.notFound('Vendor not found');

    if (body.poType === 'PROJECT') {
      if (!body.projectId) throw errors.validation('projectId is required for PROJECT type PO');
      const project = await prisma.project.findFirst({ where: { id: body.projectId, deletedAt: null } });
      if (!project) throw errors.notFound('Project not found');
    }

    const poNo = await nextSequenceNo('PO');

    // Compute line totals
    const lineData = body.lines.map((l, i) => {
      const computed = computeLineTotal(l.qty, BigInt(l.ratePaise), l.discountPct, l.gstRateBps, l.supplyType);
      return {
        id: newId(),
        itemId: l.itemId ?? null,
        description: l.description,
        uom: l.uom,
        hsnSacCode: l.hsnSacCode ?? null,
        qty: l.qty,
        ratePaise: BigInt(l.ratePaise),
        discountPct: l.discountPct,
        gstRateBps: l.gstRateBps,
        supplyType: l.supplyType,
        deliveryDate: l.deliveryDate ? new Date(l.deliveryDate) : null,
        sortOrder: i,
        ...computed,
      };
    });

    // Compute header totals
    let subTotal = BigInt(0);
    let cgst = BigInt(0);
    let sgst = BigInt(0);
    let igst = BigInt(0);
    for (const l of lineData) {
      const gstTotal = l.cgstPaise + l.sgstPaise + l.igstPaise;
      subTotal += l.lineTotalPaise - gstTotal;
      cgst += l.cgstPaise;
      sgst += l.sgstPaise;
      igst += l.igstPaise;
    }
    const freight = BigInt(body.freightPaise);
    const grandTotal = subTotal + cgst + sgst + igst + freight;

    const po = await prisma.purchaseOrder.create({
      data: {
        id: newId(),
        poNo,
        poType: body.poType,
        label: body.label ?? null,
        vendorId: body.vendorId,
        quotationId: body.quotationId ?? null,
        projectId: body.projectId ?? null,
        budgetLineId: body.budgetLineId ?? null,
        businessUnitId: body.businessUnitId ?? null,
        poDate: new Date(body.poDate),
        expectedDelivery: body.expectedDelivery ? new Date(body.expectedDelivery) : null,
        deliveryAddress: body.deliveryAddress ?? null,
        paymentTermsDays: body.paymentTermsDays ?? null,
        freightPaise: freight,
        subTotalPaise: subTotal,
        taxablePaise: subTotal,
        cgstPaise: cgst,
        sgstPaise: sgst,
        igstPaise: igst,
        grandTotalPaise: grandTotal,
        notes: body.notes ?? null,
        createdBy: actor,
        updatedBy: actor,
        lines: { create: lineData },
        paymentTerms: body.paymentTerms?.length ? {
          create: body.paymentTerms.map((t, i) => ({ id: newId(), description: t, sortOrder: i })),
        } : undefined,
        termConditions: body.termConditions?.length ? {
          create: body.termConditions.map((t, i) => ({ id: newId(), description: t, sortOrder: i })),
        } : undefined,
      },
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'purchase_order', resourceId: po.id, after: { poNo } });
    res.status(201).json({ data: { id: po.id, poNo } });
  }),
);

/* PATCH /:id — full update PO (DRAFT only): header + lines + payment terms + T&C */
poRouter.patch(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const po = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!po) throw errors.notFound('Purchase Order not found');
    if (!LINE_EDITABLE_STATES.has(po.status)) throw errors.conflict('PO can only be edited in DRAFT status');

    const body = req.body as Record<string, unknown>;
    const actor = actorId(req);
    const data: Record<string, unknown> = { updatedBy: actor };

    // Header fields
    if (body.label !== undefined) data.label = body.label || null;
    if (body.vendorId !== undefined) data.vendorId = body.vendorId;
    if (body.quotationId !== undefined) data.quotationId = body.quotationId || null;
    if (body.projectId !== undefined) data.projectId = body.projectId || null;
    if (body.businessUnitId !== undefined) data.businessUnitId = body.businessUnitId || null;
    if (body.poType !== undefined) data.poType = body.poType;
    if (body.poDate !== undefined) data.poDate = new Date(body.poDate as string);
    if (body.expectedDelivery !== undefined) data.expectedDelivery = body.expectedDelivery ? new Date(body.expectedDelivery as string) : null;
    if (body.deliveryAddress !== undefined) data.deliveryAddress = body.deliveryAddress || null;
    if (body.paymentTermsDays !== undefined) data.paymentTermsDays = body.paymentTermsDays ?? null;
    if (body.freightPaise !== undefined) data.freightPaise = BigInt(body.freightPaise as number);
    if (body.notes !== undefined) data.notes = body.notes || null;

    await prisma.purchaseOrder.update({ where: { id: po.id }, data });

    // Replace lines if provided
    const lines = body.lines as Array<{ itemId?: string; description: string; uom: string; hsnSacCode?: string; qty: number; ratePaise: number; discountPct: number; gstRateBps: number; supplyType: string; deliveryDate?: string }> | undefined;
    if (lines?.length) {
      await prisma.poLine.deleteMany({ where: { poId: po.id } });
      const lineData = lines.map((l, i) => {
        const computed = computeLineTotal(l.qty, BigInt(l.ratePaise), l.discountPct, l.gstRateBps, l.supplyType);
        return {
          id: newId(), poId: po.id,
          itemId: l.itemId ?? null, description: l.description, uom: l.uom,
          hsnSacCode: l.hsnSacCode ?? null, qty: l.qty,
          ratePaise: BigInt(l.ratePaise), discountPct: l.discountPct,
          gstRateBps: l.gstRateBps, supplyType: l.supplyType,
          deliveryDate: l.deliveryDate ? new Date(l.deliveryDate) : null,
          sortOrder: i, ...computed,
        };
      });
      await prisma.poLine.createMany({ data: lineData });
      await recalcTotals(po.id);
    }

    // Replace payment terms if provided
    const paymentTerms = body.paymentTerms as string[] | undefined;
    if (paymentTerms !== undefined) {
      await prisma.poPaymentTerm.deleteMany({ where: { poId: po.id } });
      if (paymentTerms.length) {
        await prisma.poPaymentTerm.createMany({
          data: paymentTerms.map((t, i) => ({ id: newId(), poId: po.id, description: t, sortOrder: i })),
        });
      }
    }

    // Replace T&C if provided
    const termConditions = body.termConditions as string[] | undefined;
    if (termConditions !== undefined) {
      await prisma.poTermCondition.deleteMany({ where: { poId: po.id } });
      if (termConditions.length) {
        await prisma.poTermCondition.createMany({
          data: termConditions.map((t, i) => ({ id: newId(), poId: po.id, description: t, sortOrder: i })),
        });
      }
    }

    await recordAudit(req, { action: 'UPDATE', resourceType: 'purchase_order', resourceId: po.id });
    res.json({ data: { id: po.id, poNo: po.poNo } });
  }),
);

/* DELETE /:id — soft delete (DRAFT only) */
poRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const po = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!po) throw errors.notFound('Purchase Order not found');
    if (po.status !== 'DRAFT') throw errors.conflict('Only DRAFT POs can be deleted');

    await prisma.purchaseOrder.update({ where: { id: po.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'purchase_order', resourceId: po.id, before: { poNo: po.poNo } });
    res.status(204).end();
  }),
);

// ===== Line Item CRUD =====

/* POST /:id/lines — add line */
poRouter.post(
  '/:id/lines',
  validate({ params: IdParams, body: LineSchema }),
  asyncHandler(async (req, res) => {
    const po = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!po) throw errors.notFound('Purchase Order not found');
    if (!LINE_EDITABLE_STATES.has(po.status)) throw errors.conflict('Lines can only be added in DRAFT status');

    const body = req.body as z.infer<typeof LineSchema>;
    const computed = computeLineTotal(body.qty, BigInt(body.ratePaise), body.discountPct, body.gstRateBps, body.supplyType);

    const last = await prisma.poLine.findFirst({ where: { poId: po.id, deletedAt: null }, orderBy: { sortOrder: 'desc' }, select: { sortOrder: true } });

    const line = await prisma.poLine.create({
      data: {
        id: newId(),
        poId: po.id,
        itemId: body.itemId ?? null,
        description: body.description,
        uom: body.uom,
        hsnSacCode: body.hsnSacCode ?? null,
        qty: body.qty,
        ratePaise: BigInt(body.ratePaise),
        discountPct: body.discountPct,
        gstRateBps: body.gstRateBps,
        supplyType: body.supplyType,
        deliveryDate: body.deliveryDate ? new Date(body.deliveryDate) : null,
        sortOrder: (last?.sortOrder ?? -1) + 1,
        ...computed,
      },
    });

    await recalcTotals(po.id);
    res.status(201).json({ data: { id: line.id } });
  }),
);

/* PATCH /:id/lines/:lineId — update line */
poRouter.patch(
  '/:id/lines/:lineId',
  validate({ params: LineIdParams, body: LineSchema.partial() }),
  asyncHandler(async (req, res) => {
    const po = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!po) throw errors.notFound('Purchase Order not found');
    if (!LINE_EDITABLE_STATES.has(po.status)) throw errors.conflict('Lines can only be edited in DRAFT status');

    const line = await prisma.poLine.findFirst({ where: { id: req.params.lineId as string, poId: po.id, deletedAt: null } });
    if (!line) throw errors.notFound('Line not found');

    const body = req.body as Partial<z.infer<typeof LineSchema>>;
    const qty = body.qty ?? Number(line.qty);
    const ratePaise = body.ratePaise !== undefined ? BigInt(body.ratePaise) : line.ratePaise;
    const discountPct = body.discountPct ?? Number(line.discountPct);
    const gstRateBps = body.gstRateBps ?? line.gstRateBps;
    const supplyType = body.supplyType ?? line.supplyType;

    const computed = computeLineTotal(qty, ratePaise, discountPct, gstRateBps, supplyType);

    await prisma.poLine.update({
      where: { id: line.id },
      data: {
        itemId: body.itemId !== undefined ? (body.itemId ?? null) : undefined,
        description: body.description,
        uom: body.uom,
        hsnSacCode: body.hsnSacCode !== undefined ? (body.hsnSacCode ?? null) : undefined,
        deliveryDate: body.deliveryDate !== undefined ? (body.deliveryDate ? new Date(body.deliveryDate) : null) : undefined,
        qty, ratePaise, discountPct, gstRateBps, supplyType,
        ...computed,
      },
    });

    await recalcTotals(po.id);
    res.json({ data: { id: line.id } });
  }),
);

/* DELETE /:id/lines/:lineId — soft delete line */
poRouter.delete(
  '/:id/lines/:lineId',
  validate({ params: LineIdParams }),
  asyncHandler(async (req, res) => {
    const po = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!po) throw errors.notFound('Purchase Order not found');
    if (!LINE_EDITABLE_STATES.has(po.status)) throw errors.conflict('Lines can only be deleted in DRAFT status');

    const line = await prisma.poLine.findFirst({ where: { id: req.params.lineId as string, poId: po.id, deletedAt: null } });
    if (!line) throw errors.notFound('Line not found');

    await prisma.poLine.update({ where: { id: line.id }, data: { deletedAt: new Date() } });
    await recalcTotals(po.id);
    res.status(204).end();
  }),
);

// ===== Status Transitions =====

/* POST /:id/approve */
poRouter.post(
  '/:id/approve',
  validate({ params: IdParams, body: TransitionBody }),
  asyncHandler(async (req, res) => {
    const po = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!po) throw errors.notFound('Purchase Order not found');

    const allowed = VALID_TRANSITIONS[po.status]?.find((t) => t.action === 'approve');
    if (!allowed) throw errors.conflict(`Cannot approve a PO in ${po.status} status`);

    const actor = actorId(req);
    const body = req.body as z.infer<typeof TransitionBody>;

    // Budget integration for PROJECT POs
    let budgetWarning: string | null = null;
    if (po.poType === 'PROJECT' && po.budgetLineId) {
      const bl = await prisma.budgetLine.findUnique({ where: { id: po.budgetLineId } });
      if (bl) {
        const newCommitted = bl.committedPaise + po.grandTotalPaise;
        if (newCommitted > bl.estimatedPaise) {
          budgetWarning = `PO will exceed budget: committed ${bn(newCommitted)} vs estimated ${bn(bl.estimatedPaise)}`;
        }
        await prisma.budgetLine.update({
          where: { id: bl.id },
          data: { committedPaise: newCommitted, updatedBy: actor },
        });
      }
    }

    await prisma.$transaction([
      prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { status: allowed.to, approvedByUserId: actor, approvedAt: new Date(), updatedBy: actor },
      }),
      prisma.poEvent.create({
        data: { id: newId(), poId: po.id, fromStatus: po.status, toStatus: allowed.to, actorUserId: actor, comment: body.comment ?? null },
      }),
    ]);

    await recordAudit(req, { action: 'APPROVE', resourceType: 'purchase_order', resourceId: po.id, after: { status: allowed.to } });
    res.json({ data: { id: po.id, status: allowed.to, budgetWarning } });
  }),
);

/* POST /:id/issue */
poRouter.post(
  '/:id/issue',
  validate({ params: IdParams, body: TransitionBody }),
  asyncHandler(async (req, res) => {
    const po = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!po) throw errors.notFound('Purchase Order not found');

    const allowed = VALID_TRANSITIONS[po.status]?.find((t) => t.action === 'issue');
    if (!allowed) throw errors.conflict(`Cannot issue a PO in ${po.status} status`);

    const actor = actorId(req);
    const body = req.body as z.infer<typeof TransitionBody>;

    await prisma.$transaction([
      prisma.purchaseOrder.update({ where: { id: po.id }, data: { status: allowed.to, updatedBy: actor } }),
      prisma.poEvent.create({
        data: { id: newId(), poId: po.id, fromStatus: po.status, toStatus: allowed.to, actorUserId: actor, comment: body.comment ?? null },
      }),
    ]);

    await recordAudit(req, { action: 'ISSUE', resourceType: 'purchase_order', resourceId: po.id });
    res.json({ data: { id: po.id, status: allowed.to } });
  }),
);

/* POST /:id/cancel */
poRouter.post(
  '/:id/cancel',
  validate({ params: IdParams, body: TransitionBody }),
  asyncHandler(async (req, res) => {
    const po = await prisma.purchaseOrder.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!po) throw errors.notFound('Purchase Order not found');

    const allowed = VALID_TRANSITIONS[po.status]?.find((t) => t.action === 'cancel');
    if (!allowed) throw errors.conflict(`Cannot cancel a PO in ${po.status} status`);

    const actor = actorId(req);
    const body = req.body as z.infer<typeof TransitionBody>;

    // Reverse budget commitment if PROJECT PO was approved
    if (po.poType === 'PROJECT' && po.budgetLineId && po.status !== 'DRAFT') {
      const bl = await prisma.budgetLine.findUnique({ where: { id: po.budgetLineId } });
      if (bl) {
        const newCommitted = bl.committedPaise - po.grandTotalPaise;
        await prisma.budgetLine.update({
          where: { id: bl.id },
          data: { committedPaise: newCommitted < BigInt(0) ? BigInt(0) : newCommitted, updatedBy: actor },
        });
      }
    }

    await prisma.$transaction([
      prisma.purchaseOrder.update({
        where: { id: po.id },
        data: { status: 'CANCELLED', cancelledReason: body.cancelledReason ?? body.comment ?? null, updatedBy: actor },
      }),
      prisma.poEvent.create({
        data: { id: newId(), poId: po.id, fromStatus: po.status, toStatus: 'CANCELLED', actorUserId: actor, comment: body.cancelledReason ?? body.comment ?? null },
      }),
    ]);

    await recordAudit(req, { action: 'CANCEL', resourceType: 'purchase_order', resourceId: po.id });
    res.json({ data: { id: po.id, status: 'CANCELLED' } });
  }),
);

/* GET /company-info — get company info for PO print */
poRouter.get(
  '/company-info',
  asyncHandler(async (_req, res) => {
    const company = await prisma.company.findFirst();
    res.json({ data: company });
  }),
);
