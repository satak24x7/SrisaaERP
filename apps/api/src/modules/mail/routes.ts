import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { recordAudit } from '../../middleware/audit.js';
import { prisma, newId } from '../../lib/prisma.js';
import { encrypt, decrypt } from '../../lib/crypto.js';
import { summarizeEmail, draftEmailReply } from '../../lib/gemini.js';
import { errors, AppError } from '../../middleware/error-handler.js';
import { logger } from '../../lib/logger.js';
import { uploadFile as storageUpload } from '../../lib/dms-storage.js';
import * as imapService from './imap.service.js';
import * as smtpService from './smtp.service.js';
import * as msgraphService from './msgraph.service.js';

function actorId(req: import('express').Request): string {
  const raw = req.user?.id ?? 'usr_anonymous';
  return raw.length <= 26 ? raw : raw.slice(0, 26);
}

async function resolveMyUserId(req: import('express').Request): Promise<string | null> {
  const sub = req.user?.id;
  if (!sub) return null;
  const user = await prisma.user.findUnique({ where: { externalId: sub }, select: { id: true } });
  if (user) return user.id;
  const byId = await prisma.user.findUnique({ where: { id: sub }, select: { id: true } });
  return byId?.id ?? null;
}

// --- Zod schemas ---

const IdParams = z.object({ id: z.string().min(1).max(26) });
const MsgIdParams = z.object({ id: z.string().min(1).max(26) });
const AttachParams = z.object({ id: z.string().min(1).max(26), idx: z.coerce.number().int().min(0) });

const CreateAccount = z.object({
  label: z.string().min(1).max(128),
  emailAddress: z.string().email().max(255),
  senderName: z.string().max(255).optional(),
  imapHost: z.string().min(1).max(255),
  imapPort: z.coerce.number().int().min(1).max(65535).default(993),
  imapSsl: z.boolean().default(true),
  smtpHost: z.string().min(1).max(255),
  smtpPort: z.coerce.number().int().min(1).max(65535).default(465),
  smtpSsl: z.boolean().default(true),
  password: z.string().min(1),
});

const UpdateAccount = z.object({
  label: z.string().min(1).max(128).optional(),
  emailAddress: z.string().email().max(255).optional(),
  senderName: z.string().max(255).nullable().optional(),
  imapHost: z.string().min(1).max(255).optional(),
  imapPort: z.coerce.number().int().min(1).max(65535).optional(),
  imapSsl: z.boolean().optional(),
  smtpHost: z.string().min(1).max(255).optional(),
  smtpPort: z.coerce.number().int().min(1).max(65535).optional(),
  smtpSsl: z.boolean().optional(),
  password: z.string().min(1).optional(),
  isActive: z.boolean().optional(),
});

const ListMessagesQuery = z.object({
  folder: z.string().default('INBOX'),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  refresh: z.string().optional(), // "true" to force IMAP fetch; otherwise serve from DB cache
});

// --- Helpers ---

function accountToDto(row: Record<string, unknown>) {
  return {
    id: row.id, label: row.label, emailAddress: row.emailAddress,
    senderName: row.senderName ?? null,
    accountType: row.accountType ?? 'IMAP',
    imapHost: row.imapHost ?? null, imapPort: row.imapPort ?? null, imapSsl: row.imapSsl,
    smtpHost: row.smtpHost ?? null, smtpPort: row.smtpPort ?? null, smtpSsl: row.smtpSsl,
    isActive: row.isActive,
    lastSyncAt: row.lastSyncAt ? (row.lastSyncAt as Date).toISOString() : null,
    lastSyncError: row.lastSyncError ?? null,
    createdAt: (row.createdAt as Date).toISOString(),
  };
}

function isMs365(account: { accountType?: string | null }): boolean {
  return account.accountType === 'MICROSOFT_365';
}

// --- Router ---

export const mailRouter: ExpressRouter = Router();
mailRouter.use(requireAuth);

/* GET /accounts — list my mail accounts */
mailRouter.get('/accounts', asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  if (!userId) throw errors.unauthorized('User not found');
  const rows = await prisma.mailAccount.findMany({
    where: { userId, deletedAt: null },
    orderBy: { createdAt: 'desc' },
  });
  res.json({ data: rows.map((r) => accountToDto(r as unknown as Record<string, unknown>)) });
}));

/* POST /accounts — create mail account */
mailRouter.post('/accounts', validate({ body: CreateAccount }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  if (!userId) throw errors.unauthorized('User not found');
  const body = req.body as z.infer<typeof CreateAccount>;
  const actor = actorId(req);
  const { encrypted, iv, tag } = encrypt(body.password);
  const id = newId();

  await prisma.mailAccount.create({
    data: {
      id, userId, label: body.label, emailAddress: body.emailAddress, senderName: body.senderName ?? null,
      imapHost: body.imapHost, imapPort: body.imapPort, imapSsl: body.imapSsl,
      smtpHost: body.smtpHost, smtpPort: body.smtpPort, smtpSsl: body.smtpSsl,
      encryptedPass: encrypted, passIv: iv, passTag: tag,
      createdBy: actor, updatedBy: actor,
    },
  });

  const row = await prisma.mailAccount.findUniqueOrThrow({ where: { id } });
  await recordAudit(req, { action: 'CREATE', resourceType: 'mail_account', resourceId: id, after: { label: body.label, email: body.emailAddress } });
  res.status(201).json({ data: accountToDto(row as unknown as Record<string, unknown>) });
}));

/* PATCH /accounts/:id — update */
mailRouter.patch('/accounts/:id', validate({ params: IdParams, body: UpdateAccount }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const account = await prisma.mailAccount.findFirst({ where: { id: req.params.id as string, userId: userId!, deletedAt: null } });
  if (!account) throw errors.notFound('Mail account not found');

  const body = req.body as z.infer<typeof UpdateAccount>;
  const data: Record<string, unknown> = { updatedBy: actorId(req) };
  for (const [k, v] of Object.entries(body)) {
    if (v === undefined) continue;
    if (k === 'password') {
      const { encrypted, iv, tag } = encrypt(v as string);
      data.encryptedPass = encrypted; data.passIv = iv; data.passTag = tag;
      continue;
    }
    data[k] = v;
  }

  await prisma.mailAccount.update({ where: { id: account.id }, data });
  const row = await prisma.mailAccount.findUniqueOrThrow({ where: { id: account.id } });
  await recordAudit(req, { action: 'UPDATE', resourceType: 'mail_account', resourceId: account.id });
  res.json({ data: accountToDto(row as unknown as Record<string, unknown>) });
}));

