import type { Request, Response, NextFunction } from 'express';
import { prisma, newId } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';

export interface AuditContext {
  correlationId: string;
  ipAddress: string | null;
  userAgent: string | null;
}

/**
 * Captures per-request fields used by audit log writes. Runs after correlation-id
 * and auth middleware so req.user (when present) is available to recordAudit().
 */
export function auditContextMiddleware(req: Request, _res: Response, next: NextFunction): void {
  req.audit = {
    correlationId: req.correlationId,
    ipAddress: req.ip ?? null,
    userAgent: req.header('user-agent') ?? null,
  };
  next();
}

export interface AuditWrite {
  action: string;          // CREATE | UPDATE | DELETE | SUBMIT | APPROVE | ...
  resourceType: string;    // e.g. "business_unit"
  resourceId: string;
  before?: unknown;
  after?: unknown;
  actorRole?: string;      // override; defaults to first role of req.user
}

/**
 * Service-layer helper. Call from inside route handlers after a successful write.
 * Does not throw — audit failures are logged but never break the request.
 */
export async function recordAudit(req: Request, write: AuditWrite): Promise<void> {
  const rawId = req.user?.id ?? 'usr_anonymous';
  const actorUserId = rawId.length <= 26 ? rawId : rawId.slice(0, 26);
  const actorRole = write.actorRole ?? req.user?.roles[0] ?? 'unknown';
  try {
    await prisma.auditLog.create({
      data: {
        id: newId(),
        actorUserId,
        actorRole,
        resourceType: write.resourceType,
        resourceId: write.resourceId,
        action: write.action,
        before: write.before === undefined ? undefined : JSON.parse(JSON.stringify(write.before)),
        after: write.after === undefined ? undefined : JSON.parse(JSON.stringify(write.after)),
        correlationId: req.audit.correlationId,
        ipAddress: req.audit.ipAddress,
        userAgent: req.audit.userAgent,
      },
    });
  } catch (err) {
    logger.error({ err, write, correlationId: req.audit.correlationId }, 'audit write failed');
  }
}
