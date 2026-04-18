import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

type Sources = 'body' | 'query' | 'params';

interface Schemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
}

/**
 * Validate request inputs using Zod. Validated data replaces the original
 * properties on `req`, so handlers can rely on parsed types.
 */
export function validate(schemas: Schemas) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    for (const source of Object.keys(schemas) as Sources[]) {
      const schema = schemas[source];
      if (!schema) continue;
      const result = schema.safeParse(req[source]);
      if (!result.success) {
        next(result.error);
        return;
      }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (req as any)[source] = result.data;
    }
    next();
  };
}

/**
 * Wrap async route handlers to funnel errors into the error handler.
 * Alternative to `express-async-errors` if finer control is needed.
 */
export const asyncHandler =
  <T>(fn: (req: Request, res: Response, next: NextFunction) => Promise<T>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    fn(req, res, next).catch(next);
  };
