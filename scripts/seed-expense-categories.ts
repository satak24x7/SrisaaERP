import { PrismaClient } from '@prisma/client';
import { ulid } from 'ulid';

const prisma = new PrismaClient();

async function main() {
  const count = await prisma.expenseCategory.count();
  if (count > 0) {
    console.log(`Expense categories already exist: ${count}`);
    return;
  }

  const categories = [
    { name: 'Consulting Services',      sacCode: '998311', gstBps: 1800, itc: true,  reimb: true },
    { name: 'IT Services',              sacCode: '998314', gstBps: 1800, itc: true,  reimb: true },
    { name: 'Professional Fees',        sacCode: '998211', gstBps: 1800, itc: true,  reimb: true },
    { name: 'Travel - Air',             sacCode: '996411', gstBps: 500,  itc: true,  reimb: true },
    { name: 'Travel - Rail',            sacCode: '996421', gstBps: 500,  itc: true,  reimb: true },
    { name: 'Travel - Taxi / Cab',      sacCode: '996419', gstBps: 500,  itc: true,  reimb: true },
    { name: 'Travel - Bus',             sacCode: '996422', gstBps: 500,  itc: true,  reimb: true },
    { name: 'Hotel / Accommodation',    sacCode: '996311', gstBps: 1200, itc: true,  reimb: true },
    { name: 'Stationery & Printing',    sacCode: '998912', gstBps: 1800, itc: true,  reimb: true },
    { name: 'Communication (Telecom)',  sacCode: '998412', gstBps: 1800, itc: true,  reimb: true },
    { name: 'Courier / Freight',        sacCode: '996812', gstBps: 1800, itc: true,  reimb: true },
    { name: 'Office Rent',              sacCode: '997212', gstBps: 1800, itc: true,  reimb: false },
    { name: 'Equipment Rental',         sacCode: '997311', gstBps: 1800, itc: true,  reimb: false },
    { name: 'Food & Beverages',         sacCode: '996331', gstBps: 500,  itc: false, reimb: true },
    { name: 'Fuel & Petroleum',         sacCode: null,     gstBps: 2800, itc: true,  reimb: true },
    { name: 'Insurance',                sacCode: '997113', gstBps: 1800, itc: false, reimb: false },
    { name: 'Office Supplies',          sacCode: '998599', gstBps: 1800, itc: true,  reimb: true },
    { name: 'Software & Subscriptions', sacCode: '998315', gstBps: 1800, itc: true,  reimb: false },
    { name: 'Repairs & Maintenance',    sacCode: '998719', gstBps: 1800, itc: true,  reimb: false },
    { name: 'Other / Miscellaneous',    sacCode: null,     gstBps: 1800, itc: false, reimb: true },
  ];

  for (const c of categories) {
    await prisma.expenseCategory.create({
      data: {
        id: ulid(),
        name: c.name,
        sacCode: c.sacCode,
        defaultGstRateBps: c.gstBps,
        gstInputCreditEligible: c.itc,
        reimbursable: c.reimb,
      },
    });
  }
  console.log(`${categories.length} expense categories seeded`);
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
