import { Router } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { prisma } from '../../lib/prisma.js';

const ListQuery = z.object({
  unreadOnly: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  cursor: z.string().optional(),
});

export const notificationRouter = Router();

// -- List notifications + unread count ---------------------------------------
notificationRouter.get(
  '/',
  requireAuth,
  validate({ query: ListQuery }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { unreadOnly, limit, cursor } = req.query as unknown as z.infer<typeof ListQuery>;

    const where: Record<string, unknown> = { userId };
    if (unreadOnly === 'true') where.isRead = false;

    const [items, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where: { ...where, ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}) },
        orderBy: { createdAt: 'desc' },
        take: limit + 1,
      }),
      prisma.notification.count({ where: { userId, isRead: false } }),
    ]);

    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;

    res.json({
      data: page.map((n) => ({
        id: n.id,
        title: n.title,
        body: n.body,
        type: n.type,
        category: n.category,
        isRead: n.isRead,
        entityType: n.entityType,
        entityId: n.entityId,
        actionUrl: n.actionUrl,
        createdAt: n.createdAt,
      })),
      meta: {
        unreadCount,
        next_cursor: hasMore ? page[page.length - 1].createdAt.toISOString() : null,
        limit,
      },
    });
  }),
);

// -- Unread count only (lightweight poll) ------------------------------------
notificationRouter.get(
  '/unread-count',
  requireAuth,
  asyncHandler(async (req, res) => {
    const count = await prisma.notification.count({
      where: { userId: req.user!.id, isRead: false },
    });
    res.json({ data: { unreadCount: count } });
  }),
);

// -- Mark single as read -----------------------------------------------------
notificationRouter.patch(
  '/:id/read',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    await prisma.notification.updateMany({
      where: { id, userId: req.user!.id },
      data: { isRead: true },
    });
    res.json({ data: { ok: true } });
  }),
);

// -- Mark all as read --------------------------------------------------------
notificationRouter.post(
  '/read-all',
  requireAuth,
  asyncHandler(async (req, res) => {
    await prisma.notification.updateMany({
      where: { userId: req.user!.id, isRead: false },
      data: { isRead: true },
    });
    res.json({ data: { ok: true } });
  }),
);
