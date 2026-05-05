/**
 * Microsoft Graph API service for Microsoft 365 mail accounts.
 * Mirrors the interface of imap.service.ts so the route layer can dispatch transparently.
 */
import { prisma } from '../../lib/prisma.js';
import { logger } from '../../lib/logger.js';
import type { FolderInfo, EnvelopeMessage } from './imap.service.js';

// ===== Config helpers =====

async function getMs365Config(): Promise<{ clientId: string; clientSecret: string; tenantId: string; redirectUri: string }> {
  const rows = await prisma.appConfig.findMany({
    where: { key: { in: ['ms365_client_id', 'ms365_client_secret', 'ms365_tenant_id', 'ms365_redirect_uri'] } },
  });
  const cfg = Object.fromEntries(rows.map((r) => [r.key, r.value]));
  if (!cfg['ms365_client_id'] || !cfg['ms365_client_secret']) {
    throw new Error('Microsoft 365 OAuth not configured. Go to System → Configuration and set Client ID and Client Secret.');
  }
  return {
    clientId: cfg['ms365_client_id']!,
    clientSecret: cfg['ms365_client_secret']!,
    tenantId: cfg['ms365_tenant_id'] || 'common',
    redirectUri: cfg['ms365_redirect_uri'] || 'http://localhost:4200/mail/oauth/callback',
  };
}

// ===== Token management =====

interface TokenSet {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}

/**
 * Get a valid access token for a Microsoft 365 mail account.
 * Auto-refreshes if expired.
 */
export async function getAccessToken(accountId: string): Promise<string> {
  const account = await prisma.mailAccount.findUnique({
    where: { id: accountId },
    select: { id: true, oauthAccessToken: true, oauthRefreshToken: true, oauthTokenExpiry: true },
  });
  if (!account) throw new Error('Mail account not found');
  if (!account.oauthRefreshToken) throw new Error('No OAuth refresh token. Please reconnect your Microsoft account.');

  // If token is still valid (with 2-minute buffer), use it
  if (account.oauthAccessToken && account.oauthTokenExpiry && account.oauthTokenExpiry.getTime() > Date.now() + 120_000) {
    return account.oauthAccessToken;
  }

  // Refresh the token
  const cfg = await getMs365Config();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: account.oauthRefreshToken,
    scope: 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access',
  });

  const res = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    logger.error({ status: res.status, err: errText }, 'Microsoft token refresh failed');
    throw new Error('Microsoft token refresh failed. Please reconnect your Microsoft account in Mail Settings.');
  }

  const data = await res.json() as { access_token: string; refresh_token?: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  await prisma.mailAccount.update({
    where: { id: accountId },
    data: {
      oauthAccessToken: data.access_token,
      oauthRefreshToken: data.refresh_token ?? account.oauthRefreshToken,
      oauthTokenExpiry: expiresAt,
    },
  });

  return data.access_token;
}

/**
 * Exchange authorization code for tokens. Called after OAuth callback.
 */
export async function exchangeCodeForTokens(code: string): Promise<TokenSet & { email: string; displayName: string }> {
  const cfg = await getMs365Config();
  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: cfg.redirectUri,
    scope: 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access',
  });

  const res = await fetch(`https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text();
    logger.error({ status: res.status, err: errText }, 'Microsoft code exchange failed');
    let detail = '';
    try {
      const errJson = JSON.parse(errText);
      detail = errJson.error_description || errJson.error || '';
    } catch { detail = errText; }
    throw new Error(`Microsoft authentication failed (${res.status}): ${detail}`);
  }

  const data = await res.json() as { access_token: string; refresh_token: string; expires_in: number };
  const expiresAt = new Date(Date.now() + data.expires_in * 1000);

  // Get user profile to get email
  const profileRes = await fetch('https://graph.microsoft.com/v1.0/me', {
    headers: { Authorization: `Bearer ${data.access_token}` },
  });
  if (!profileRes.ok) throw new Error('Failed to fetch Microsoft profile');
  const profile = await profileRes.json() as { mail?: string; userPrincipalName?: string; displayName?: string };

  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt,
    email: profile.mail ?? profile.userPrincipalName ?? '',
    displayName: profile.displayName ?? '',
  };
}

/**
 * Build the Microsoft OAuth authorization URL.
 */
export async function getAuthorizationUrl(state: string): Promise<string> {
  const cfg = await getMs365Config();
  const params = new URLSearchParams({
    client_id: cfg.clientId,
    response_type: 'code',
    redirect_uri: cfg.redirectUri,
    scope: 'https://graph.microsoft.com/Mail.ReadWrite https://graph.microsoft.com/Mail.Send https://graph.microsoft.com/User.Read offline_access',
    response_mode: 'query',
    state,
    prompt: 'consent',
  });
  return `https://login.microsoftonline.com/${cfg.tenantId}/oauth2/v2.0/authorize?${params.toString()}`;
}

// ===== Graph API helpers =====