/* DELETE /accounts/:id */
mailRouter.delete('/accounts/:id', validate({ params: IdParams }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const account = await prisma.mailAccount.findFirst({ where: { id: req.params.id as string, userId: userId!, deletedAt: null } });
  if (!account) throw errors.notFound('Mail account not found');
  await prisma.mailAccount.update({ where: { id: account.id }, data: { deletedAt: new Date() } });
  await recordAudit(req, { action: 'DELETE', resourceType: 'mail_account', resourceId: account.id });
  res.status(204).end();
}));

/* POST /accounts/:id/test — test connection */
mailRouter.post('/accounts/:id/test', validate({ params: IdParams }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const account = await prisma.mailAccount.findFirst({ where: { id: req.params.id as string, userId: userId!, deletedAt: null } });
  if (!account) throw errors.notFound('Mail account not found');

  if (isMs365(account)) {
    const result = await msgraphService.testConnection(account.id);
    res.json({ data: { imap: result.ok, error: result.error } });
  } else {
    const result = await imapService.testConnection(account as unknown as Parameters<typeof imapService.testConnection>[0]);
    res.json({ data: result });
  }
}));

/* GET /accounts/:id/folders — list mail folders */
mailRouter.get('/accounts/:id/folders', validate({ params: IdParams }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const account = await prisma.mailAccount.findFirst({ where: { id: req.params.id as string, userId: userId!, deletedAt: null } });
  if (!account) throw errors.notFound('Mail account not found');

  const folders = isMs365(account)
    ? await msgraphService.fetchFolders(account.id)
    : await imapService.fetchFolders(account as unknown as Parameters<typeof imapService.fetchFolders>[0]);

  // Supplement with unread counts from DB cache
  const cachedCounts = await prisma.mailMessage.groupBy({
    by: ['folder'],
    where: { mailAccountId: account.id },
    _count: { id: true },
  });
  const unreadCounts = await prisma.mailMessage.groupBy({
    by: ['folder'],
    where: { mailAccountId: account.id, isRead: false },
    _count: { id: true },
  });
  const countMap = new Map(cachedCounts.map((c) => [c.folder, c._count.id]));
  const unreadMap = new Map(unreadCounts.map((c) => [c.folder, c._count.id]));

  for (const f of folders) {
    if (countMap.has(f.path)) f.messagesCount = countMap.get(f.path)!;
    if (unreadMap.has(f.path)) f.unseenCount = unreadMap.get(f.path)!;
  }

  res.json({ data: folders });
}));

/* GET /accounts/:id/messages — list messages in folder */
mailRouter.get('/accounts/:id/messages', validate({ params: IdParams, query: ListMessagesQuery }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const account = await prisma.mailAccount.findFirst({ where: { id: req.params.id as string, userId: userId!, deletedAt: null } });
  if (!account) throw errors.notFound('Mail account not found');

  const q = req.query as unknown as z.infer<typeof ListMessagesQuery>;

  // Check if we have cached messages for this folder
  const cachedCount = await prisma.mailMessage.count({ where: { mailAccountId: account.id, folder: q.folder } });

  if (cachedCount > 0 && q.refresh !== 'true') {
    // Serve from DB cache (instant)
    const skip = (q.page - 1) * q.limit;
    const cached = await prisma.mailMessage.findMany({
      where: { mailAccountId: account.id, folder: q.folder },
      orderBy: { sentAt: 'desc' },
      skip, take: q.limit,
    });
    res.json({
      data: cached.map((m) => ({
        uid: m.uid, messageId: m.messageId, fromAddress: m.fromAddress, fromName: m.fromName,
        toAddresses: m.toAddresses, subject: m.subject,
        sentAt: m.sentAt.toISOString(), isRead: m.isRead, isFlagged: m.isFlagged,
        hasAttachments: m.hasAttachments,
      })),
      meta: { total: cachedCount, page: q.page, limit: q.limit, folder: q.folder },
    });
    return;
  }

  // Fetch from provider (first load or explicit refresh)
  let result: { messages: imapService.EnvelopeMessage[]; total: number };

  if (isMs365(account)) {
    const graphResult = await msgraphService.fetchMessageList(account.id, q.folder, q.page, q.limit);
    // Store graphId in cache so we can fetch body later
    for (const msg of graphResult.messages) {
      await prisma.mailMessage.upsert({
        where: { mailAccountId_folder_uid: { mailAccountId: account.id, folder: q.folder, uid: msg.uid } },
        create: {
          id: newId(), mailAccountId: account.id, folder: q.folder, uid: msg.uid,
          messageId: msg.graphId, inReplyTo: null,
          fromAddress: msg.fromAddress, fromName: msg.fromName,
          toAddresses: msg.toAddresses, ccAddresses: msg.ccAddresses.length ? msg.ccAddresses : undefined,
          subject: msg.subject, sentAt: msg.sentAt,
          isRead: msg.isRead, isFlagged: msg.isFlagged, hasAttachments: msg.hasAttachments,
        },
        update: { isRead: msg.isRead, isFlagged: msg.isFlagged },
      });
    }
    result = { messages: graphResult.messages, total: graphResult.total };
  } else {
    result = await imapService.fetchMessageList(
      account as unknown as Parameters<typeof imapService.fetchMessageList>[0],
      q.folder, q.page, q.limit,
    );
    // Upsert messages into cache
    for (const msg of result.messages) {
      await prisma.mailMessage.upsert({
        where: { mailAccountId_folder_uid: { mailAccountId: account.id, folder: q.folder, uid: msg.uid } },
        create: {
          id: newId(), mailAccountId: account.id, folder: q.folder, uid: msg.uid,
          messageId: msg.messageId, inReplyTo: msg.inReplyTo,
          fromAddress: msg.fromAddress, fromName: msg.fromName,
          toAddresses: msg.toAddresses, ccAddresses: msg.ccAddresses.length ? msg.ccAddresses : undefined,
          subject: msg.subject, sentAt: msg.sentAt,
          isRead: msg.isRead, isFlagged: msg.isFlagged, hasAttachments: msg.hasAttachments,
        },
        update: { isRead: msg.isRead, isFlagged: msg.isFlagged },
      });
    }
  }

  res.json({
    data: result.messages.map((m) => ({
      uid: m.uid, messageId: m.messageId, fromAddress: m.fromAddress, fromName: m.fromName,
      toAddresses: m.toAddresses, subject: m.subject,
      sentAt: m.sentAt.toISOString(), isRead: m.isRead, isFlagged: m.isFlagged,
      hasAttachments: m.hasAttachments,
    })),
    meta: { total: result.total, page: q.page, limit: q.limit, folder: q.folder },
  });
}));

