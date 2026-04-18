import { Router, type Router as ExpressRouter } from 'express';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { companyService } from './service.js';
import { UpdateCompanyInput } from './types.js';

export const companyRouter: ExpressRouter = Router();
companyRouter.use(requireAuth);

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

/**
 * GET /api/v1/company
 * Returns the singleton company profile, or 404 if not yet created.
 */
companyRouter.get(
  '/',
  asyncHandler(async (_req, res) => {
    const dto = await companyService.get();
    res.json({ data: dto });
  })
);

/**
 * PATCH /api/v1/company
 * Updates the company profile. If no row exists yet, creates one (upsert).
 */
companyRouter.patch(
  '/',
  validate({ body: UpdateCompanyInput }),
  asyncHandler(async (req, res) => {
    const actorUserId = actorId(req);
    const { before, after } = await companyService.upsert(
      req.body as UpdateCompanyInput,
      actorUserId
    );
    await recordAudit(req, {
      action: before ? 'UPDATE' : 'CREATE',
      resourceType: 'company',
      resourceId: after.id,
      before: before ?? undefined,
      after,
    });
    res.status(before ? 200 : 201).json({ data: after });
  })
);
