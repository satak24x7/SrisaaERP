import type { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../lib/logger.js';

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const errors = {
  notFound: (message = 'Resource not found') => new AppError(404, 'NOT_FOUND', message),
  forbidden: (message = 'Forbidden') => new AppError(403, 'FORBIDDEN', message),
  unauthorized: (message = 'Unauthorized') => new AppError(401, 'UNAUTHORIZED', message),
  conflict: (message = 'Conflict', details?: unknown) =>
    new AppError(409, 'CONFLICT', message, details),
  businessRule: (code: string, message: string, details?: unknown) =>
    new AppError(422, code, message, details),
  validation: (message = 'Validation failed', details?: unknown) =>
    new AppError(400, 'VALIDATION_FAILED', message, details),
};

export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  if (err instanceof ZodError) {
    res.status(400).json({
      error: {
        code: 'VALIDATION_FAILED',
        message: 'Request validation failed',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      },
    });
    return;
  }

  if (err instanceof AppError) {
    res.status(err.status).json({
      error: { code: err.code, message: err.message, details: err.details },
    });
    return;
  }

  logger.error({ err, correlationId: req.correlationId }, 'Unhandled error');
  res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' },
  });
}
