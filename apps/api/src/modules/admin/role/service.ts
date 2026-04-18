import type { RoleDto } from './types.js';
import { errors } from '../../../middleware/error-handler.js';
import { roleRepo } from './repository.js';
import { toDto } from './types.js';

export interface PaginatedRoles {
  data: RoleDto[];
  meta: { next_cursor: string | null; limit: number };
}

export interface ListRolesQuery {
  status?: string | undefined;
  q?: string | undefined;
  cursor?: string | undefined;
  limit: number;
}

export interface CreateRoleInput {
  name: string;
  displayName: string;
  description?: string | undefined;
  permissions?: string[] | undefined;
}

export interface UpdateRoleInput {
  name?: string | undefined;
  displayName?: string | undefined;
  description?: string | null | undefined;
  permissions?: string[] | null | undefined;
}

export const roleService = {
  async list(query: ListRolesQuery): Promise<PaginatedRoles> {
    const rows = await roleRepo.list({
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

  async get(id: string): Promise<RoleDto> {
    const row = await roleRepo.findById(id);
    if (!row) throw errors.notFound('Role not found');
    return toDto(row);
  },

  async create(input: CreateRoleInput): Promise<RoleDto> {
    const existing = await roleRepo.findByName(input.name);
    if (existing) {
      throw errors.conflict('A role with this name already exists');
    }
    const row = await roleRepo.create({
      name: input.name,
      displayName: input.displayName,
      description: input.description,
      permissions: input.permissions,
    });
    return toDto(row);
  },

  async update(
    id: string,
    input: UpdateRoleInput
  ): Promise<{ before: RoleDto; after: RoleDto }> {
    const existing = await roleRepo.findById(id);
    if (!existing) throw errors.notFound('Role not found');

    // If renaming, check for uniqueness
    if (input.name !== undefined && input.name !== existing.name) {
      const conflict = await roleRepo.findByName(input.name);
      if (conflict) {
        throw errors.conflict('A role with this name already exists');
      }
    }

    const row = await roleRepo.update(id, {
      name: input.name,
      displayName: input.displayName,
      description: input.description,
      permissions: input.permissions,
    });
    return { before: toDto(existing), after: toDto(row) };
  },

  async softDelete(id: string): Promise<RoleDto> {
    const existing = await roleRepo.findById(id);
    if (!existing) throw errors.notFound('Role not found');

    // Prevent deleting system roles
    if (existing.isSystem) {
      throw errors.businessRule(
        'SYSTEM_ROLE',
        'System roles cannot be deleted'
      );
    }

    // Prevent deleting roles with BU member references
    const refs = await roleRepo.countReferences(id);
    if (refs.members > 0) {
      throw errors.businessRule(
        'ROLE_HAS_REFERENCES',
        'Role cannot be deleted while it is assigned to Business Unit members. Re-assign them first.',
        refs
      );
    }

    const row = await roleRepo.softDelete(id);
    return toDto(row);
  },
};
