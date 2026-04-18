import { prisma, newId } from '../../../lib/prisma.js';
import type { UpdateCompanyInput } from './types.js';

const FIELDS = [
  'legalName', 'cin', 'logoUri', 'registeredAddress', 'corporateAddress',
  'pan', 'tan', 'gstin',
] as const;

export const companyRepo = {
  async findSingleton() {
    return prisma.company.findFirst({ where: { deletedAt: null } });
  },

  async upsert(input: UpdateCompanyInput, actorUserId: string) {
    const existing = await prisma.company.findFirst({ where: { deletedAt: null } });

    if (existing) {
      const data: Record<string, unknown> = { updatedBy: actorUserId };
      for (const key of FIELDS) {
        if (input[key] !== undefined) data[key] = input[key];
      }
      return prisma.company.update({ where: { id: existing.id }, data });
    }

    return prisma.company.create({
      data: {
        id: newId(),
        legalName: input.legalName ?? 'Unnamed Company',
        cin: input.cin ?? null,
        logoUri: input.logoUri ?? null,
        registeredAddress: input.registeredAddress ?? null,
        corporateAddress: input.corporateAddress ?? null,
        pan: input.pan ?? null,
        tan: input.tan ?? null,
        gstin: input.gstin ?? null,
        createdBy: actorUserId,
        updatedBy: actorUserId,
      },
    });
  },
};
