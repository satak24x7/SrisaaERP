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
import { ulid } from 'ulid';

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

  // ── AI Rule Category Lookup List ──
  await seedAiRuleCategoryLookup();

  // ── Default AI Analysis Rules ──
  await seedDefaultAiRules();

  console.log('✅ Seed complete.');
}

async function seedAiRuleCategoryLookup() {
  const code = 'ai_rule_category';
  const existing = await prisma.lookupList.findUnique({ where: { code } });
  if (existing) { console.log('  AI Rule Category lookup already exists'); return; }

  const listId = id();
  await prisma.lookupList.create({ data: { id: listId, code, name: 'AI Rule Category' } });

  const categories = [
    { label: 'Payment Terms', value: 'PAYMENT' },
    { label: 'Legal & Contractual', value: 'LEGAL' },
    { label: 'Financial Risk', value: 'FINANCIAL' },
    { label: 'Scope & Deliverables', value: 'SCOPE' },
    { label: 'Timeline & Schedule', value: 'TIMELINE' },
    { label: 'Eligibility & Compliance', value: 'ELIGIBILITY' },
  ];
  for (let i = 0; i < categories.length; i++) {
    await prisma.lookupItem.create({
      data: { id: id(), listId, label: categories[i]!.label, value: categories[i]!.value, sortOrder: (i + 1) * 10, isActive: true },
    });
  }
  console.log('  AI Rule Category lookup list created');
}

async function seedDefaultAiRules() {
  const count = await prisma.aiAnalysisRule.count();
  if (count > 0) { console.log('  AI rules already seeded'); return; }

  const rules = [
    // Payment
    { title: 'No milestone payments', ruleText: 'Flag if payment is made only after full project completion with no interim milestone-based payments. This creates severe working capital pressure.', category: 'PAYMENT', severity: 'HIGH' },
    { title: 'Excessive retention', ruleText: 'Flag if retention/security deposit exceeds 10% of contract value. Standard is 5-10%.', category: 'PAYMENT', severity: 'HIGH' },
    { title: 'Long DLP period', ruleText: 'Flag if Defect Liability Period (DLP) exceeds 24 months. Standard is 12-24 months.', category: 'PAYMENT', severity: 'MEDIUM' },
    { title: 'No advance for mobilization', ruleText: 'Flag if no mobilization advance is provided for projects requiring significant upfront capital deployment (equipment, site setup).', category: 'PAYMENT', severity: 'MEDIUM' },
    { title: 'Long payment cycle', ruleText: 'Flag if payment cycle exceeds 60 days from invoice submission. Typical is 30-45 days.', category: 'PAYMENT', severity: 'HIGH' },
    { title: 'Back-loaded payments', ruleText: 'Flag if more than 50% of total payment is linked to the final milestone or project completion. Payment should be spread proportionally.', category: 'PAYMENT', severity: 'HIGH' },
    { title: 'Subject to fund availability', ruleText: 'Flag if payment is conditional on budget/fund availability (e.g. "subject to funds being available"). This creates payment uncertainty.', category: 'PAYMENT', severity: 'HIGH' },

    // Legal
    { title: 'Unlimited liability', ruleText: 'Flag if the contract imposes unlimited liability on the contractor without any cap.', category: 'LEGAL', severity: 'HIGH' },
    { title: 'Unilateral termination', ruleText: 'Flag if the client can terminate the contract unilaterally without cause or with very short notice (less than 30 days).', category: 'LEGAL', severity: 'HIGH' },
    { title: 'IP assignment clause', ruleText: 'Flag if the contract requires blanket assignment of all intellectual property including pre-existing IP and tools.', category: 'LEGAL', severity: 'MEDIUM' },
    { title: 'Excessive LD penalties', ruleText: 'Flag if Liquidated Damages (LD) / penalties exceed 10% of contract value or have no cap.', category: 'LEGAL', severity: 'HIGH' },

    // Financial
    { title: 'No price escalation clause', ruleText: 'Flag if there is no price escalation/variation clause for contracts longer than 18 months. Material and labor costs can rise significantly.', category: 'FINANCIAL', severity: 'MEDIUM' },
    { title: 'High EMD requirement', ruleText: 'Flag if Earnest Money Deposit (EMD) exceeds 3% of estimated project value. This ties up significant capital.', category: 'FINANCIAL', severity: 'LOW' },

    // Scope
    { title: 'Vague scope definition', ruleText: 'Flag if deliverables or scope of work uses vague language like "as directed by the engineer", "any other work as required", or "to the satisfaction of" without measurable criteria.', category: 'SCOPE', severity: 'HIGH' },
    { title: 'Unlimited scope changes', ruleText: 'Flag if the contract allows scope changes without a formal change order process or cost adjustment mechanism.', category: 'SCOPE', severity: 'MEDIUM' },

    // Timeline
    { title: 'Unrealistic timeline', ruleText: 'Flag if the completion period seems unrealistically short relative to the scope and value of work described.', category: 'TIMELINE', severity: 'MEDIUM' },
    { title: 'No extension provision', ruleText: 'Flag if there is no provision for time extension due to force majeure, client delays, or approval dependencies.', category: 'TIMELINE', severity: 'MEDIUM' },

    // Eligibility
    { title: 'Restrictive eligibility', ruleText: 'Flag if eligibility criteria seem unnecessarily restrictive (e.g. very high turnover for a small project, or very specific certifications not relevant to the work).', category: 'ELIGIBILITY', severity: 'LOW' },
  ];

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]!;
    await prisma.aiAnalysisRule.create({
      data: {
        id: id(), title: r.title, ruleText: r.ruleText,
        category: r.category, severity: r.severity,
        enabled: true, sortOrder: (i + 1) * 10,
        createdBy: SYSTEM_USER_ID, updatedBy: SYSTEM_USER_ID,
      },
    });
  }
  console.log(`  ${rules.length} default AI analysis rules seeded`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
