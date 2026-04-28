import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import * as imapService from './imap.service.js';
import { newId } from '../../lib/prisma.js';

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
let intervalId: ReturnType<typeof setInterval> | null = null;

async function syncAccount(accountId: string): Promise<void> {
  const account = await prisma.mailAccount.findFirst({
    where: { id: accountId, isActive: true, deletedAt: null },
  });
  if (!account) return;

  try {
    // Fetch recent messages from INBOX
    const result = await imapService.fetchMessageList(
      account as unknown as Parameters<typeof imapService.fetchMessageList>[0],
      'INBOX', 1, 50,
    );

    let newCount = 0;
    for (const msg of result.messages) {
      const existing = await prisma.mailMessage.findUnique({
        where: { mailAccountId_folder_uid: { mailAccountId: account.id, folder: 'INBOX', uid: msg.uid } },
      });
      if (!existing) {
        await prisma.mailMessage.create({
          data: {
            id: newId(), mailAccountId: account.id, folder: 'INBOX', uid: msg.uid,
            messageId: msg.messageId, inReplyTo: msg.inReplyTo,
            fromAddress: msg.fromAddress, fromName: msg.fromName,
            toAddresses: msg.toAddresses,
            ccAddresses: msg.ccAddresses.length ? msg.ccAddresses : undefined,
            subject: msg.subject, sentAt: msg.sentAt,
            isRead: msg.isRead, isFlagged: msg.isFlagged, hasAttachments: msg.hasAttachments,
          },
        });
        newCount++;
      }
    }

    await prisma.mailAccount.update({
      where: { id: account.id },
      data: { lastSyncAt: new Date(), lastSyncError: null },
    });

    if (newCount > 0) {
      logger.info({ accountId, email: account.emailAddress, newCount }, 'Mail sync: new messages');
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ accountId, err: message }, 'Mail sync failed for account');
    await prisma.mailAccount.update({
      where: { id: accountId },
      data: { lastSyncError: message.slice(0, 1000) },
    });
  }
}

async function syncAll(): Promise<void> {
  const accounts = await prisma.mailAccount.findMany({
    where: { isActive: true, deletedAt: null },
    select: { id: true },
  });

  for (const account of accounts) {
    await syncAccount(account.id);
  }
}

export function startMailSyncWorker(): void {
  logger.info({ interval: '5m' }, 'Mail sync worker started');
  // Run first sync after 30 seconds (let the server warm up)
  setTimeout(() => {
    syncAll().catch((err) => logger.error({ err }, 'Mail sync error'));
  }, 30_000);

  intervalId = setInterval(() => {
    syncAll().catch((err) => logger.error({ err }, 'Mail sync error'));
  }, SYNC_INTERVAL_MS);
}

export function stopMailSyncWorker(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
    logger.info('Mail sync worker stopped');
  }
}
