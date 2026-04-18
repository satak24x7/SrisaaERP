import { Router, type Router as ExpressRouter } from 'express';
import { prisma } from '../../lib/prisma.js';
import { redis } from '../../lib/redis.js';

export const healthRouter: ExpressRouter = Router();
healthRouter.get('/', (_req, res) => {
  res.json({
    data: {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.APP_VERSION ?? '0.0.0',
    },
  });
});

type ProbeResult = { ok: true } | { ok: false; error: string };

async function probeDb(): Promise<ProbeResult> {
  try {
    await prisma.$queryRawUnsafe('SELECT 1');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

async function probeRedis(): Promise<ProbeResult> {
  try {
    const reply = await redis.ping();
    if (reply !== 'PONG') return { ok: false, error: `unexpected PING reply: ${reply}` };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export const readyRouter: ExpressRouter = Router();
readyRouter.get('/', async (_req, res) => {
  const [db, cache] = await Promise.all([probeDb(), probeRedis()]);
  const ready = db.ok && cache.ok;
  const checks = {
    db: db.ok ? { ok: true as const } : { ok: false as const, error: db.error },
    redis: cache.ok ? { ok: true as const } : { ok: false as const, error: cache.error },
  };
  res.status(ready ? 200 : 503).json({ data: { ready, checks } });
});
