import type { BusinessUnit } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma, newId } from '../../../lib/prisma.js';

export interface CreateRow {
  name: string;
  description?: string | undefined;
  costCentre?: string | undefined;
  buHeadUserId: string;
  approvalThresholds?: Prisma.InputJsonValue | undefined;
  status: string;
  actorUserId: string;
}

export interface UpdateRow {
  name?: string | undefined;
  description?: string | null | undefined;
  costCentre?: string | null | undefined;
  buHeadUserId?: string | undefined;
  approvalThresholds?: Prisma.InputJsonValue | null | undefined;
  status?: string | undefined;
  actorUserId: string;
}

export interface ListFilter {
  status?: string | undefined;
  q?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}

export const businessUnitRepo = {
  async create(input: CreateRow): Promise<BusinessUnit & { buHead: { fullName: string } }> {
    return prisma.businessUnit.create({
      data: {
        id: newId(),
        name: input.name,
        description: input.description ?? null,
        costCentre: input.costCentre ?? null,
        buHeadUserId: input.buHeadUserId,
        approvalThresholds: input.approvalThresholds ?? Prisma.JsonNull,
        status: input.status,
        createdBy: input.actorUserId,
        updatedBy: input.actorUserId,
      },
      include: { buHead: { select: { fullName: true } } },
    }) as Promise<BusinessUnit & { buHead: { fullName: string } }>;
  },

  async findById(id: string): Promise<(BusinessUnit & { buHead: { fullName: string } }) | null> {
    return prisma.businessUnit.findFirst({
      where: { id, deletedAt: null },
      include: { buHead: { select: { fullName: true } } },
    }) as Promise<(BusinessUnit & { buHead: { fullName: string } }) | null>;
  },

  async update(id: string, input: UpdateRow): Promise<BusinessUnit & { buHead: { fullName: string } }> {
    const data: Prisma.BusinessUnitUncheckedUpdateInput = { updatedBy: input.actorUserId };
    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.costCentre !== undefined) data.costCentre = input.costCentre;
    if (input.buHeadUserId !== undefined) data.buHeadUserId = input.buHeadUserId;
    if (input.approvalThresholds !== undefined) {
      data.approvalThresholds =
        input.approvalThresholds === null ? Prisma.JsonNull : input.approvalThresholds;
    }
    if (input.status !== undefined) data.status = input.status;
    return prisma.businessUnit.update({
      where: { id },
      data,
      include: { buHead: { select: { fullName: true } } },
    }) as Promise<BusinessUnit & { buHead: { fullName: string } }>;
  },

  async softDelete(id: string, actorUserId: string): Promise<BusinessUnit> {
    return prisma.businessUnit.update({
      where: { id },
      data: { deletedAt: new Date(), updatedBy: actorUserId },
    });
  },

  async list(filter: ListFilter): Promise<BusinessUnit[]> {
    const where: Prisma.BusinessUnitWhereInput = { deletedAt: null };
    if (filter.status) where.status = filter.status;
    if (filter.q) where.name = { contains: filter.q };

    // Cursor-based pagination: ULIDs are lex-sortable, so `id >` on the cursor
    // gives stable "after this id" ordering without a separate timestamp.
    const take = filter.limit + 1; // fetch one extra to compute next_cursor
    const args: Prisma.BusinessUnitFindManyArgs = {
      where,
      orderBy: { id: 'asc' },
      take,
    };
    if (filter.cursor) {
      args.cursor = { id: filter.cursor };
      args.skip = 1;
    }
    args.include = { buHead: { select: { fullName: true } } };
    return prisma.businessUnit.findMany(args) as Promise<Array<BusinessUnit & { buHead: { fullName: string } }>>;
  },

  async countReferences(id: string): Promise<{
    projects: number;
    opportunities: number;
    expenseSheets: number;
    materialRequests: number;
  }> {
    const [projects, opportunities, expenseSheets, materialRequests] = await Promise.all([
      prisma.project.count({ where: { businessUnitId: id, deletedAt: null } }),
      prisma.opportunity.count({ where: { businessUnitId: id, deletedAt: null } }),
      prisma.expenseSheet.count({ where: { businessUnitId: id, deletedAt: null } }),
      prisma.materialRequest.count({ where: { businessUnitId: id, deletedAt: null } }),
    ]);
    return { projects, opportunities, expenseSheets, materialRequests };
  },

  async userExists(userId: string): Promise<boolean> {
    const count = await prisma.user.count({ where: { id: userId, deletedAt: null } });
    return count > 0;
  },
};