async function graphFetch(accountId: string, path: string, options?: RequestInit): Promise<Response> {
  const token = await getAccessToken(accountId);
  const url = path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`;
  return fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });
}

async function graphGet<T>(accountId: string, path: string): Promise<T> {
  const res = await graphFetch(accountId, path);
  if (!res.ok) {
    const err = await res.text();
    logger.error({ status: res.status, path, err }, 'Graph API error');
    throw new Error(`Microsoft Graph error (${res.status})`);
  }
  return res.json() as Promise<T>;
}

// ===== Mail operations (mirrors imap.service interface) =====

const SPECIAL_USE_MAP: Record<string, string> = {
  inbox: '\\Inbox',
  sentItems: '\\Sent',
  drafts: '\\Drafts',
  deleteditems: '\\Trash',
  junkemail: '\\Junk',
  archive: '\\Archive',
};

export async function testConnection(accountId: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await graphGet<{ id: string }>(accountId, '/me');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function fetchFolders(accountId: string): Promise<FolderInfo[]> {
  const data = await graphGet<{ value: Array<{ id: string; displayName: string; totalItemCount: number; unreadItemCount: number }> }>(
    accountId, '/me/mailFolders?$top=50',
  );

  return data.value.map((f) => ({
    path: f.displayName,
    name: f.displayName,
    delimiter: '/',
    specialUse: SPECIAL_USE_MAP[f.displayName.toLowerCase().replace(/\s/g, '')] ?? null,
    messagesCount: f.totalItemCount,
    unseenCount: f.unreadItemCount,
  }));
}

interface GraphMessage {
  id: string;
  internetMessageId: string | null;
  conversationId: string | null;
  subject: string | null;
  bodyPreview: string;
  from: { emailAddress: { address: string; name: string } } | null;
  toRecipients: Array<{ emailAddress: { address: string; name: string } }>;
  ccRecipients: Array<{ emailAddress: { address: string; name: string } }>;
  sentDateTime: string;
  receivedDateTime: string;
  isRead: boolean;
  flag: { flagStatus: string };
  hasAttachments: boolean;
  body?: { contentType: string; content: string };
  attachments?: Array<{ id: string; name: string; contentType: string; size: number; isInline: boolean; contentBytes?: string }>;
}

/**
 * Generate a stable integer UID from a Graph message ID string.
 * Uses a simple hash that fits in a signed 32-bit integer (Prisma Int).
 */
function stableUid(graphId: string): number {
  let hash = 0;
  for (let i = 0; i < graphId.length; i++) {
    hash = ((hash << 5) - hash + graphId.charCodeAt(i)) | 0;
  }
  // Ensure positive and within safe range for MySQL INT
  return Math.abs(hash) % 2000000000;
}

function graphMsgToEnvelope(msg: GraphMessage): EnvelopeMessage {
  return {
    uid: stableUid(msg.id),
    messageId: msg.internetMessageId,
    inReplyTo: null,
    fromAddress: msg.from?.emailAddress.address ?? '',
    fromName: msg.from?.emailAddress.name ?? null,
    toAddresses: msg.toRecipients.map((r) => ({ address: r.emailAddress.address, name: r.emailAddress.name || null })),
    ccAddresses: msg.ccRecipients.map((r) => ({ address: r.emailAddress.address, name: r.emailAddress.name || null })),
    subject: msg.subject,
    sentAt: new Date(msg.sentDateTime || msg.receivedDateTime),
    isRead: msg.isRead,
    isFlagged: msg.flag?.flagStatus === 'flagged',
    hasAttachments: msg.hasAttachments,
    size: 0,
  };
}

export async function fetchMessageList(
  accountId: string,
  folder: string,
  page: number,
  limit: number,
): Promise<{ messages: Array<EnvelopeMessage & { graphId: string }>; total: number }> {
  const skip = (page - 1) * limit;
  // Resolve folder ID by name
  const folderId = await resolveFolderId(accountId, folder);

  const data = await graphGet<{ value: GraphMessage[]; '@odata.count'?: number }>(
    accountId,
    `/me/mailFolders/${folderId}/messages?$top=${limit}&$skip=${skip}&$orderby=receivedDateTime desc&$count=true&$select=id,internetMessageId,subject,bodyPreview,from,toRecipients,ccRecipients,sentDateTime,receivedDateTime,isRead,flag,hasAttachments`,
  );

  const messages = data.value.map((msg, i) => ({
    ...graphMsgToEnvelope(msg),
    graphId: msg.id,
  }));

  return { messages, total: data['@odata.count'] ?? messages.length };
}

export async function fetchMessageBody(
  accountId: string,
  graphMessageId: string,
): Promise<{
  bodyHtml: string | null;
  bodyText: string | null;
  attachments: Array<{ id: string; filename: string; contentType: string; size: number }>;
}> {
  const msg = await graphGet<GraphMessage>(
    accountId,
    `/me/messages/${graphMessageId}?$select=body,attachments&$expand=attachments`,
  );

  const isHtml = msg.body?.contentType === 'html';
  return {
    bodyHtml: isHtml ? (msg.body?.content ?? null) : null,
    bodyText: isHtml ? null : (msg.body?.content ?? null),
    attachments: (msg.attachments ?? [])
      .filter((a) => !a.isInline)
      .map((a) => ({ id: a.id, filename: a.name, contentType: a.contentType, size: a.size })),
  };
}

export async function downloadAttachment(
  accountId: string,
  graphMessageId: string,
  attachmentId: string,
): Promise<{ data: Buffer; filename: string; contentType: string }> {
  const att = await graphGet<{ name: string; contentType: string; contentBytes: string }>(
    accountId,
    `/me/messages/${graphMessageId}/attachments/${attachmentId}`,
  );
  return {
    data: Buffer.from(att.contentBytes, 'base64'),
    filename: att.name,
    contentType: att.contentType,
  };
}

export async function searchMessages(
  accountId: string,
  query: string,
  limit: number = 20,
): Promise<Array<EnvelopeMessage & { graphId: string }>> {
  const data = await graphGet<{ value: GraphMessage[] }>(
    accountId,
    `/me/messages?$search="${encodeURIComponent(query)}"&$top=${limit}&$orderby=receivedDateTime desc&$select=id,internetMessageId,subject,bodyPreview,from,toRecipients,ccRecipients,sentDateTime,receivedDateTime,isRead,flag,hasAttachments`,
  );
  return data.value.map((msg, i) => ({
    ...graphMsgToEnvelope(msg),
    graphId: msg.id,
  }));
}

export async function moveMessages(
  accountId: string,
  graphMessageIds: string[],
  toFolder: string,
): Promise<void> {
  const folderId = await resolveFolderId(accountId, toFolder);
  for (const id of graphMessageIds) {
    await graphFetch(accountId, `/me/messages/${id}/move`, {
      method: 'POST',
      body: JSON.stringify({ destinationId: folderId }),
    });
  }
}

export async function deleteMessages(
  accountId: string,
  graphMessageIds: string[],
): Promise<void> {
  for (const id of graphMessageIds) {
    await graphFetch(accountId, `/me/messages/${id}`, { method: 'DELETE' });
  }
}

export async function markRead(
  accountId: string,
  graphMessageId: string,
  isRead: boolean = true,
): Promise<void> {
  await graphFetch(accountId, `/me/messages/${graphMessageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ isRead }),
  });
}

