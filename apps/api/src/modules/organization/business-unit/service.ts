import type {
  CreateBusinessUnitInput,
  ListBusinessUnitsQuery,
  UpdateBusinessUnitInput,
} from '@govprojects/shared-types';
import { errors } from '../../../middleware/error-handler.js';
import { businessUnitRepo } from './repository.js';
import { toDto, type BusinessUnitDto } from './types.js';

export interface PaginatedBusinessUnits {
  data: BusinessUnitDto[];
  meta: { next_cursor: string | null; limit: number };
}

async function assertBuHeadExists(userId: string): Promise<void> {
  const ok = await businessUnitRepo.userExists(userId);
  if (!ok) throw errors.businessRule('BU_HEAD_NOT_FOUND', 'buHeadUserId does not reference an active user');
}

export const businessUnitService = {
  async list(query: ListBusinessUnitsQuery): Promise<PaginatedBusinessUnits> {
    const rows = await businessUnitRepo.list({
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

  async get(id: string): Promise<BusinessUnitDto> {
    const row = await businessUnitRepo.findById(id);
    if (!row) throw errors.notFound('Business Unit not found');
    return toDto(row);
  },

  async create(input: CreateBusinessUnitInput, actorUserId: string): Promise<BusinessUnitDto> {
    await assertBuHeadExists(input.buHeadUserId);
    const row = await businessUnitRepo.create({
      name: input.name,
      description: input.description,
      costCentre: input.costCentre,
      buHeadUserId: input.buHeadUserId,
      approvalThresholds: input.approvalThresholds,
      status: input.status,
      actorUserId,
    });
    return toDto(row);
  },

  async update(
    id: string,
    input: UpdateBusinessUnitInput,
    actorUserId: string
  ): Promise<{ before: BusinessUnitDto; after: BusinessUnitDto }> {
    const existing = await businessUnitRepo.findById(id);
    if (!existing) throw errors.notFound('Business Unit not found');
    if (input.buHeadUserId && input.buHeadUserId !== existing.buHeadUserId) {
      await assertBuHeadExists(input.buHeadUserId);
    }
    const row = await businessUnitRepo.update(id, { ...input, actorUserId });
    return { before: toDto(existing), after: toDto(row) };
  },

  async softDelete(id: string, actorUserId: string): Promise<BusinessUnitDto> {
    const existing = await businessUnitRepo.findById(id);
    if (!existing) throw errors.notFound('Business Unit not found');
    const refs = await businessUnitRepo.countReferences(id);
    const total = refs.projects + refs.opportunities + refs.expenseSheets + refs.materialRequests;
    if (total > 0) {
      throw errors.businessRule(
        'BU_HAS_REFERENCES',
        'Business Unit cannot be deleted while it has open projects, opportunities, expense sheets, or material requests. Re-assign them first.',
        refs
      );
    }
    const row = await businessUnitRepo.softDelete(id, actorUserId);
    return toDto(row);
  },
};
