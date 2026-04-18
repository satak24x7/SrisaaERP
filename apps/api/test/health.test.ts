import './setup.js';

const prismaQueryRaw = jest.fn();
const redisPing = jest.fn();

jest.mock('../src/lib/prisma.js', () => ({
  prisma: { auditLog: { create: jest.fn() }, $queryRawUnsafe: prismaQueryRaw },
  newId: () => '01HSTUBSTUBSTUBSTUBSTUBSTU',
}));

jest.mock('../src/lib/redis.js', () => ({
  redis: { ping: redisPing },
}));

import request from 'supertest';
import { createApp } from '../src/app.js';

describe('GET /api/v1/health', () => {
  const app = createApp();

  it('returns { data: { status: "ok" } }', async () => {
    const res = await request(app).get('/api/v1/health').expect(200);
    expect(res.body.data.status).toBe('ok');
    expect(typeof res.body.data.timestamp).toBe('string');
  });

  it('echoes a correlation id when supplied', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('X-Correlation-ID', 'corr-test-12345678')
      .expect(200);
    expect(res.headers['x-correlation-id']).toBe('corr-test-12345678');
  });
});

describe('GET /api/v1/ready', () => {
  const app = createApp();

  beforeEach(() => {
    prismaQueryRaw.mockReset();
    redisPing.mockReset();
  });

  it('returns 200 with ready:true when DB + Redis both respond', async () => {
    prismaQueryRaw.mockResolvedValueOnce([{ '1': 1 }]);
    redisPing.mockResolvedValueOnce('PONG');
    const res = await request(app).get('/api/v1/ready').expect(200);
    expect(res.body.data.ready).toBe(true);
    expect(res.body.data.checks.db.ok).toBe(true);
    expect(res.body.data.checks.redis.ok).toBe(true);
  });

  it('returns 503 with per-check error when DB fails', async () => {
    prismaQueryRaw.mockRejectedValueOnce(new Error('connection refused'));
    redisPing.mockResolvedValueOnce('PONG');
    const res = await request(app).get('/api/v1/ready').expect(503);
    expect(res.body.data.ready).toBe(false);
    expect(res.body.data.checks.db.ok).toBe(false);
    expect(res.body.data.checks.db.error).toContain('connection refused');
    expect(res.body.data.checks.redis.ok).toBe(true);
  });

  it('returns 503 when Redis fails', async () => {
    prismaQueryRaw.mockResolvedValueOnce([{ '1': 1 }]);
    redisPing.mockRejectedValueOnce(new Error('NOCONN'));
    const res = await request(app).get('/api/v1/ready').expect(503);
    expect(res.body.data.ready).toBe(false);
    expect(res.body.data.checks.redis.ok).toBe(false);
  });
});
