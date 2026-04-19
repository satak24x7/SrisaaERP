import type { UserStatus } from '@prisma/client';
import type { UserDto } from './types.js';
import { errors } from '../../../middleware/error-handler.js';
import { userRepo } from './repository.js';
import { toDto } from './types.js';
import { createKeycloakUser, updateKeycloakUser, disableKeycloakUser, syncKeycloakRoles } from '../../../lib/keycloak-admin.js';
import { prisma } from '../../../lib/prisma.js';
import { logger } from '../../../lib/logger.js';

/** Resolve app role IDs to role names for Keycloak sync */
async function resolveRoleNames(roleIds: string[]): Promise<string[]> {
  if (roleIds.length === 0) return [];
  const roles = await prisma.role.findMany({
    where: { id: { in: roleIds } },
    select: { name: true },
  });
  return roles.map((r) => r.name);
}

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

    // Auto-create Keycloak account (email as username, default password Test@1234)
    let externalId = input.externalId;
    if (!externalId || externalId === 'pending') {
      try {
        externalId = await createKeycloakUser({ email: input.email, fullName: input.fullName });
      } catch (err) {
        logger.error({ err, email: input.email }, 'Failed to create Keycloak account — continuing with placeholder externalId');
        externalId = `pending_${Date.now()}`;
      }
    }

    const row = await userRepo.create({
      email: input.email,
      fullName: input.fullName,
      externalId,
      phone: input.phone,
      status: input.status,
      roleIds: input.roleIds,
    });

    // Sync roles to Keycloak
    if (input.roleIds && input.roleIds.length > 0 && externalId && !externalId.startsWith('pending')) {
      try {
        const roleNames = await resolveRoleNames(input.roleIds);
        await syncKeycloakRoles(externalId, roleNames);
      } catch (err) {
        logger.warn({ err, email: input.email }, 'Failed to sync roles to Keycloak on create');
      }
    }

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

    // Sync changes to Keycloak
    if (existing.externalId && !existing.externalId.startsWith('pending')) {
      // Sync name/email
      const needsProfileSync = (input.email && input.email !== existing.email) ||
                               (input.fullName && input.fullName !== existing.fullName);
      if (needsProfileSync) {
        try {
          await updateKeycloakUser(existing.externalId, {
            email: input.email,
            fullName: input.fullName,
          });
        } catch (err) {
          logger.warn({ err, userId: id }, 'Failed to sync user profile to Keycloak');
        }
      }

      // Sync roles
      if (input.roleIds !== undefined) {
        try {
          const roleNames = await resolveRoleNames(input.roleIds);
          await syncKeycloakRoles(existing.externalId, roleNames);
        } catch (err) {
          logger.warn({ err, userId: id }, 'Failed to sync roles to Keycloak');
        }
      }
    }

    return { before: toDto(existing), after: toDto(row) };
  },

  async softDelete(id: string): Promise<UserDto> {
    const existing = await userRepo.findById(id);
    if (!existing) throw errors.notFound('User not found');
    const row = await userRepo.softDelete(id);

    // Disable Keycloak account
    if (existing.externalId && !existing.externalId.startsWith('pending')) {
      try {
        await disableKeycloakUser(existing.externalId);
      } catch (err) {
        logger.warn({ err, userId: id }, 'Failed to disable Keycloak account');
      }
    }

    return toDto({ ...row, userRoles: [], buMemberships: [] });
  },
};
