import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma, newId } from '../../../lib/prisma.js';
import { requireAuth } from '../../../middleware/auth.js';
import { asyncHandler, validate } from '../../../middleware/validate.js';
import { recordAudit } from '../../../middleware/audit.js';
import { errors } from '../../../middleware/error-handler.js';

const UlidSchema = z.string().min(26).max(26);

const BuIdParams = z.object({ buId: UlidSchema });
const MemberIdParams = z.object({ buId: UlidSchema, memberId: UlidSchema });

const AddMemberBody = z.object({
  userId: UlidSchema,
  roleId: UlidSchema,
});

const ListMembersQuery = z.object({
  cursor: UlidSchema.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const buMembersRouter: ExpressRouter = Router({ mergeParams: true });
buMembersRouter.use(requireAuth);

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

/**
 * Verify the BU exists and is not soft-deleted.
 */
async function assertBuExists(buId: string): Promise<void> {
  const count = await prisma.businessUnit.count({ where: { id: buId, deletedAt: null } });
  if (count === 0) throw errors.notFound('Business Unit not found');
}

/**
 * GET /api/v1/business-units/:buId/members
 * List members of a business unit with user + role details.
 */
buMembersRouter.get(
  '/',
  validate({ params: BuIdParams, query: ListMembersQuery }),
  asyncHandler(async (req, res) => {
    const { buId } = req.params as unknown as z.infer<typeof BuIdParams>;
    const { cursor, limit } = req.query as unknown as z.infer<typeof ListMembersQuery>;

    await assertBuExists(buId);

    const take = limit + 1;
    const args: Prisma.BusinessUnitMemberFindManyArgs = {
      where: { businessUnitId: buId },
      include: { user: true, role: true },
      orderBy: { id: 'asc' },
      take,
    };
    if (cursor) {
      args.cursor = { id: cursor };
      args.skip = 1;
    }

    const rows = await prisma.businessUnitMember.findMany(args);
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    res.json({
      data: page,
      meta: { next_cursor: nextCursor, limit },
    });
  })
);

/**
 * POST /api/v1/business-units/:buId/members
 * Add a user to a business unit with a specific role.
 */
buMembersRouter.post(
  '/',
  validate({ params: BuIdParams, body: AddMemberBody }),
  asyncHandler(async (req, res) => {
    const { buId } = req.params as unknown as z.infer<typeof BuIdParams>;
    const { userId, roleId } = req.body as z.infer<typeof AddMemberBody>;

    // Validate that BU, user, and role all exist
    const [buCount, userCount, roleCount] = await Promise.all([
      prisma.businessUnit.count({ where: { id: buId, deletedAt: null } }),
      prisma.user.count({ where: { id: userId, deletedAt: null } }),
      prisma.role.count({ where: { id: roleId, deletedAt: null } }),
    ]);
    if (buCount === 0) throw errors.notFound('Business Unit not found');
    if (userCount === 0) throw errors.notFound('User not found');
    if (roleCount === 0) throw errors.notFound('Role not found');

    try {
      const member = await prisma.businessUnitMember.create({
        data: {
          id: newId(),
          businessUnitId: buId,
          userId,
          roleId,
        },
        include: { user: true, role: true },
      });

      await recordAudit(req, {
        action: 'CREATE',
        resourceType: 'business_unit_member',
        resourceId: member.id,
        after: member,
      });

      res.status(201).json({ data: member });
    } catch (err) {
      // Handle unique constraint violation (user already a member of this BU)
      if (
        err instanceof Prisma.PrismaClientKnownRequestError &&
        err.code === 'P2002'
      ) {
        throw errors.conflict('User is already a member of this Business Unit');
      }
      throw err;
    }
  })
);

/**
 * DELETE /api/v1/business-units/:buId/members/:memberId
 * Remove a member from a business unit.
 */
buMembersRouter.delete(
  '/:memberId',
  validate({ params: MemberIdParams }),
  asyncHandler(async (req, res) => {
    const { buId, memberId } = req.params as unknown as z.infer<typeof MemberIdParams>;

    await assertBuExists(buId);

    const member = await prisma.businessUnitMember.findFirst({
      where: { id: memberId, businessUnitId: buId },
    });
    if (!member) throw errors.notFound('Member not found in this Business Unit');

    await prisma.businessUnitMember.delete({ where: { id: memberId } });

    await recordAudit(req, {
      action: 'DELETE',
      resourceType: 'business_unit_member',
      resourceId: memberId,
      before: member,
    });

    res.status(204).end();
  })
);
