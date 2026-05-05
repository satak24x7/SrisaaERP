import { Server as HttpServer } from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import { createRemoteJWKSet, jwtVerify } from 'jose';
import { env } from '../config/env.js';
import { logger } from './logger.js';
import { prisma } from './prisma.js';

// User ID → set of connected sockets
const clients = new Map<string, Set<WebSocket>>();

let wss: WebSocketServer | null = null;

const JWKS_URL = new URL(`${env.JWT_ISSUER}/protocol/openid-connect/certs`);
const jwks = createRemoteJWKSet(JWKS_URL);

const ACCEPTED_ISSUERS: string[] = [env.JWT_ISSUER];
if (env.JWT_ISSUER_ALIASES) {
  for (const alias of env.JWT_ISSUER_ALIASES.split(',').map((s) => s.trim())) {
    if (alias) ACCEPTED_ISSUERS.push(alias);
  }
}

async function verifyToken(token: string): Promise<string | null> {
  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: ACCEPTED_ISSUERS,
      audience: env.JWT_AUDIENCE,
    });

    // Resolve DB user ID from Keycloak sub
    const sub = payload.sub;
    if (!sub) return null;

    const user = await prisma.user.findFirst({
      where: { externalId: sub, deletedAt: null },
      select: { id: true },
    });

    return user?.id ?? null;
  } catch {
    return null;
  }
}

export function initWebSocket(server: HttpServer): void {
  wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', async (ws, req) => {
    // Extract token from query string: /ws?token=xxx
    const url = new URL(req.url ?? '', `http://${req.headers.host}`);
    const token = url.searchParams.get('token');

    if (!token) {
      ws.close(4001, 'Missing token');
      return;
    }

    const userId = await verifyToken(token);
    if (!userId) {
      ws.close(4003, 'Invalid token');
      return;
    }

    // Register
    if (!clients.has(userId)) {
      clients.set(userId, new Set());
    }
    clients.get(userId)!.add(ws);
    logger.info({ userId, total: clients.get(userId)!.size }, 'WebSocket connected');

    // Send current unread count immediately
    try {
      const count = await prisma.notification.count({ where: { userId, isRead: false } });
      ws.send(JSON.stringify({ type: 'unread_count', data: { unreadCount: count } }));
    } catch { /* best effort */ }

    // Keepalive ping every 45s
    const pingInterval = setInterval(() => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.ping();
      }
    }, 45_000);

    ws.on('pong', () => { /* client is alive */ });

    ws.on('close', () => {
      const sockets = clients.get(userId);
      if (sockets) {
        sockets.delete(ws);
        if (sockets.size === 0) clients.delete(userId);
      }
      clearInterval(pingInterval);
      logger.debug({ userId }, 'WebSocket disconnected');
    });

    ws.on('error', (err) => {
      logger.warn({ userId, err: err.message }, 'WebSocket error');
    });
  });

  logger.info('WebSocket server initialized on /ws');
}

/**
 * Push a notification to a connected user in real time.
 * Called from notify() after DB insert.
 */
export async function pushToUser(userId: string, notification: {
  id: string; title: string; body: string | null; type: string; category: string;
  entityType: string | null; entityId: string | null; actionUrl: string | null;
}): Promise<void> {
  const sockets = clients.get(userId);
  if (!sockets || sockets.size === 0) return;

  // Get fresh unread count
  let unreadCount = 0;
  try {
    unreadCount = await prisma.notification.count({ where: { userId, isRead: false } });
  } catch { /* best effort */ }

  const message = JSON.stringify({
    type: 'notification',
    data: { ...notification, unreadCount },
  });

  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

/**
 * Push updated unread count (e.g. after mark-read).
 */
export async function pushUnreadCount(userId: string): Promise<void> {
  const sockets = clients.get(userId);
  if (!sockets || sockets.size === 0) return;

  let unreadCount = 0;
  try {
    unreadCount = await prisma.notification.count({ where: { userId, isRead: false } });
  } catch { /* best effort */ }

  const message = JSON.stringify({ type: 'unread_count', data: { unreadCount } });

  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message);
    }
  }
}

export function shutdownWebSocket(): void {
  if (wss) {
    for (const [, sockets] of clients) {
      for (const ws of sockets) ws.close(1001, 'Server shutting down');
    }
    clients.clear();
    wss.close();
    wss = null;
  }
}
