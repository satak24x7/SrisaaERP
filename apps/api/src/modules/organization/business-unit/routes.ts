import { Router, type Router as ExpressRouter } from 'express';
import {
  CreateBusinessUnitInput,
  ListBusinessUnitsQuery,
  UpdateBusinessUnitInput,
  UlidSchema,
} from '@govprojects/shared-types';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { businessUnitService } from './service.js';

const IdParams = z.object({ id: UlidSchema });

export const businessUnitRouter: ExpressRouter = Router();
businessUnitRouter.use(requireAuth);

businessUnitRouter.get(
  '/',
  validate({ query: ListBusinessUnitsQuery }),
  asyncHandler(async (req, res) => {
    const result = await businessUnitService.list(req.query as unknown as z.infer<typeof ListBusinessUnitsQuery>);
    res.json(result);
  })
);

businessUnitRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const dto = await businessUnitService.get(req.params.id as string);
    res.json({ data: dto });
  })
);

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

businessUnitRouter.post(
  '/',
  validate({ body: CreateBusinessUnitInput }),
  asyncHandler(async (req, res) => {
    const actorUserId = actorId(req);
    const dto = await businessUnitService.create(
      req.body as z.infer<typeof CreateBusinessUnitInput>,
      actorUserId
    );
    await recordAudit(req, {
      action: 'CREATE',
      resourceType: 'business_unit',
      resourceId: dto.id,
      after: dto,
    });
    res.status(201).json({ data: dto });
  })
);

businessUnitRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateBusinessUnitInput }),
  asyncHandler(async (req, res) => {
    const actorUserId = actorId(req);
    const { before, after } = await businessUnitService.update(
      req.params.id as string,
      req.body as z.infer<typeof UpdateBusinessUnitInput>,
      actorUserId
    );
    await recordAudit(req, {
      action: 'UPDATE',
      resourceType: 'business_unit',
      resourceId: after.id,
      before,
      after,
    });
    res.json({ data: after });
  })
);

businessUnitRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const actorUserId = actorId(req);
    const dto = await businessUnitService.softDelete(req.params.id as string, actorUserId);
    await recordAudit(req, {
      action: 'DELETE',
      resourceType: 'business_unit',
      resourceId: dto.id,
      before: dto,
    });
    res.status(204).end();
  })
);
