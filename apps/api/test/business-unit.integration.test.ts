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
  seedUser,
  seedBusinessUnit,
  seedProject,
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
// POST /api/v1/business-units
// ---------------------------------------------------------------------------
describe('[integration] POST /api/v1/business-units', () => {
  it('creates a BU and persists it in the database', async () => {
    const user = await seedUser();

    const res = await request(app)
      .post('/api/v1/business-units')
      .set('Authorization', BEARER)
      .send({ name: 'Infra BU', description: 'Infrastructure division', buHeadUserId: user.id })
      .expect(201);

    expect(res.body.data.name).toBe('Infra BU');
    expect(res.body.data.description).toBe('Infrastructure division');
    expect(res.body.data.buHeadUserId).toBe(user.id);
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.id).toHaveLength(26); // ULID

    // Verify it's actually in the DB
    const dbRow = await db.businessUnit.findUnique({ where: { id: res.body.data.id } });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.name).toBe('Infra BU');
  });

  it('writes an audit log row on create', async () => {
    const user = await seedUser();

    const res = await request(app)
      .post('/api/v1/business-units')
      .set('Authorization', BEARER)
      .send({ name: 'Audit Test BU', buHeadUserId: user.id })
      .expect(201);

    const auditRows = await db.auditLog.findMany({
      where: { resourceType: 'business_unit', resourceId: res.body.data.id },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.action).toBe('CREATE');
    expect(auditRows[0]!.actorUserId).toBe('usr_integration_test');
  });

  it('returns 422 BU_HEAD_NOT_FOUND when buHeadUserId references no user', async () => {
    const res = await request(app)
      .post('/api/v1/business-units')
      .set('Authorization', BEARER)
      .send({ name: 'Ghost Head BU', buHeadUserId: '01ZZZZZZZZZZZZZZZZZZZZZZZA' })
      .expect(422);

    expect(res.body.error.code).toBe('BU_HEAD_NOT_FOUND');

    // Nothing should be created
    const count = await db.businessUnit.count();
    expect(count).toBe(0);
  });

  it('returns 400 when name is missing', async () => {
    const res = await request(app)
      .post('/api/v1/business-units')
      .set('Authorization', BEARER)
      .send({ description: 'no name' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 401 without auth', async () => {
    await request(app)
      .post('/api/v1/business-units')
      .send({ name: 'No Auth BU' })
      .expect(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/business-units
// ---------------------------------------------------------------------------
describe('[integration] GET /api/v1/business-units', () => {
  it('returns an empty list when no BUs exist', async () => {
    const res = await request(app)
      .get('/api/v1/business-units')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data).toEqual([]);
    expect(res.body.meta.next_cursor).toBeNull();
  });

  it('returns seeded BUs', async () => {
    await seedBusinessUnit({ name: 'Alpha BU' });
    await seedBusinessUnit({ name: 'Beta BU' });

    const res = await request(app)
      .get('/api/v1/business-units')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data).toHaveLength(2);
    const names = res.body.data.map((b: { name: string }) => b.name).sort();
    expect(names).toEqual(['Alpha BU', 'Beta BU']);
  });

  it('supports cursor-based pagination', async () => {
    // Seed 3 BUs
    await seedBusinessUnit({ name: 'BU-1' });
    await seedBusinessUnit({ name: 'BU-2' });
    await seedBusinessUnit({ name: 'BU-3' });

    // Page 1: limit=2
    const page1 = await request(app)
      .get('/api/v1/business-units?limit=2')
      .set('Authorization', BEARER)
      .expect(200);

    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.next_cursor).not.toBeNull();
    expect(page1.body.meta.limit).toBe(2);

    // Page 2: use cursor
    const page2 = await request(app)
      .get(`/api/v1/business-units?limit=2&cursor=${page1.body.meta.next_cursor}`)
      .set('Authorization', BEARER)
      .expect(200);

    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta.next_cursor).toBeNull();

    // No overlap
    const allIds = [
      ...page1.body.data.map((b: { id: string }) => b.id),
      ...page2.body.data.map((b: { id: string }) => b.id),
    ];
    expect(new Set(allIds).size).toBe(3);
  });

  it('filters by status', async () => {
    await seedBusinessUnit({ name: 'Active BU', status: 'ACTIVE' });
    await seedBusinessUnit({ name: 'Inactive BU', status: 'INACTIVE' });

    const res = await request(app)
      .get('/api/v1/business-units?status=INACTIVE')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Inactive BU');
  });

  it('supports text search via ?q=', async () => {
    await seedBusinessUnit({ name: 'Infrastructure Division' });
    await seedBusinessUnit({ name: 'IT Services' });

    const res = await request(app)
      .get('/api/v1/business-units?q=Infra')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('Infrastructure Division');
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/business-units/:id
// ---------------------------------------------------------------------------
describe('[integration] GET /api/v1/business-units/:id', () => {
  it('returns a single BU by id', async () => {
    const bu = await seedBusinessUnit({ name: 'Single BU' });

    const res = await request(app)
      .get(`/api/v1/business-units/${bu.id}`)
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data.id).toBe(bu.id);
    expect(res.body.data.name).toBe('Single BU');
  });

  it('returns 404 for non-existent id', async () => {
    const res = await request(app)
      .get('/api/v1/business-units/01ZZZZZZZZZZZZZZZZZZZZZZZZ')
      .set('Authorization', BEARER)
      .expect(404);

    expect(res.body.error.code).toBe('NOT_FOUND');
  });

  it('returns 404 for soft-deleted BU', async () => {
    const bu = await seedBusinessUnit({ name: 'Deleted BU' });
    await db.businessUnit.update({
      where: { id: bu.id },
      data: { deletedAt: new Date() },
    });

    await request(app)
      .get(`/api/v1/business-units/${bu.id}`)
      .set('Authorization', BEARER)
      .expect(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/business-units/:id
// ---------------------------------------------------------------------------
describe('[integration] PATCH /api/v1/business-units/:id', () => {
  it('updates name and records before/after audit', async () => {
    const bu = await seedBusinessUnit({ name: 'Old Name' });

    const res = await request(app)
      .patch(`/api/v1/business-units/${bu.id}`)
      .set('Authorization', BEARER)
      .send({ name: 'New Name' })
      .expect(200);

    expect(res.body.data.name).toBe('New Name');

    // Verify in DB
    const dbRow = await db.businessUnit.findUnique({ where: { id: bu.id } });
    expect(dbRow!.name).toBe('New Name');

    // Check audit
    const auditRows = await db.auditLog.findMany({
      where: { resourceType: 'business_unit', resourceId: bu.id, action: 'UPDATE' },
    });
    expect(auditRows).toHaveLength(1);
    const audit = auditRows[0]!;
    expect((audit.before as Record<string, unknown>).name).toBe('Old Name');
    expect((audit.after as Record<string, unknown>).name).toBe('New Name');
  });

  it('validates new buHeadUserId on update', async () => {
    const user = await seedUser();
    const bu = await seedBusinessUnit({ name: 'Head Test', buHeadUserId: user.id });

    const res = await request(app)
      .patch(`/api/v1/business-units/${bu.id}`)
      .set('Authorization', BEARER)
      .send({ buHeadUserId: '01ZZZZZZZZZZZZZZZZZZZZZZZA' })
      .expect(422);

    expect(res.body.error.code).toBe('BU_HEAD_NOT_FOUND');

    // DB unchanged
    const dbRow = await db.businessUnit.findUnique({ where: { id: bu.id } });
    expect(dbRow!.buHeadUserId).toBe(user.id);
  });

  it('returns 404 for non-existent BU', async () => {
    await request(app)
      .patch('/api/v1/business-units/01ZZZZZZZZZZZZZZZZZZZZZZZZ')
      .set('Authorization', BEARER)
      .send({ name: 'Nope' })
      .expect(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/business-units/:id
// ---------------------------------------------------------------------------
describe('[integration] DELETE /api/v1/business-units/:id', () => {
  it('soft-deletes a BU with no references', async () => {
    const bu = await seedBusinessUnit({ name: 'To Delete' });

    await request(app)
      .delete(`/api/v1/business-units/${bu.id}`)
      .set('Authorization', BEARER)
      .expect(204);

    // Verify soft-deleted in DB
    const dbRow = await db.businessUnit.findUnique({ where: { id: bu.id } });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.deletedAt).not.toBeNull();

    // Verify audit
    const auditRows = await db.auditLog.findMany({
      where: { resourceType: 'business_unit', resourceId: bu.id, action: 'DELETE' },
    });
    expect(auditRows).toHaveLength(1);
  });

  it('returns 422 BU_HAS_REFERENCES when projects reference the BU', async () => {
    const user = await seedUser();
    const bu = await seedBusinessUnit({ name: 'Referenced BU', buHeadUserId: user.id });
    await seedProject(bu.id, user.id);

    const res = await request(app)
      .delete(`/api/v1/business-units/${bu.id}`)
      .set('Authorization', BEARER)
      .expect(422);

    expect(res.body.error.code).toBe('BU_HAS_REFERENCES');
    expect(res.body.error.details.projects).toBe(1);

    // BU should NOT be deleted
    const dbRow = await db.businessUnit.findUnique({ where: { id: bu.id } });
    expect(dbRow!.deletedAt).toBeNull();
  });

  it('returns 404 for non-existent BU', async () => {
    await request(app)
      .delete('/api/v1/business-units/01ZZZZZZZZZZZZZZZZZZZZZZZZ')
      .set('Authorization', BEARER)
      .expect(404);
  });

  it('returns 404 for already-deleted BU', async () => {
    const bu = await seedBusinessUnit({ name: 'Already Deleted' });
    await db.businessUnit.update({
      where: { id: bu.id },
      data: { deletedAt: new Date() },
    });

    await request(app)
      .delete(`/api/v1/business-units/${bu.id}`)
      .set('Authorization', BEARER)
      .expect(404);
  });
});
