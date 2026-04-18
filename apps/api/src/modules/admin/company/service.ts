import { errors } from '../../../middleware/error-handler.js';
import { companyRepo } from './repository.js';
import { toDto, type CompanyDto, type UpdateCompanyInput } from './types.js';

export const companyService = {
  /**
   * Retrieve the singleton company profile.
   * Returns 404 if no company row has been created yet.
   */
  async get(): Promise<CompanyDto> {
    const row = await companyRepo.findSingleton();
    if (!row) throw errors.notFound('Company profile not found. Create it via PATCH /api/v1/company.');
    return toDto(row);
  },

  /**
   * Update (or create on first call) the company profile.
   * Returns `{ before, after }` for audit logging.
   */
  async upsert(
    input: UpdateCompanyInput,
    actorUserId: string
  ): Promise<{ before: CompanyDto | null; after: CompanyDto }> {
    const existing = await companyRepo.findSingleton();
    const before = existing ? toDto(existing) : null;
    const row = await companyRepo.upsert(input, actorUserId);
    return { before, after: toDto(row) };
  },
};
