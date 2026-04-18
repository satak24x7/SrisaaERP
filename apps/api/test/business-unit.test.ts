import './setup.js';

const mockBu = {
  create: jest.fn(),
  findFirst: jest.fn(),
  findMany: jest.fn(),
  update: jest.fn(),
};
const mockUser = { count: jest.fn() };
const mockProject = { count: jest.fn() };
const mockOpportunity = { count: jest.fn() };
const mockExpenseSheet = { count: jest.fn() };
const mockMaterialRequest = { count: jest.fn() };
const mockAuditCreate = jest.fn();

jest.mock('../src/lib/prisma.js', () => ({
  prisma: {
    businessUnit: mockBu,
    user: mockUser,
    project: mockProject,
    opportunity: mockOpportunity,
    expenseSheet: mockExpenseSheet,
    materialRequest: mockMaterialRequest,
    auditLog: { create: mockAuditCreate },
    $queryRawUnsafe: jest.fn(),
  },
  newId: () => '01HBUSTUBSTUBSTUBSTUBSTUBU',
}));
jest.mock('../src/lib/redis.js', () => ({ redis: { ping: jest.fn() } }));

import request from 'supertest';
import { createApp } from '../src/app.js';

const VALID_ULID = '01HABCDEFGHJKMNPQRSTVWXYZ0';
const USER_ULID = '01HABCDEFGHJKMNPQRSTVWXYZ1';
const OTHER_USER_ULID = '01HABCDEFGHJKMNPQRSTVWXYZ2';

function fakeJwt(claims: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'usr_stub0000000000000000000',
      email: 'stub@local',
      name: 'Stub User',
      realm_access: { roles: [] },
      ...claims,
    })
  ).toString('base64url');
  return `Bearer ${header}.${payload}.fake-sig`;
}
const BEARER = fakeJwt();

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: VALID_ULID,
    name: 'Infra BU',
    description: null,
    costCentre: null,
    buHeadUserId: USER_ULID,
    approvalThresholds: null,
    status: 'ACTIVE',
    createdAt: new Date('2026-04-17T00:00:00Z'),
    updatedAt: new Date('2026-04-17T00:00:00Z'),
    deletedAt: null,
    createdBy: USER_ULID,
    updatedBy: USER_ULID,
    ...overrides,
  };
}

