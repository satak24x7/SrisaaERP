import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import multer from 'multer';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';
import { actorId, bn, nextSequenceNo } from './shared.js';
import { uploadFile as storageUpload, downloadFileWithFallback, deleteFileWithFallback } from '../../lib/dms-storage.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 10 * 1024 * 1024 } });

export const vendorRouter: ExpressRouter = Router();
vendorRouter.use(requireAuth);

// ===== Schemas =====

const IdParams = z.object({ id: z.string().min(1).max(26) });

// Coerce empty/null/undefined to undefined so optional fields pass cleanly
const optStr = (max = 255) => z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.string().max(max).optional(),
);
const optEmail = () => z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : v),
  z.string().email().max(255).optional(),
);
const optInt = () => z.preprocess(
  (v) => {
    if (v === '' || v === null || v === undefined) return undefined;
    const n = typeof v === 'string' ? parseInt(v, 10) : v;
    return isNaN(n as number) ? undefined : n;
  },
  z.number().int().min(0).optional(),
);

// GSTIN validation: 15-char format with checksum
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[A-Z0-9]{1}Z[A-Z0-9]{1}$/;
const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

const gstinSchema = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : typeof v === 'string' ? v.toUpperCase().trim() : v),
  z.string().max(16).refine((v) => GSTIN_REGEX.test(v), { message: 'Invalid GSTIN format' }).optional(),
);
const panSchema = z.preprocess(
  (v) => (v === '' || v === null || v === undefined ? undefined : typeof v === 'string' ? v.toUpperCase().trim() : v),
  z.string().max(10).refine((v) => PAN_REGEX.test(v), { message: 'Invalid PAN format (expected ABCDE1234F)' }).optional(),
);

const CreateVendorBody = z.object({
  name: z.preprocess((v) => (typeof v === 'string' ? v.trim() : v), z.string().min(1).max(255)),
  gstin: gstinSchema,
  pan: panSchema,
  category: optStr(128),
  contactName: optStr(255),
  email: optEmail(),
  phone: optStr(32),
  address: optStr(5000),
  city: optStr(128),
  state: optStr(64),
  pincode: optStr(10),
  bankAccountName: optStr(255),
  bankAccountNo: optStr(64),
  bankIfsc: optStr(16),
  bankBranch: optStr(255),
  paymentTermsDays: optInt(),
  rating: optInt(),
  notes: optStr(5000),
  status: z.string().optional(),
  // KYC fields
  msmeNumber: optStr(32),
  msmeCategory: z.enum(['MICRO', 'SMALL', 'MEDIUM']).optional(),
  tdsSection: optStr(8),
  defaultTdsRateBps: optInt(),
  isOem: z.boolean().optional(),
  oemPrincipals: optStr(500),
});

const UpdateVendorBody = CreateVendorBody.partial().extend({
  status: z.enum(['ACTIVE', 'INACTIVE']).optional(),
});

const ListQuery = z.object({
  q: z.string().optional(),
  category: z.string().optional(),
  status: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ===== Routes =====

/* GET / — list vendors */
vendorRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.status) where.status = q.status;
    if (q.category) where.category = q.category;
    if (q.q) where.name = { contains: q.q };

    const take = q.limit + 1;
    const rows = await prisma.vendor.findMany({
      where,
      orderBy: { name: 'asc' },
      take,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > q.limit;
    if (hasMore) rows.pop();

    res.json({
      data: rows.map((r) => ({
        id: r.id, name: r.name, gstin: r.gstin, pan: r.pan,
        category: r.category, contactName: r.contactName,
        email: r.email, phone: r.phone, city: r.city, state: r.state,
        rating: r.rating, status: r.status,
        paymentTermsDays: r.paymentTermsDays,
      })),
      meta: { next_cursor: hasMore ? rows[rows.length - 1]!.id : null, limit: q.limit },
    });
  }),
);

/* GET /:id — single vendor with KYC data */
vendorRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        documents: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
        bankDetails: { where: { deletedAt: null }, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!vendor) throw errors.notFound('Vendor not found');
    res.json({ data: vendor });
  }),
);

