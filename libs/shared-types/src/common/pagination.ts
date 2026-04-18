import { z } from 'zod';

/**
 * Cursor-based pagination params parsed from the query string.
 * See docs/api/conventions.md.
 */
export const PaginationParams = z.object({
  cursor: z.string().min(1).max(128).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  sort: z.string().min(1).max(128).optional(),
});

export type PaginationParams = z.infer<typeof PaginationParams>;

/**
 * Standard `meta` block returned with every collection response.
 */
export const PaginationMeta = z.object({
  next_cursor: z.string().nullable(),
  limit: z.number().int().positive(),
  total: z.number().int().nonnegative().optional(),
});

export type PaginationMeta = z.infer<typeof PaginationMeta>;
