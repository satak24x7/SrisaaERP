import type { BusinessUnit as PrismaBusinessUnit } from '@prisma/client';
import type {
  ApprovalThresholds,
  BusinessUnitStatus,
} from '@govprojects/shared-types';

export interface BusinessUnitDto {
  id: string;
  name: string;
  description: string | null;
  costCentre: string | null;
  buHeadUserId: string;
  buHeadName: string | null;
  approvalThresholds: ApprovalThresholds | null;
  status: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Convert a Prisma BusinessUnit row to the DTO returned over the wire.
 */
export function toDto(row: PrismaBusinessUnit & { buHead?: { fullName: string } }): BusinessUnitDto {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    costCentre: row.costCentre,
    buHeadUserId: row.buHeadUserId,
    buHeadName: row.buHead?.fullName ?? null,
    approvalThresholds: (row.approvalThresholds as ApprovalThresholds | null) ?? null,
    status: row.status as BusinessUnitStatus,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