/* POST / — create vendor */
vendorRouter.post(
  '/',
  validate({ body: CreateVendorBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateVendorBody>;
    const actor = actorId(req);

    // Duplicate GSTIN detection
    if (body.gstin) {
      const dup = await prisma.vendor.findFirst({ where: { gstin: body.gstin, deletedAt: null } });
      if (dup) throw errors.conflict(`Vendor with GSTIN ${body.gstin} already exists: ${dup.name} (${dup.id})`);
    }
    // Duplicate PAN detection
    if (body.pan) {
      const dup = await prisma.vendor.findFirst({ where: { pan: body.pan, deletedAt: null } });
      if (dup) throw errors.conflict(`Vendor with PAN ${body.pan} already exists: ${dup.name} (${dup.id})`);
    }

    const vendorCode = await nextSequenceNo('VND');
    const { status: _ignoreStatus, ...rest } = body;
    const vendor = await prisma.vendor.create({
      data: { id: newId(), vendorCode, ...rest, kycStatus: 'DRAFT', createdBy: actor, updatedBy: actor },
    });
    await recordAudit(req, { action: 'CREATE', resourceType: 'vendor', resourceId: vendor.id, after: { name: vendor.name, vendorCode } });
    res.status(201).json({ data: vendor });
  }),
);

/* PATCH /:id — update vendor */
vendorRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateVendorBody }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.vendor.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Vendor not found');
    const body = req.body as z.infer<typeof UpdateVendorBody>;
    const vendor = await prisma.vendor.update({
      where: { id: existing.id },
      data: { ...body, updatedBy: actorId(req) },
    });
    await recordAudit(req, { action: 'UPDATE', resourceType: 'vendor', resourceId: vendor.id, before: { name: existing.name }, after: { name: vendor.name } });
    res.json({ data: vendor });
  }),
);

/* DELETE /:id — soft delete */
vendorRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.vendor.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!existing) throw errors.notFound('Vendor not found');

    // Check references
    const poCount = await prisma.purchaseOrder.count({ where: { vendorId: existing.id, deletedAt: null } });
    if (poCount > 0) throw errors.conflict(`Vendor has ${poCount} purchase order(s). Cannot delete.`);

    await prisma.vendor.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'vendor', resourceId: existing.id, before: { name: existing.name } });
    res.status(204).end();
  }),
);

// ==========================================================================
// KYC Document Management
// ==========================================================================

const VendorDocTypes = ['GST_CERT', 'PAN_CARD', 'MSME', 'CANCELLED_CHEQUE', 'NDA', 'ISO', 'OEM_AUTH', 'COMPANY_REG', 'OTHER'] as const;

const DocIdParams = z.object({ id: z.string().min(1).max(26), docId: z.string().min(1).max(26) });

/* GET /:id/documents — list vendor documents */
vendorRouter.get(
  '/:id/documents',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!vendor) throw errors.notFound('Vendor not found');
    const docs = await prisma.vendorDocument.findMany({
      where: { vendorId: vendor.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: docs });
  }),
);

/* POST /:id/documents — upload KYC document */
vendorRouter.post(
  '/:id/documents',
  validate({ params: IdParams }),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!vendor) throw errors.notFound('Vendor not found');

    const file = req.file;
    if (!file) throw errors.validation('File is required');

    const docType = (req.body as Record<string, unknown>).docType as string;
    if (!docType || !VendorDocTypes.includes(docType as typeof VendorDocTypes[number])) {
      throw errors.validation('Invalid document type', { valid: VendorDocTypes });
    }
    const expiresAt = (req.body as Record<string, unknown>).expiresAt as string | undefined;

    const result = await storageUpload(file, `vendor:${vendor.id}`);
    const actor = actorId(req);

    const doc = await prisma.vendorDocument.create({
      data: {
        id: newId(),
        vendorId: vendor.id,
        docType,
        fileName: file.originalname,
        mimeType: file.mimetype,
        fileSize: file.size,
        storagePath: result.storagePath,
        expiresAt: expiresAt ? new Date(expiresAt) : null,
        createdBy: actor,
      },
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'vendor_document', resourceId: doc.id, after: { vendorId: vendor.id, docType } });
    res.status(201).json({ data: doc });
  }),
);

