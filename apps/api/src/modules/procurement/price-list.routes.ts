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
import { uploadFile as storageUpload, downloadFileWithFallback } from '../../lib/dms-storage.js';
import { actorId, bn } from './shared.js';
import { extractPriceListFromFile } from '../../lib/gemini.js';

const TEMP_DIR = path.join(os.tmpdir(), 'govprojects-pricelists');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEMP_DIR),
    filename: (_req, file, cb) => cb(null, `${newId()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const priceListRouter: ExpressRouter = Router();
priceListRouter.use(requireAuth);

// ===== Schemas =====

const IdParams = z.object({ id: z.string().min(1).max(26) });
const optStr = (max = 255) => z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : v), z.string().max(max).optional());

const CreateBody = z.object({
  vendorId: z.string().min(1).max(26),
  name: z.string().min(1).max(255),
  priceDate: z.string(),
  status: z.enum(['ACTIVE', 'EXPIRED', 'SUPERSEDED']).default('ACTIVE'),
  notes: z.string().optional(),
});

const UpdateBody = CreateBody.partial();

const ListQuery = z.object({
  vendorId: z.string().optional(),
  status: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ===== Routes =====

/* GET / — list price lists */
priceListRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.vendorId) where.vendorId = q.vendorId;
    if (q.status) where.status = q.status;

    const take = q.limit + 1;
    const rows = await prisma.vendorPriceList.findMany({
      where,
      include: {
        vendor: { select: { id: true, name: true } },
        _count: { select: { items: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > q.limit;
    if (hasMore) rows.pop();

    res.json({
      data: rows.map((r) => ({
        id: r.id, vendorId: r.vendorId, vendorName: r.vendor.name,
        name: r.name, priceDate: r.priceDate.toISOString().slice(0, 10),
        status: r.status, itemCount: r._count.items,
        attachmentName: r.attachmentName,
      })),
      meta: { next_cursor: hasMore ? rows[rows.length - 1]!.id : null, limit: q.limit },
    });
  }),
);

/* GET /:id — single price list with items */
priceListRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.vendorPriceList.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        vendor: { select: { id: true, name: true } },
        items: {
          where: { deletedAt: null },
          include: { masterItem: { select: { id: true, sku: true, name: true, category: true } } },
          orderBy: { modelName: 'asc' },
        },
      },
    });
    if (!row) throw errors.notFound('Price list not found');

    res.json({
      data: {
        ...row,
        priceDate: row.priceDate.toISOString().slice(0, 10),
        items: row.items.map(i => ({
          id: i.id, masterItemId: i.masterItemId, masterItem: i.masterItem,
          oemPartNo: i.oemPartNo, modelName: i.modelName, brand: i.brand,
          description: i.description, unitPricePaise: bn(i.unitPricePaise),
          moq: i.moq, leadTimeDays: i.leadTimeDays, warranty: i.warranty,
          uom: i.uom, hsn: i.hsn, gstRateBps: i.gstRateBps, status: i.status,
        })),
      },
    });
  }),
);

/* POST / — create price list header */
priceListRouter.post(
  '/',
  validate({ body: CreateBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateBody>;
    const actor = actorId(req);

    const vendor = await prisma.vendor.findFirst({ where: { id: body.vendorId, deletedAt: null } });
    if (!vendor) throw errors.notFound('Vendor not found');

    const pl = await prisma.vendorPriceList.create({
      data: {
        id: newId(),
        vendorId: body.vendorId,
        name: body.name,
        priceDate: new Date(body.priceDate),
        status: body.status,
        notes: body.notes ?? null,
        createdBy: actor,
        updatedBy: actor,
      },
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'vendor_price_list', resourceId: pl.id });
    res.status(201).json({ data: { id: pl.id, name: pl.name } });
  }),
);

/* PATCH /:id — update price list */
priceListRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateBody }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.vendorPriceList.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Price list not found');
    const body = req.body as z.infer<typeof UpdateBody>;

    await prisma.vendorPriceList.update({
      where: { id: existing.id },
      data: {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.priceDate !== undefined ? { priceDate: new Date(body.priceDate!) } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.notes !== undefined ? { notes: body.notes ?? null } : {}),
        updatedBy: actorId(req),
      },
    });

    await recordAudit(req, { action: 'UPDATE', resourceType: 'vendor_price_list', resourceId: existing.id });
    res.json({ data: { id: existing.id } });
  }),
);

/* DELETE /:id — soft delete */
priceListRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.vendorPriceList.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Price list not found');
    await prisma.vendorPriceList.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'vendor_price_list', resourceId: existing.id });
    res.status(204).end();
  }),
);

/* POST /:id/attachment — upload Excel file */
priceListRouter.post(
  '/:id/attachment',
  validate({ params: IdParams }),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const existing = await prisma.vendorPriceList.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Price list not found');
    const file = req.file;
    if (!file) throw errors.validation('File is required');

    const result = await storageUpload(file, `pricelist:${existing.id}`);
    await prisma.vendorPriceList.update({
      where: { id: existing.id },
      data: { attachmentName: file.originalname, attachmentPath: result.storagePath },
    });

    res.json({ data: { attachmentName: file.originalname } });
  }),
);

// ===== Excel Import =====

/* POST /import/preview — parse Excel and return headers + sample rows */
priceListRouter.post(
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
    const sheets: Array<{ name: string; headers: string[]; sampleRows: unknown[][]; totalRows: number; allRows?: unknown[][] }> = [];
    const isFull = req.query.full === 'true';

    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name]!;
      const data = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });
      if (data.length === 0) continue;

      // Find header row — first row with ≥3 non-empty cells
      let headerIdx = 0;
      for (let i = 0; i < Math.min(data.length, 10); i++) {
        const row = data[i]!;
        const nonEmpty = (row as unknown[]).filter(c => c !== '' && c != null).length;
        if (nonEmpty >= 3) { headerIdx = i; break; }
      }

      const headers = (data[headerIdx] as unknown[]).map(h => String(h ?? '').trim());
      const dataRows = data.slice(headerIdx + 1).filter(r => (r as unknown[]).some(c => c !== '' && c != null));
      const sampleRows = isFull ? dataRows : dataRows.slice(0, 5);

      sheets.push({
        name, headers, sampleRows: sampleRows as unknown[][], totalRows: dataRows.length,
        ...(isFull ? { allRows: dataRows as unknown[][] } : {}),
      });
    }

    if (sheets.length === 0) throw errors.validation('No data found in the uploaded file');
    try { fs.unlinkSync(file.path); } catch { /* best effort */ }

    res.json({ data: { sheets } });
  }),
);

/* POST /import/extract — extract price list from image/PDF via Gemini AI */
priceListRouter.post(
  '/import/extract',
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const file = req.file;
    if (!file) throw errors.validation('File is required');

    const ext = path.extname(file.originalname).toLowerCase();
    const supportedExts = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tiff'];
    if (!supportedExts.includes(ext)) {
      throw errors.validation('Supported formats: PDF, PNG, JPG, WEBP, GIF, BMP, TIFF');
    }

    const mimeMap: Record<string, string> = {
      '.pdf': 'application/pdf', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
      '.webp': 'image/webp', '.gif': 'image/gif', '.bmp': 'image/bmp', '.tiff': 'image/tiff',
    };
    const mimeType = mimeMap[ext] || 'application/octet-stream';
    const fileData = fs.readFileSync(file.path);

    const extracted = await extractPriceListFromFile(fileData, mimeType);

    // Clean up temp file
    try { fs.unlinkSync(file.path); } catch { /* best effort */ }

    // Return in the same format as the Excel preview endpoint
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

/* POST /import — create/update OEM catalog items from mapped Excel data */
const ImportBody = z.object({
  vendorId: z.string().min(1).max(26),
  priceListId: z.string().max(26).optional(),       // existing price list to link to
  priceListName: z.string().max(255).optional(),     // or create a new one
  priceDate: z.string(),
  defaultGstRateBps: z.number().int().min(0).max(5000).default(0),
  defaultUom: z.string().max(16).default('NOS'),
  defaultMoq: z.number().int().min(1).default(1),
  items: z.array(z.object({
    masterItemId: z.string().min(1).max(26),
    oemPartNo: z.string().max(128).optional(),
    modelName: z.string().min(1).max(255),
    brand: z.string().max(128).optional(),
    description: z.string().optional(),
    unitPricePaise: z.number().int().min(0),
    uom: z.string().max(16).optional(),
    hsn: z.string().max(16).optional(),
    gstRateBps: z.number().int().min(0).max(5000).optional(),
    warranty: z.string().max(128).optional(),
    moq: z.number().int().min(1).optional(),
    leadTimeDays: z.number().int().min(0).optional(),
  })).min(1),
});

priceListRouter.post(
  '/import',
  validate({ body: ImportBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof ImportBody>;
    const actor = actorId(req);

    // Validate vendor
    const vendor = await prisma.vendor.findFirst({ where: { id: body.vendorId, deletedAt: null } });
    if (!vendor) throw errors.notFound('Vendor not found');

    // Get or create price list
    let priceListId = body.priceListId;
    if (!priceListId) {
      const pl = await prisma.vendorPriceList.create({
        data: {
          id: newId(),
          vendorId: body.vendorId,
          name: body.priceListName || `${vendor.name} Price List`,
          priceDate: new Date(body.priceDate),
          createdBy: actor,
          updatedBy: actor,
        },
      });
      priceListId = pl.id;
    }

    let created = 0;
    let updated = 0;

    for (const item of body.items) {
      const gst = item.gstRateBps ?? body.defaultGstRateBps;
      const uom = item.uom || body.defaultUom;
      const moq = item.moq ?? body.defaultMoq;

      // Try to find existing by vendor + part no
      let existing: { id: string } | null = null;
      if (item.oemPartNo) {
        existing = await prisma.oemCatalogItem.findFirst({
          where: { vendorId: body.vendorId, oemPartNo: item.oemPartNo, deletedAt: null },
          select: { id: true },
        });
      }

      if (existing) {
        // Update price + details
        await prisma.oemCatalogItem.update({
          where: { id: existing.id },
          data: {
            masterItemId: item.masterItemId,
            priceListId,
            modelName: item.modelName,
            brand: item.brand ?? undefined,
            description: item.description ?? undefined,
            unitPricePaise: BigInt(item.unitPricePaise),
            uom, hsn: item.hsn ?? undefined, gstRateBps: gst,
            moq, leadTimeDays: item.leadTimeDays ?? undefined,
            warranty: item.warranty ?? undefined,
            validFrom: new Date(body.priceDate),
            updatedBy: actor,
          },
        });
        updated++;
      } else {
        await prisma.oemCatalogItem.create({
          data: {
            id: newId(),
            masterItemId: item.masterItemId,
            vendorId: body.vendorId,
            priceListId,
            oemPartNo: item.oemPartNo ?? null,
            modelName: item.modelName,
            brand: item.brand ?? null,
            description: item.description ?? null,
            unitPricePaise: BigInt(item.unitPricePaise),
            uom, hsn: item.hsn ?? null, gstRateBps: gst,
            moq, leadTimeDays: item.leadTimeDays ?? null,
            warranty: item.warranty ?? null,
            validFrom: new Date(body.priceDate),
            createdBy: actor,
            updatedBy: actor,
          },
        });
        created++;
      }
    }

    await recordAudit(req, { action: 'CREATE', resourceType: 'vendor_price_list_import', resourceId: priceListId, after: { created, updated } });
    res.status(201).json({ data: { priceListId, created, updated, total: body.items.length } });
  }),
);
