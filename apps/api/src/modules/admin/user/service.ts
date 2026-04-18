import type { UserStatus } from '@prisma/client';
import type { UserDto } from './types.js';
import { errors } from '../../../middleware/error-handler.js';
import { userRepo } from './repository.js';
import { toDto } from './types.js';

export interface PaginatedUsers {
  data: UserDto[];
  meta: { next_cursor: string | null; limit: number };
}

export interface CreateUserInput {
  email: string;
  fullName: string;
  externalId: string;
  phone?: string | undefined;
  status?: UserStatus | undefined;
  roleIds?: string[] | undefined;
}

export interface UpdateUserInput {
  email?: string | undefined;
  fullName?: string | undefined;
  externalId?: string | undefined;
  phone?: string | null | undefined;
  status?: UserStatus | undefined;
  roleIds?: string[] | undefined;
}

export interface ListUsersQuery {
  status?: UserStatus | undefined;
  q?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}

async function assertEmailUnique(email: string, excludeId?: string): Promise<void> {
  const existing = await userRepo.findByEmail(email);
  if (existing && existing.id !== excludeId) {
    throw errors.conflict('A user with this email already exists');
  }
}

export const userService = {
  async list(query: ListUsersQuery): Promise<PaginatedUsers> {
    const rows = await userRepo.list({
      status: query.status,
      q: query.q,
      cursor: query.cursor,
      limit: query.limit,
    });
    const hasMore = rows.length > query.limit;
    const page = hasMore ? rows.slice(0, query.limit) : rows;
    const nextCursor = hasMore ? (page[page.length - 1]?.id ?? null) : null;
    return {
      data: page.map(toDto),
      meta: { next_cursor: nextCursor, limit: query.limit },
    };
  },

  async get(id: string): Promise<UserDto> {
    const row = await userRepo.findById(id);
    if (!row) throw errors.notFound('User not found');
    return toDto(row);
  },

  async create(input: CreateUserInput): Promise<UserDto> {
    await assertEmailUnique(input.email);
    const row = await userRepo.create({
      email: input.email,
      fullName: input.fullName,
      externalId: input.externalId,
      phone: input.phone,
      status: input.status,
      roleIds: input.roleIds,
    });
    return toDto(row);
  },

  async update(
    id: string,
    input: UpdateUserInput,
  ): Promise<{ before: UserDto; after: UserDto }> {
    const existing = await userRepo.findById(id);
    if (!existing) throw errors.notFound('User not found');
    if (input.email && input.email !== existing.email) {
      await assertEmailUnique(input.email, id);
    }
    const row = await userRepo.update(id, input);
    return { before: toDto(existing), after: toDto(row) };
  },

  async softDelete(id: string): Promise<UserDto> {
    const existing = await userRepo.findById(id);
    if (!existing) throw errors.notFound('User not found');
    const row = await userRepo.softDelete(id);
    return toDto({ ...row, userRoles: [], buMemberships: [] });
  },
};
