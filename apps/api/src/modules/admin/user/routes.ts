import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { userService } from './service.js';
import { prisma } from '../../../lib/prisma.js';
import { env } from '../../../config/env.js';
import { errors } from '../../../middleware/error-handler.js';
import { logger } from '../../../lib/logger.js';

/* ------------------------------------------------------------------ */
/*  Zod schemas (local — User is not yet in shared-types)             */
/* ------------------------------------------------------------------ */

const UserStatusEnum = z.enum(['ACTIVE', 'INACTIVE', 'SUSPENDED']);

const UlidSchema = z.string().min(1).max(26);

const IdParams = z.object({ id: UlidSchema });

const CreateUserInput = z.object({
  email: z.string().email().max(255),
  fullName: z.string().min(1).max(255),
  externalId: z.string().min(1).max(128),
  phone: z.string().max(32).optional(),
  status: UserStatusEnum.optional(),
  roleIds: z.array(z.string().min(1).max(26)).optional(),
});

const UpdateUserInput = z.object({
  email: z.string().email().max(255).optional(),
  fullName: z.string().min(1).max(255).optional(),
  externalId: z.string().min(1).max(128).optional(),
  phone: z.string().max(32).optional().nullable(),
  status: UserStatusEnum.optional(),
  roleIds: z.array(z.string().min(1).max(26)).optional(),
});

const ListUsersQuery = z.object({
  status: UserStatusEnum.optional(),
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
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

export const userRouter: ExpressRouter = Router();
userRouter.use(requireAuth);

/* GET /  — list with ?status, ?q, ?cursor, ?limit */
userRouter.get(
  '/',
  validate({ query: ListUsersQuery }),
  asyncHandler(async (req, res) => {
    const result = await userService.list(
      req.query as unknown as z.infer<typeof ListUsersQuery>
    );
    res.json(result);
  })
);

/* GET /:id  — single user with BU memberships */
userRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const dto = await userService.get(req.params.id as string);
    res.json({ data: dto });
  })
);

/* POST /  — create */
userRouter.post(
  '/',
  validate({ body: CreateUserInput }),
  asyncHandler(async (req, res) => {
    const dto = await userService.create(
      req.body as z.infer<typeof CreateUserInput>
    );
    await recordAudit(req, {
      action: 'CREATE',
      resourceType: 'user',
      resourceId: dto.id,
      after: dto,
    });
    res.status(201).json({ data: dto });
  })
);

/* PATCH /:id  — update */
userRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdateUserInput }),
  asyncHandler(async (req, res) => {
    const { before, after } = await userService.update(
      req.params.id as string,
      req.body as z.infer<typeof UpdateUserInput>
    );
    await recordAudit(req, {
      action: 'UPDATE',
      resourceType: 'user',
      resourceId: after.id,
      before,
      after,
    });
    res.json({ data: after });
  })
);

/* DELETE /:id  — soft delete */
userRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const dto = await userService.softDelete(req.params.id as string);
    await recordAudit(req, {
      action: 'DELETE',
      resourceType: 'user',
      resourceId: dto.id,
      before: dto,
    });
    res.status(204).end();
  })
);

/* POST /:id/reset-password — reset user password via Keycloak Admin API */
const ResetPasswordInput = z.object({
  newPassword: z.string().min(4).max(128),
  temporary: z.boolean().default(false),
});

userRouter.post(
  '/:id/reset-password',
  validate({ params: IdParams, body: ResetPasswordInput }),
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findFirst({
      where: { id: req.params.id as string, deletedAt: null },
      select: { id: true, externalId: true, fullName: true },
    });
    if (!user) throw errors.notFound('User not found');
    if (!user.externalId || user.externalId.startsWith('kc-sub-') || user.externalId.startsWith('cc_')) {
      throw errors.businessRule('NO_KEYCLOAK_LINK', 'User is not linked to Keycloak. They need to log in first to establish the link.');
    }

    const body = req.body as z.infer<typeof ResetPasswordInput>;

    // Get Keycloak admin token via resource owner password grant
    const kcBase = env.JWT_ISSUER.replace('/realms/govprojects', '');
    const tokenParams = new URLSearchParams({
      grant_type: 'password',
      client_id: 'admin-cli',
      username: env.KEYCLOAK_ADMIN_USER,
      password: env.KEYCLOAK_ADMIN_PASSWORD,
    });
    const tokenRes = await fetch(`${kcBase}/realms/master/protocol/openid-connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams.toString(),
    });

    if (!tokenRes.ok) {
      logger.error({ status: tokenRes.status }, 'Failed to get Keycloak admin token');
      throw errors.businessRule('KC_AUTH_FAILED', 'Failed to authenticate with Keycloak admin');
    }

    const tokenData = await tokenRes.json() as { access_token: string };
    const adminToken = tokenData.access_token;

    // Reset the password
    const resetRes = await fetch(`${kcBase}/admin/realms/govprojects/users/${user.externalId}/reset-password`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${adminToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        type: 'password',
        value: body.newPassword,
        temporary: body.temporary,
      }),
    });

    if (!resetRes.ok) {
      const errBody = await resetRes.text();
      logger.error({ status: resetRes.status, body: errBody }, 'Keycloak password reset failed');
      throw errors.businessRule('KC_RESET_FAILED', 'Failed to reset password in Keycloak');
    }

    await recordAudit(req, {
      action: 'UPDATE',
      resourceType: 'user',
      resourceId: user.id,
      after: { passwordReset: true },
    });

    res.json({ data: { success: true, message: `Password reset for ${user.fullName}` } });
  })
);
