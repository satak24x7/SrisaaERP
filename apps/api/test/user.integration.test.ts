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
  seedRole,
  seedBusinessUnit,
  seedBuMember,
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
// POST /api/v1/users
// ---------------------------------------------------------------------------
describe('[integration] POST /api/v1/users', () => {
  it('creates a user and persists it', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', BEARER)
      .send({
        email: 'john@govprojects.local',
        fullName: 'John Doe',
        externalId: 'kc-sub-001',
        phone: '+91-9876543210',
      })
      .expect(201);

    expect(res.body.data.email).toBe('john@govprojects.local');
    expect(res.body.data.fullName).toBe('John Doe');
    expect(res.body.data.status).toBe('ACTIVE');
    expect(res.body.data.id).toHaveLength(26);

    // Verify DB
    const dbRow = await db.user.findUnique({ where: { id: res.body.data.id } });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.email).toBe('john@govprojects.local');
  });

  it('writes audit log on create', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', BEARER)
      .send({ email: 'audit@test.local', fullName: 'Audit User', externalId: 'kc-audit' })
      .expect(201);

    const auditRows = await db.auditLog.findMany({
      where: { resourceType: 'user', resourceId: res.body.data.id },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.action).toBe('CREATE');
  });

  it('returns 409 when email already exists', async () => {
    await seedUser({ email: 'taken@test.local' });

    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', BEARER)
      .send({ email: 'taken@test.local', fullName: 'Dup', externalId: 'kc-dup' })
      .expect(409);

    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 400 on missing required fields', async () => {
    const res = await request(app)
      .post('/api/v1/users')
      .set('Authorization', BEARER)
      .send({ email: 'partial@test.local' }) // missing fullName, externalId
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 400 on invalid email', async () => {
    await request(app)
      .post('/api/v1/users')
      .set('Authorization', BEARER)
      .send({ email: 'not-an-email', fullName: 'Bad', externalId: 'kc-bad' })
      .expect(400);
  });

  it('returns 401 without auth', async () => {
    await request(app)
      .post('/api/v1/users')
      .send({ email: 'a@b.com', fullName: 'X', externalId: 'y' })
      .expect(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/users
// ---------------------------------------------------------------------------
describe('[integration] GET /api/v1/users', () => {
  it('returns empty list when no users exist', async () => {
    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data).toEqual([]);
  });

  it('returns seeded users', async () => {
    await seedUser({ fullName: 'Alice' });
    await seedUser({ fullName: 'Bob' });

    const res = await request(app)
      .get('/api/v1/users')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data).toHaveLength(2);
  });

  it('supports cursor pagination', async () => {
    await seedUser({ fullName: 'U1' });
    await seedUser({ fullName: 'U2' });
    await seedUser({ fullName: 'U3' });

    const page1 = await request(app)
      .get('/api/v1/users?limit=2')
      .set('Authorization', BEARER)
      .expect(200);

    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.next_cursor).not.toBeNull();

    const page2 = await request(app)
      .get(`/api/v1/users?limit=2&cursor=${page1.body.meta.next_cursor}`)
      .set('Authorization', BEARER)
      .expect(200);

    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta.next_cursor).toBeNull();
  });

  it('filters by status', async () => {
    await seedUser({ fullName: 'Active User' });
    // Create an inactive user
    const inactive = await seedUser({ fullName: 'Inactive User' });
    await db.user.update({ where: { id: inactive.id }, data: { status: 'INACTIVE' } });

    const res = await request(app)
      .get('/api/v1/users?status=INACTIVE')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].fullName).toBe('Inactive User');
  });

  it('supports text search via ?q=', async () => {
    await seedUser({ fullName: 'Rajesh Kumar', email: 'rajesh@test.local' });
    await seedUser({ fullName: 'Priya Sharma', email: 'priya@test.local' });

    const res = await request(app)
      .get('/api/v1/users?q=Rajesh')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].fullName).toBe('Rajesh Kumar');
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/users/:id
// ---------------------------------------------------------------------------
describe('[integration] GET /api/v1/users/:id', () => {
  it('returns a single user', async () => {
    const user = await seedUser({ fullName: 'Single User', email: 'single@test.local' });

    const res = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data.id).toBe(user.id);
    expect(res.body.data.fullName).toBe('Single User');
  });

  it('includes BU memberships in response', async () => {
    const user = await seedUser({ fullName: 'Member User' });
    const role = await seedRole({ name: 'engineer', displayName: 'Engineer' });
    const bu = await seedBusinessUnit({ name: 'Infra BU', buHeadUserId: user.id });
    await seedBuMember(bu.id, user.id, role.id);

    const res = await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data.buMemberships).toHaveLength(1);
    expect(res.body.data.buMemberships[0].businessUnitName).toBe('Infra BU');
    expect(res.body.data.buMemberships[0].roleName).toBe('engineer');
  });

  it('returns 404 for non-existent user', async () => {
    await request(app)
      .get('/api/v1/users/01ZZZZZZZZZZZZZZZZZZZZZZZZ')
      .set('Authorization', BEARER)
      .expect(404);
  });

  it('returns 404 for soft-deleted user', async () => {
    const user = await seedUser();
    await db.user.update({ where: { id: user.id }, data: { deletedAt: new Date() } });

    await request(app)
      .get(`/api/v1/users/${user.id}`)
      .set('Authorization', BEARER)
      .expect(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/users/:id
// ---------------------------------------------------------------------------
describe('[integration] PATCH /api/v1/users/:id', () => {
  it('updates user fields and records audit', async () => {
    const user = await seedUser({ fullName: 'Old Name', email: 'old@test.local' });

    const res = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set('Authorization', BEARER)
      .send({ fullName: 'New Name', phone: '+91-1234567890' })
      .expect(200);

    expect(res.body.data.fullName).toBe('New Name');
    expect(res.body.data.phone).toBe('+91-1234567890');

    // Verify DB
    const dbRow = await db.user.findUnique({ where: { id: user.id } });
    expect(dbRow!.fullName).toBe('New Name');

    // Check audit
    const auditRows = await db.auditLog.findMany({
      where: { resourceType: 'user', resourceId: user.id, action: 'UPDATE' },
    });
    expect(auditRows).toHaveLength(1);
  });

  it('rejects email change to existing email with 409', async () => {
    await seedUser({ email: 'taken@test.local' });
    const user = await seedUser({ email: 'mine@test.local' });

    const res = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set('Authorization', BEARER)
      .send({ email: 'taken@test.local' })
      .expect(409);

    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('allows updating status', async () => {
    const user = await seedUser();

    const res = await request(app)
      .patch(`/api/v1/users/${user.id}`)
      .set('Authorization', BEARER)
      .send({ status: 'SUSPENDED' })
      .expect(200);

    expect(res.body.data.status).toBe('SUSPENDED');
  });

  it('returns 404 for non-existent user', async () => {
    await request(app)
      .patch('/api/v1/users/01ZZZZZZZZZZZZZZZZZZZZZZZZ')
      .set('Authorization', BEARER)
      .send({ fullName: 'Nope' })
      .expect(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/users/:id
// ---------------------------------------------------------------------------
describe('[integration] DELETE /api/v1/users/:id', () => {
  it('soft-deletes a user', async () => {
    const user = await seedUser({ fullName: 'To Delete' });

    await request(app)
      .delete(`/api/v1/users/${user.id}`)
      .set('Authorization', BEARER)
      .expect(204);

    // Verify soft-deleted in DB
    const dbRow = await db.user.findUnique({ where: { id: user.id } });
    expect(dbRow!.deletedAt).not.toBeNull();

    // Verify audit
    const auditRows = await db.auditLog.findMany({
      where: { resourceType: 'user', resourceId: user.id, action: 'DELETE' },
    });
    expect(auditRows).toHaveLength(1);
  });

  it('returns 404 for non-existent user', async () => {
    await request(app)
      .delete('/api/v1/users/01ZZZZZZZZZZZZZZZZZZZZZZZZ')
      .set('Authorization', BEARER)
      .expect(404);
  });
});
