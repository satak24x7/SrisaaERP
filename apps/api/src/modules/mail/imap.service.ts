import { ImapFlow } from 'imapflow';
import { simpleParser, type ParsedMail } from 'mailparser';
import { decrypt } from '../../lib/crypto.js';
import { logger } from '../../lib/logger.js';

interface MailAccountRow {
  id: string;
  emailAddress: string;
  imapHost: string;
  imapPort: number;
  imapSsl: boolean;
  encryptedPass: string;
  passIv: string;
  passTag: string;
}

export interface FolderInfo {
  path: string;
  name: string;
  delimiter: string;
  specialUse: string | null;
  messagesCount: number;
  unseenCount: number;
}

export interface EnvelopeMessage {
  uid: number;
  messageId: string | null;
  inReplyTo: string | null;
  fromAddress: string;
  fromName: string | null;
  toAddresses: Array<{ address: string; name: string | null }>;
  ccAddresses: Array<{ address: string; name: string | null }>;
  subject: string | null;
  sentAt: Date;
  isRead: boolean;
  isFlagged: boolean;
  hasAttachments: boolean;
  size: number;
}

function decryptPassword(account: MailAccountRow): string {
  return decrypt(account.encryptedPass, account.passIv, account.passTag);
}

function createClient(account: MailAccountRow): ImapFlow {
  const password = decryptPassword(account);
  return new ImapFlow({
    host: account.imapHost,
    port: account.imapPort,
    secure: account.imapSsl,
    auth: { user: account.emailAddress, pass: password },
    logger: false as unknown as import('imapflow').Logger,
    socketTimeout: 30000,
    emitLogs: false,
  });
}

export async function testConnection(account: MailAccountRow): Promise<{ imap: boolean; error?: string }> {
  const client = createClient(account);
  try {
    await client.connect();
    await client.logout();
    return { imap: true };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn({ err, email: account.emailAddress }, 'IMAP test connection failed');
    return { imap: false, error: message };
  }
}

export async function fetchFolders(account: MailAccountRow): Promise<FolderInfo[]> {
  const client = createClient(account);
  try {
    await client.connect();
    const tree = await client.listTree();
    const folders: FolderInfo[] = [];

    function walk(node: typeof tree) {
      if (node.path) {
        folders.push({
          path: node.path,
          name: node.name || node.path,
          delimiter: node.delimiter || '/',
          specialUse: (node as Record<string, unknown>).specialUse as string ?? null,
          messagesCount: (node as Record<string, unknown>).status?.messages ?? 0,
          unseenCount: (node as Record<string, unknown>).status?.unseen ?? 0,
        });
      }
      if (node.folders) {
        for (const child of node.folders) walk(child);
      }
    }
    walk(tree);

    // Only get INBOX status (fast) — skip other folders to avoid 10s+ delay
    try {
      const inboxStatus = await client.status('INBOX', { messages: true, unseen: true });
      const inbox = folders.find((f) => f.path === 'INBOX');
      if (inbox) {
        inbox.messagesCount = inboxStatus.messages ?? 0;
        inbox.unseenCount = inboxStatus.unseen ?? 0;
      }
    } catch { /* non-critical */ }

    await client.logout();
    return folders;
  } catch (err) {
    logger.error({ err }, 'Failed to fetch folders');
    try { await client.logout(); } catch { /* ignore */ }
    throw err;
  }
}

