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
import { actorId, bn, nextSequenceNo } from './shared.js';
import { Decimal } from '@prisma/client/runtime/library.js';

const TEMP_DIR = path.join(os.tmpdir(), 'govprojects-grn-docs');
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, TEMP_DIR),
    filename: (_req, file, cb) => cb(null, `${newId()}${path.extname(file.originalname)}`),
  }),
  limits: { fileSize: 25 * 1024 * 1024 },
});

export const grnRouter: ExpressRouter = Router();
grnRouter.use(requireAuth);

// ===== Schemas =====

const IdParams = z.object({ id: z.string().min(1).max(26) });

const GrnLineSchema = z.object({
  poLineId: z.string().min(1).max(26),
  qtyReceived: z.number().min(0),
  qtyAccepted: z.number().min(0),
  qtyRejected: z.number().min(0).default(0),
  rejectionReason: z.string().max(500).optional(),
});

const CreateBody = z.object({
  poId: z.string().min(1).max(26),
  receivedDate: z.string(), // YYYY-MM-DD
  warehouseNote: z.string().max(255).optional(),
  notes: z.string().optional(),
  lines: z.array(GrnLineSchema).min(1),
});

const ListQuery = z.object({
  poId: z.string().optional(),
  qualityStatus: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

// ===== Routes =====

/* GET / — list GRNs */
grnRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as z.infer<typeof ListQuery>;
    const where: Record<string, unknown> = { deletedAt: null };
    if (q.poId) where.poId = q.poId;
    if (q.qualityStatus) where.qualityStatus = q.qualityStatus;

    const take = q.limit + 1;
    const rows = await prisma.grn.findMany({
      where,
      include: {
        po: { select: { id: true, poNo: true, vendor: { select: { name: true } } } },
        _count: { select: { lines: true } },
      },
      orderBy: { createdAt: 'desc' },
      take,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });

    const hasMore = rows.length > q.limit;
    if (hasMore) rows.pop();

    res.json({
      data: rows.map((r) => ({
        id: r.id, grnNo: r.grnNo, poId: r.poId, poNo: r.po.poNo,
        vendorName: r.po.vendor.name,
        receivedDate: r.receivedDate.toISOString().slice(0, 10),
        qualityStatus: r.qualityStatus, lineCount: r._count.lines,
        createdAt: r.createdAt.toISOString(),
      })),
      meta: { next_cursor: hasMore ? rows[rows.length - 1]!.id : null, limit: q.limit },
    });
  }),
);

/* GET /:id — single GRN with lines */
grnRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const row = await prisma.grn.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      include: {
        po: {
          select: {
            id: true, poNo: true, poType: true, projectId: true, budgetLineId: true,
            vendor: { select: { id: true, name: true } },
            lines: { where: { deletedAt: null }, select: { id: true, description: true, uom: true, qty: true, qtyReceived: true, qtyAccepted: true, ratePaise: true } },
          },
        },
        lines: {
          include: { poLine: { select: { id: true, description: true, uom: true, qty: true, ratePaise: true } } },
        },
        documents: true,
      },
    });
    if (!row) throw errors.notFound('GRN not found');

    res.json({
      data: {
        id: row.id, grnNo: row.grnNo, poId: row.poId, po: {
          id: row.po.id, poNo: row.po.poNo, poType: row.po.poType,
          vendorName: row.po.vendor.name,
          lines: row.po.lines.map((l) => ({
            id: l.id, description: l.description, uom: l.uom,
            qty: Number(l.qty), qtyReceived: Number(l.qtyReceived), qtyAccepted: Number(l.qtyAccepted),
            pendingQty: Number(l.qty) - Number(l.qtyReceived),
            ratePaise: bn(l.ratePaise),
          })),
        },
        receivedDate: row.receivedDate.toISOString().slice(0, 10),
        receivedById: row.receivedById, warehouseNote: row.warehouseNote,
        qualityStatus: row.qualityStatus, notes: row.notes,
        lines: row.lines.map((l) => ({
          id: l.id, poLineId: l.poLineId,
          poLineDescription: l.poLine.description,
          qtyReceived: Number(l.qtyReceived), qtyAccepted: Number(l.qtyAccepted),
          qtyRejected: Number(l.qtyRejected), rejectionReason: l.rejectionReason,
        })),
        documents: row.documents.map((d) => ({
          id: d.id, name: d.name, fileName: d.fileName, mimeType: d.mimeType, fileSize: d.fileSize,
        })),
        createdAt: row.createdAt.toISOString(),
      },
    });
  }),
);

