// Ambient augmentations for the Express Request object.
// Uses the global Express namespace (works whether @types/express resolves
// internally via express-serve-static-core or directly).

import type { AuthenticatedUser } from '../middleware/auth.js';
import type { AuditContext } from '../middleware/audit.js';

declare global {
  namespace Express {
    interface Request {
      correlationId: string;
      user?: AuthenticatedUser;
      audit: AuditContext;
    }
  }
}

export {};
