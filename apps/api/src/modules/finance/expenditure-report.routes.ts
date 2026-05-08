import { Router, type Router as ExpressRouter } from 'express';
import { z } from 'zod';
import { requireAuth } from '../../middleware/auth.js';
import { asyncHandler, validate } from '../../middleware/validate.js';
import { prisma } from '../../lib/prisma.js';

const QueryParams = z.object({
  groupBy: z.enum(['PROJECT', 'OPPORTUNITY', 'INITIATIVE', 'ACCOUNT', 'LEAD', 'CONTACT']),
  businessUnitId: z.string().max(26).optional(),
  from: z.string().optional(), // YYYY-MM-DD
  to: z.string().optional(),   // YYYY-MM-DD
});

function toBigNum(v: bigint | null | undefined): number {
  return v != null ? Number(v) : 0;
}

async function resolveEntityName(entityType: string, entityId: string): Promise<string> {
  switch (entityType) {
    case 'OPPORTUNITY': { const r = await prisma.opportunity.findUnique({ where: { id: entityId }, select: { title: true } }); return r?.title ?? entityId; }
    case 'PROJECT': { const r = await prisma.project.findUnique({ where: { id: entityId }, select: { name: true } }); return r?.name ?? entityId; }
    case 'INITIATIVE': { const r = await prisma.initiative.findUnique({ where: { id: entityId }, select: { title: true } }); return r?.title ?? entityId; }
    case 'ACCOUNT': { const r = await prisma.account.findUnique({ where: { id: entityId }, select: { name: true } }); return r?.name ?? entityId; }
    case 'LEAD': { const r = await prisma.lead.findUnique({ where: { id: entityId }, select: { title: true } }); return r?.title ?? entityId; }
    case 'CONTACT': { const r = await prisma.contact.findUnique({ where: { id: entityId }, select: { firstName: true, lastName: true } }); return r ? `${r.firstName}${r.lastName ? ' ' + r.lastName : ''}` : entityId; }
    default: return entityId;
  }
}

export const expenditureReportRouter: ExpressRouter = Router();
expenditureReportRouter.use(requireAuth);

/* GET / — expenditure grouped by entity via associations */
expenditureReportRouter.get('/', validate({ query: QueryParams }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.infer<typeof QueryParams>;

  // Find all associations of the requested entity type that belong to approved/paid sheets
  const sheetWhere: Record<string, unknown> = {
    deletedAt: null,
    status: { in: ['APPROVED', 'IN_PROGRESS', 'EXPENSE_SUBMITTED', 'COMPLETED'] },
  };
  if (q.businessUnitId) sheetWhere.businessUnitId = q.businessUnitId;

  const lineWhere: Record<string, unknown> = { deletedAt: null };
  if (q.from || q.to) {
    const dateFilter: Record<string, Date> = {};
    if (q.from) dateFilter.gte = new Date(q.from);
    if (q.to) dateFilter.lte = new Date(q.to);
    lineWhere.expenseDate = dateFilter;
  }

  // Get sheets that have at least one association of the target entityType
  const sheets = await prisma.expenseSheet.findMany({
    where: {
      ...sheetWhere,
      associations: { some: { entityType: q.groupBy } },
    },
    include: {
      lines: { where: lineWhere },
      associations: { where: { entityType: q.groupBy } },
      businessUnit: { select: { id: true, name: true } },
    },
  });

  // Group by entity
  const groups = new Map<string, {
    entityId: string; entityName: string; entityType: string;
    businessUnitName: string | null;
    lineCount: number; taxablePaise: number; gstPaise: number; grandTotalPaise: number;
    cgstPaise: number; sgstPaise: number; igstPaise: number;
  }>();

  for (const sheet of sheets) {
    for (const assoc of sheet.associations) {
      const entityId = assoc.entityId;
      let group = groups.get(entityId);
      if (!group) {
        group = {
          entityId, entityName: '', entityType: q.groupBy,
          businessUnitName: sheet.businessUnit?.name ?? null,
          lineCount: 0, taxablePaise: 0, gstPaise: 0, grandTotalPaise: 0,
          cgstPaise: 0, sgstPaise: 0, igstPaise: 0,
        };
        groups.set(entityId, group);
      }

      for (const line of sheet.lines) {
        group.lineCount++;
        group.taxablePaise += toBigNum(line.amountPaise);
        group.gstPaise += toBigNum(line.gstPaise);
        group.cgstPaise += toBigNum(line.cgstPaise);
        group.sgstPaise += toBigNum(line.sgstPaise);
        group.igstPaise += toBigNum(line.igstPaise);
        group.grandTotalPaise += toBigNum(line.amountPaise) + toBigNum(line.gstPaise);
      }
    }
  }

  // Resolve entity names
  const namePromises = Array.from(groups.values()).map(async (g) => {
    g.entityName = await resolveEntityName(q.groupBy, g.entityId);
  });
  await Promise.all(namePromises);

  const data = Array.from(groups.values()).sort((a, b) => b.grandTotalPaise - a.grandTotalPaise);

  const totals = data.reduce((acc, g) => ({
    lineCount: acc.lineCount + g.lineCount,
    taxablePaise: acc.taxablePaise + g.taxablePaise,
    gstPaise: acc.gstPaise + g.gstPaise,
    grandTotalPaise: acc.grandTotalPaise + g.grandTotalPaise,
  }), { lineCount: 0, taxablePaise: 0, gstPaise: 0, grandTotalPaise: 0 });

  res.json({ data: { groupBy: q.groupBy, entities: data, totals } });
}));