export async function sendMail(
  accountId: string,
  message: {
    to: string[];
    cc?: string[];
    bcc?: string[];
    subject: string;
    bodyHtml: string;
    inReplyTo?: string;
  },
): Promise<string> {
  const toRecipients = message.to.map((addr) => ({ emailAddress: { address: addr } }));
  const ccRecipients = (message.cc ?? []).map((addr) => ({ emailAddress: { address: addr } }));
  const bccRecipients = (message.bcc ?? []).map((addr) => ({ emailAddress: { address: addr } }));

  const res = await graphFetch(accountId, '/me/sendMail', {
    method: 'POST',
    body: JSON.stringify({
      message: {
        subject: message.subject,
        body: { contentType: 'HTML', content: message.bodyHtml },
        toRecipients,
        ccRecipients,
        bccRecipients,
      },
      saveToSentItems: true,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Failed to send: ${err}`);
  }

  // Graph sendMail returns 202 with no body — generate a message ID
  return `<graph-${Date.now()}@microsoft.com>`;
}

// ===== Helpers =====

const folderIdCache = new Map<string, string>();

async function resolveFolderId(accountId: string, folderName: string): Promise<string> {
  const key = `${accountId}:${folderName}`;
  if (folderIdCache.has(key)) return folderIdCache.get(key)!;

  // Well-known folder names
  const wellKnown: Record<string, string> = {
    'INBOX': 'inbox',
    'Inbox': 'inbox',
    'Sent Items': 'sentitems',
    'Sent': 'sentitems',
    'Drafts': 'drafts',
    'Deleted Items': 'deleteditems',
    'Trash': 'deleteditems',
    'Junk Email': 'junkemail',
    'Junk': 'junkemail',
    'Archive': 'archive',
  };

  const wellKnownId = wellKnown[folderName];
  if (wellKnownId) {
    folderIdCache.set(key, wellKnownId);
    return wellKnownId;
  }

  // Lookup by name
  try {
    const data = await graphGet<{ value: Array<{ id: string; displayName: string }> }>(
      accountId,
      `/me/mailFolders?$filter=displayName eq '${folderName.replace(/'/g, "''")}'`,
    );
    const first = data.value[0];
    if (first) {
      folderIdCache.set(key, first.id);
      return first.id;
    }
  } catch { /* fallthrough */ }

  // Fallback: use the name as-is (Graph might accept it)
  return folderName;
}

/**
 * Sync recent messages for a Microsoft 365 account (used by sync worker).
 */
export async function syncRecent(accountId: string, limit: number = 50): Promise<{
  messages: Array<EnvelopeMessage & { graphId: string }>;
  total: number;
}> {
  return fetchMessageList(accountId, 'INBOX', 1, limit);
}
