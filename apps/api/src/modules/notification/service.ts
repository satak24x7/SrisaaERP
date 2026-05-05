import { prisma, newId } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import { pushToUser } from '../../lib/websocket.js';

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
 * Pushes to WebSocket if user is connected, otherwise they'll see it on next page load.
 */
export async function notify(input: CreateNotificationInput): Promise<void> {
  try {
    const id = newId();
    await prisma.notification.create({
      data: {
        id,
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

    // Push real-time via WebSocket
    await pushToUser(input.userId, {
      id,
      title: input.title,
      body: input.body ?? null,
      type: input.type ?? 'INFO',
      category: input.category,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      actionUrl: input.actionUrl ?? null,
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
