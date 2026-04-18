import type { User as PrismaUser } from '@prisma/client';

export interface RoleRef {
  id: string;
  name: string;
  displayName: string;
}

export interface UserDto {
  id: string;
  externalId: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: string;
  roles: RoleRef[];
  createdAt: string;
  updatedAt: string;
  buMemberships?: BuMembershipDto[];
}

export interface BuMembershipDto {
  businessUnitId: string;
  businessUnitName: string;
  roleId: string;
  roleName: string;
}

type UserWithIncludes = PrismaUser & {
  userRoles?: Array<{
    role: { id: string; name: string; displayName: string };
  }>;
  buMemberships?: Array<{
    businessUnitId: string;
    businessUnit: { name: string };
    roleId: string;
    role: { name: string };
  }>;
};

export function toDto(row: UserWithIncludes): UserDto {
  const dto: UserDto = {
    id: row.id,
    externalId: row.externalId,
    email: row.email,
    fullName: row.fullName,
    phone: row.phone,
    status: row.status,
    roles: (row.userRoles ?? []).map((ur) => ({
      id: ur.role.id,
      name: ur.role.name,
      displayName: ur.role.displayName,
    })),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };

  if (row.buMemberships) {
    dto.buMemberships = row.buMemberships.map((m) => ({
      businessUnitId: m.businessUnitId,
      businessUnitName: m.businessUnit.name,
      roleId: m.roleId,
      roleName: m.role.name,
    }));
  }

  return dto;
}
