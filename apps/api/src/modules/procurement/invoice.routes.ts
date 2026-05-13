import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';
import { uploadFile as storageUpload, downloadFileWithFallback } from '../../lib/dms-storage.js';
import { actorId, bn } from './shared.js';

const TEMP_DIR = path.join(os.tmpdir(), 'govprojects-invoices');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEMP_DIR),
    filename: (_req, file, cb) => cb(null, `${newId()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const invoiceRouter: ExpressRouter = Router();
invoiceRouter.use(requireAuth);

// ===== Schemas =====

const IdParams = z.object({ id: z.string().min(1).max(26) });

const CreateBody = z.object({
  poId: z.string().min(1).max(26),
  grnId: z.string().max(26).optional(),
  vendorId: z.string().min(1).max(26),
  vendorInvoiceNo: z.string().min(1).max(64),
  invoiceDate: z.string(),
  dueDate: z.string(),
  invoiceAmountPaise: z.number().int().min(0),
  gstAmountPaise: z.number().int().min(0).default(0),
  tdsRateBps: z.number().int().min(0).default(0),
  tdsAmountPaise: z.number().int().min(0).default(0),
  notes: z.string().optional(),
});

const PaymentBody = z.object({
  paymentDate: z.string(),
  amountPaise: z.number().int().min(1),
  paymentMode: z.enum(['NEFT', 'RTGS', 'CHEQUE', 'UPI', 'CASH']),
  utrReference: z.string().max(64).optional(),
  remarks: z.string().max(500).optional(),
});

const ListQuery = z.object({
  status: z.string().optional(),
  vendorId: z.string().optional(),
  poId: z.string().optional(),
  overdue: z.coerce.boolean().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ===== Helpers =====

function threeWayMatch(poTotal: bigint, grnAcceptedValue: bigint, invoiceAmount: bigint) {
  const tolerance = BigInt(100); // 1 rupee tolerance
  const poVsGrn = grnAcceptedValue === BigInt(0) || // No GRN yet — skip GRN check
    (poTotal - grnAcceptedValue >= BigInt(0) ? poTotal - grnAcceptedValue : grnAcceptedValue - poTotal) <= tolerance;
  const grnVsInv = grnAcceptedValue === BigInt(0) ||
    (grnAcceptedValue - invoiceAmount >= BigInt(0) ? grnAcceptedValue - invoiceAmount : invoiceAmount - grnAcceptedValue) <= tolerance;
  const poVsInv = (poTotal - invoiceAmount >= BigInt(0) ? poTotal - invoiceAmount : invoiceAmount - poTotal) <= tolerance;

  return {
    status: (poVsGrn && grnVsInv && poVsInv) ? 'MATCHED' : 'MISMATCH',
    details: {
      poTotal: bn(poTotal),
      grnAcceptedValue: bn(grnAcceptedValue),
      invoiceAmount: bn(invoiceAmount),
      poVsGrn, grnVsInv, poVsInv,
    },
  };
}

// ===== Routes =====

/* GET / — list invoices */
invoiceRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.vendorId) where.vendorId = q.vendorId;
    if (q.poId) where.poId = q.poId;
    if (q.overdue) {
      where.dueDate = { lt: new Date() };
      where.status = { not: 'PAID' };
    }

    const take = q.limit + 1;
    const rows = await prisma.vendorInvoice.findMany({
      where,
      include: {
        vendor: { select: { id: true, name: true } },
        po: { select: { id: true, poNo: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > q.limit;
    if (hasMore) rows.pop();

    const today = new Date();
    res.json({
      data: rows.map((r) => {
        const daysOverdue = r.status !== 'PAID' && r.dueDate < today
          ? Math.floor((today.getTime() - r.dueDate.getTime()) / 86400000) : 0;
        return {
          id: r.id, vendorId: r.vendorId, vendorName: r.vendor.name,
          poId: r.poId, poNo: r.po.poNo,
          vendorInvoiceNo: r.vendorInvoiceNo,
          invoiceDate: r.invoiceDate.toISOString().slice(0, 10),
          dueDate: r.dueDate.toISOString().slice(0, 10),
          invoiceAmountPaise: bn(r.invoiceAmountPaise),
          netPayablePaise: bn(r.netPayablePaise),
          paidPaise: bn(r.paidPaise),
          matchStatus: r.matchStatus, status: r.status, daysOverdue,
        };
      }),
      meta: { next_cursor: hasMore ? rows[rows.length - 1]!.id : null, limit: q.limit },
    });
  }),
);

/* GET /aging — aging report */
invoiceRouter.get(
  '/aging',
  asyncHandler(async (_req, res) => {
    const unpaid = await prisma.vendorInvoice.findMany({
      where: { deletedAt: null, status: { not: 'PAID' } },
      include: { vendor: { select: { id: true, name: true } } },
    });

    const today = new Date();
    const buckets = { current: BigInt(0), days30: BigInt(0), days60: BigInt(0), days90: BigInt(0), over90: BigInt(0) };
    const vendorTotals: Record<string, { vendorId: string; vendorName: string; outstanding: bigint }> = {};

    for (const inv of unpaid) {
      const outstanding = inv.netPayablePaise - inv.paidPaise;
      const days = Math.floor((today.getTime() - inv.dueDate.getTime()) / 86400000);

      if (days <= 0) buckets.current += outstanding;
      else if (days <= 30) buckets.days30 += outstanding;
      else if (days <= 60) buckets.days60 += outstanding;
      else if (days <= 90) buckets.days90 += outstanding;
      else buckets.over90 += outstanding;

      if (!vendorTotals[inv.vendorId]) {
        vendorTotals[inv.vendorId] = { vendorId: inv.vendorId, vendorName: inv.vendor.name, outstanding: BigInt(0) };
      }
      vendorTotals[inv.vendorId]!.outstanding += outstanding;
    }

    res.json({
      data: {
        totalOutstanding: bn(buckets.current + buckets.days30 + buckets.days60 + buckets.days90 + buckets.over90),
        buckets: { current: bn(buckets.current), days30: bn(buckets.days30), days60: bn(buckets.days60), days90: bn(buckets.days90), over90: bn(buckets.over90) },
        byVendor: Object.values(vendorTotals).map((v) => ({ ...v, outstanding: bn(v.outstanding) })).sort((a, b) => b.outstanding - a.outstanding),
      },
    });
  }),
);

/* GET /:id — single invoice with match details + payments */
invoiceRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.vendorInvoice.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        vendor: { select: { id: true, name: true } },
        po: { select: { id: true, poNo: true, grandTotalPaise: true } },
        grn: { select: { id: true, grnNo: true } },
        payments: { orderBy: { paymentDate: 'desc' } },
      },
    });
    if (!row) throw errors.notFound('Invoice not found');

    res.json({
      data: {
        id: row.id, vendorId: row.vendorId, vendor: row.vendor,
        poId: row.poId, po: { ...row.po, grandTotalPaise: bn(row.po.grandTotalPaise) },
        grn: row.grn ? { id: row.grn.id, grnNo: row.grn.grnNo } : null,
        vendorInvoiceNo: row.vendorInvoiceNo,
        invoiceDate: row.invoiceDate.toISOString().slice(0, 10),
        dueDate: row.dueDate.toISOString().slice(0, 10),
        invoiceAmountPaise: bn(row.invoiceAmountPaise),
        gstAmountPaise: bn(row.gstAmountPaise),
        tdsRateBps: row.tdsRateBps, tdsAmountPaise: bn(row.tdsAmountPaise),
        netPayablePaise: bn(row.netPayablePaise),
        paidPaise: bn(row.paidPaise),
        matchStatus: row.matchStatus, matchDetails: row.matchDetails,
        status: row.status, notes: row.notes,
        attachmentName: row.attachmentName, hasAttachment: !!row.attachmentPath,
        payments: row.payments.map((p) => ({
          id: p.id, paymentDate: p.paymentDate.toISOString().slice(0, 10),
          amountPaise: bn(p.amountPaise), paymentMode: p.paymentMode,
          utrReference: p.utrReference, remarks: p.remarks,
        })),
        createdAt: row.createdAt.toISOString(),
      },
    });
  }),
);

/* POST / — record invoice (with optional attachment) */
invoiceRouter.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    // Parse body (multer puts it in req.body as strings)
    const raw = req.body as Record<string, string>;
    const body: z.infer<typeof CreateBody> = {
      poId: raw.poId!,
      grnId: raw.grnId || undefined,
      vendorId: raw.vendorId!,
      vendorInvoiceNo: raw.vendorInvoiceNo!,
      invoiceDate: raw.invoiceDate!,
      dueDate: raw.dueDate!,
      invoiceAmountPaise: parseInt(raw.invoiceAmountPaise!, 10),
      gstAmountPaise: parseInt(raw.gstAmountPaise || '0', 10),
      tdsRateBps: parseInt(raw.tdsRateBps || '0', 10),
      tdsAmountPaise: parseInt(raw.tdsAmountPaise || '0', 10),
      notes: raw.notes,
    };

    const parsed = CreateBody.parse(body);
    const actor = actorId(req);

    // Validate PO
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: parsed.poId, deletedAt: null },
      include: { lines: { where: { deletedAt: null } } },
    });
    if (!po) throw errors.notFound('Purchase Order not found');

    // Compute net payable
    const netPayable = BigInt(parsed.invoiceAmountPaise) + BigInt(parsed.gstAmountPaise) - BigInt(parsed.tdsAmountPaise);

    // 3-way match
    let grnAcceptedValue = BigInt(0);
    if (parsed.grnId) {
      const grnLines = await prisma.grnLine.findMany({
        where: { grnId: parsed.grnId },
        include: { poLine: { select: { ratePaise: true } } },
      });
      for (const gl of grnLines) {
        grnAcceptedValue += BigInt(Math.round(Number(gl.qtyAccepted) * Number(gl.poLine.ratePaise)));
      }
    }
    const match = threeWayMatch(po.grandTotalPaise, grnAcceptedValue, BigInt(parsed.invoiceAmountPaise));

    // Handle file upload
    let attachmentName: string | null = null;
    let attachmentPath: string | null = null;
    if (req.file) {
      const result = await storageUpload(req.file, `po:${parsed.poId}`);
      attachmentName = req.file.originalname;
      attachmentPath = result.storagePath;
    }

    const invoice = await prisma.vendorInvoice.create({
      data: {
        id: newId(),
        poId: parsed.poId,
        grnId: parsed.grnId ?? null,
        vendorId: parsed.vendorId,
        vendorInvoiceNo: parsed.vendorInvoiceNo,
        invoiceDate: new Date(parsed.invoiceDate),
        dueDate: new Date(parsed.dueDate),
        invoiceAmountPaise: BigInt(parsed.invoiceAmountPaise),
        gstAmountPaise: BigInt(parsed.gstAmountPaise),
        tdsRateBps: parsed.tdsRateBps,
        tdsAmountPaise: BigInt(parsed.tdsAmountPaise),
        netPayablePaise: netPayable,
        matchStatus: match.status,
        matchDetails: match.details as Record<string, unknown>,
        attachmentName, attachmentPath,
        notes: parsed.notes ?? null,
        createdBy: actor, updatedBy: actor,
      },
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'vendor_invoice', resourceId: invoice.id, after: { vendorInvoiceNo: parsed.vendorInvoiceNo } });
    res.status(201).json({ data: { id: invoice.id, matchStatus: match.status, matchDetails: match.details } });
  }),
);

/* GET /:id/attachment/download */
invoiceRouter.get(
  '/:id/attachment/download',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const inv = await prisma.vendorInvoice.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!inv || !inv.attachmentPath) throw errors.notFound('Attachment not found');

    res.setHeader('Content-Disposition', `inline; filename="${inv.attachmentName}"`);
    const { stream } = await downloadFileWithFallback(inv.attachmentPath, TEMP_DIR);
    (stream as NodeJS.ReadableStream).pipe(res);
  }),
);

/* POST /:id/payments — record payment */
invoiceRouter.post(
  '/:id/payments',
  validate({ params: IdParams, body: PaymentBody }),
  asyncHandler(async (req, res) => {
    const inv = await prisma.vendorInvoice.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!inv) throw errors.notFound('Invoice not found');
    if (inv.status === 'PAID') throw errors.conflict('Invoice is already fully paid');

    const body = req.body as z.infer<typeof PaymentBody>;
    const actor = actorId(req);

    const newPaid = inv.paidPaise + BigInt(body.amountPaise);
    const newStatus = newPaid >= inv.netPayablePaise ? 'PAID' : 'PARTIALLY_PAID';

    await prisma.$transaction([
      prisma.vendorPayment.create({
        data: {
          id: newId(),
          invoiceId: inv.id,
          paymentDate: new Date(body.paymentDate),
          amountPaise: BigInt(body.amountPaise),
          paymentMode: body.paymentMode,
          utrReference: body.utrReference ?? null,
          remarks: body.remarks ?? null,
          createdBy: actor, updatedBy: actor,
        },
      }),
      prisma.vendorInvoice.update({
        where: { id: inv.id },
        data: { paidPaise: newPaid, status: newStatus, updatedBy: actor },
      }),
    ]);

    await recordAudit(req, { action: 'CREATE', resourceType: 'vendor_payment', resourceId: inv.id, after: { amountPaise: body.amountPaise, paymentMode: body.paymentMode } });
    res.status(201).json({ data: { invoiceStatus: newStatus, paidPaise: bn(newPaid), netPayablePaise: bn(inv.netPayablePaise) } });
  }),
);