/* GET /accounts/:id/search — search emails via IMAP */
const SearchQuery = z.object({
  folder: z.string().default('INBOX'),
  q: z.string().min(1),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
mailRouter.get('/accounts/:id/search', validate({ params: IdParams, query: SearchQuery }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const account = await prisma.mailAccount.findFirst({ where: { id: req.params.id as string, userId: userId!, deletedAt: null } });
  if (!account) throw errors.notFound('Mail account not found');

  const q = req.query as unknown as z.infer<typeof SearchQuery>;
  const result = await imapService.searchMessages(
    account as unknown as Parameters<typeof imapService.searchMessages>[0],
    q.folder, q.q, q.limit,
  );

  // Cache search results
  for (const msg of result.messages) {
    await prisma.mailMessage.upsert({
      where: { mailAccountId_folder_uid: { mailAccountId: account.id, folder: q.folder, uid: msg.uid } },
      create: {
        id: newId(), mailAccountId: account.id, folder: q.folder, uid: msg.uid,
        messageId: msg.messageId, inReplyTo: msg.inReplyTo,
        fromAddress: msg.fromAddress, fromName: msg.fromName,
        toAddresses: msg.toAddresses, ccAddresses: msg.ccAddresses.length ? msg.ccAddresses : undefined,
        subject: msg.subject, sentAt: msg.sentAt,
        isRead: msg.isRead, isFlagged: msg.isFlagged, hasAttachments: msg.hasAttachments,
      },
      update: { isRead: msg.isRead, isFlagged: msg.isFlagged },
    });
  }

  res.json({
    data: result.messages.map((m) => ({
      uid: m.uid, messageId: m.messageId, fromAddress: m.fromAddress, fromName: m.fromName,
      toAddresses: m.toAddresses, subject: m.subject,
      sentAt: m.sentAt.toISOString(), isRead: m.isRead, isFlagged: m.isFlagged,
      hasAttachments: m.hasAttachments,
    })),
    meta: { total: result.total, folder: q.folder, query: q.q },
  });
}));

/* GET /messages/by-uid — find message by account+folder+uid and return full body */
const ByUidQuery = z.object({ accountId: z.string().min(1).max(26), folder: z.string().min(1), uid: z.coerce.number().int() });
mailRouter.get('/messages/by-uid', validate({ query: ByUidQuery }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const q = req.query as unknown as z.infer<typeof ByUidQuery>;

  const account = await prisma.mailAccount.findFirst({ where: { id: q.accountId, userId: userId!, deletedAt: null } });
  if (!account) throw errors.notFound('Mail account not found');

  let cached = await prisma.mailMessage.findUnique({
    where: { mailAccountId_folder_uid: { mailAccountId: q.accountId, folder: q.folder, uid: q.uid } },
  });

  if (!cached) throw errors.notFound('Message not found in cache');

  // Fetch body if not cached
  if (!cached.bodyHtml && !cached.bodyText) {
    if (isMs365(account)) {
      const graphId = cached.messageId;
      if (!graphId) throw errors.businessRule('NO_GRAPH_ID', 'Cannot fetch message — missing Graph ID');
      const body = await msgraphService.fetchMessageBody(account.id, graphId);
      const attachmentsMeta = body.attachments.map((a, i) => ({
        index: i, filename: a.filename, contentType: a.contentType, size: a.size, graphAttachmentId: a.id,
      }));
      await prisma.mailMessage.update({
        where: { id: cached.id },
        data: {
          bodyHtml: body.bodyHtml, bodyText: body.bodyText,
          hasAttachments: attachmentsMeta.length > 0,
          attachments: attachmentsMeta.length > 0 ? attachmentsMeta : undefined,
          isRead: true,
        },
      });
      void msgraphService.markRead(account.id, graphId);
    } else {
      const parsed = await imapService.fetchMessageBody(
        account as unknown as Parameters<typeof imapService.fetchMessageBody>[0],
        q.folder, q.uid,
      );
      const attachmentsMeta = (parsed.attachments ?? []).map((a, i) => ({
        index: i, filename: a.filename ?? `attachment-${i}`,
        contentType: a.contentType ?? 'application/octet-stream', size: a.size ?? 0,
      }));
      await prisma.mailMessage.update({
        where: { id: cached.id },
        data: {
          bodyHtml: parsed.html || null, bodyText: parsed.text || null,
          snippet: (parsed.text ?? '').slice(0, 500),
          hasAttachments: attachmentsMeta.length > 0,
          attachments: attachmentsMeta.length > 0 ? attachmentsMeta : undefined,
          isRead: true,
        },
      });
    }
    cached = await prisma.mailMessage.findUniqueOrThrow({ where: { id: cached.id } });
  }

  res.json({
    data: {
      id: cached.id, folder: cached.folder, uid: cached.uid, messageId: cached.messageId,
      fromAddress: cached.fromAddress, fromName: cached.fromName,
      toAddresses: cached.toAddresses, ccAddresses: cached.ccAddresses,
      subject: cached.subject, sentAt: cached.sentAt.toISOString(),
      bodyHtml: cached.bodyHtml, bodyText: cached.bodyText,
      attachments: cached.attachments ?? [], isRead: true, isFlagged: cached.isFlagged,
      aiSummary: cached.aiSummary ?? null,
    },
  });
}));

