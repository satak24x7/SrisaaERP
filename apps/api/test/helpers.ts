import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';

// ---------------------------------------------------------------------------
// Prisma client for direct DB operations in tests (seed, assert, cleanup)
// ---------------------------------------------------------------------------

let _testPrisma: PrismaClient | undefined;

export function getTestPrisma(): PrismaClient {
  if (!_testPrisma) {
    _testPrisma = new PrismaClient({
      datasources: {
        db: { url: process.env.DATABASE_URL },
      },
      log: ['warn', 'error'],
    });
  }
  return _testPrisma;
}

export async function disconnectTestPrisma(): Promise<void> {
  if (_testPrisma) {
    await _testPrisma.$disconnect();
    _testPrisma = undefined;
  }
}

// ---------------------------------------------------------------------------
// Cleanup: truncate all tables between tests
// ---------------------------------------------------------------------------

const TABLES_TO_TRUNCATE = [
  'audit_log',
  'outbox_event',
  'attachment',
  'expense_sheet_event',
  'expense_line',
  'expense_sheet',
  'expense_category',
  'material_request_line',
  'material_request',
  'task',
  'project',
  'opportunity_contact',
  'opportunity_influencer',
  'lead',
  'opportunity',
  'influencer',
  'account_contact',
  'contact',
  'account',
  'business_unit_member',
  'business_unit',
  'employee',
  'bank_account',
  'certification',
  'dsc',
  'empanelment',
  'past_project',
  'statutory_registration',
  'turnover_record',
  'lookup_item',
  'lookup_list',
  'government',
  'company_document',
  'user_role',
  'role',
  'user',
  'company',
] as const;

export async function truncateAll(): Promise<void> {
  const db = getTestPrisma();
  // Disable FK checks to avoid ordering issues
  await db.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0');
  for (const table of TABLES_TO_TRUNCATE) {
    await db.$executeRawUnsafe(`TRUNCATE TABLE \`${table}\``);
  }
  await db.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1');
}

// ---------------------------------------------------------------------------
// Fake JWT helper (same as unit tests — jose is mocked in setup)
// ---------------------------------------------------------------------------

export function fakeJwt(claims: Record<string, unknown> = {}): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      sub: 'usr_integration_test',
      email: 'integration@govprojects.local',
      name: 'Integration Tester',
      realm_access: { roles: ['admin'] },
      ...claims,
    }),
  ).toString('base64url');
  return `Bearer ${header}.${payload}.fake-sig`;
}

// ---------------------------------------------------------------------------
// Seed helpers
// ---------------------------------------------------------------------------

export function id(): string {
  return ulid();
}

export interface SeedUserOpts {
  id?: string;
  email?: string;
  fullName?: string;
  externalId?: string;
}

export async function seedUser(opts: SeedUserOpts = {}): Promise<{ id: string; email: string }> {
  const db = getTestPrisma();
  const userId = opts.id ?? id();
  const email = opts.email ?? `user-${userId.slice(-6)}@test.local`;
  await db.user.create({
    data: {
      id: userId,
      externalId: opts.externalId ?? `ext-${userId}`,
      email,
      fullName: opts.fullName ?? 'Test User',
      status: 'ACTIVE',
    },
  });
  return { id: userId, email };
}

export interface SeedBuOpts {
  id?: string;
  name?: string;
  buHeadUserId?: string; // if omitted, a user is auto-seeded
  status?: 'ACTIVE' | 'INACTIVE';
}

export async function seedBusinessUnit(opts: SeedBuOpts = {}): Promise<{ id: string; name: string; buHeadUserId: string }> {
  const db = getTestPrisma();
  const buId = opts.id ?? id();
  const name = opts.name ?? `BU-${buId.slice(-6)}`;
  // buHeadUserId is required in the schema — auto-seed a user if not provided
  const buHeadUserId = opts.buHeadUserId ?? (await seedUser()).id;
  await db.businessUnit.create({
    data: {
      id: buId,
      name,
      buHeadUserId,
      status: opts.status ?? 'ACTIVE',
      createdBy: 'usr_seed',
      updatedBy: 'usr_seed',
    },
  });
  return { id: buId, name, buHeadUserId };
}

export interface SeedRoleOpts {
  id?: string;
  name?: string;
  displayName?: string;
  isSystem?: boolean;
  permissions?: string[];
}

export async function seedRole(opts: SeedRoleOpts = {}): Promise<{ id: string; name: string }> {
  const db = getTestPrisma();
  const roleId = opts.id ?? id();
  const name = opts.name ?? `role-${roleId.slice(-6)}`;
  await db.role.create({
    data: {
      id: roleId,
      name,
      displayName: opts.displayName ?? name,
      isSystem: opts.isSystem ?? false,
      permissions: opts.permissions ?? [],
    },
  });
  return { id: roleId, name };
}

export async function seedCompany(opts: { legalName?: string } = {}): Promise<{ id: string }> {
  const db = getTestPrisma();
  const companyId = id();
  await db.company.create({
    data: {
      id: companyId,
      legalName: opts.legalName ?? 'Test Company Pvt Ltd',
      createdBy: 'usr_seed',
      updatedBy: 'usr_seed',
    },
  });
  return { id: companyId };
}

export async function seedBuMember(buId: string, userId: string, roleId: string): Promise<{ id: string }> {
  const db = getTestPrisma();
  const memberId = id();
  await db.businessUnitMember.create({
    data: {
      id: memberId,
      businessUnitId: buId,
      userId,
      roleId,
    },
  });
  return { id: memberId };
}

export async function seedProject(buId: string, pmUserId: string): Promise<{ id: string }> {
  const db = getTestPrisma();
  const projId = id();
  await db.project.create({
    data: {
      id: projId,
      name: `Project-${projId.slice(-6)}`,
      businessUnitId: buId,
      clientName: 'Test Client',
      contractValuePaise: BigInt(1_000_000_00), // ₹10 lakh
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-31'),
      projectManagerId: pmUserId,
      status: 'ACTIVE',
      createdBy: 'usr_seed',
      updatedBy: 'usr_seed',
    },
  });
  return { id: projId };
}
