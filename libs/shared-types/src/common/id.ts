import { z } from 'zod';

/**
 * ULID — Crockford base32, 26 chars, lexicographically sortable.
 * All primary keys in this platform are ULIDs generated in app code.
 */
export const UlidSchema = z
  .string()
  .regex(/^[0-9A-HJKMNP-TV-Z]{26}$/, 'Must be a 26-character ULID');

export type Ulid = z.infer<typeof UlidSchema>;
