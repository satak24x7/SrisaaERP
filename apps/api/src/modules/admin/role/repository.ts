import type { Role } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma, newId } from '../../../lib/prisma.js';

export interface CreateRow {
  name: string;
  displayName: string;
  description?: string | undefined;
  permissions?: Prisma.InputJsonValue | undefined;
}

export interface UpdateRow {
  name?: string | undefined;
  displayName?: string | undefined;
  description?: string | null | undefined;
  permissions?: Prisma.InputJsonValue | null | undefined;
}

export interface ListFilter {
  status?: string | undefined;
  q?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}

export const roleRepo = {
  async create(input: CreateRow): Promise<Role> {
    return prisma.role.create({
      data: {
        id: newId(),
        name: input.name,
        displayName: input.displayName,
        description: input.description ?? null,
        permissions: input.permissions ?? Prisma.JsonNull,
      },
    });
  },

  async findById(id: string): Promise<Role | null> {
    return prisma.role.findFirst({ where: { id, deletedAt: null } });
  },

  async findByName(name: string): Promise<Role | null> {
    return prisma.role.findFirst({ where: { name, deletedAt: null } });
  },

  async update(id: string, input: UpdateRow): Promise<Role> {
    const data: Prisma.RoleUncheckedUpdateInput = {};
    if (input.name !== undefined) data.name = input.name;
    if (input.displayName !== undefined) data.displayName = input.displayName;
    if (input.description !== undefined) data.description = input.description;
    if (input.permissions !== undefined) {
      data.permissions =
        input.permissions === null ? Prisma.JsonNull : input.permissions;
    }
    return prisma.role.update({ where: { id }, data });
  },

  async softDelete(id: string): Promise<Role> {
    return prisma.role.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async list(filter: ListFilter): Promise<Role[]> {
    const where: Prisma.RoleWhereInput = { deletedAt: null };
    if (filter.status && filter.status !== 'all') {
      // 'active' is the default — already filtered by deletedAt: null
    }
    if (filter.q) where.name = { contains: filter.q };

    // Cursor-based pagination: ULIDs are lex-sortable, so `id >` on the cursor
    // gives stable "after this id" ordering without a separate timestamp.
    const take = filter.limit + 1; // fetch one extra to compute next_cursor
    const args: Prisma.RoleFindManyArgs = {
      where,
      orderBy: { id: 'asc' },
      take,
    };
    if (filter.cursor) {
      args.cursor = { id: filter.cursor };
      args.skip = 1;
    }
    return prisma.role.findMany(args);
  },

  async countReferences(id: string): Promise<{ members: number }> {
    const members = await prisma.businessUnitMember.count({
      where: { roleId: id },
    });
    return { members };
  },
};
