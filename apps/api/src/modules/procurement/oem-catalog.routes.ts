import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';
import { actorId, bn } from './shared.js';

export const oemCatalogRouter: ExpressRouter = Router();
oemCatalogRouter.use(requireAuth);

// ===== Schemas =====

const IdParams = z.object({ id: z.string().min(1).max(26) });

const ListQuery = z.object({
  masterItemId: z.string().optional(),
  vendorId: z.string().optional(),
  priceListId: z.string().optional(),
  brand: z.string().optional(),
  status: z.string().optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

const optStr = (max = 255) => z.preprocess((v) => (v === '' || v === null || v === undefined ? undefined : v), z.string().max(max).optional());

const CreateBody = z.object({
  masterItemId: z.string().min(1).max(26),
  vendorId: z.string().min(1).max(26),
  priceListId: optStr(26),
  oemPartNo: optStr(128),
  modelName: z.string().min(1).max(255),
  brand: optStr(128),
  description: z.string().optional(),
  specifications: z.any().optional(),
  unitPricePaise: z.number().int().min(0),
  moq: z.number().int().min(1).default(1),
  leadTimeDays: z.number().int().min(0).optional(),
  warranty: optStr(128),
  uom: z.string().max(16).default('NOS'),
  hsn: optStr(16),
  gstRateBps: z.number().int().min(0).max(5000).default(0),
  validFrom: z.string().optional(),
  validTo: z.string().optional(),
});

const UpdateBody = CreateBody.partial();

// ===== Routes =====

/* GET / — list OEM catalog items */
oemCatalogRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.masterItemId) where.masterItemId = q.masterItemId;
    if (q.vendorId) where.vendorId = q.vendorId;
    if (q.priceListId) where.priceListId = q.priceListId;
    if (q.brand) where.brand = q.brand;
    if (q.status) where.status = q.status;
    if (q.q) {
      where.OR = [
        { modelName: { contains: q.q } },
        { oemPartNo: { contains: q.q } },
        { description: { contains: q.q } },
        { brand: { contains: q.q } },
      ];
    }

    const take = q.limit + 1;
    const rows = await prisma.oemCatalogItem.findMany({
      where,
      include: {
        masterItem: { select: { id: true, sku: true, name: true, category: true } },
        vendor: { select: { id: true, name: true } },
        priceList: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > q.limit;
    if (hasMore) rows.pop();

    res.json({
      data: rows.map((r) => ({
        id: r.id, masterItemId: r.masterItemId, vendorId: r.vendorId,
        masterItem: r.masterItem, vendor: r.vendor, priceList: r.priceList,
        oemPartNo: r.oemPartNo, modelName: r.modelName, brand: r.brand,
        description: r.description, unitPricePaise: bn(r.unitPricePaise),
        moq: r.moq, leadTimeDays: r.leadTimeDays, warranty: r.warranty,
        uom: r.uom, hsn: r.hsn, gstRateBps: r.gstRateBps,
        validFrom: r.validFrom?.toISOString().slice(0, 10) ?? null,
        validTo: r.validTo?.toISOString().slice(0, 10) ?? null,
        status: r.status,
      })),
      meta: { next_cursor: hasMore ? rows[rows.length - 1]!.id : null, limit: q.limit },
    });
  }),
);

/* GET /by-master-item/:masterItemId — all OEM options for a master item */
oemCatalogRouter.get(
  '/by-master-item/:masterItemId',
  asyncHandler(async (req, res) => {
    const masterItemId = req.params.masterItemId as string;
    const rows = await prisma.oemCatalogItem.findMany({
      where: { masterItemId, status: 'ACTIVE', deletedAt: null },
      include: {
        vendor: { select: { id: true, name: true, isOem: true } },
        priceList: { select: { id: true, name: true, priceDate: true } },
      },
      orderBy: { unitPricePaise: 'asc' },
    });

    res.json({
      data: rows.map((r) => ({
        id: r.id, vendorId: r.vendorId, vendor: r.vendor, priceList: r.priceList ? { ...r.priceList, priceDate: r.priceList.priceDate.toISOString().slice(0, 10) } : null,
        oemPartNo: r.oemPartNo, modelName: r.modelName, brand: r.brand,
        description: r.description, specifications: r.specifications,
        unitPricePaise: bn(r.unitPricePaise), moq: r.moq,
        leadTimeDays: r.leadTimeDays, warranty: r.warranty,
        uom: r.uom, hsn: r.hsn, gstRateBps: r.gstRateBps,
        validFrom: r.validFrom?.toISOString().slice(0, 10) ?? null,
        validTo: r.validTo?.toISOString().slice(0, 10) ?? null,
        status: r.status,
      })),
    });
  }),
);

/* GET /:id — single OEM catalog item */
oemCatalogRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.oemCatalogItem.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        masterItem: { select: { id: true, sku: true, name: true, category: true } },
        vendor: { select: { id: true, name: true } },
        priceList: { select: { id: true, name: true } },
      },
    });
    if (!row) throw errors.notFound('OEM catalog item not found');

    res.json({
      data: {
        ...row,
        unitPricePaise: bn(row.unitPricePaise),
        validFrom: row.validFrom?.toISOString().slice(0, 10) ?? null,
        validTo: row.validTo?.toISOString().slice(0, 10) ?? null,
      },
    });
  }),
);