/* GET /messages/:id — full message body (by cached DB id or by uid) */
mailRouter.get('/messages/:id', validate({ params: MsgIdParams }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const cached = await prisma.mailMessage.findFirst({
    where: { id: req.params.id as string },
    include: { mailAccount: { select: { id: true, userId: true, emailAddress: true, accountType: true, imapHost: true, imapPort: true, imapSsl: true, encryptedPass: true, passIv: true, passTag: true } } },
  });
  if (!cached || cached.mailAccount.userId !== userId) throw errors.notFound('Message not found');

  // If body not cached, fetch from provider
  if (!cached.bodyHtml && !cached.bodyText) {
    if (isMs365(cached.mailAccount)) {
      // For MS365, messageId stores the Graph message ID
      const graphId = cached.messageId;
      if (!graphId) throw errors.businessRule('NO_GRAPH_ID', 'Cannot fetch message body — missing Graph ID');
      const body = await msgraphService.fetchMessageBody(cached.mailAccount.id, graphId);
      const attachmentsMeta = body.attachments.map((a, i) => ({
        index: i, filename: a.filename, contentType: a.contentType, size: a.size, graphAttachmentId: a.id,
      }));
      await prisma.mailMessage.update({
        where: { id: cached.id },
        data: {
          bodyHtml: body.bodyHtml, bodyText: body.bodyText,
          hasAttachments: attachmentsMeta.length > 0,
          attachments: attachmentsMeta.length > 0 ? attachmentsMeta : undefined,
          isRead: true,
        },
      });
      // Mark as read in Graph too
      void msgraphService.markRead(cached.mailAccount.id, graphId);

      const updated = await prisma.mailMessage.findUniqueOrThrow({ where: { id: cached.id } });
      res.json({
        data: {
          id: updated.id, folder: updated.folder, uid: updated.uid, messageId: updated.messageId,
          fromAddress: updated.fromAddress, fromName: updated.fromName,
          toAddresses: updated.toAddresses, ccAddresses: updated.ccAddresses,
          subject: updated.subject, sentAt: updated.sentAt.toISOString(),
          bodyHtml: updated.bodyHtml, bodyText: updated.bodyText,
          attachments: updated.attachments ?? [], isRead: true, isFlagged: updated.isFlagged,
          aiSummary: updated.aiSummary ?? null,
        },
      });
      return;
    }

    const parsed = await imapService.fetchMessageBody(
      cached.mailAccount as unknown as Parameters<typeof imapService.fetchMessageBody>[0],
      cached.folder, cached.uid,
    );
    const attachmentsMeta = (parsed.attachments ?? []).map((a, i) => ({
      index: i, filename: a.filename ?? `attachment-${i}`,
      contentType: a.contentType ?? 'application/octet-stream', size: a.size ?? 0,
    }));

    await prisma.mailMessage.update({
      where: { id: cached.id },
      data: {
        bodyHtml: parsed.html || null,
        bodyText: parsed.text || null,
        snippet: (parsed.text ?? '').slice(0, 500),
        hasAttachments: attachmentsMeta.length > 0,
        attachments: attachmentsMeta.length > 0 ? attachmentsMeta : undefined,
        isRead: true,
      },
    });

    res.json({
      data: {
        id: cached.id, folder: cached.folder, uid: cached.uid, messageId: cached.messageId,
        fromAddress: cached.fromAddress, fromName: cached.fromName,
        toAddresses: cached.toAddresses, ccAddresses: cached.ccAddresses,
        subject: cached.subject, sentAt: cached.sentAt.toISOString(),
        bodyHtml: parsed.html || null, bodyText: parsed.text || null,
        attachments: attachmentsMeta, isRead: true, isFlagged: cached.isFlagged,
        aiSummary: cached.aiSummary ?? null,
      },
    });
    return;
  }

  res.json({
    data: {
      id: cached.id, folder: cached.folder, uid: cached.uid, messageId: cached.messageId,
      fromAddress: cached.fromAddress, fromName: cached.fromName,
      toAddresses: cached.toAddresses, ccAddresses: cached.ccAddresses,
      subject: cached.subject, sentAt: cached.sentAt.toISOString(),
      bodyHtml: cached.bodyHtml, bodyText: cached.bodyText,
      attachments: cached.attachments ?? [], isRead: cached.isRead, isFlagged: cached.isFlagged,
      aiSummary: cached.aiSummary ?? null,
    },
  });
}));

