import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { roleService } from './service.js';

/* ------------------------------------------------------------------ */
/*  Zod schemas (local — not in shared-types yet)                     */
/* ------------------------------------------------------------------ */

const UlidParam = z.object({
  id: z.string().min(1).max(26),
});

const CreateRoleInput = z.object({
  name: z.string().min(1).max(64),
  displayName: z.string().min(1).max(128),
  description: z.string().optional(),
  permissions: z.array(z.string()).optional(),
});

const UpdateRoleInput = z.object({
  name: z.string().min(1).max(64).optional(),
  displayName: z.string().min(1).max(128).optional(),
  description: z.string().nullable().optional(),
  permissions: z.array(z.string()).nullable().optional(),
});

const ListRolesQuery = z.object({
  status: z.enum(['all', 'active']).optional().default('active'),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).optional().default(50),
});

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

/* ------------------------------------------------------------------ */
/*  Router                                                            */
/* ------------------------------------------------------------------ */

export const roleRouter: ExpressRouter = Router();
roleRouter.use(requireAuth);

roleRouter.get(
  '/',
  validate({ query: ListRolesQuery }),
  asyncHandler(async (req, res) => {
    const result = await roleService.list(req.query as unknown as z.infer<typeof ListRolesQuery>);
    res.json(result);
  })
);

roleRouter.get(
  '/:id',
  validate({ params: UlidParam }),
  asyncHandler(async (req, res) => {
    const dto = await roleService.get(req.params.id as string);
    res.json({ data: dto });
  })
);

roleRouter.post(
  '/',
  validate({ body: CreateRoleInput }),
  asyncHandler(async (req, res) => {
    const dto = await roleService.create(
      req.body as z.infer<typeof CreateRoleInput>
    );
    await recordAudit(req, {
      action: 'CREATE',
      resourceType: 'role',
      resourceId: dto.id,
      after: dto,
    });
    res.status(201).json({ data: dto });
  })
);

roleRouter.patch(
  '/:id',
  validate({ params: UlidParam, body: UpdateRoleInput }),
  asyncHandler(async (req, res) => {
    const { before, after } = await roleService.update(
      req.params.id as string,
      req.body as z.infer<typeof UpdateRoleInput>
    );
    await recordAudit(req, {
      action: 'UPDATE',
      resourceType: 'role',
      resourceId: after.id,
      before,
      after,
    });
    res.json({ data: after });
  })
);

roleRouter.delete(
  '/:id',
  validate({ params: UlidParam }),
  asyncHandler(async (req, res) => {
    const _actor = actorId(req);
    const dto = await roleService.softDelete(req.params.id as string);
    await recordAudit(req, {
      action: 'DELETE',
      resourceType: 'role',
      resourceId: dto.id,
      before: dto,
    });
    res.status(204).end();
  })
);
