import { z } from 'zod';

const PAN_REGEX = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
const TAN_REGEX = /^[A-Z]{4}[0-9]{5}[A-Z]$/;
const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][0-9A-Z][Z][0-9A-Z]$/;

export const UpdateCompanyInput = z.object({
  legalName: z.string().min(1).max(255).optional(),
  cin: z.string().max(32).optional(),
  logoUri: z.string().max(512).optional(),
  registeredAddress: z.string().optional(),
  corporateAddress: z.string().optional(),
  pan: z.string().length(10).regex(PAN_REGEX, 'Invalid PAN format (XXXXX9999X)').optional(),
  tan: z.string().length(10).regex(TAN_REGEX, 'Invalid TAN format (XXXX99999X)').optional(),
  gstin: z.string().length(15).regex(GSTIN_REGEX, 'Invalid GSTIN format (99XXXXX0000X9XX)').optional(),
});

export type UpdateCompanyInput = z.infer<typeof UpdateCompanyInput>;

export interface CompanyDto {
  id: string;
  legalName: string;
  cin: string | null;
  logoUri: string | null;
  registeredAddress: string | null;
  corporateAddress: string | null;
  pan: string | null;
  tan: string | null;
  gstin: string | null;
  createdAt: string;
  updatedAt: string;
}

export function toDto(row: {
  id: string;
  legalName: string;
  cin: string | null;
  logoUri: string | null;
  registeredAddress: string | null;
  corporateAddress: string | null;
  pan: string | null;
  tan: string | null;
  gstin: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CompanyDto {
  return {
    id: row.id,
    legalName: row.legalName,
    cin: row.cin,
    logoUri: row.logoUri,
    registeredAddress: row.registeredAddress,
    corporateAddress: row.corporateAddress,
    pan: row.pan,
    tan: row.tan,
    gstin: row.gstin,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
