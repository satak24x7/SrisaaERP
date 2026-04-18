import type { User, UserStatus } from '@prisma/client';
import { Prisma } from '@prisma/client';
import { prisma, newId } from '../../../lib/prisma.js';

export interface CreateRow {
  externalId: string;
  email: string;
  fullName: string;
  phone?: string | undefined;
  status?: UserStatus | undefined;
  roleIds?: string[] | undefined;
}

export interface UpdateRow {
  externalId?: string | undefined;
  email?: string | undefined;
  fullName?: string | undefined;
  phone?: string | null | undefined;
  status?: UserStatus | undefined;
  roleIds?: string[] | undefined;
}

export interface ListFilter {
  status?: UserStatus | undefined;
  q?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}

const USER_INCLUDE = {
  userRoles: {
    include: {
      role: { select: { id: true, name: true, displayName: true } },
    },
  },
  buMemberships: {
    include: {
      businessUnit: { select: { name: true } },
      role: { select: { name: true } },
    },
  },
} as const;

type UserWithIncludes = Prisma.UserGetPayload<{ include: typeof USER_INCLUDE }>;

export const userRepo = {
  async create(input: CreateRow): Promise<UserWithIncludes> {
    const userId = newId();
    await prisma.user.create({
      data: {
        id: userId,
        externalId: input.externalId,
        email: input.email,
        fullName: input.fullName,
        phone: input.phone ?? null,
        status: input.status ?? 'ACTIVE',
      },
    });

    if (input.roleIds && input.roleIds.length > 0) {
      await prisma.userRole.createMany({
        data: input.roleIds.map((roleId) => ({
          id: newId(),
          userId,
          roleId,
        })),
      });
    }

    return prisma.user.findUniqueOrThrow({
      where: { id: userId },
      include: USER_INCLUDE,
    });
  },

  async findById(id: string): Promise<UserWithIncludes | null> {
    return prisma.user.findFirst({
      where: { id, deletedAt: null },
      include: USER_INCLUDE,
    });
  },

  async findByEmail(email: string): Promise<User | null> {
    return prisma.user.findFirst({ where: { email, deletedAt: null } });
  },

  async update(id: string, input: UpdateRow): Promise<UserWithIncludes> {
    const data: Prisma.UserUncheckedUpdateInput = {};
    if (input.externalId !== undefined) data.externalId = input.externalId;
    if (input.email !== undefined) data.email = input.email;
    if (input.fullName !== undefined) data.fullName = input.fullName;
    if (input.phone !== undefined) data.phone = input.phone;
    if (input.status !== undefined) data.status = input.status;
    await prisma.user.update({ where: { id }, data });

    // Sync roles if provided
    if (input.roleIds !== undefined) {
      await prisma.userRole.deleteMany({ where: { userId: id } });
      if (input.roleIds.length > 0) {
        await prisma.userRole.createMany({
          data: input.roleIds.map((roleId) => ({
            id: newId(),
            userId: id,
            roleId,
          })),
        });
      }
    }

    return prisma.user.findUniqueOrThrow({
      where: { id },
      include: USER_INCLUDE,
    });
  },

  async softDelete(id: string): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  },

  async list(filter: ListFilter): Promise<UserWithIncludes[]> {
    const where: Prisma.UserWhereInput = { deletedAt: null };
    if (filter.status) where.status = filter.status;
    if (filter.q) {
      where.OR = [
        { fullName: { contains: filter.q } },
        { email: { contains: filter.q } },
      ];
    }

    const take = filter.limit + 1;
    const args: Prisma.UserFindManyArgs = {
      where,
      orderBy: { id: 'asc' },
      take,
      include: USER_INCLUDE,
    };
    if (filter.cursor) {
      args.cursor = { id: filter.cursor };
      args.skip = 1;
    }
    return prisma.user.findMany(args) as Promise<UserWithIncludes[]>;
  },
};