/* GET /entity-detail — lines for a specific entity via associations */
const EntityDetailParams = z.object({
  entityType: z.enum(['PROJECT', 'OPPORTUNITY', 'INITIATIVE', 'ACCOUNT', 'LEAD', 'CONTACT']),
  entityId: z.string().min(1).max(26),
  from: z.string().optional(),
  to: z.string().optional(),
});

expenditureReportRouter.get('/entity-detail', validate({ query: EntityDetailParams }), asyncHandler(async (req, res) => {
  const q = req.query as unknown as z.infer<typeof EntityDetailParams>;

  const lineWhere: Record<string, unknown> = { deletedAt: null };
  if (q.from || q.to) {
    const dateFilter: Record<string, Date> = {};
    if (q.from) dateFilter.gte = new Date(q.from);
    if (q.to) dateFilter.lte = new Date(q.to);
    lineWhere.expenseDate = dateFilter;
  }

  const lines = await prisma.expenseLine.findMany({
    where: {
      ...lineWhere,
      sheet: {
        deletedAt: null,
        status: { in: ['APPROVED', 'IN_PROGRESS', 'EXPENSE_SUBMITTED', 'COMPLETED'] },
        associations: { some: { entityType: q.entityType, entityId: q.entityId } },
      },
    },
    include: { sheet: { select: { id: true, title: true, status: true } } },
    orderBy: { expenseDate: 'desc' },
  });

  res.json({
    data: lines.map((l) => ({
      lineId: l.id,
      sheetId: l.sheet.id,
      sheetTitle: l.sheet.title,
      sheetStatus: l.sheet.status,
      expenseDate: l.expenseDate.toISOString().slice(0, 10),
      category: l.category,
      vendorName: l.vendorName,
      description: l.description,
      amountPaise: toBigNum(l.amountPaise),
      gstPaise: toBigNum(l.gstPaise),
      cgstPaise: toBigNum(l.cgstPaise),
      sgstPaise: toBigNum(l.sgstPaise),
      igstPaise: toBigNum(l.igstPaise),
      totalPaise: toBigNum(l.amountPaise) + toBigNum(l.gstPaise),
      paymentMode: l.paymentMode,
    })),
  });
}));
