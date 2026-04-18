import type { Request, Response, NextFunction } from 'express';
import { ulid } from 'ulid';

export function correlationIdMiddleware(req: Request, res: Response, next: NextFunction): void {
  const incoming = req.header('x-correlation-id');
  const id = incoming && /^[A-Za-z0-9_-]{8,128}$/.test(incoming) ? incoming : ulid();
  req.correlationId = id;
  res.setHeader('X-Correlation-ID', id);
  next();
}
