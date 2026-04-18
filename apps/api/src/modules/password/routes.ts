import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { errors } from '../../middleware/error-handler.js';
import { encrypt, decrypt } from '../../lib/crypto.js';

const IdParams = z.object({ id: z.string().min(1).max(26) });

const SecurityQuestionInput = z.object({
  question: z.string().min(1).max(500),
  answer: z.string().min(1),
});

const CreatePasswordEntry = z.object({
  portal: z.string().min(1).max(255),
  location: z.string().max(255).nullable().optional(),
  username: z.string().min(1).max(255),
  password: z.string().min(1),
  notes: z.string().nullable().optional(),
  visibility: z.enum(['PERSONAL', 'ROLE', 'ALL']).default('PERSONAL'),
  sharedRoleId: z.string().max(26).nullable().optional(),
  securityQuestions: z.array(SecurityQuestionInput).optional(),
});

const UpdatePasswordEntry = z.object({
  portal: z.string().min(1).max(255).optional(),
  location: z.string().max(255).nullable().optional(),
  username: z.string().min(1).max(255).optional(),
  password: z.string().min(1).optional(),
  notes: z.string().nullable().optional(),
  visibility: z.enum(['PERSONAL', 'ROLE', 'ALL']).optional(),
  sharedRoleId: z.string().max(26).nullable().optional(),
  securityQuestions: z.array(SecurityQuestionInput).optional(),
});

const ListQuery = z.object({
  visibility: z.string().optional(),
  mine: z.string().optional(), // "true" = only entries I own
  q: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

/**
 * Build WHERE clause that returns entries the user can see:
 *   - PERSONAL entries owned by the user
 *   - ROLE entries shared with any role the user has
 *   - ALL entries
 */
async function visibilityWhere(userId: string) {
  // Get user's role IDs
  const userRoles = await prisma.userRole.findMany({
    where: { userId },
    select: { roleId: true },
  });
  const roleIds = userRoles.map((ur) => ur.roleId);

  return {
    deletedAt: null,
    OR: [
      { visibility: 'PERSONAL', ownerUserId: userId },
      { visibility: 'ALL' },
      ...(roleIds.length > 0 ? [{ visibility: 'ROLE', sharedRoleId: { in: roleIds } }] : []),
    ],
  };
}

const ENTRY_INCLUDE = {
  owner: { select: { id: true, fullName: true } },
  sharedRole: { select: { id: true, name: true, displayName: true } },
  securityQuestions: true,
} as const;

function entryToDto(row: Record<string, unknown>, includeSecrets: boolean) {
  const r = row as Record<string, unknown> & {
    createdAt: Date; updatedAt: Date;
    encryptedPass: string; passIv: string; passTag: string;
    owner: { id: string; fullName: string };
    sharedRole?: { id: string; name: string; displayName: string | null } | null;
    securityQuestions: Array<{ id: string; question: string; encryptedAnswer: string; answerIv: string; answerTag: string }>;
  };

  return {
    id: r.id,
    portal: r.portal,
    location: r.location ?? null,
    username: r.username,
    password: includeSecrets ? decrypt(r.encryptedPass, r.passIv, r.passTag) : '••••••••',
    notes: r.notes ?? null,
    visibility: r.visibility,
    ownerUserId: r.owner.id,
    ownerName: r.owner.fullName,
    sharedRoleId: r.sharedRole?.id ?? null,
    sharedRoleName: r.sharedRole?.displayName ?? r.sharedRole?.name ?? null,
    securityQuestions: r.securityQuestions.map((sq) => ({
      id: sq.id,
      question: sq.question,
      answer: includeSecrets ? decrypt(sq.encryptedAnswer, sq.answerIv, sq.answerTag) : '••••••••',
    })),
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
  };
}

export const passwordRouter: ExpressRouter = Router();
passwordRouter.use(requireAuth);

/* GET / — list visible entries (without secrets) */
passwordRouter.get(
  '/',
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as z.infer<typeof ListQuery>;
    const userId = actorId(req);
    const baseWhere = await visibilityWhere(userId);

    let where: Record<string, unknown>;
    if (q.mine === 'true') {
      // Only my own entries
      where = { deletedAt: null, ownerUserId: userId };
    } else {
      where = { ...baseWhere };
    }
    if (q.visibility) {
      // Filter within visible entries
      const orClauses = ((where.OR ?? []) as Array<Record<string, unknown>>).filter(
        (clause) => clause.visibility === q.visibility,
      );
      if (q.mine !== 'true' && orClauses.length === 0) {
        res.json({ data: [], meta: { next_cursor: null, limit: q.limit } });
        return;
      }
      if (orClauses.length > 0) where.OR = orClauses;
    }
    if (q.q) where.portal = { contains: q.q };

    const take = q.limit + 1;
    const args: Record<string, unknown> = {
      where, orderBy: { portal: 'asc' }, take,
      include: { owner: { select: { id: true, fullName: true } }, sharedRole: { select: { id: true, name: true, displayName: true } } },
    };
    if (q.cursor) { args.cursor = { id: q.cursor }; args.skip = 1; }

    const rows = await prisma.passwordEntry.findMany(args as Parameters<typeof prisma.passwordEntry.findMany>[0]);
    const hasMore = rows.length > q.limit;
    const page = hasMore ? rows.slice(0, q.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;

    // List view: no secrets
    const data = page.map((r) => {
      const row = r as unknown as Record<string, unknown> & { createdAt: Date; updatedAt: Date; owner: { id: string; fullName: string }; sharedRole?: { id: string; name: string; displayName: string | null } | null };
      return {
        id: row.id, portal: row.portal, location: row.location ?? null,
        username: row.username, visibility: row.visibility,
        ownerUserId: row.owner.id, ownerName: row.owner.fullName,
        sharedRoleId: row.sharedRole?.id ?? null,
        sharedRoleName: row.sharedRole?.displayName ?? row.sharedRole?.name ?? null,
        createdAt: row.createdAt.toISOString(),
      };
    });

    res.json({ data, meta: { next_cursor: nextCursor, limit: q.limit } });
  }),
);

/* GET /:id — single entry WITH decrypted secrets */
passwordRouter.get(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const userId = actorId(req);
    const baseWhere = await visibilityWhere(userId);

    const row = await prisma.passwordEntry.findFirst({
      where: { id: req.params.id as string, ...baseWhere },
      include: ENTRY_INCLUDE,
    });
    if (!row) throw errors.notFound('Password entry not found');
    res.json({ data: entryToDto(row as unknown as Record<string, unknown>, true) });
  }),
);