/* GET /messages/:id/attachment/:idx — download attachment */
mailRouter.get('/messages/:id/attachment/:idx', validate({ params: AttachParams }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const cached = await prisma.mailMessage.findFirst({
    where: { id: req.params.id as string },
    include: { mailAccount: { select: { id: true, userId: true, emailAddress: true, accountType: true, imapHost: true, imapPort: true, imapSsl: true, encryptedPass: true, passIv: true, passTag: true } } },
  });
  if (!cached || cached.mailAccount.userId !== userId) throw errors.notFound('Message not found');

  const idx = Number(req.params.idx);

  if (isMs365(cached.mailAccount)) {
    const graphId = cached.messageId;
    if (!graphId) throw errors.businessRule('NO_GRAPH_ID', 'Cannot fetch attachment — missing Graph ID');
    // Get attachment ID from cached metadata
    const attMeta = (cached.attachments as Array<{ graphAttachmentId?: string; filename: string; contentType: string }> | null)?.[idx];
    if (!attMeta?.graphAttachmentId) throw errors.notFound('Attachment not found');
    const att = await msgraphService.downloadAttachment(cached.mailAccount.id, graphId, attMeta.graphAttachmentId);
    res.setHeader('Content-Type', att.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${att.filename}"`);
    res.send(att.data);
  } else {
    const att = await imapService.streamAttachment(
      cached.mailAccount as unknown as Parameters<typeof imapService.streamAttachment>[0],
      cached.folder, cached.uid, idx,
    );
    res.setHeader('Content-Type', att.contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${att.filename}"`);
    res.send(att.content);
  }
}));

// ===== Save attachment to DMS =====

const SaveAttachBody = z.object({
  folderId: z.string().min(1).max(26),
  name: z.string().min(1).max(255).optional(),
  entityType: z.enum(['OPPORTUNITY', 'PROJECT', 'TENDER', 'INITIATIVE', 'ACCOUNT']).optional(),
  entityId: z.string().min(1).max(26).optional(),
});

/* POST /messages/:id/attachment/:idx/save-to-dms — save attachment to DMS folder */
mailRouter.post('/messages/:id/attachment/:idx/save-to-dms', validate({ params: AttachParams, body: SaveAttachBody }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const cached = await prisma.mailMessage.findFirst({
    where: { id: req.params.id as string },
    include: { mailAccount: { select: { id: true, userId: true, emailAddress: true, imapHost: true, imapPort: true, imapSsl: true, encryptedPass: true, passIv: true, passTag: true } } },
  });
  if (!cached || cached.mailAccount.userId !== userId) throw errors.notFound('Message not found');

  const idx = Number(req.params.idx);
  const att = await imapService.streamAttachment(
    cached.mailAccount as unknown as Parameters<typeof imapService.streamAttachment>[0],
    cached.folder, cached.uid, idx,
  );

  const body = req.body as z.infer<typeof SaveAttachBody>;

  // Validate folder exists
  const folder = await prisma.documentFolder.findFirst({ where: { id: body.folderId, deletedAt: null } });
  if (!folder) throw errors.notFound('Folder not found');

  // Write attachment to temp file for the storage layer
  const tempDir = path.join(os.tmpdir(), 'govprojects-mail-att');
  if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
  const ext = path.extname(att.filename) || '';
  const tempFileName = `${newId()}${ext}`;
  const tempPath = path.join(tempDir, tempFileName);
  fs.writeFileSync(tempPath, att.content);

  // Build a multer-like file object for the storage layer
  const multerFile = {
    path: tempPath,
    originalname: att.filename,
    mimetype: att.contentType,
    size: att.content.length,
    filename: tempFileName,
    fieldname: 'file',
    encoding: '7bit',
    destination: tempDir,
    buffer: att.content,
    stream: fs.createReadStream(tempPath),
  } as Express.Multer.File;

  // Upload via storage layer (uses folder's driveId if Google Drive)
  const result = await storageUpload(multerFile, folder.driveId ?? '');

  const actor = actorId(req);
  const docName = body.name?.trim() || path.parse(att.filename).name;

  // Find max sortOrder in target folder
  const last = await prisma.document.findFirst({
    where: { folderId: body.folderId, deletedAt: null },
    orderBy: { sortOrder: 'desc' },
    select: { sortOrder: true },
  });

  const doc = await prisma.document.create({
    data: {
      id: newId(), folderId: body.folderId, name: docName,
      fileName: att.filename, mimeType: att.contentType, fileSize: att.content.length,
      storagePath: result.storagePath,
      sortOrder: (last?.sortOrder ?? -1) + 1,
      createdBy: actor, updatedBy: actor,
    },
  });

  // Optionally link to an entity
  if (body.entityType && body.entityId) {
    await prisma.documentEntityLink.create({
      data: { id: newId(), documentId: doc.id, entityType: body.entityType, entityId: body.entityId, createdBy: actor },
    });
  }

  await recordAudit(req, { action: 'CREATE', resourceType: 'document', resourceId: doc.id, after: { name: doc.name, fileName: doc.fileName, source: 'email_attachment' } });
  res.status(201).json({ data: { id: doc.id, name: doc.name, fileName: doc.fileName } });
}));

// ===== Delete messages =====

/* DELETE /messages/:id — delete single message */
mailRouter.delete('/messages/:id', validate({ params: MsgIdParams }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const cached = await prisma.mailMessage.findFirst({
    where: { id: req.params.id as string },
    include: { mailAccount: true },
  });
  if (!cached || cached.mailAccount.userId !== userId) throw errors.notFound('Message not found');

  // Delete from IMAP if it's a real message (positive uid)
  if (cached.uid > 0) {
    try {
      await imapService.deleteMessages(
        cached.mailAccount as unknown as Parameters<typeof imapService.deleteMessages>[0],
        cached.folder, [cached.uid],
      );
    } catch { /* IMAP delete failed — still remove from cache */ }
  }

  // Remove from local cache
  await prisma.mailMessage.delete({ where: { id: cached.id } });
  res.status(204).end();
}));

/* POST /accounts/:id/delete-messages — bulk delete */
const BulkDeleteBody = z.object({
  folder: z.string().min(1),
  uids: z.array(z.coerce.number().int()).min(1),
});

mailRouter.post('/accounts/:id/delete-messages', validate({ params: IdParams, body: BulkDeleteBody }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const account = await prisma.mailAccount.findFirst({ where: { id: req.params.id as string, userId: userId!, deletedAt: null } });
  if (!account) throw errors.notFound('Mail account not found');

  const body = req.body as z.infer<typeof BulkDeleteBody>;
  const realUids = body.uids.filter((u) => u > 0);

  // Delete from IMAP
  if (realUids.length > 0) {
    try {
      await imapService.deleteMessages(
        account as unknown as Parameters<typeof imapService.deleteMessages>[0],
        body.folder, realUids,
      );
    } catch { /* continue to remove from cache */ }
  }

  // Remove from local cache
  await prisma.mailMessage.deleteMany({
    where: { mailAccountId: account.id, folder: body.folder, uid: { in: body.uids } },
  });

  res.json({ data: { deleted: body.uids.length } });
}));

/* POST /accounts/:id/not-spam — move messages from Junk/Spam to INBOX */
const NotSpamBody = z.object({
  folder: z.string().min(1),
  uids: z.array(z.coerce.number().int()).min(1),
});

mailRouter.post('/accounts/:id/not-spam', validate({ params: IdParams, body: NotSpamBody }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const account = await prisma.mailAccount.findFirst({ where: { id: req.params.id as string, userId: userId!, deletedAt: null } });
  if (!account) throw errors.notFound('Mail account not found');

  const body = req.body as z.infer<typeof NotSpamBody>;
  const realUids = body.uids.filter((u) => u > 0);

  if (realUids.length > 0) {
    await imapService.moveMessages(
      account as unknown as Parameters<typeof imapService.moveMessages>[0],
      body.folder, 'INBOX', realUids,
    );
  }

  // Remove from local cache (they'll reappear in INBOX on next refresh)
  await prisma.mailMessage.deleteMany({
    where: { mailAccountId: account.id, folder: body.folder, uid: { in: body.uids } },
  });

  res.json({ data: { moved: body.uids.length } });
}));

/* POST /accounts/:id/move-messages — move messages to another folder */
const MoveMessagesBody = z.object({
  folder: z.string().min(1),
  uids: z.array(z.coerce.number().int()).min(1),
  toFolder: z.string().min(1),
});

