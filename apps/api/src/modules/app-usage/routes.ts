import { Router } from 'express';
import { z } from 'zod';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { prisma, newId } from '../../lib/prisma.js';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

const RegisterDeviceInput = z.object({
  platform: z.enum(['ANDROID', 'IOS', 'WEB']),
  deviceId: z.string().min(1).max(128),
  appVersion: z.string().max(32).optional(),
});

const SyncUsageInput = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  activeSeconds: z.number().int().min(0).max(86400),
  sessionCount: z.number().int().min(0).max(1000),
});

const AdminSummaryQuery = z.object({
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export const appUsageRouter = Router();

// -- Register / update device ------------------------------------------------
appUsageRouter.post(
  '/device',
  requireAuth,
  validate({ body: RegisterDeviceInput }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { platform, deviceId, appVersion } = req.body as z.infer<typeof RegisterDeviceInput>;

    await prisma.appDevice.upsert({
      where: { userId_deviceId: { userId, deviceId } },
      update: { platform, appVersion: appVersion ?? null, isActive: true, updatedAt: new Date() },
      create: { id: newId(), userId, platform, deviceId, appVersion: appVersion ?? null },
    });

    res.json({ data: { ok: true } });
  }),
);

// -- Sync daily usage --------------------------------------------------------
appUsageRouter.post(
  '/sync',
  requireAuth,
  validate({ body: SyncUsageInput }),
  asyncHandler(async (req, res) => {
    const userId = req.user!.id;
    const { date, activeSeconds, sessionCount } = req.body as z.infer<typeof SyncUsageInput>;
    const usageDate = new Date(date + 'T00:00:00.000Z');
    const now = new Date();

    const existing = await prisma.appUsageDaily.findUnique({
      where: { userId_usageDate: { userId, usageDate } },
    });

    if (existing) {
      await prisma.appUsageDaily.update({
        where: { id: existing.id },
        data: {
          activeSeconds: existing.activeSeconds + activeSeconds,
          sessionCount: existing.sessionCount + sessionCount,
          lastSeenAt: now,
        },
      });
    } else {
      await prisma.appUsageDaily.create({
        data: {
          id: newId(),
          userId,
          usageDate,
          activeSeconds,
          sessionCount,
          lastSeenAt: now,
        },
      });
    }

    res.json({ data: { ok: true } });
  }),
);

// -- Admin: usage summary ----------------------------------------------------
appUsageRouter.get(
  '/admin/summary',
  requireAuth,
  requireRole('super_admin', 'admin'),
  validate({ query: AdminSummaryQuery }),
  asyncHandler(async (req, res) => {
    const { from, to, limit, cursor } = req.query as unknown as z.infer<typeof AdminSummaryQuery>;

    // Build date filter for usage data
    const dateFilter: Record<string, Date> = {};
    if (from) dateFilter.gte = new Date(from + 'T00:00:00.000Z');
    if (to) dateFilter.lte = new Date(to + 'T23:59:59.999Z');

    // Get all users with devices (installed the app)
    const devices = await prisma.appDevice.findMany({
      where: { isActive: true, ...(cursor ? { id: { gt: cursor } } : {}) },
      include: {
        user: { select: { id: true, fullName: true, email: true, status: true } },
      },
      orderBy: { id: 'asc' },
      take: limit + 1,
    });

    const hasMore = devices.length > limit;
    const page = hasMore ? devices.slice(0, limit) : devices;

    // Get usage data for those users
    const userIds = [...new Set(page.map((d) => d.userId))];

    const usageData = userIds.length > 0
      ? await prisma.appUsageDaily.findMany({
          where: {
            userId: { in: userIds },
            ...(Object.keys(dateFilter).length > 0 ? { usageDate: dateFilter } : {}),
          },
          orderBy: { usageDate: 'desc' },
        })
      : [];

    // Group usage by user
    const usageByUser = new Map<string, { totalSeconds: number; totalSessions: number; lastSeen: Date | null; days: number }>();
    for (const row of usageData) {
      const entry = usageByUser.get(row.userId) ?? { totalSeconds: 0, totalSessions: 0, lastSeen: null, days: 0 };
      entry.totalSeconds += row.activeSeconds;
      entry.totalSessions += row.sessionCount;
      entry.days++;
      if (!entry.lastSeen || row.lastSeenAt > entry.lastSeen) {
        entry.lastSeen = row.lastSeenAt;
      }
      usageByUser.set(row.userId, entry);
    }

    // Deduplicate users (one user may have multiple devices)
    const seenUsers = new Set<string>();
    const summary = [];
    for (const device of page) {
      if (seenUsers.has(device.userId)) continue;
      seenUsers.add(device.userId);

      const usage = usageByUser.get(device.userId);
      summary.push({
        userId: device.user.id,
        fullName: device.user.fullName,
        email: device.user.email,
        status: device.user.status,
        platform: device.platform,
        appVersion: device.appVersion,
        deviceRegisteredAt: device.createdAt,
        totalSeconds: usage?.totalSeconds ?? 0,
        totalSessions: usage?.totalSessions ?? 0,
        activeDays: usage?.days ?? 0,
        lastSeenAt: usage?.lastSeen ?? null,
        avgSecondsPerDay: usage && usage.days > 0 ? Math.round(usage.totalSeconds / usage.days) : 0,
      });
    }

    res.json({
      data: summary,
      meta: {
        next_cursor: hasMore ? page[page.length - 1].id : null,
        limit,
      },
    });
  }),
);

// -- Admin: single user usage history ----------------------------------------
appUsageRouter.get(
  '/admin/users/:userId',
  requireAuth,
  requireRole('super_admin', 'admin'),
  asyncHandler(async (req, res) => {
    const { userId } = req.params;

    const [user, devices, usage] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, fullName: true, email: true, status: true },
      }),
      prisma.appDevice.findMany({
        where: { userId, isActive: true },
        select: { platform: true, deviceId: true, appVersion: true, createdAt: true, updatedAt: true },
      }),
      prisma.appUsageDaily.findMany({
        where: { userId },
        orderBy: { usageDate: 'desc' },
        take: 90, // last 90 days
      }),
    ]);

    if (!user) {
      throw errors.notFound('User not found');
    }

    res.json({
      data: {
        user,
        devices,
        dailyUsage: usage.map((u) => ({
          date: u.usageDate.toISOString().slice(0, 10),
          activeSeconds: u.activeSeconds,
          sessionCount: u.sessionCount,
          lastSeenAt: u.lastSeenAt,
        })),
      },
    });
  }),
);
