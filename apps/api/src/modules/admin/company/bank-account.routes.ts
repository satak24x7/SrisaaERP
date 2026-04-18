import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { prisma, newId } from '../../../lib/prisma.js';
import { errors } from '../../../middleware/error-handler.js';

const IFSC_REGEX = /^[A-Z]{4}0[A-Z0-9]{6}$/;

const IdParams = z.object({ id: z.string().min(1).max(26) });

const CreateBankAccountInput = z.object({
  bankName: z.string().min(1).max(128),
  accountName: z.string().min(1).max(255),
  accountNo: z.string().min(1).max(64),
  ifsc: z.string().length(11).regex(IFSC_REGEX, 'Invalid IFSC format'),
  branch: z.string().max(255).optional(),
  purpose: z.enum(['EMD', 'RECEIVABLES', 'PAYROLL', 'GENERAL']),
});

const UpdateBankAccountInput = CreateBankAccountInput.partial();

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

function toDto(r: {
  id: string; bankName: string; accountName: string; accountNo: string;
  ifsc: string; branch: string | null; purpose: string;
  createdAt: Date; updatedAt: Date;
}) {
  return {
    id: r.id, bankName: r.bankName, accountName: r.accountName,
    accountNo: r.accountNo, ifsc: r.ifsc, branch: r.branch,
    purpose: r.purpose,
    createdAt: r.createdAt.toISOString(), updatedAt: r.updatedAt.toISOString(),
  };
}

export const bankAccountRouter: ExpressRouter = Router();
bankAccountRouter.use(requireAuth);

/* GET / */
bankAccountRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const rows = await prisma.bankAccount.findMany({
      where: { deletedAt: null },
      orderBy: { createdAt: 'asc' },
    });
    res.json({ data: rows.map(toDto) });
  }),
);

/* POST / */
bankAccountRouter.post(
  '/',
  validate({ body: CreateBankAccountInput }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreateBankAccountInput>;
    const actor = actorId(req);
    const row = await prisma.bankAccount.create({
      data: {
        id: newId(),
        bankName: body.bankName,
        accountName: body.accountName,
        accountNo: body.accountNo,
        ifsc: body.ifsc.toUpperCase(),
        branch: body.branch ?? null,
        purpose: body.purpose,
        createdBy: actor,
        updatedBy: actor,
      },
    });
    await recordAudit(req, {
      action: 'CREATE', resourceType: 'bank_account', resourceId: row.id,
      after: toDto(row),
    });
    res.status(201).json({ data: toDto(row) });
  }),
);

/* PATCH /:id */
bankAccountRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateBankAccountInput }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.bankAccount.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Bank account not found');

    const body = req.body as z.infer<typeof UpdateBankAccountInput>;
    const data: Record<string, unknown> = { updatedBy: actorId(req) };
    if (body.bankName !== undefined) data.bankName = body.bankName;
    if (body.accountName !== undefined) data.accountName = body.accountName;
    if (body.accountNo !== undefined) data.accountNo = body.accountNo;
    if (body.ifsc !== undefined) data.ifsc = body.ifsc.toUpperCase();
    if (body.branch !== undefined) data.branch = body.branch;
    if (body.purpose !== undefined) data.purpose = body.purpose;

    const updated = await prisma.bankAccount.update({ where: { id: existing.id }, data });
    await recordAudit(req, {
      action: 'UPDATE', resourceType: 'bank_account', resourceId: existing.id,
      before: toDto(existing), after: toDto(updated),
    });
    res.json({ data: toDto(updated) });
  }),
);

/* DELETE /:id */
bankAccountRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const existing = await prisma.bankAccount.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
    });
    if (!existing) throw errors.notFound('Bank account not found');

    await prisma.bankAccount.update({
      where: { id: existing.id },
      data: { deletedAt: new Date() },
    });
    await recordAudit(req, {
      action: 'DELETE', resourceType: 'bank_account', resourceId: existing.id,
      before: toDto(existing),
    });
    res.status(204).end();
  }),
);