/* POST / — create */
passwordRouter.post(
  '/',
  validate({ body: CreatePasswordEntry }),
  asyncHandler(async (req, res) => {
    const body = req.body as z.infer<typeof CreatePasswordEntry>;
    const actor = actorId(req);

    if (body.visibility === 'ROLE' && !body.sharedRoleId) {
      throw errors.businessRule('MISSING_ROLE', 'sharedRoleId is required when visibility is ROLE');
    }

    const { encrypted, iv, tag } = encrypt(body.password);
    const entryId = newId();

    await prisma.passwordEntry.create({
      data: {
        id: entryId,
        ownerUserId: actor,
        portal: body.portal,
        location: body.location ?? null,
        username: body.username,
        encryptedPass: encrypted,
        passIv: iv,
        passTag: tag,
        notes: body.notes ?? null,
        visibility: body.visibility,
        sharedRoleId: body.visibility === 'ROLE' ? body.sharedRoleId! : null,
        createdBy: actor,
        updatedBy: actor,
      },
    });

    // Security questions
    if (body.securityQuestions && body.securityQuestions.length > 0) {
      await prisma.passwordSecurityQuestion.createMany({
        data: body.securityQuestions.map((sq) => {
          const enc = encrypt(sq.answer);
          return {
            id: newId(),
            passwordEntryId: entryId,
            question: sq.question,
            encryptedAnswer: enc.encrypted,
            answerIv: enc.iv,
            answerTag: enc.tag,
          };
        }),
      });
    }

    const row = await prisma.passwordEntry.findUniqueOrThrow({ where: { id: entryId }, include: ENTRY_INCLUDE });
    await recordAudit(req, { action: 'CREATE', resourceType: 'password_entry', resourceId: entryId, after: { portal: body.portal } });
    res.status(201).json({ data: entryToDto(row as unknown as Record<string, unknown>, true) });
  }),
);

/* PATCH /:id — update */
passwordRouter.patch(
  '/:id',
  validate({ params: IdParams, body: UpdatePasswordEntry }),
  asyncHandler(async (req, res) => {
    const actor = actorId(req);
    const existing = await prisma.passwordEntry.findFirst({
      where: { id: req.params.id as string, deletedAt: null, ownerUserId: actor },
    });
    if (!existing) throw errors.notFound('Password entry not found or not owned by you');

    const body = req.body as z.infer<typeof UpdatePasswordEntry>;
    const data: Record<string, unknown> = { updatedBy: actor };

    if (body.portal !== undefined) data.portal = body.portal;
    if (body.location !== undefined) data.location = body.location;
    if (body.username !== undefined) data.username = body.username;
    if (body.notes !== undefined) data.notes = body.notes;
    if (body.visibility !== undefined) {
      data.visibility = body.visibility;
      data.sharedRoleId = body.visibility === 'ROLE' ? (body.sharedRoleId ?? existing.sharedRoleId) : null;
    }
    if (body.sharedRoleId !== undefined && body.visibility === undefined) {
      data.sharedRoleId = body.sharedRoleId;
    }

    if (body.password) {
      const { encrypted, iv, tag } = encrypt(body.password);
      data.encryptedPass = encrypted;
      data.passIv = iv;
      data.passTag = tag;
    }

    await prisma.passwordEntry.update({ where: { id: existing.id }, data });

    // Sync security questions (delete all + recreate)
    if (body.securityQuestions !== undefined) {
      await prisma.passwordSecurityQuestion.deleteMany({ where: { passwordEntryId: existing.id } });
      if (body.securityQuestions.length > 0) {
        await prisma.passwordSecurityQuestion.createMany({
          data: body.securityQuestions.map((sq) => {
            const enc = encrypt(sq.answer);
            return {
              id: newId(), passwordEntryId: existing.id,
              question: sq.question, encryptedAnswer: enc.encrypted, answerIv: enc.iv, answerTag: enc.tag,
            };
          }),
        });
      }
    }

    const row = await prisma.passwordEntry.findUniqueOrThrow({ where: { id: existing.id }, include: ENTRY_INCLUDE });
    await recordAudit(req, { action: 'UPDATE', resourceType: 'password_entry', resourceId: existing.id });
    res.json({ data: entryToDto(row as unknown as Record<string, unknown>, true) });
  }),
);

/* DELETE /:id — soft delete (owner only) */
passwordRouter.delete(
  '/:id',
  validate({ params: IdParams }),
  asyncHandler(async (req, res) => {
    const actor = actorId(req);
    const existing = await prisma.passwordEntry.findFirst({
      where: { id: req.params.id as string, deletedAt: null, ownerUserId: actor },
    });
    if (!existing) throw errors.notFound('Password entry not found or not owned by you');
    await prisma.passwordEntry.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
    await recordAudit(req, { action: 'DELETE', resourceType: 'password_entry', resourceId: existing.id });
    res.status(204).end();
  }),
);