mailRouter.post('/accounts/:id/move-messages', validate({ params: IdParams, body: MoveMessagesBody }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const account = await prisma.mailAccount.findFirst({ where: { id: req.params.id as string, userId: userId!, deletedAt: null } });
  if (!account) throw errors.notFound('Mail account not found');

  const body = req.body as z.infer<typeof MoveMessagesBody>;
  if (body.folder === body.toFolder) { res.json({ data: { moved: 0 } }); return; }

  const realUids = body.uids.filter((u) => u > 0);
  if (realUids.length > 0) {
    await imapService.moveMessages(
      account as unknown as Parameters<typeof imapService.moveMessages>[0],
      body.folder, body.toFolder, realUids,
    );
  }

  // Remove from local cache (they'll reappear in target folder on next refresh)
  await prisma.mailMessage.deleteMany({
    where: { mailAccountId: account.id, folder: body.folder, uid: { in: body.uids } },
  });

  res.json({ data: { moved: body.uids.length } });
}));

// ===== AI Email Assistant =====

function stripHtml(html: string): string {
  return html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

async function getMessageForAi(messageId: string, userId: string) {
  const msg = await prisma.mailMessage.findFirst({
    where: { id: messageId },
    include: { mailAccount: { select: { userId: true } } },
  });
  if (!msg || msg.mailAccount.userId !== userId) return null;
  return msg;
}

/* POST /messages/:id/ai-summarize — summarize email via Gemini (cached in DB) */
const AiSummarizeBody = z.object({ regenerate: z.boolean().optional() });
mailRouter.post('/messages/:id/ai-summarize', validate({ params: MsgIdParams, body: AiSummarizeBody }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const msg = await getMessageForAi(req.params.id as string, userId!);
  if (!msg) throw errors.notFound('Message not found');

  const regen = (req.body as z.infer<typeof AiSummarizeBody>).regenerate;

  // Return cached summary if available and not forcing regenerate
  if (msg.aiSummary && !regen) {
    res.json({ data: { summary: msg.aiSummary, cached: true } });
    return;
  }

  const body = msg.bodyText || (msg.bodyHtml ? stripHtml(msg.bodyHtml) : '');
  if (!body) throw errors.validation('Email has no content to summarize');

  const toAddrs = (msg.toAddresses as Array<{ address: string }>).map((a) => a.address);
  const ccAddrs = msg.ccAddresses ? (msg.ccAddresses as Array<{ address: string }>).map((a) => a.address) : undefined;

  const summary = await summarizeEmail({
    subject: msg.subject, body, from: msg.fromAddress, to: toAddrs, cc: ccAddrs,
  });

  // Persist summary
  await prisma.mailMessage.update({
    where: { id: msg.id },
    data: { aiSummary: summary, aiSummarizedAt: new Date() },
  });

  res.json({ data: { summary, cached: false } });
}));

/* POST /messages/:id/ai-draft — draft reply via Gemini */
const AiDraftBody = z.object({ prompt: z.string().max(500).optional() });

mailRouter.post('/messages/:id/ai-draft', validate({ params: MsgIdParams, body: AiDraftBody }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const msg = await getMessageForAi(req.params.id as string, userId!);
  if (!msg) throw errors.notFound('Message not found');

  const bodyText = msg.bodyText || (msg.bodyHtml ? stripHtml(msg.bodyHtml) : '');
  if (!bodyText) throw errors.validation('Email has no content to draft a reply for');

  const toAddrs = (msg.toAddresses as Array<{ address: string }>).map((a) => a.address);
  const ccAddrs = msg.ccAddresses ? (msg.ccAddresses as Array<{ address: string }>).map((a) => a.address) : undefined;
  const userPrompt = (req.body as z.infer<typeof AiDraftBody>).prompt;

  const draft = await draftEmailReply(
    { subject: msg.subject, body: bodyText, from: msg.fromAddress, to: toAddrs, cc: ccAddrs },
    userPrompt,
  );

  res.json({ data: { draft } });
}));

// ===== Phase 2: Compose / Reply / Forward =====

const SendMailBody = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  bcc: z.array(z.string().email()).optional(),
  subject: z.string().max(1000),
  html: z.string(),
});

/* POST /accounts/:id/send — compose and send new email */
mailRouter.post('/accounts/:id/send', validate({ params: IdParams, body: SendMailBody }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const account = await prisma.mailAccount.findFirst({ where: { id: req.params.id as string, userId: userId!, deletedAt: null } });
  if (!account) throw errors.notFound('Mail account not found');

  const body = req.body as z.infer<typeof SendMailBody>;
  let messageId: string;

  if (isMs365(account)) {
    messageId = await msgraphService.sendMail(account.id, {
      to: body.to, cc: body.cc, bcc: body.bcc, subject: body.subject, bodyHtml: body.html,
    });
  } else {
    const result = await smtpService.sendMail(
      account as unknown as Parameters<typeof smtpService.sendMail>[0],
      { to: body.to, cc: body.cc, bcc: body.bcc, subject: body.subject, html: body.html },
    );
    messageId = result.messageId;
  }

  // Cache sent message locally (MS365 saves to Sent Items automatically, but we cache too)
  await prisma.mailMessage.create({
    data: {
      id: newId(), mailAccountId: account.id, folder: 'Sent', uid: -(Date.now() % 2147483647),
      messageId, fromAddress: account.emailAddress, fromName: null,
      toAddresses: body.to.map((a) => ({ address: a, name: null })),
      ccAddresses: body.cc?.map((a) => ({ address: a, name: null })),
      subject: body.subject, bodyHtml: body.html,
      snippet: body.html.replace(/<[^>]*>/g, '').slice(0, 500),
      isRead: true, sentAt: new Date(),
    },
  });

  res.json({ data: { messageId } });
}));

const ReplyBody = z.object({
  html: z.string(),
  to: z.array(z.string().email()).optional(),
  cc: z.array(z.string().email()).optional(),
  replyAll: z.boolean().default(false),
});