/* DELETE /:id/documents/:docId */
vendorRouter.delete(
  '/:id/documents/:docId',
  validate({ params: DocIdParams }),
  asyncHandler(async (req, res) => {
    const doc = await prisma.vendorDocument.findFirst({
      where: { id: req.params.docId as string, vendorId: req.params.id as string, deletedAt: null },
    });
    if (!doc) throw errors.notFound('Document not found');

    await prisma.vendorDocument.update({ where: { id: doc.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'vendor_document', resourceId: doc.id, before: { docType: doc.docType, fileName: doc.fileName } });
    res.status(204).end();
  }),
);

// ==========================================================================
// Bank Detail Management (dual-control verification)
// ==========================================================================

const BankDetailBody = z.object({
  accountName: z.string().min(1).max(255),
  accountNo: z.string().min(1).max(64),
  ifsc: z.string().min(1).max(16),
  branch: optStr(255),
  isPrimary: z.boolean().default(false),
});

const BankIdParams = z.object({ id: z.string().min(1).max(26), bdId: z.string().min(1).max(26) });

/* GET /:id/bank-details — list */
vendorRouter.get(
  '/:id/bank-details',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!vendor) throw errors.notFound('Vendor not found');
    const details = await prisma.vendorBankDetail.findMany({
      where: { vendorId: vendor.id, deletedAt: null },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: details });
  }),
);

/* POST /:id/bank-details — add */
vendorRouter.post(
  '/:id/bank-details',
  validate({ params: IdParams, body: BankDetailBody }),
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!vendor) throw errors.notFound('Vendor not found');
    const body = req.body as z.infer<typeof BankDetailBody>;
    const actor = actorId(req);

    // If isPrimary, unset others
    if (body.isPrimary) {
      await prisma.vendorBankDetail.updateMany({
        where: { vendorId: vendor.id, deletedAt: null, isPrimary: true },
        data: { isPrimary: false },
      });
    }

    const bd = await prisma.vendorBankDetail.create({
      data: { id: newId(), vendorId: vendor.id, ...body, createdBy: actor },
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'vendor_bank_detail', resourceId: bd.id, after: { vendorId: vendor.id, ifsc: bd.ifsc } });
    res.status(201).json({ data: bd });
  }),
);

/* PATCH /:id/bank-details/:bdId — update */
vendorRouter.patch(
  '/:id/bank-details/:bdId',
  validate({ params: BankIdParams, body: BankDetailBody.partial() }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.vendorBankDetail.findFirst({
      where: { id: req.params.bdId as string, vendorId: req.params.id as string, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Bank detail not found');

    // Reset verification on edit (data changed, must re-verify)
    const body = req.body as Partial<z.infer<typeof BankDetailBody>>;
    const bd = await prisma.vendorBankDetail.update({
      where: { id: existing.id },
      data: { ...body, verifiedByUserId: null, verifiedAt: null },
    });

    res.json({ data: bd });
  }),
);

/* POST /:id/bank-details/:bdId/verify — dual-control verify */
vendorRouter.post(
  '/:id/bank-details/:bdId/verify',
  validate({ params: BankIdParams }),
  asyncHandler(async (req, res) => {
    const bd = await prisma.vendorBankDetail.findFirst({
      where: { id: req.params.bdId as string, vendorId: req.params.id as string, deletedAt: null },
    });
    if (!bd) throw errors.notFound('Bank detail not found');

    const actor = actorId(req);
    // Dual-control: verifier must be different from creator
    if (actor === bd.createdBy) {
      throw errors.businessRule('SELF_VERIFY_FORBIDDEN', 'Cannot verify bank details you entered. A different user must verify.');
    }

    if (bd.verifiedAt) {
      throw errors.businessRule('ALREADY_VERIFIED', 'Bank detail is already verified');
    }

    const updated = await prisma.vendorBankDetail.update({
      where: { id: bd.id },
      data: { verifiedByUserId: actor, verifiedAt: new Date() },
    });

    await recordAudit(req, { action: 'VERIFY', resourceType: 'vendor_bank_detail', resourceId: bd.id, after: { verifiedByUserId: actor } });
    res.json({ data: updated });
  }),
);

/* DELETE /:id/bank-details/:bdId */
vendorRouter.delete(
  '/:id/bank-details/:bdId',
  validate({ params: BankIdParams }),
  asyncHandler(async (req, res) => {
    const bd = await prisma.vendorBankDetail.findFirst({
      where: { id: req.params.bdId as string, vendorId: req.params.id as string, deletedAt: null },
    });
    if (!bd) throw errors.notFound('Bank detail not found');

    await prisma.vendorBankDetail.update({ where: { id: bd.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'vendor_bank_detail', resourceId: bd.id });
    res.status(204).end();
  }),
);

// ==========================================================================
// KYC Status Transitions
// ==========================================================================

const KycTransitionBody = z.object({
  reason: z.string().optional(),
});

/* POST /:id/submit-kyc — DRAFT → KYC_PENDING */
vendorRouter.post(
  '/:id/submit-kyc',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!vendor) throw errors.notFound('Vendor not found');
    if (vendor.kycStatus !== 'DRAFT') {
      throw errors.businessRule('INVALID_TRANSITION', `Cannot submit KYC from status: ${vendor.kycStatus}`);
    }
    // Must have at least GSTIN or PAN
    if (!vendor.gstin && !vendor.pan) {
      throw errors.businessRule('KYC_INCOMPLETE', 'GSTIN or PAN is required before submitting KYC');
    }

    const updated = await prisma.vendor.update({
      where: { id: vendor.id },
      data: { kycStatus: 'KYC_PENDING', updatedBy: actorId(req) },
    });
    await recordAudit(req, { action: 'SUBMIT_KYC', resourceType: 'vendor', resourceId: vendor.id, before: { kycStatus: 'DRAFT' }, after: { kycStatus: 'KYC_PENDING' } });
    res.json({ data: updated });
  }),
);

