/**
 * Seed script — creates baseline reference data for local development.
 *
 * Run: pnpm seed
 *
 * Idempotent — safe to run multiple times.
 *
 * Creates:
 *   - 1 Company
 *   - 2 Business Units (Smart Cities, Defence)
 *   - 1 Super Admin user
 *   - 2 BU Heads (one per BU)
 *   - 2 Project Managers
 *   - 1 Admin / Procurement Officer
 *   - 1 Stores Officer
 *   - 1 Finance Officer
 *   - Expense categories baseline
 *   - Item categories baseline
 */

import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulidx';

const prisma = new PrismaClient();

// Helper: generate a ULID for IDs
const id = () => ulid();

// A known "system" user id for seed provenance
const SYSTEM_USER_ID = '00000000000000000000000000';

async function upsertCompany() {
  const existing = await prisma.company.findFirst();
  if (existing) return existing;

  return prisma.company.create({
    data: {
      id: id(),
      legalName: 'Demo Government Solutions Pvt Ltd',
      cin: 'U72200TG2020PTC000000',
      incorporationDate: new Date('2020-04-01'),
      registeredAddress: '1st Floor, Demo Building, Hyderabad, Telangana 500081',
      corporateAddress: 'Same as registered',
      defaultCurrency: 'INR',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });
}

async function upsertUser(email: string, displayName: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;

  return prisma.user.create({
    data: {
      id: id(),
      externalId: `seed-${email}`,
      email,
      displayName,
      status: 'ACTIVE',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });
}

async function upsertBusinessUnit(name: string, costCentreCode: string, buHeadUserId: string) {
  const existing = await prisma.businessUnit.findUnique({ where: { costCentreCode } });
  if (existing) return existing;

  return prisma.businessUnit.create({
    data: {
      id: id(),
      name,
      costCentreCode,
      buHeadUserId,
      approvalThresholds: {
        expense_sheet: {
          pre_project: [
            { limit_paise: 2500000, approvers: ['SALES_LEAD'] },
            { limit_paise: 10000000, approvers: ['SALES_LEAD', 'BU_HEAD'] },
            { limit_paise: null, approvers: ['SALES_LEAD', 'BU_HEAD', 'CFO'] },
          ],
          during_project: [
            { limit_paise: 1500000, approvers: ['PM'] },
            { limit_paise: 7500000, approvers: ['PM', 'BU_HEAD'] },
            { limit_paise: null, approvers: ['PM', 'BU_HEAD', 'CFO'] },
          ],
        },
        material_request: [
          { limit_paise: 1000000, approvers: ['PM'] },
          { limit_paise: null, approvers: ['PM', 'BU_HEAD'] },
        ],
      },
      status: 'ACTIVE',
      createdBy: SYSTEM_USER_ID,
      updatedBy: SYSTEM_USER_ID,
    },
  });
}

async function main() {
  console.log('🌱 Seeding…');

  const company = await upsertCompany();
  console.log(`  Company: ${company.legalName}`);

  // Users
  const superAdmin = await upsertUser('superadmin@demo.local', 'Super Admin');
  const smartCitiesHead = await upsertUser('vikram.sc@demo.local', 'Vikram Sharma');
  const defenceHead = await upsertUser('vikram.def@demo.local', 'Vikram Rao');
  const pm1 = await upsertUser('arjun.sc@demo.local', 'Arjun Iyer');
  const pm2 = await upsertUser('arjun.def@demo.local', 'Arjun Menon');
  const admin = await upsertUser('neha@demo.local', 'Neha Kulkarni');
  const stores = await upsertUser('ravi@demo.local', 'Ravi Kumar');
  const finance = await upsertUser('suresh@demo.local', 'Suresh Agarwal');
  const compliance = await upsertUser('priya@demo.local', 'Priya Shah');
  console.log('  Users created');

  // Business Units
  const smartCities = await upsertBusinessUnit('Smart Cities', 'CC-SC-001', smartCitiesHead.id);
  const defence = await upsertBusinessUnit('Defence & Aerospace', 'CC-DEF-001', defenceHead.id);
  console.log(`  Business Units: ${smartCities.name}, ${defence.name}`);

  // Employee records for the people above
  const employees = [
    { user: superAdmin, code: 'EMP0001', bu: smartCities, role: 'Super Admin' },
    { user: smartCitiesHead, code: 'EMP0002', bu: smartCities, role: 'BU Head' },
    { user: defenceHead, code: 'EMP0003', bu: defence, role: 'BU Head' },
    { user: pm1, code: 'EMP0004', bu: smartCities, role: 'Project Manager' },
    { user: pm2, code: 'EMP0005', bu: defence, role: 'Project Manager' },
    { user: admin, code: 'EMP0006', bu: smartCities, role: 'Admin / Procurement' },
    { user: stores, code: 'EMP0007', bu: smartCities, role: 'Stores Officer' },
    { user: finance, code: 'EMP0008', bu: smartCities, role: 'Finance' },
    { user: compliance, code: 'EMP0009', bu: smartCities, role: 'Compliance' },
  ];

  for (const e of employees) {
    const exists = await prisma.employee.findUnique({ where: { userId: e.user.id } });
    if (!exists) {
      await prisma.employee.create({
        data: {
          id: id(),
          userId: e.user.id,
          employeeCode: e.code,
          businessUnitId: e.bu.id,
          designation: e.role,
          dateOfJoining: new Date('2024-01-01'),
          availableForDeployment: true,
          createdBy: SYSTEM_USER_ID,
          updatedBy: SYSTEM_USER_ID,
        },
      });
    }
  }
  console.log('  Employee records created');

  console.log('✅ Seed complete.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