/* POST /messages/:id/reply — reply to a message */
mailRouter.post('/messages/:id/reply', validate({ params: MsgIdParams, body: ReplyBody }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const msg = await prisma.mailMessage.findFirst({
    where: { id: req.params.id as string },
    include: { mailAccount: true },
  });
  if (!msg || msg.mailAccount.userId !== userId) throw errors.notFound('Message not found');

  const body = req.body as z.infer<typeof ReplyBody>;
  const account = msg.mailAccount;

  // Build recipients
  let toAddrs = body.to ?? [msg.fromAddress];
  let ccAddrs = body.cc ?? [];
  if (body.replyAll) {
    const origTo = (msg.toAddresses as Array<{ address: string }>).map((a) => a.address).filter((a) => a !== account.emailAddress);
    const origCc = (msg.ccAddresses as Array<{ address: string }> | null)?.map((a) => a.address).filter((a) => a !== account.emailAddress) ?? [];
    toAddrs = [msg.fromAddress, ...origTo];
    ccAddrs = [...origCc, ...ccAddrs];
  }
  // Deduplicate
  toAddrs = [...new Set(toAddrs)];
  ccAddrs = [...new Set(ccAddrs.filter((a) => !toAddrs.includes(a)))];

  const subject = msg.subject?.startsWith('Re: ') ? msg.subject : `Re: ${msg.subject ?? ''}`;

  let messageId: string;
  if (isMs365(account)) {
    messageId = await msgraphService.sendMail(account.id, {
      to: toAddrs, cc: ccAddrs, subject, bodyHtml: body.html, inReplyTo: msg.messageId ?? undefined,
    });
  } else {
    const result = await smtpService.sendMail(
      account as unknown as Parameters<typeof smtpService.sendMail>[0],
      { to: toAddrs, cc: ccAddrs, subject, html: body.html, inReplyTo: msg.messageId ?? undefined, references: msg.messageId ?? undefined },
    );
    messageId = result.messageId;
  }

  // Cache sent reply
  await prisma.mailMessage.create({
    data: {
      id: newId(), mailAccountId: account.id, folder: 'Sent', uid: -(Date.now() % 2147483647),
      messageId, inReplyTo: msg.messageId,
      fromAddress: account.emailAddress, fromName: null,
      toAddresses: toAddrs.map((a) => ({ address: a, name: null })),
      ccAddresses: ccAddrs.length ? ccAddrs.map((a) => ({ address: a, name: null })) : undefined,
      subject, bodyHtml: body.html,
      snippet: body.html.replace(/<[^>]*>/g, '').slice(0, 500),
      isRead: true, sentAt: new Date(),
    },
  });

  res.json({ data: { messageId } });
}));

const ForwardBody = z.object({
  to: z.array(z.string().email()).min(1),
  cc: z.array(z.string().email()).optional(),
  html: z.string(),
});

/* POST /messages/:id/forward — forward a message */
mailRouter.post('/messages/:id/forward', validate({ params: MsgIdParams, body: ForwardBody }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const msg = await prisma.mailMessage.findFirst({
    where: { id: req.params.id as string },
    include: { mailAccount: true },
  });
  if (!msg || msg.mailAccount.userId !== userId) throw errors.notFound('Message not found');

  const body = req.body as z.infer<typeof ForwardBody>;
  const account = msg.mailAccount;
  const subject = msg.subject?.startsWith('Fwd: ') ? msg.subject : `Fwd: ${msg.subject ?? ''}`;

  let sendResult: { messageId: string };
  if (isMs365(account)) {
    const mid = await msgraphService.sendMail(account.id, {
      to: body.to, cc: body.cc, subject, bodyHtml: body.html,
    });
    sendResult = { messageId: mid };
  } else {
    sendResult = await smtpService.sendMail(
      account as unknown as Parameters<typeof smtpService.sendMail>[0],
      { to: body.to, cc: body.cc, subject, html: body.html },
    );
  }

  await prisma.mailMessage.create({
    data: {
      id: newId(), mailAccountId: account.id, folder: 'Sent', uid: -(Date.now() % 2147483647),
      messageId: sendResult.messageId, fromAddress: account.emailAddress, fromName: null,
      toAddresses: body.to.map((a) => ({ address: a, name: null })),
      ccAddresses: body.cc?.map((a) => ({ address: a, name: null })),
      subject, bodyHtml: body.html,
      snippet: body.html.replace(/<[^>]*>/g, '').slice(0, 500),
      isRead: true, sentAt: new Date(),
    },
  });

  res.json({ data: { messageId: sendResult.messageId } });
}));

// ===== Phase 3: Entity Linking =====

const LINK_ENTITY_TYPES = ['OPPORTUNITY', 'LEAD', 'ACCOUNT', 'PROJECT', 'INITIATIVE'] as const;
const CreateLinkBody = z.object({
  entityType: z.enum(LINK_ENTITY_TYPES),
  entityId: z.string().min(1).max(26),
});

/* POST /messages/:id/links — link email to entity */
mailRouter.post('/messages/:id/links', validate({ params: MsgIdParams, body: CreateLinkBody }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const msg = await prisma.mailMessage.findFirst({
    where: { id: req.params.id as string },
    include: { mailAccount: { select: { userId: true } } },
  });
  if (!msg || msg.mailAccount.userId !== userId) throw errors.notFound('Message not found');

  const body = req.body as z.infer<typeof CreateLinkBody>;
  const existing = await prisma.mailEntityLink.findUnique({
    where: { mailMessageId_entityType_entityId: { mailMessageId: msg.id, entityType: body.entityType, entityId: body.entityId } },
  });
  if (existing) { res.json({ data: { id: existing.id } }); return; }

  const link = await prisma.mailEntityLink.create({
    data: { id: newId(), mailMessageId: msg.id, entityType: body.entityType, entityId: body.entityId, createdBy: actorId(req) },
  });
  res.status(201).json({ data: { id: link.id } });
}));

/* DELETE /messages/:id/links/:linkId — remove link */
const LinkIdParams = z.object({ id: z.string().min(1).max(26), linkId: z.string().min(1).max(26) });
mailRouter.delete('/messages/:id/links/:linkId', validate({ params: LinkIdParams }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const link = await prisma.mailEntityLink.findFirst({
    where: { id: req.params.linkId as string, mailMessageId: req.params.id as string },
    include: { mailMessage: { include: { mailAccount: { select: { userId: true } } } } },
  });
  if (!link || link.mailMessage.mailAccount.userId !== userId) throw errors.notFound('Link not found');
  await prisma.mailEntityLink.delete({ where: { id: link.id } });
  res.status(204).end();
}));

