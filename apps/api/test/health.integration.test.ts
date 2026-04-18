import './setup.integration.js';

import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';

const app = createApp();

afterAll(async () => {
  await prisma.$disconnect();
  redis.disconnect();
});

describe('[integration] GET /api/v1/health', () => {
  it('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/v1/health').expect(200);
    expect(res.body.data.status).toBe('ok');
    expect(typeof res.body.data.timestamp).toBe('string');
    expect(res.body.data.version).toBe('0.0.1');
  });

  it('is accessible without auth', async () => {
    await request(app).get('/api/v1/health').expect(200);
  });

  it('echoes X-Correlation-ID', async () => {
    const res = await request(app)
      .get('/api/v1/health')
      .set('X-Correlation-ID', 'int-test-corr-001')
      .expect(200);
    expect(res.headers['x-correlation-id']).toBe('int-test-corr-001');
  });
});

describe('[integration] GET /api/v1/ready', () => {
  it('returns 200 with real DB + Redis checks passing', async () => {
    const res = await request(app).get('/api/v1/ready').expect(200);
    expect(res.body.data.ready).toBe(true);
    expect(res.body.data.checks.db.ok).toBe(true);
    expect(res.body.data.checks.redis.ok).toBe(true);
  });
});