/* POST / — create GRN with lines */
grnRouter.post(
  '/',
  validate({ body: CreateBody }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateBody>;
    const actor = actorId(req);

    // Validate PO exists and is in receivable state
    const po = await prisma.purchaseOrder.findFirst({
      where: { id: body.poId, deletedAt: null },
      include: { lines: { where: { deletedAt: null } } },
    });
    if (!po) throw errors.notFound('Purchase Order not found');
    if (!['ISSUED', 'PARTIALLY_RECEIVED'].includes(po.status)) {
      throw errors.conflict(`Cannot create GRN for PO in ${po.status} status`);
    }

    // Validate lines: received qty must not exceed pending qty
    for (const gl of body.lines) {
      const poLine = po.lines.find((l) => l.id === gl.poLineId);
      if (!poLine) throw errors.validation(`PO line ${gl.poLineId} not found`);
      const pending = Number(poLine.qty) - Number(poLine.qtyReceived);
      if (gl.qtyReceived > pending) {
        throw errors.validation(`Received qty (${gl.qtyReceived}) exceeds pending qty (${pending}) for ${poLine.description}`);
      }
      if (gl.qtyAccepted > gl.qtyReceived) {
        throw errors.validation(`Accepted qty cannot exceed received qty for ${poLine.description}`);
      }
    }

    const grnNo = await nextSequenceNo('GRN');

    // Determine quality status
    const totalRejected = body.lines.reduce((s, l) => s + l.qtyRejected, 0);
    const totalAccepted = body.lines.reduce((s, l) => s + l.qtyAccepted, 0);
    let qualityStatus = 'ACCEPTED';
    if (totalAccepted === 0 && totalRejected > 0) qualityStatus = 'REJECTED';
    else if (totalRejected > 0) qualityStatus = 'PARTIAL_REJECT';

    const grn = await prisma.$transaction(async (tx) => {
      const g = await tx.grn.create({
        data: {
          id: newId(),
          grnNo,
          poId: body.poId,
          receivedDate: new Date(body.receivedDate),
          receivedById: actor,
          warehouseNote: body.warehouseNote ?? null,
          qualityStatus,
          notes: body.notes ?? null,
          createdBy: actor,
          updatedBy: actor,
          lines: {
            create: body.lines.map((l) => ({
              id: newId(),
              poLineId: l.poLineId,
              qtyReceived: l.qtyReceived,
              qtyAccepted: l.qtyAccepted,
              qtyRejected: l.qtyRejected,
              rejectionReason: l.rejectionReason ?? null,
            })),
          },
        },
      });

      // Update PO line quantities
      for (const gl of body.lines) {
        await tx.poLine.update({
          where: { id: gl.poLineId },
          data: {
            qtyReceived: { increment: new Decimal(gl.qtyReceived) },
            qtyAccepted: { increment: new Decimal(gl.qtyAccepted) },
          },
        });
      }

      // Check if all PO lines are fully received
      const updatedPoLines = await tx.poLine.findMany({ where: { poId: body.poId, deletedAt: null } });
      const allFullyReceived = updatedPoLines.every((l) => Number(l.qtyReceived) >= Number(l.qty));
      const newPoStatus = allFullyReceived ? 'COMPLETED' : 'PARTIALLY_RECEIVED';

      if (po.status !== newPoStatus) {
        await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: newPoStatus, updatedBy: actor } });
        await tx.poEvent.create({
          data: { id: newId(), poId: po.id, fromStatus: po.status, toStatus: newPoStatus, actorUserId: actor, comment: `GRN ${grnNo} received` },
        });
      }

      // Budget integration: increment actualPaise on PROJECT POs
      if (po.poType === 'PROJECT' && po.budgetLineId) {
        let acceptedValuePaise = BigInt(0);
        for (const gl of body.lines) {
          const poLine = po.lines.find((l) => l.id === gl.poLineId);
          if (poLine) {
            acceptedValuePaise += BigInt(Math.round(gl.qtyAccepted * Number(poLine.ratePaise)));
          }
        }
        if (acceptedValuePaise > BigInt(0)) {
          await tx.budgetLine.update({
            where: { id: po.budgetLineId },
            data: { actualPaise: { increment: acceptedValuePaise }, updatedBy: actor },
          });
        }
      }

      return g;
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'grn', resourceId: grn.id, after: { grnNo, poId: body.poId } });
    res.status(201).json({ data: { id: grn.id, grnNo } });
  }),
);

/* POST /:id/documents — upload quality evidence photo */
grnRouter.post(
  '/:id/documents',
  validate({ params: IdParams }),
  upload.single('file'),
  asyncHandler(async (req, res) => {
    const grn = await prisma.grn.findFirst({ where: { id: req.params.id as string, deletedAt: null } });
    if (!grn) throw errors.notFound('GRN not found');

    const file = req.file;
    if (!file) throw errors.validation('File is required');

    const result = await storageUpload(file, `grn:${grn.id}`);
    const name = (req.body as Record<string, string>).name?.trim() || path.parse(file.originalname).name;

    const doc = await prisma.grnDocument.create({
      data: {
        id: newId(), grnId: grn.id, name, fileName: file.originalname,
        mimeType: file.mimetype, fileSize: file.size,
        storagePath: result.storagePath, createdBy: actorId(req),
      },
    });

    res.status(201).json({ data: { id: doc.id, name: doc.name, fileName: doc.fileName } });
  }),
);

/* GET /:id/documents/:docId/download */
grnRouter.get(
  '/:id/documents/:docId/download',
  asyncHandler(async (req, res) => {
    const doc = await prisma.grnDocument.findFirst({ where: { id: req.params.docId as string } });
    if (!doc) throw errors.notFound('Document not found');

    res.setHeader('Content-Disposition', `inline; filename="${doc.fileName}"`);
    res.setHeader('Content-Type', doc.mimeType);

    const { stream } = await downloadFileWithFallback(doc.storagePath, TEMP_DIR);
    (stream as NodeJS.ReadableStream).pipe(res);
  }),
);
