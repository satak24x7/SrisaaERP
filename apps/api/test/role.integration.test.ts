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
  seedRole,
  seedUser,
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
// POST /api/v1/roles
// ---------------------------------------------------------------------------
describe('[integration] POST /api/v1/roles', () => {
  it('creates a role and persists it', async () => {
    const res = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', BEARER)
      .send({
        name: 'project_lead',
        displayName: 'Project Lead',
        description: 'Leads project execution',
        permissions: ['project.read', 'project.write'],
      })
      .expect(201);

    expect(res.body.data.name).toBe('project_lead');
    expect(res.body.data.displayName).toBe('Project Lead');
    expect(res.body.data.permissions).toEqual(['project.read', 'project.write']);
    expect(res.body.data.isSystem).toBe(false);

    // Verify DB
    const dbRow = await db.role.findUnique({ where: { id: res.body.data.id } });
    expect(dbRow).not.toBeNull();
    expect(dbRow!.name).toBe('project_lead');
  });

  it('writes audit log on create', async () => {
    const res = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', BEARER)
      .send({ name: 'audited_role', displayName: 'Audited Role' })
      .expect(201);

    const auditRows = await db.auditLog.findMany({
      where: { resourceType: 'role', resourceId: res.body.data.id },
    });
    expect(auditRows).toHaveLength(1);
    expect(auditRows[0]!.action).toBe('CREATE');
  });

  it('returns 409 when role name already exists', async () => {
    await seedRole({ name: 'duplicate_role' });

    const res = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', BEARER)
      .send({ name: 'duplicate_role', displayName: 'Dup' })
      .expect(409);

    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 400 on missing name', async () => {
    const res = await request(app)
      .post('/api/v1/roles')
      .set('Authorization', BEARER)
      .send({ displayName: 'No Name' })
      .expect(400);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('returns 401 without auth', async () => {
    await request(app)
      .post('/api/v1/roles')
      .send({ name: 'test', displayName: 'Test' })
      .expect(401);
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/roles
// ---------------------------------------------------------------------------
describe('[integration] GET /api/v1/roles', () => {
  it('returns empty list when no roles exist', async () => {
    const res = await request(app)
      .get('/api/v1/roles')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data).toEqual([]);
    expect(res.body.meta.next_cursor).toBeNull();
  });

  it('returns seeded roles', async () => {
    await seedRole({ name: 'alpha' });
    await seedRole({ name: 'beta' });

    const res = await request(app)
      .get('/api/v1/roles')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data).toHaveLength(2);
  });

  it('supports cursor pagination', async () => {
    await seedRole({ name: 'r1' });
    await seedRole({ name: 'r2' });
    await seedRole({ name: 'r3' });

    const page1 = await request(app)
      .get('/api/v1/roles?limit=2')
      .set('Authorization', BEARER)
      .expect(200);

    expect(page1.body.data).toHaveLength(2);
    expect(page1.body.meta.next_cursor).not.toBeNull();

    const page2 = await request(app)
      .get(`/api/v1/roles?limit=2&cursor=${page1.body.meta.next_cursor}`)
      .set('Authorization', BEARER)
      .expect(200);

    expect(page2.body.data).toHaveLength(1);
    expect(page2.body.meta.next_cursor).toBeNull();
  });

  it('filters by ?q= search', async () => {
    await seedRole({ name: 'finance_manager' });
    await seedRole({ name: 'site_engineer' });

    const res = await request(app)
      .get('/api/v1/roles?q=finance')
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].name).toBe('finance_manager');
  });
});

// ---------------------------------------------------------------------------
// GET /api/v1/roles/:id
// ---------------------------------------------------------------------------
describe('[integration] GET /api/v1/roles/:id', () => {
  it('returns a single role', async () => {
    const role = await seedRole({ name: 'fetched_role', displayName: 'Fetched Role' });

    const res = await request(app)
      .get(`/api/v1/roles/${role.id}`)
      .set('Authorization', BEARER)
      .expect(200);

    expect(res.body.data.id).toBe(role.id);
    expect(res.body.data.name).toBe('fetched_role');
  });

  it('returns 404 for non-existent role', async () => {
    await request(app)
      .get('/api/v1/roles/01ZZZZZZZZZZZZZZZZZZZZZZZZ')
      .set('Authorization', BEARER)
      .expect(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /api/v1/roles/:id
// ---------------------------------------------------------------------------
describe('[integration] PATCH /api/v1/roles/:id', () => {
  it('updates role fields and records audit', async () => {
    const role = await seedRole({ name: 'old_name', displayName: 'Old' });

    const res = await request(app)
      .patch(`/api/v1/roles/${role.id}`)
      .set('Authorization', BEARER)
      .send({ name: 'new_name', displayName: 'New' })
      .expect(200);

    expect(res.body.data.name).toBe('new_name');
    expect(res.body.data.displayName).toBe('New');

    // Verify DB
    const dbRow = await db.role.findUnique({ where: { id: role.id } });
    expect(dbRow!.name).toBe('new_name');

    // Check audit
    const auditRows = await db.auditLog.findMany({
      where: { resourceType: 'role', resourceId: role.id, action: 'UPDATE' },
    });
    expect(auditRows).toHaveLength(1);
  });

  it('rejects rename to existing name with 409', async () => {
    await seedRole({ name: 'taken_name' });
    const role = await seedRole({ name: 'my_role' });

    const res = await request(app)
      .patch(`/api/v1/roles/${role.id}`)
      .set('Authorization', BEARER)
      .send({ name: 'taken_name' })
      .expect(409);

    expect(res.body.error.code).toBe('CONFLICT');
  });

  it('returns 404 for non-existent role', async () => {
    await request(app)
      .patch('/api/v1/roles/01ZZZZZZZZZZZZZZZZZZZZZZZZ')
      .set('Authorization', BEARER)
      .send({ displayName: 'Nope' })
      .expect(404);
  });
});

// ---------------------------------------------------------------------------
// DELETE /api/v1/roles/:id
// ---------------------------------------------------------------------------
describe('[integration] DELETE /api/v1/roles/:id', () => {
  it('soft-deletes a role with no references', async () => {
    const role = await seedRole({ name: 'to_delete' });

    await request(app)
      .delete(`/api/v1/roles/${role.id}`)
      .set('Authorization', BEARER)
      .expect(204);

    // Verify soft-deleted
    const dbRow = await db.role.findUnique({ where: { id: role.id } });
    expect(dbRow!.deletedAt).not.toBeNull();

    // Verify audit
    const auditRows = await db.auditLog.findMany({
      where: { resourceType: 'role', resourceId: role.id, action: 'DELETE' },
    });
    expect(auditRows).toHaveLength(1);
  });

  it('rejects deletion of system role with 422', async () => {
    const role = await seedRole({ name: 'system_role', isSystem: true });

    const res = await request(app)
      .delete(`/api/v1/roles/${role.id}`)
      .set('Authorization', BEARER)
      .expect(422);

    expect(res.body.error.code).toBe('SYSTEM_ROLE');
  });

  it('rejects deletion when role is assigned to BU members with 422', async () => {
    const role = await seedRole({ name: 'assigned_role' });
    const user = await seedUser();
    const bu = await seedBusinessUnit({ buHeadUserId: user.id });
    await seedBuMember(bu.id, user.id, role.id);

    const res = await request(app)
      .delete(`/api/v1/roles/${role.id}`)
      .set('Authorization', BEARER)
      .expect(422);

    expect(res.body.error.code).toBe('ROLE_HAS_REFERENCES');
    expect(res.body.error.details.members).toBe(1);
  });

  it('returns 404 for non-existent role', async () => {
    await request(app)
      .delete('/api/v1/roles/01ZZZZZZZZZZZZZZZZZZZZZZZZ')
      .set('Authorization', BEARER)
      .expect(404);
  });
});
