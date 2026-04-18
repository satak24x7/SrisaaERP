import { z } from 'zod';
import { UlidSchema } from '../common/id.js';

export const BusinessUnitStatus = z.enum(['ACTIVE', 'INACTIVE']);
export type BusinessUnitStatus = z.infer<typeof BusinessUnitStatus>;

/**
 * Approval threshold rule. The BU Head is the default second-level approver
 * for amounts within the configured band. Leaving this empty falls back to
 * module defaults in docs/modules/04-expense-management.md.
 */
export const ApprovalThresholdRule = z.object({
  module: z.enum(['EXPENSE', 'PURCHASE', 'PROJECT_BUDGET']),
  currency: z.string().length(3).default('INR'),
  maxAmountPaise: z.number().int().nonnegative(),
  approverRole: z.string().min(1).max(32),
});
export type ApprovalThresholdRule = z.infer<typeof ApprovalThresholdRule>;

export const ApprovalThresholds = z.array(ApprovalThresholdRule);
export type ApprovalThresholds = z.infer<typeof ApprovalThresholds>;

/**
 * DTO returned by the API for a single Business Unit.
 */
export const BusinessUnitDto = z.object({
  id: UlidSchema,
  name: z.string(),
  description: z.string().nullable(),
  costCentre: z.string().nullable(),
  buHeadUserId: UlidSchema,
  approvalThresholds: ApprovalThresholds.nullable(),
  status: BusinessUnitStatus,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type BusinessUnitDto = z.infer<typeof BusinessUnitDto>;

export const CreateBusinessUnitInput = z.object({
  name: z.string().trim().min(1).max(128),
  description: z.string().trim().max(2000).optional(),
  costCentre: z.string().trim().max(32).optional(),
  buHeadUserId: UlidSchema,
  approvalThresholds: ApprovalThresholds.optional(),
  status: BusinessUnitStatus.default('ACTIVE'),
});
export type CreateBusinessUnitInput = z.infer<typeof CreateBusinessUnitInput>;

export const UpdateBusinessUnitInput = CreateBusinessUnitInput.partial();
export type UpdateBusinessUnitInput = z.infer<typeof UpdateBusinessUnitInput>;

export const ListBusinessUnitsQuery = z.object({
  status: BusinessUnitStatus.optional(),
  q: z.string().trim().min(1).max(128).optional(),
  cursor: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.string().min(1).max(128).optional(),
});
export type ListBusinessUnitsQuery = z.infer<typeof ListBusinessUnitsQuery>;
