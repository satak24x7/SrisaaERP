import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import os from 'os';
import multer from 'multer';
import * as XLSX from 'xlsx';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';
import { uploadFile as storageUpload, downloadFileWithFallback, deleteFileWithFallback } from '../../lib/dms-storage.js';
import { actorId, bn, nextSequenceNo, computeLineTotal } from './shared.js';
import { extractPriceListFromFile } from '../../lib/gemini.js';

const TEMP_DIR = path.join(os.tmpdir(), 'govprojects-quotations');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEMP_DIR),
    filename: (_req, file, cb) => cb(null, `${newId()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const quotationRouter: ExpressRouter = Router();
quotationRouter.use(requireAuth);

// ===== Schemas =====

const IdParams = z.object({ id: z.string().min(1).max(26) });

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
  qty: z.number().positive(),
  ratePaise: z.number().int().min(0),
  discountPct: z.number().min(0).max(100).default(0),
  gstRateBps: z.number().int().min(0).max(5000).default(0),
  supplyType: z.enum(['INTRA', 'INTER', 'EXEMPT']).default('INTRA'),
  hsnSacCode: optStr(16),
});

const CreateBody = z.object({
  vendorId: z.string().min(1).max(26),
  quotationNo: optStr(64),         // vendor's quotation/reference number (user-entered)
  referenceNo: optStr(64),
  quotationDate: z.string(),       // YYYY-MM-DD
  validUntil: optStr(32),
  paymentTermsDays: optInt(),
  deliveryDays: optInt(),
  notes: optStr(5000),
  rateComparisonId: optStr(26),
  lines: z.array(LineSchema).min(1),
});

const UpdateBody = CreateBody.partial();

const ListQuery = z.object({
  vendorId: z.string().optional(),
  status: z.string().optional(),
  rateComparisonId: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ===== Helpers =====

function computeQuotationTotals(lines: Array<{ ratePaise: bigint; qty: unknown; discountPct: unknown; cgstPaise: bigint; sgstPaise: bigint; igstPaise: bigint; lineTotalPaise: bigint }>) {
  let totalPaise = BigInt(0);
  let gstTotalPaise = BigInt(0);
  let grandTotalPaise = BigInt(0);

  for (const l of lines) {
    const gst = l.cgstPaise + l.sgstPaise + l.igstPaise;
    const lineNet = l.lineTotalPaise - gst;
    totalPaise += lineNet;
    gstTotalPaise += gst;
    grandTotalPaise += l.lineTotalPaise;
  }

  return { totalPaise, gstTotalPaise, grandTotalPaise };
}

// ===== Routes =====

/* GET / — list quotations */
quotationRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.vendorId) where.vendorId = q.vendorId;
    if (q.status) where.status = q.status;
    if (q.rateComparisonId) where.rateComparisonId = q.rateComparisonId;

    const take = q.limit + 1;
    const rows = await prisma.vendorQuotation.findMany({
      where,
      include: { vendor: { select: { id: true, name: true } }, _count: { select: { lines: true } } },
      orderBy: { createdAt: 'desc' },
      take,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > q.limit;
    if (hasMore) rows.pop();

    res.json({
      data: rows.map((r) => ({
        id: r.id, quotationNo: r.quotationNo, vendorId: r.vendorId,
        vendorName: r.vendor.name, referenceNo: r.referenceNo,
        quotationDate: r.quotationDate.toISOString().slice(0, 10),
        validUntil: r.validUntil?.toISOString().slice(0, 10) ?? null,
        totalPaise: bn(r.totalPaise), grandTotalPaise: bn(r.grandTotalPaise),
        status: r.status, lineCount: r._count.lines,
      })),
      meta: { next_cursor: hasMore ? rows[rows.length - 1]!.id : null, limit: q.limit },
    });
  }),
);

/* GET /:id — single quotation with lines */
quotationRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.vendorQuotation.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        vendor: { select: { id: true, name: true, gstin: true } },
        lines: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, include: { item: { select: { id: true, sku: true, name: true } } } },
      },
    });
    if (!row) throw errors.notFound('Quotation not found');

    res.json({
      data: {
        ...row,
        totalPaise: bn(row.totalPaise), gstTotalPaise: bn(row.gstTotalPaise), grandTotalPaise: bn(row.grandTotalPaise),
        quotationDate: row.quotationDate.toISOString().slice(0, 10),
        validUntil: row.validUntil?.toISOString().slice(0, 10) ?? null,
        lines: row.lines.map((l) => ({
          id: l.id, itemId: l.itemId, item: l.item, description: l.description, uom: l.uom,
          qty: Number(l.qty), ratePaise: bn(l.ratePaise), discountPct: Number(l.discountPct),
          gstRateBps: l.gstRateBps, supplyType: l.supplyType, hsnSacCode: l.hsnSacCode,
          cgstPaise: bn(l.cgstPaise), sgstPaise: bn(l.sgstPaise), igstPaise: bn(l.igstPaise),
          lineTotalPaise: bn(l.lineTotalPaise), sortOrder: l.sortOrder,
        })),
      },
    });
  }),
);

/* POST / — create quotation with lines */
quotationRouter.post(
  '/',
  validate({ body: CreateBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateBody>;
    const actor = actorId(req);

    // Validate vendor
    const vendor = await prisma.vendor.findFirst({ where: { id: body.vendorId, deletedAt: null } });
    if (!vendor) throw errors.notFound('Vendor not found');

    // Use user-entered quotation number, or auto-generate one
    const quotationNo = body.quotationNo || await nextSequenceNo('QT');

    // Check uniqueness
    const dup = await prisma.vendorQuotation.findUnique({ where: { quotationNo } });
    if (dup) throw errors.conflict(`Quotation number "${quotationNo}" already exists`);

    // Compute line totals
    const lineData = body.lines.map((l, i) => {
      const computed = computeLineTotal(l.qty, BigInt(l.ratePaise), l.discountPct, l.gstRateBps, l.supplyType);
      return {
        id: newId(),
        itemId: l.itemId ?? null,
        description: l.description,
        uom: l.uom,
        qty: l.qty,
        ratePaise: BigInt(l.ratePaise),
        discountPct: l.discountPct,
        gstRateBps: l.gstRateBps,
        supplyType: l.supplyType,
        hsnSacCode: l.hsnSacCode ?? null,
        sortOrder: i,
        ...computed,
      };
    });

    const totals = computeQuotationTotals(lineData);

    const quotation = await prisma.vendorQuotation.create({
      data: {
        id: newId(),
        quotationNo,
        vendorId: body.vendorId,
        referenceNo: body.referenceNo ?? null,
        quotationDate: new Date(body.quotationDate),
        validUntil: body.validUntil ? new Date(body.validUntil) : null,
        paymentTermsDays: body.paymentTermsDays ?? null,
        deliveryDays: body.deliveryDays ?? null,
        notes: body.notes ?? null,
        rateComparisonId: body.rateComparisonId ?? null,
        ...totals,
        createdBy: actor,
        updatedBy: actor,
        lines: {
          create: lineData,
        },
      },
      include: { lines: true },
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'vendor_quotation', resourceId: quotation.id, after: { quotationNo } });
    res.status(201).json({ data: { id: quotation.id, quotationNo } });
  }),
);

/* PUT /:id — full update quotation + lines */
quotationRouter.put(
  '/:id',
  validate({ params: IdParams, body: CreateBody }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.vendorQuotation.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Quotation not found');

    const body = req.body as z.infer<typeof CreateBody>;
    const actor = actorId(req);

    const lineData = body.lines.map((l, i) => {
      const computed = computeLineTotal(l.qty, BigInt(l.ratePaise), l.discountPct, l.gstRateBps, l.supplyType);
      return {
        id: newId(),
        quotationId: existing.id,
        itemId: l.itemId ?? null,
        description: l.description,
        uom: l.uom,
        qty: l.qty,
        ratePaise: BigInt(l.ratePaise),
        discountPct: l.discountPct,
        gstRateBps: l.gstRateBps,
        supplyType: l.supplyType,
        hsnSacCode: l.hsnSacCode ?? null,
        sortOrder: i,
        ...computed,
      };
    });

    const totals = computeQuotationTotals(lineData);

    await prisma.$transaction(async (tx) => {
      // Delete old lines
      await tx.vendorQuotationLine.deleteMany({ where: { quotationId: existing.id } });
      // Create new lines
      await tx.vendorQuotationLine.createMany({ data: lineData });
      // Update header
      await tx.vendorQuotation.update({
        where: { id: existing.id },
        data: {
          vendorId: body.vendorId,
          referenceNo: body.referenceNo ?? null,
          quotationDate: new Date(body.quotationDate),
          validUntil: body.validUntil ? new Date(body.validUntil) : null,
          paymentTermsDays: body.paymentTermsDays ?? null,
          deliveryDays: body.deliveryDays ?? null,
          notes: body.notes ?? null,
          rateComparisonId: body.rateComparisonId ?? null,
          ...totals,
          updatedBy: actor,
        },
      });
    });

    await recordAudit(req, { action: 'UPDATE', resourceType: 'vendor_quotation', resourceId: existing.id });
    res.json({ data: { id: existing.id, quotationNo: existing.quotationNo } });
  }),
);

/* DELETE /:id — soft delete */
quotationRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.vendorQuotation.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Quotation not found');
    await prisma.vendorQuotation.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'vendor_quotation', resourceId: existing.id });
    res.status(204).end();
  }),
);

/* POST /:id/attachment — upload quotation PDF */
quotationRouter.post(
  '/:id/attachment',
  validate({ params: IdParams }),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.vendorQuotation.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Quotation not found');
    const file = req.file;
    if (!file) throw errors.validation('File is required');

    // Delete old attachment if exists
    if (existing.attachmentPath) {
      try { await deleteFileWithFallback(existing.attachmentPath, TEMP_DIR); } catch { /* best effort */ }
    }

    const result = await storageUpload(file, `quotation:${existing.id}`);
    await prisma.vendorQuotation.update({
      where: { id: existing.id },
      data: { attachmentName: file.originalname, attachmentPath: result.storagePath },
    });

    res.json({ data: { attachmentName: file.originalname } });
  }),
);

/* GET /:id/attachment/download */
quotationRouter.get(
  '/:id/attachment/download',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.vendorQuotation.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing || !existing.attachmentPath) throw errors.notFound('Attachment not found');

    res.setHeader('Content-Disposition', `inline; filename="${existing.attachmentName}"`);
    const { stream } = await downloadFileWithFallback(existing.attachmentPath, TEMP_DIR);
    (stream as NodeJS.ReadableStream).pipe(res);
  }),
);

// ===== Excel Import =====

/* POST /import/preview — upload Excel, return headers + sample rows */
quotationRouter.post(
  '/import/preview',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw errors.validation('Excel file is required');

    const ext = path.extname(file.originalname).toLowerCase();
    if (!['.xlsx', '.xls', '.csv'].includes(ext)) {
      throw errors.validation('Only .xlsx, .xls, and .csv files are supported');
    }

    const workbook = XLSX.readFile(file.path);
    const sheetNames = workbook.SheetNames;
    const sheets: Array<{ name: string; headers: string[]; sampleRows: unknown[][]; totalRows: number }> = [];

    for (const name of sheetNames) {
      const sheet = workbook.Sheets[name]!;
      const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      if (data.length === 0) continue;

      // Find the header row — first row with ≥3 non-empty cells
      let headerIdx = 0;
      for (let i = 0; i < Math.min(data.length, 10); i++) {
        const row = data[i]!;
        const nonEmpty = (row as unknown[]).filter(c => c !== '' && c != null).length;
        if (nonEmpty >= 3) { headerIdx = i; break; }
      }

      const headers = (data[headerIdx] as unknown[]).map(h => String(h ?? '').trim());
      const dataRows = data.slice(headerIdx + 1).filter(r => (r as unknown[]).some(c => c !== '' && c != null));
      const isFull = req.query.full === 'true';
      const sampleRows = isFull ? dataRows : dataRows.slice(0, 5);

      sheets.push({
        name, headers, sampleRows: sampleRows as unknown[][], totalRows: dataRows.length,
        ...(isFull ? { allRows: dataRows as unknown[][] } : {}),
      });
    }

    if (sheets.length === 0) throw errors.validation('No data found in the uploaded file');

    // Clean up temp file
    try { fs.unlinkSync(file.path); } catch { /* best effort */ }

    res.json({ data: { sheets } });
  }),
);

const ImportBody = z.object({
  vendorId: z.string().min(1).max(26),
  quotationDate: z.string(),
  quotationId: z.string().max(26).optional(),   // if set, update this quotation
  defaultGstRateBps: z.number().int().min(0).max(5000).default(0),
  lines: z.array(z.object({
    description: z.string().min(1),
    uom: z.string().default('NOS'),
    qty: z.number().min(0).default(1),
    ratePaise: z.number().int().min(0),
    discountPct: z.number().min(0).max(100).default(0),
    gstRateBps: z.number().int().min(0).max(5000).optional(),
    hsnSacCode: z.string().optional(),
  })).min(1),
});

/* POST /import/extract — extract price data from image/PDF via Gemini AI */
quotationRouter.post(
  '/import/extract',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw errors.validation('File is required');

    const ext = path.extname(file.originalname).toLowerCase();
    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.tiff': 'image/tiff',
    };
    const mimeType = mimeMap[ext];
    if (!mimeType) throw errors.validation('Supported formats: PDF, PNG, JPG, WEBP, GIF, BMP, TIFF');

    const fileData = fs.readFileSync(file.path);
    const extracted = await extractPriceListFromFile(fileData, mimeType);
    try { fs.unlinkSync(file.path); } catch { /* */ }

    const isFull = req.query.full === 'true';
    const sampleRows = isFull ? extracted.rows : extracted.rows.slice(0, 5);

    res.json({
      data: {
        sheets: [{
          name: file.originalname,
          headers: extracted.headers,
          sampleRows,
          totalRows: extracted.rows.length,
          ...(isFull ? { allRows: extracted.rows } : {}),
        }],
        source: 'ai',
      },
    });
  }),
);

/* POST /import — create or update quotation from mapped Excel data */
quotationRouter.post(
  '/import',
  validate({ body: ImportBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof ImportBody>;
    const actor = actorId(req);
    const isUpdate = req.query.mode === 'update' && body.quotationId;

    // Validate vendor
    const vendor = await prisma.vendor.findFirst({ where: { id: body.vendorId, deletedAt: null } });
    if (!vendor) throw errors.notFound('Vendor not found');

    const buildLines = (quotationId?: string) => body.lines.map((l, i) => {
      const gst = l.gstRateBps ?? body.defaultGstRateBps;
      const computed = computeLineTotal(l.qty, BigInt(l.ratePaise), l.discountPct, gst, 'INTRA');
      return {
        id: newId(),
        ...(quotationId ? { quotationId } : {}),
        itemId: null,
        description: l.description,
        uom: l.uom,
        qty: l.qty,
        ratePaise: BigInt(l.ratePaise),
        discountPct: l.discountPct,
        gstRateBps: gst,
        supplyType: 'INTRA',
        hsnSacCode: l.hsnSacCode ?? null,
        sortOrder: i,
        ...computed,
      };
    });

    if (isUpdate) {
      // Update existing quotation — replace all lines
      const existing = await prisma.vendorQuotation.findFirst({ where: { id: body.quotationId!, deletedAt: null } });
      if (!existing) throw errors.notFound('Quotation not found');

      const lineData = buildLines(existing.id);
      const totals = computeQuotationTotals(lineData);

      await prisma.$transaction(async (tx) => {
        await tx.vendorQuotationLine.deleteMany({ where: { quotationId: existing.id } });
        await tx.vendorQuotationLine.createMany({ data: lineData });
        await tx.vendorQuotation.update({
          where: { id: existing.id },
          data: { quotationDate: new Date(body.quotationDate), ...totals, updatedBy: actor },
        });
      });

      await recordAudit(req, { action: 'UPDATE', resourceType: 'vendor_quotation', resourceId: existing.id, after: { importedLines: body.lines.length } });
      res.json({ data: { id: existing.id, quotationNo: existing.quotationNo, linesImported: body.lines.length } });
    } else {
      // Create new quotation
      const quotationNo = await nextSequenceNo('QT');
      const lineData = buildLines();
      const totals = computeQuotationTotals(lineData);

      const quotation = await prisma.vendorQuotation.create({
        data: {
          id: newId(),
          quotationNo,
          vendorId: body.vendorId,
          referenceNo: null,
          quotationDate: new Date(body.quotationDate),
          ...totals,
          createdBy: actor,
          updatedBy: actor,
          lines: { create: lineData },
        },
      });

      await recordAudit(req, { action: 'CREATE', resourceType: 'vendor_quotation', resourceId: quotation.id, after: { quotationNo, importedLines: body.lines.length } });
      res.status(201).json({ data: { id: quotation.id, quotationNo, linesImported: body.lines.length } });
    }
  }),
);
