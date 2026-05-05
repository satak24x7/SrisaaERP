/**
 * Seed AI Analysis Rules + Lookup List
 * Run: PRISMA_CLIENT_ENGINE_TYPE=binary pnpm tsx scripts/seed-ai-rules.ts
 */
import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';

const prisma = new PrismaClient();
const id = () => ulid();
const SYS = '00000000000000000000000000';

async function run() {
  // 1. Seed ai_rule_category lookup list
  const code = 'ai_rule_category';
  let listExists = await prisma.lookupList.findUnique({ where: { code } });
  if (!listExists) {
    const listId = id();
    await prisma.lookupList.create({ data: { id: listId, code, name: 'AI Rule Category' } });
    const cats = [
      { label: 'Payment Terms', value: 'PAYMENT' },
      { label: 'Legal & Contractual', value: 'LEGAL' },
      { label: 'Financial Risk', value: 'FINANCIAL' },
      { label: 'Scope & Deliverables', value: 'SCOPE' },
      { label: 'Timeline & Schedule', value: 'TIMELINE' },
      { label: 'Eligibility & Compliance', value: 'ELIGIBILITY' },
    ];
    for (let i = 0; i < cats.length; i++) {
      await prisma.lookupItem.create({
        data: { id: id(), listId, label: cats[i]!.label, value: cats[i]!.value, sortOrder: (i + 1) * 10, isActive: true },
      });
    }
    console.log('✅ ai_rule_category lookup list created with 6 categories');
  } else {
    console.log('⏭  ai_rule_category lookup list already exists');
  }

  // 2. Seed default AI analysis rules
  const cnt = await prisma.aiAnalysisRule.count();
  if (cnt > 0) {
    console.log(`⏭  ${cnt} AI rules already exist`);
    return;
  }

  const rules = [
    // Payment (7 rules)
    { title: 'No milestone payments', ruleText: 'Flag if payment is made only after full project completion with no interim milestone-based payments. This creates severe working capital pressure.', category: 'PAYMENT', severity: 'HIGH' },
    { title: 'Excessive retention', ruleText: 'Flag if retention/security deposit exceeds 10% of contract value. Standard is 5-10%.', category: 'PAYMENT', severity: 'HIGH' },
    { title: 'Long DLP period', ruleText: 'Flag if Defect Liability Period (DLP) exceeds 24 months. Standard is 12-24 months.', category: 'PAYMENT', severity: 'MEDIUM' },
    { title: 'No advance for mobilization', ruleText: 'Flag if no mobilization advance is provided for projects requiring significant upfront capital deployment (equipment, site setup).', category: 'PAYMENT', severity: 'MEDIUM' },
    { title: 'Long payment cycle', ruleText: 'Flag if payment cycle exceeds 60 days from invoice submission. Typical is 30-45 days.', category: 'PAYMENT', severity: 'HIGH' },
    { title: 'Back-loaded payments', ruleText: 'Flag if more than 50% of total payment is linked to the final milestone or project completion. Payment should be spread proportionally.', category: 'PAYMENT', severity: 'HIGH' },
    { title: 'Subject to fund availability', ruleText: 'Flag if payment is conditional on budget/fund availability (e.g. "subject to funds being available"). This creates payment uncertainty.', category: 'PAYMENT', severity: 'HIGH' },

    // Legal (4 rules)
    { title: 'Unlimited liability', ruleText: 'Flag if the contract imposes unlimited liability on the contractor without any cap.', category: 'LEGAL', severity: 'HIGH' },
    { title: 'Unilateral termination', ruleText: 'Flag if the client can terminate the contract unilaterally without cause or with very short notice (less than 30 days).', category: 'LEGAL', severity: 'HIGH' },
    { title: 'IP assignment clause', ruleText: 'Flag if the contract requires blanket assignment of all intellectual property including pre-existing IP and tools.', category: 'LEGAL', severity: 'MEDIUM' },
    { title: 'Excessive LD penalties', ruleText: 'Flag if Liquidated Damages (LD) / penalties exceed 10% of contract value or have no cap.', category: 'LEGAL', severity: 'HIGH' },

    // Financial (2 rules)
    { title: 'No price escalation clause', ruleText: 'Flag if there is no price escalation/variation clause for contracts longer than 18 months. Material and labor costs can rise significantly.', category: 'FINANCIAL', severity: 'MEDIUM' },
    { title: 'High EMD requirement', ruleText: 'Flag if Earnest Money Deposit (EMD) exceeds 3% of estimated project value. This ties up significant capital.', category: 'FINANCIAL', severity: 'LOW' },

    // Scope (2 rules)
    { title: 'Vague scope definition', ruleText: 'Flag if deliverables or scope of work uses vague language like "as directed by the engineer", "any other work as required", or "to the satisfaction of" without measurable criteria.', category: 'SCOPE', severity: 'HIGH' },
    { title: 'Unlimited scope changes', ruleText: 'Flag if the contract allows scope changes without a formal change order process or cost adjustment mechanism.', category: 'SCOPE', severity: 'MEDIUM' },

    // Timeline (2 rules)
    { title: 'Unrealistic timeline', ruleText: 'Flag if the completion period seems unrealistically short relative to the scope and value of work described.', category: 'TIMELINE', severity: 'MEDIUM' },
    { title: 'No extension provision', ruleText: 'Flag if there is no provision for time extension due to force majeure, client delays, or approval dependencies.', category: 'TIMELINE', severity: 'MEDIUM' },

    // Eligibility (1 rule)
    { title: 'Restrictive eligibility', ruleText: 'Flag if eligibility criteria seem unnecessarily restrictive (e.g. very high turnover for a small project, or very specific certifications not relevant to the work).', category: 'ELIGIBILITY', severity: 'LOW' },
  ];

  for (let i = 0; i < rules.length; i++) {
    const r = rules[i]!;
    await prisma.aiAnalysisRule.create({
      data: {
        id: id(), title: r.title, ruleText: r.ruleText,
        category: r.category, severity: r.severity,
        enabled: true, sortOrder: (i + 1) * 10,
        createdBy: SYS, updatedBy: SYS,
      },
    });
  }
  console.log(`✅ ${rules.length} default AI analysis rules seeded`);
}

run()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