/* POST /:id/activate — KYC_PENDING → ACTIVE (requires docs + verified bank) */
vendorRouter.post(
  '/:id/activate',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!vendor) throw errors.notFound('Vendor not found');
    if (vendor.kycStatus !== 'KYC_PENDING') {
      throw errors.businessRule('INVALID_TRANSITION', `Cannot activate from status: ${vendor.kycStatus}`);
    }

    // Check required KYC docs exist
    const docs = await prisma.vendorDocument.findMany({
      where: { vendorId: vendor.id, deletedAt: null },
      select: { docType: true },
    });
    const docTypes = new Set(docs.map((d) => d.docType));
    const requiredDocs = ['GST_CERT', 'PAN_CARD', 'CANCELLED_CHEQUE'];
    const missingDocs = requiredDocs.filter((d) => !docTypes.has(d));
    if (missingDocs.length > 0) {
      throw errors.businessRule('KYC_DOCS_MISSING', `Missing required documents: ${missingDocs.join(', ')}`);
    }

    // Check at least one verified bank detail
    const verifiedBank = await prisma.vendorBankDetail.count({
      where: { vendorId: vendor.id, deletedAt: null, verifiedAt: { not: null } },
    });
    if (verifiedBank === 0) {
      throw errors.businessRule('BANK_NOT_VERIFIED', 'At least one bank detail must be verified before activation');
    }

    const updated = await prisma.vendor.update({
      where: { id: vendor.id },
      data: { kycStatus: 'ACTIVE', status: 'ACTIVE', updatedBy: actorId(req) },
    });
    await recordAudit(req, { action: 'ACTIVATE', resourceType: 'vendor', resourceId: vendor.id, before: { kycStatus: 'KYC_PENDING' }, after: { kycStatus: 'ACTIVE' } });
    res.json({ data: updated });
  }),
);

/* POST /:id/block — ACTIVE → BLOCKED */
vendorRouter.post(
  '/:id/block',
  validate({ params: IdParams, body: KycTransitionBody }),
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!vendor) throw errors.notFound('Vendor not found');
    if (vendor.kycStatus !== 'ACTIVE') {
      throw errors.businessRule('INVALID_TRANSITION', `Cannot block from status: ${vendor.kycStatus}`);
    }
    const body = req.body as z.infer<typeof KycTransitionBody>;

    const updated = await prisma.vendor.update({
      where: { id: vendor.id },
      data: { kycStatus: 'BLOCKED', status: 'INACTIVE', kycBlockReason: body.reason ?? null, updatedBy: actorId(req) },
    });
    await recordAudit(req, { action: 'BLOCK', resourceType: 'vendor', resourceId: vendor.id, before: { kycStatus: 'ACTIVE' }, after: { kycStatus: 'BLOCKED', reason: body.reason } });
    res.json({ data: updated });
  }),
);

/* POST /:id/unblock — BLOCKED → ACTIVE */
vendorRouter.post(
  '/:id/unblock',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const vendor = await prisma.vendor.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!vendor) throw errors.notFound('Vendor not found');
    if (vendor.kycStatus !== 'BLOCKED') {
      throw errors.businessRule('INVALID_TRANSITION', `Cannot unblock from status: ${vendor.kycStatus}`);
    }

    const updated = await prisma.vendor.update({
      where: { id: vendor.id },
      data: { kycStatus: 'ACTIVE', status: 'ACTIVE', kycBlockReason: null, updatedBy: actorId(req) },
    });
    await recordAudit(req, { action: 'UNBLOCK', resourceType: 'vendor', resourceId: vendor.id, before: { kycStatus: 'BLOCKED' }, after: { kycStatus: 'ACTIVE' } });
    res.json({ data: updated });
  }),
);
