import { z } from 'zod';

/**
 * Single field-level error detail.
 */
export const ErrorDetail = z.object({
  path: z.string(),
  message: z.string(),
});
export type ErrorDetail = z.infer<typeof ErrorDetail>;

/**
 * Standard error envelope. Every non-2xx response from the API has this shape.
 * `code` values are SCREAMING_SNAKE and stable once shipped.
 */
export const ErrorEnvelope = z.object({
  error: z.object({
    code: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    message: z.string(),
    details: z.array(ErrorDetail).optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof ErrorEnvelope>;
