import { prisma, newId } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';

export interface CreateNotificationInput {
  userId: string;
  title: string;
  body?: string;
  type?: 'INFO' | 'ACTION' | 'WARNING' | 'SUCCESS';
  category: string;
  entityType?: string;
  entityId?: string;
  actionUrl?: string;
}

/**
 * Create a notification for a user. Fire-and-forget — errors are logged, never thrown.
 * Usage from any module:
 *   import { notify } from '../notification/service.js';
 *   await notify({ userId, title: 'Travel plan approved', category: 'TRAVEL', entityType: 'TRAVEL_PLAN', entityId: plan.id });
 */
export async function notify(input: CreateNotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        id: newId(),
        userId: input.userId,
        title: input.title,
        body: input.body ?? null,
        type: input.type ?? 'INFO',
        category: input.category,
        entityType: input.entityType ?? null,
        entityId: input.entityId ?? null,
        actionUrl: input.actionUrl ?? null,
      },
    });
  } catch (err) {
    logger.error({ err, input }, 'Failed to create notification');
  }
}

/**
 * Notify multiple users at once.
 */
export async function notifyMany(
  userIds: string[],
  input: Omit<CreateNotificationInput, 'userId'>,
): Promise<void> {
  await Promise.all(userIds.map((userId) => notify({ ...input, userId })));
}