export async function fetchMessageList(
  account: MailAccountRow,
  folder: string,
  page: number,
  limit: number,
): Promise<{ messages: EnvelopeMessage[]; total: number }> {
  const client = createClient(account);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const mailbox = client.mailbox;
      const total = mailbox?.exists ?? 0;

      if (total === 0) {
        return { messages: [], total: 0 };
      }

      // Calculate range (most recent first)
      const start = Math.max(1, total - (page * limit) + 1);
      const end = Math.max(1, total - ((page - 1) * limit));
      const range = `${start}:${end}`;

      const messages: EnvelopeMessage[] = [];
      for await (const msg of client.fetch(range, {
        envelope: true,
        flags: true,
        bodyStructure: true,
        uid: true,
      })) {
        const env = msg.envelope;
        const from = env.from?.[0];
        messages.push({
          uid: msg.uid,
          messageId: env.messageId ?? null,
          inReplyTo: env.inReplyTo ?? null,
          fromAddress: from?.address ?? '',
          fromName: from?.name ?? null,
          toAddresses: (env.to ?? []).map((a: { address?: string; name?: string }) => ({ address: a.address ?? '', name: a.name ?? null })),
          ccAddresses: (env.cc ?? []).map((a: { address?: string; name?: string }) => ({ address: a.address ?? '', name: a.name ?? null })),
          subject: env.subject ?? null,
          sentAt: env.date ?? new Date(),
          isRead: msg.flags?.has('\\Seen') ?? false,
          isFlagged: msg.flags?.has('\\Flagged') ?? false,
          hasAttachments: hasAttachmentParts(msg.bodyStructure),
          size: msg.size ?? 0,
        });
      }

      // Reverse to show newest first
      messages.reverse();

      return { messages, total };
    } finally {
      lock.release();
    }
  } catch (err) {
    logger.error({ err, folder }, 'Failed to fetch message list');
    try { await client.logout(); } catch { /* ignore */ }
    throw err;
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

function hasAttachmentParts(structure: Record<string, unknown> | undefined): boolean {
  if (!structure) return false;
  const disp = (structure.disposition as string)?.toLowerCase();
  if (disp === 'attachment') return true;
  const childNodes = structure.childNodes as Array<Record<string, unknown>> | undefined;
  if (childNodes) {
    for (const child of childNodes) {
      if (hasAttachmentParts(child)) return true;
    }
  }
  return false;
}

export async function fetchMessageBody(
  account: MailAccountRow,
  folder: string,
  uid: number,
): Promise<ParsedMail> {
  const client = createClient(account);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      const source = await client.download(String(uid), undefined, { uid: true });
      const parsed = await simpleParser(source.content);

      // Mark as read
      try {
        await client.messageFlagsAdd(String(uid), ['\\Seen'], { uid: true });
      } catch { /* non-critical */ }

      return parsed;
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

export async function streamAttachment(
  account: MailAccountRow,
  folder: string,
  uid: number,
  partIndex: number,
): Promise<{ content: Buffer; filename: string; contentType: string }> {
  const parsed = await fetchMessageBody(account, folder, uid);
  const attachments = parsed.attachments ?? [];
  if (partIndex < 0 || partIndex >= attachments.length) {
    throw new Error('Attachment index out of range');
  }
  const att = attachments[partIndex]!;
  return {
    content: att.content,
    filename: att.filename ?? `attachment-${partIndex}`,
    contentType: att.contentType ?? 'application/octet-stream',
  };
}

export async function searchMessages(
  account: MailAccountRow,
  folder: string,
  query: string,
  limit: number = 50,
): Promise<{ messages: EnvelopeMessage[]; total: number }> {
  const client = createClient(account);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      // Search subject first (most common), then merge from/to/cc results
      // ImapFlow's OR syntax is unreliable, so we run separate searches and merge
      const uidSets: number[][] = [];
      for (const field of ['subject', 'from', 'to', 'cc'] as const) {
        try {
          const result = await client.search({ [field]: query }, { uid: true });
          if (result.length) uidSets.push(result);
        } catch { /* some servers don't support all search fields */ }
      }
      // Merge and deduplicate
      const uids = [...new Set(uidSets.flat())];
      const total = uids.length;

      if (total === 0) {
        return { messages: [], total: 0 };
      }

      // Take only the most recent N results
      const recentUids = uids.slice(-limit).reverse();
      const uidRange = recentUids.join(',');

      const messages: EnvelopeMessage[] = [];
      for await (const msg of client.fetch(uidRange, {
        envelope: true,
        flags: true,
        bodyStructure: true,
        uid: true,
      })) {
        const env = msg.envelope;
        const from = env.from?.[0];
        messages.push({
          uid: msg.uid,
          messageId: env.messageId ?? null,
          inReplyTo: env.inReplyTo ?? null,
          fromAddress: from?.address ?? '',
          fromName: from?.name ?? null,
          toAddresses: (env.to ?? []).map((a: { address?: string; name?: string }) => ({ address: a.address ?? '', name: a.name ?? null })),
          ccAddresses: (env.cc ?? []).map((a: { address?: string; name?: string }) => ({ address: a.address ?? '', name: a.name ?? null })),
          subject: env.subject ?? null,
          sentAt: env.date ?? new Date(),
          isRead: msg.flags?.has('\\Seen') ?? false,
          isFlagged: msg.flags?.has('\\Flagged') ?? false,
          hasAttachments: hasAttachmentParts(msg.bodyStructure),
          size: msg.size ?? 0,
        });
      }

      messages.sort((a, b) => b.sentAt.getTime() - a.sentAt.getTime());
      return { messages, total };
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

export async function moveMessages(
  account: MailAccountRow,
  fromFolder: string,
  toFolder: string,
  uids: number[],
): Promise<void> {
  if (uids.length === 0) return;
  const client = createClient(account);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(fromFolder);
    try {
      await client.messageMove(uids.map(String).join(','), toFolder, { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}

export async function deleteMessages(
  account: MailAccountRow,
  folder: string,
  uids: number[],
): Promise<void> {
  if (uids.length === 0) return;
  const client = createClient(account);
  try {
    await client.connect();
    const lock = await client.getMailboxLock(folder);
    try {
      // Mark as deleted and expunge
      await client.messageDelete(uids.map(String).join(','), { uid: true });
    } finally {
      lock.release();
    }
  } finally {
    try { await client.logout(); } catch { /* ignore */ }
  }
}
