import type { Role as PrismaRole } from '@prisma/client';

export interface RoleDto {
  id: string;
  name: string;
  displayName: string;
  description: string | null;
  permissions: string[] | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert a Prisma Role row to the DTO returned over the wire.
 * Dates are serialized as ISO 8601 strings per the API conventions.
 */
export function toDto(row: PrismaRole): RoleDto {
  return {
    id: row.id,
    name: row.name,
    displayName: row.displayName,
    description: row.description,
    permissions: (row.permissions as string[] | null) ?? null,
    isSystem: row.isSystem,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
