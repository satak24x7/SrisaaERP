import './setup.integration.js';

import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/lib/prisma.js';
import { redis } from '../src/lib/redis.js';
import {
  fakeJwt,
  getTestPrisma,
  disconnectTestPrisma,
  truncateAll,
  seedCompany,
} from './helpers.js';

const app = createApp();
const BEARER = fakeJwt();
const db = getTestPrisma();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await truncateAll();
  await disconnectTestPrisma();
  await prisma.$disconnect();
  redis.disconnect();
});

// ---------------------------------------------------------------------------
// GET /api/v1/company
// ---------------------------------------------------------------------------
describe('[integration] GET /api/v1/company', () => {
  it('returns 404 when no company profile exists', async () => {
    const res = await request(app)
      .get('/api/v1/company')
      .set('Authorization', BEARER)
      .expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns the company profile when it exists', async () => {
    await seedCompany({ legalName: 'Srisaa Technologies Pvt Ltd' });

    const res = await request(app)
      .get('/api/v1/company')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data.legalName).toBe('Srisaa Technologies Pvt Ltd');
    expect(res.body.data.id).toHaveLength(26);
  });

  it('returns 401 without auth', async () => {
    await request(app).get('/api/v1/company').expect(401);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/company
// ---------------------------------------------------------------------------
describe('[integration] PATCH /api/v1/company', () => {
  it('creates company on first PATCH (upsert) and returns 201', async () => {
    const res = await request(app)
      .patch('/api/v1/company')
      .set('Authorization', BEARER)
      .send({ legalName: 'New Corp Ltd', cin: 'U12345MH2020PTC123456' })
      .expect(201);

    expect(res.body.data.legalName).toBe('New Corp Ltd');
    expect(res.body.data.cin).toBe('U12345MH2020PTC123456');

    // Verify in DB
    const dbRow = await db.company.findFirst({ where: { deletedAt: null } });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.legalName).toBe('New Corp Ltd');
  });

  it('updates existing company on subsequent PATCH and returns 200', async () => {
    await seedCompany({ legalName: 'Old Name' });

    const res = await request(app)
      .patch('/api/v1/company')
      .set('Authorization', BEARER)
      .send({ legalName: 'Updated Name', registeredAddress: '123 MG Road, Mumbai' })
      .expect(200);

    expect(res.body.data.legalName).toBe('Updated Name');
    expect(res.body.data.registeredAddress).toBe('123 MG Road, Mumbai');
  });

  it('writes audit log on create', async () => {
    const res = await request(app)
      .patch('/api/v1/company')
      .set('Authorization', BEARER)
      .send({ legalName: 'Audit Test Corp' })
      .expect(201);

    const auditRows = await db.auditLog.findMany({
      where: { resourceType: 'company', resourceId: res.body.data.id },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.action).toBe('CREATE');
  });

  it('writes audit log on update with before/after', async () => {
    await seedCompany({ legalName: 'Before Corp' });

    // First GET to know the id
    const getRes = await request(app)
      .get('/api/v1/company')
      .set('Authorization', BEARER)
      .expect(200);

    await request(app)
      .patch('/api/v1/company')
      .set('Authorization', BEARER)
      .send({ legalName: 'After Corp' })
      .expect(200);

    const auditRows = await db.auditLog.findMany({
      where: { resourceType: 'company', resourceId: getRes.body.data.id, action: 'UPDATE' },
    });
    expect(auditRows).toHaveLength(1);
    const audit = auditRows[0]!;
    expect((audit.before as Record<string, unknown>).legalName).toBe('Before Corp');
    expect((audit.after as Record<string, unknown>).legalName).toBe('After Corp');
  });

  it('returns 400 on invalid input', async () => {
    const res = await request(app)
      .patch('/api/v1/company')
      .set('Authorization', BEARER)
      .send({ legalName: '' }) // min 1 char
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });
});