/* GET /messages/:id/links — list links for a message */
mailRouter.get('/messages/:id/links', validate({ params: MsgIdParams }), asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  const msg = await prisma.mailMessage.findFirst({
    where: { id: req.params.id as string },
    include: { mailAccount: { select: { userId: true } } },
  });
  if (!msg || msg.mailAccount.userId !== userId) throw errors.notFound('Message not found');

  const links = await prisma.mailEntityLink.findMany({ where: { mailMessageId: msg.id } });

  const enriched: Array<{ id: string; entityType: string; entityId: string; entityName: string | null }> = [];
  for (const link of links) {
    let name: string | null = null;
    try {
      if (link.entityType === 'OPPORTUNITY') {
        const e = await prisma.opportunity.findUnique({ where: { id: link.entityId }, select: { title: true } });
        name = e?.title ?? null;
      } else if (link.entityType === 'LEAD') {
        const e = await prisma.lead.findUnique({ where: { id: link.entityId }, select: { title: true } });
        name = e?.title ?? null;
      } else if (link.entityType === 'ACCOUNT') {
        const e = await prisma.account.findUnique({ where: { id: link.entityId }, select: { name: true } });
        name = e?.name ?? null;
      } else if (link.entityType === 'PROJECT') {
        const e = await prisma.project.findUnique({ where: { id: link.entityId }, select: { name: true } });
        name = e?.name ?? null;
      } else if (link.entityType === 'INITIATIVE') {
        const e = await prisma.initiative.findUnique({ where: { id: link.entityId }, select: { title: true } });
        name = e?.title ?? null;
      }
    } catch { /* ignore */ }
    enriched.push({ id: link.id, entityType: link.entityType, entityId: link.entityId, entityName: name });
  }

  res.json({ data: enriched });
}));

/* GET /entity-links — reverse lookup: emails linked to an entity */
const EntityLinkQuery = z.object({
  entityType: z.enum(LINK_ENTITY_TYPES),
  entityId: z.string().min(1).max(26),
});
mailRouter.get('/entity-links', validate({ query: EntityLinkQuery }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.infer<typeof EntityLinkQuery>;
  const links = await prisma.mailEntityLink.findMany({
    where: { entityType: q.entityType, entityId: q.entityId },
    include: {
      mailMessage: {
        select: { id: true, fromAddress: true, fromName: true, subject: true, sentAt: true, folder: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  res.json({
    data: links.map((l) => ({
      id: l.id, entityType: l.entityType, entityId: l.entityId,
      message: {
        id: l.mailMessage.id, fromAddress: l.mailMessage.fromAddress, fromName: l.mailMessage.fromName,
        subject: l.mailMessage.subject, sentAt: l.mailMessage.sentAt.toISOString(), folder: l.mailMessage.folder,
      },
    })),
  });
}));

// ===== Microsoft 365 OAuth =====

/* GET /oauth/microsoft/authorize — get the Microsoft login URL */
mailRouter.get('/oauth/microsoft/authorize', asyncHandler(async (req, res) => {
  const userId = await resolveMyUserId(req);
  if (!userId) throw errors.unauthorized('User not found');
  // Use userId as state so we can associate the callback
  const state = Buffer.from(JSON.stringify({ userId })).toString('base64url');
  const url = await msgraphService.getAuthorizationUrl(state);
  res.json({ data: { url } });
}));

/* POST /oauth/microsoft/callback — exchange code for tokens + create account */
const OAuthCallbackBody = z.object({
  code: z.string().min(1),
  state: z.string().min(1),
});

mailRouter.post('/oauth/microsoft/callback', validate({ body: OAuthCallbackBody }), asyncHandler(async (req, res) => {
  try {
    const userId = await resolveMyUserId(req);
    if (!userId) throw errors.unauthorized('User not found');

    const { code, state } = req.body as z.infer<typeof OAuthCallbackBody>;

    // Verify state matches this user
    let stateData: { userId: string };
    try {
      stateData = JSON.parse(Buffer.from(state, 'base64url').toString()) as { userId: string };
    } catch {
      throw errors.businessRule('INVALID_STATE', 'Invalid OAuth state format. Please try again.');
    }
    if (stateData.userId !== userId) {
      throw errors.businessRule('INVALID_STATE', `OAuth state user mismatch. Expected ${userId}, got ${stateData.userId}. Please try again.`);
    }

    // Exchange code for tokens
    logger.info({ codeLength: code.length }, 'Exchanging Microsoft OAuth code');
    const tokens = await msgraphService.exchangeCodeForTokens(code);
    logger.info({ email: tokens.email, displayName: tokens.displayName }, 'Microsoft OAuth tokens obtained');

    const actor = actorId(req);

    // Check if account already exists for this email (including soft-deleted)
    const existing = await prisma.mailAccount.findFirst({
      where: { userId, emailAddress: tokens.email },
    });

    if (existing) {
      // Revive if soft-deleted, or update if active
      await prisma.mailAccount.update({
        where: { id: existing.id },
        data: {
          accountType: 'MICROSOFT_365',
          oauthAccessToken: tokens.accessToken,
          oauthRefreshToken: tokens.refreshToken,
          oauthTokenExpiry: tokens.expiresAt,
          senderName: tokens.displayName || existing.senderName,
          label: `Microsoft 365 (${tokens.email})`,
          deletedAt: null, // revive if soft-deleted
          isActive: true,
          updatedBy: actor,
        },
      });
      const row = await prisma.mailAccount.findUniqueOrThrow({ where: { id: existing.id } });
      res.json({ data: accountToDto(row as unknown as Record<string, unknown>) });
      return;
    }

    // Create new Microsoft 365 account
    const id = newId();
    await prisma.mailAccount.create({
      data: {
        id, userId, accountType: 'MICROSOFT_365',
        label: `Microsoft 365 (${tokens.email})`,
        emailAddress: tokens.email,
        senderName: tokens.displayName || null,
        oauthAccessToken: tokens.accessToken,
        oauthRefreshToken: tokens.refreshToken,
        oauthTokenExpiry: tokens.expiresAt,
        createdBy: actor, updatedBy: actor,
      },
    });

    await recordAudit(req, { action: 'CREATE', resourceType: 'mail_account', resourceId: id, after: { label: `Microsoft 365`, email: tokens.email } });
    const row = await prisma.mailAccount.findUniqueOrThrow({ where: { id } });
    res.status(201).json({ data: accountToDto(row as unknown as Record<string, unknown>) });
  } catch (err) {
    // Ensure ALL errors are returned as proper JSON, never as generic 500
    if (err instanceof AppError) throw err;
    const msg = err instanceof Error ? err.message : String(err);
    logger.error({ err: msg, stack: err instanceof Error ? err.stack : undefined }, 'Microsoft OAuth callback failed');
    throw errors.businessRule('OAUTH_FAILED', msg);
  }
}));
