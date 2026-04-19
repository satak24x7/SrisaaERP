import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { notify } from './service.js';

const CHECK_INTERVAL_MS = 5 * 60 * 1000; // every 5 minutes
const REMINDER_WINDOW_MS = 60 * 60 * 1000; // 1 hour before

let timer: ReturnType<typeof setInterval> | null = null;

/**
 * Start the reminder worker. Checks every 5 minutes for activities
 * with startDateTime or dueDateTime within the next hour and sends
 * a reminder notification (if one hasn't already been sent).
 */
export function startReminderWorker(): void {
  logger.info('Reminder worker started (interval: 5m, window: 1h)');
  // Run once immediately, then on interval
  checkAndNotify().catch((err) => logger.error({ err }, 'Reminder check failed'));
  timer = setInterval(() => {
    checkAndNotify().catch((err) => logger.error({ err }, 'Reminder check failed'));
  }, CHECK_INTERVAL_MS);
}

export function stopReminderWorker(): void {
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

async function checkAndNotify(): Promise<void> {
  const now = new Date();
  const windowStart = new Date(now.getTime() + 55 * 60 * 1000); // 55 min from now
  const windowEnd = new Date(now.getTime() + 65 * 60 * 1000);   // 65 min from now

  // Find events with startDateTime in the 55-65 min window
  const upcomingEvents = await prisma.activity.findMany({
    where: {
      deletedAt: null,
      activityType: 'EVENT',
      startDateTime: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true, subject: true, userId: true, startDateTime: true },
  });

  // Find tasks with dueDateTime in the 55-65 min window
  const upcomingTasks = await prisma.activity.findMany({
    where: {
      deletedAt: null,
      activityType: 'TASK',
      taskStatus: { not: 'CLOSED' },
      dueDateTime: { gte: windowStart, lte: windowEnd },
    },
    select: { id: true, subject: true, userId: true, dueDateTime: true },
  });

  const candidates = [
    ...upcomingEvents.map((e) => ({
      id: e.id,
      subject: e.subject,
      userId: e.userId,
      time: e.startDateTime!,
      type: 'EVENT' as const,
    })),
    ...upcomingTasks.map((t) => ({
      id: t.id,
      subject: t.subject,
      userId: t.userId,
      time: t.dueDateTime!,
      type: 'TASK' as const,
    })),
  ];

  if (candidates.length === 0) return;

  // Check which ones already have a reminder notification
  const activityIds = candidates.map((c) => c.id);
  const existing = await prisma.notification.findMany({
    where: {
      entityType: 'ACTIVITY_REMINDER',
      entityId: { in: activityIds },
    },
    select: { entityId: true },
  });
  const alreadySent = new Set(existing.map((e) => e.entityId));

  let sentCount = 0;
  for (const c of candidates) {
    if (alreadySent.has(c.id)) continue;

    const timeStr = c.time.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
    const label = c.type === 'EVENT' ? 'Event starting' : 'Task due';

    await notify({
      userId: c.userId,
      title: `${label} in 1 hour`,
      body: `"${c.subject}" at ${timeStr}`,
      type: 'WARNING',
      category: 'ACTIVITY',
      entityType: 'ACTIVITY_REMINDER', // distinct from ACTIVITY to avoid duplicate detection conflicts
      entityId: c.id,
      actionUrl: `/work-area/activities`,
    });
    sentCount++;
  }

  if (sentCount > 0) {
    logger.info({ sentCount }, 'Reminder notifications sent');
  }
}