describe('Business Unit CRUD — /api/v1/business-units', () => {
  const app = createApp();

  beforeEach(() => {
    jest.resetAllMocks();
  });

  describe('GET /', () => {
    it('returns paginated list with next_cursor when more rows exist', async () => {
      mockBu.findMany.mockResolvedValueOnce([makeRow({ id: '01A' }), makeRow({ id: '01B' })]);
      const res = await request(app)
        .get('/api/v1/business-units?limit=1')
        .set('Authorization', BEARER)
        .expect(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.meta.next_cursor).toBe('01A');
      expect(res.body.meta.limit).toBe(1);
    });

    it('returns null cursor when fewer rows than limit', async () => {
      mockBu.findMany.mockResolvedValueOnce([makeRow()]);
      const res = await request(app)
        .get('/api/v1/business-units?limit=50')
        .set('Authorization', BEARER)
        .expect(200);
      expect(res.body.meta.next_cursor).toBeNull();
    });

    it('requires auth', async () => {
      const res = await request(app).get('/api/v1/business-units').expect(401);
      expect(res.body.error.code).toBe('UNAUTHORIZED');
    });
  });

  describe('GET /:id', () => {
    it('returns a single BU', async () => {
      mockBu.findFirst.mockResolvedValueOnce(makeRow());
      const res = await request(app)
        .get(`/api/v1/business-units/${VALID_ULID}`)
        .set('Authorization', BEARER)
        .expect(200);
      expect(res.body.data.id).toBe(VALID_ULID);
      expect(res.body.data.status).toBe('ACTIVE');
    });

    it('404 when not found', async () => {
      mockBu.findFirst.mockResolvedValueOnce(null);
      const res = await request(app)
        .get(`/api/v1/business-units/${VALID_ULID}`)
        .set('Authorization', BEARER)
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });

    it('400 on invalid ULID', async () => {
      const res = await request(app)
        .get('/api/v1/business-units/not-a-ulid')
        .set('Authorization', BEARER)
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('POST /', () => {
    it('creates a BU and writes an audit row', async () => {
      mockUser.count.mockResolvedValueOnce(1);
      mockBu.create.mockResolvedValueOnce(makeRow({ name: 'Water BU' }));
      const res = await request(app)
        .post('/api/v1/business-units')
        .set('Authorization', BEARER)
        .send({ name: 'Water BU', buHeadUserId: USER_ULID })
        .expect(201);
      expect(res.body.data.name).toBe('Water BU');
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      expect(mockAuditCreate.mock.calls[0][0].data).toMatchObject({
        action: 'CREATE',
        resourceType: 'business_unit',
        resourceId: VALID_ULID,
      });
    });

    it('422 when buHeadUserId does not reference a user', async () => {
      mockUser.count.mockResolvedValueOnce(0);
      const res = await request(app)
        .post('/api/v1/business-units')
        .set('Authorization', BEARER)
        .send({ name: 'Ghost BU', buHeadUserId: USER_ULID })
        .expect(422);
      expect(res.body.error.code).toBe('BU_HEAD_NOT_FOUND');
      expect(mockBu.create).not.toHaveBeenCalled();
    });

    it('400 on missing name', async () => {
      const res = await request(app)
        .post('/api/v1/business-units')
        .set('Authorization', BEARER)
        .send({ buHeadUserId: USER_ULID })
        .expect(400);
      expect(res.body.error.code).toBe('VALIDATION_FAILED');
    });
  });

  describe('PATCH /:id', () => {
    it('updates fields and records before/after audit', async () => {
      mockBu.findFirst.mockResolvedValueOnce(makeRow({ name: 'Old' }));
      mockBu.update.mockResolvedValueOnce(makeRow({ name: 'New' }));
      const res = await request(app)
        .patch(`/api/v1/business-units/${VALID_ULID}`)
        .set('Authorization', BEARER)
        .send({ name: 'New' })
        .expect(200);
      expect(res.body.data.name).toBe('New');
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      const audit = mockAuditCreate.mock.calls[0][0].data;
      expect(audit.action).toBe('UPDATE');
      expect(audit.before.name).toBe('Old');
      expect(audit.after.name).toBe('New');
    });

    it('re-validates a new BU Head', async () => {
      mockBu.findFirst.mockResolvedValueOnce(makeRow({ buHeadUserId: USER_ULID }));
      mockUser.count.mockResolvedValueOnce(0);
      const res = await request(app)
        .patch(`/api/v1/business-units/${VALID_ULID}`)
        .set('Authorization', BEARER)
        .send({ buHeadUserId: OTHER_USER_ULID })
        .expect(422);
      expect(res.body.error.code).toBe('BU_HEAD_NOT_FOUND');
      expect(mockBu.update).not.toHaveBeenCalled();
    });
  });

  describe('DELETE /:id', () => {
    it('soft-deletes when no references exist and returns 204', async () => {
      mockBu.findFirst.mockResolvedValueOnce(makeRow());
      mockProject.count.mockResolvedValueOnce(0);
      mockOpportunity.count.mockResolvedValueOnce(0);
      mockExpenseSheet.count.mockResolvedValueOnce(0);
      mockMaterialRequest.count.mockResolvedValueOnce(0);
      mockBu.update.mockResolvedValueOnce(makeRow({ deletedAt: new Date() }));
      await request(app)
        .delete(`/api/v1/business-units/${VALID_ULID}`)
        .set('Authorization', BEARER)
        .expect(204);
      expect(mockBu.update).toHaveBeenCalledTimes(1);
      expect(mockAuditCreate).toHaveBeenCalledTimes(1);
      expect(mockAuditCreate.mock.calls[0][0].data.action).toBe('DELETE');
    });

    it('422 BU_HAS_REFERENCES when any child rows exist', async () => {
      mockBu.findFirst.mockResolvedValueOnce(makeRow());
      mockProject.count.mockResolvedValueOnce(2);
      mockOpportunity.count.mockResolvedValueOnce(0);
      mockExpenseSheet.count.mockResolvedValueOnce(1);
      mockMaterialRequest.count.mockResolvedValueOnce(0);
      const res = await request(app)
        .delete(`/api/v1/business-units/${VALID_ULID}`)
        .set('Authorization', BEARER)
        .expect(422);
      expect(res.body.error.code).toBe('BU_HAS_REFERENCES');
      expect(res.body.error.details).toMatchObject({
        projects: 2,
        opportunities: 0,
        expenseSheets: 1,
        materialRequests: 0,
      });
      expect(mockBu.update).not.toHaveBeenCalled();
    });

    it('404 on unknown id', async () => {
      mockBu.findFirst.mockResolvedValueOnce(null);
      const res = await request(app)
        .delete(`/api/v1/business-units/${VALID_ULID}`)
        .set('Authorization', BEARER)
        .expect(404);
      expect(res.body.error.code).toBe('NOT_FOUND');
    });
  });
});