/* POST / — create OEM catalog item */
oemCatalogRouter.post(
  '/',
  validate({ body: CreateBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateBody>;
    const actor = actorId(req);

    // Validate refs
    const [masterItem, vendor] = await Promise.all([
      prisma.item.findFirst({ where: { id: body.masterItemId, deletedAt: null } }),
      prisma.vendor.findFirst({ where: { id: body.vendorId, deletedAt: null } }),
    ]);
    if (!masterItem) throw errors.notFound('Master item not found');
    if (!vendor) throw errors.notFound('Vendor not found');

    // Check duplicate OEM part number for same vendor
    if (body.oemPartNo) {
      const dup = await prisma.oemCatalogItem.findFirst({
        where: { vendorId: body.vendorId, oemPartNo: body.oemPartNo, deletedAt: null },
      });
      if (dup) throw errors.conflict(`OEM Part No "${body.oemPartNo}" already exists for this vendor`);
    }

    const item = await prisma.oemCatalogItem.create({
      data: {
        id: newId(),
        masterItemId: body.masterItemId,
        vendorId: body.vendorId,
        priceListId: body.priceListId ?? null,
        oemPartNo: body.oemPartNo ?? null,
        modelName: body.modelName,
        brand: body.brand ?? null,
        description: body.description ?? null,
        specifications: body.specifications ?? undefined,
        unitPricePaise: BigInt(body.unitPricePaise),
        moq: body.moq,
        leadTimeDays: body.leadTimeDays ?? null,
        warranty: body.warranty ?? null,
        uom: body.uom,
        hsn: body.hsn ?? null,
        gstRateBps: body.gstRateBps,
        validFrom: body.validFrom ? new Date(body.validFrom) : null,
        validTo: body.validTo ? new Date(body.validTo) : null,
        createdBy: actor,
        updatedBy: actor,
      },
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'oem_catalog_item', resourceId: item.id });
    res.status(201).json({ data: { id: item.id, modelName: item.modelName } });
  }),
);

/* PATCH /:id — update OEM catalog item */
oemCatalogRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateBody }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.oemCatalogItem.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('OEM catalog item not found');

    const body = req.body as z.infer<typeof UpdateBody>;
    const actor = actorId(req);

    // Check part no uniqueness if changing
    if (body.oemPartNo && body.oemPartNo !== existing.oemPartNo) {
      const vendorId = body.vendorId ?? existing.vendorId;
      const dup = await prisma.oemCatalogItem.findFirst({
        where: { vendorId, oemPartNo: body.oemPartNo, deletedAt: null, NOT: { id: existing.id } },
      });
      if (dup) throw errors.conflict(`OEM Part No "${body.oemPartNo}" already exists for this vendor`);
    }

    const updated = await prisma.oemCatalogItem.update({
      where: { id: existing.id },
      data: {
        ...(body.masterItemId !== undefined ? { masterItemId: body.masterItemId } : {}),
        ...(body.vendorId !== undefined ? { vendorId: body.vendorId } : {}),
        ...(body.priceListId !== undefined ? { priceListId: body.priceListId ?? null } : {}),
        ...(body.oemPartNo !== undefined ? { oemPartNo: body.oemPartNo ?? null } : {}),
        ...(body.modelName !== undefined ? { modelName: body.modelName } : {}),
        ...(body.brand !== undefined ? { brand: body.brand ?? null } : {}),
        ...(body.description !== undefined ? { description: body.description ?? null } : {}),
        ...(body.specifications !== undefined ? { specifications: body.specifications ?? undefined } : {}),
        ...(body.unitPricePaise !== undefined ? { unitPricePaise: BigInt(body.unitPricePaise) } : {}),
        ...(body.moq !== undefined ? { moq: body.moq } : {}),
        ...(body.leadTimeDays !== undefined ? { leadTimeDays: body.leadTimeDays ?? null } : {}),
        ...(body.warranty !== undefined ? { warranty: body.warranty ?? null } : {}),
        ...(body.uom !== undefined ? { uom: body.uom } : {}),
        ...(body.hsn !== undefined ? { hsn: body.hsn ?? null } : {}),
        ...(body.gstRateBps !== undefined ? { gstRateBps: body.gstRateBps } : {}),
        ...(body.validFrom !== undefined ? { validFrom: body.validFrom ? new Date(body.validFrom) : null } : {}),
        ...(body.validTo !== undefined ? { validTo: body.validTo ? new Date(body.validTo) : null } : {}),
        updatedBy: actor,
      },
    });

    await recordAudit(req, { action: 'UPDATE', resourceType: 'oem_catalog_item', resourceId: existing.id });
    res.json({ data: { id: updated.id, modelName: updated.modelName } });
  }),
);

/* DELETE /:id — soft delete */
oemCatalogRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.oemCatalogItem.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('OEM catalog item not found');
    await prisma.oemCatalogItem.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'oem_catalog_item', resourceId: existing.id });
    res.status(204).end();
  }),
);

/* GET /brands — distinct brands for filter dropdown */
oemCatalogRouter.get(
  '/meta/brands',
  asyncHandler(async (_req, res) => {
    const brands = await prisma.oemCatalogItem.findMany({
      where: { deletedAt: null, brand: { not: null } },
      select: { brand: true },
      distinct: ['brand'],
      orderBy: { brand: 'asc' },
    });
    res.json({ data: brands.map(b => b.brand).filter(Boolean) });
  }),
);
