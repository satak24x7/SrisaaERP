import type { Request, Response, NextFunction } from 'express';
import { createRemoteJWKSet, jwtVerify, type JWTPayload } from 'jose';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { errors } from './error-handler.js';
import { prisma, newId } from '../lib/prisma.js';

export interface AuthenticatedUser {
  id: string;
  externalId: string;
  email: string;
  fullName: string;
  roles: readonly string[];
  businessUnitIds: readonly string[];
  isSuperAdmin: boolean;
}

// ---------------------------------------------------------------------------
// JWKS setup
// ---------------------------------------------------------------------------

const JWKS_URL = new URL(
  `${env.JWT_ISSUER}/protocol/openid-connect/certs`,
);

const jwks = createRemoteJWKSet(JWKS_URL);

// ---------------------------------------------------------------------------
// Claim extraction
// ---------------------------------------------------------------------------

interface KeycloakClaims extends JWTPayload {
  sub?: string;
  email?: string;
  name?: string;
  given_name?: string;
  family_name?: string;
  preferred_username?: string;
  realm_access?: { roles?: string[] };
  bu_ids?: string[];
}

function extractUser(claims: KeycloakClaims): AuthenticatedUser {
  const realmRoles = claims.realm_access?.roles ?? [];

  const name =
    claims.name ??
    (`${claims.given_name ?? ''} ${claims.family_name ?? ''}`.trim() ||
      (claims.preferred_username ?? ''));

  return {
    id: claims.sub ?? 'usr_anonymous',
    externalId: claims.sub ?? '',
    email: claims.email ?? '',
    fullName: name,
    roles: realmRoles,
    businessUnitIds: claims.bu_ids ?? [],
    isSuperAdmin: realmRoles.includes('super_admin'),
  };
}

// ---------------------------------------------------------------------------
// Auto-provision: create DB user on first login from Keycloak
// ---------------------------------------------------------------------------

async function ensureDbUser(authUser: AuthenticatedUser): Promise<{ id: string } | null> {
  if (!authUser.externalId) return null;

  try {
    // Check if user exists by externalId
    const existing = await prisma.user.findUnique({
      where: { externalId: authUser.externalId },
      select: { id: true },
    });
    if (existing) return existing;

    // Also check by email — might exist with a placeholder externalId
    if (authUser.email) {
      const byEmail = await prisma.user.findUnique({
        where: { email: authUser.email },
        select: { id: true },
      });
      if (byEmail) {
        // Link existing user to Keycloak by updating externalId
        await prisma.user.update({
          where: { id: byEmail.id },
          data: { externalId: authUser.externalId },
        });
        logger.info({ userId: byEmail.id, email: authUser.email }, 'Linked existing user to Keycloak');
        return byEmail;
      }
    }

    // Create new user
    const id = newId();
    await prisma.user.create({
      data: {
        id,
        externalId: authUser.externalId,
        email: authUser.email || `${authUser.externalId}@keycloak.local`,
        fullName: authUser.fullName || 'User',
        status: 'ACTIVE',
      },
    });
    logger.info({ userId: id, email: authUser.email, externalId: authUser.externalId }, 'Auto-provisioned new user from Keycloak');
    return { id };
  } catch (err) {
    logger.error({ err }, 'Failed to auto-provision user');
    return null;
  }
}

// ---------------------------------------------------------------------------
// Middleware
// ---------------------------------------------------------------------------

export async function authMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  const header = req.header('authorization');
  if (!header) {
    next();
    return;
  }
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    next();
    return;
  }

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: env.JWT_ISSUER,
      audience: env.JWT_AUDIENCE,
    });

    const authUser = extractUser(payload as KeycloakClaims);

    // Auto-provision: ensure a DB user exists for this Keycloak identity
    const dbUser = await ensureDbUser(authUser);
    if (dbUser) {
      // Override id with the DB user ULID (not the Keycloak sub UUID)
      authUser.id = dbUser.id;
    }

    req.user = authUser;
  } catch (err: unknown) {
    logger.warn({ err }, 'JWT verification failed');
    // Don't set req.user — downstream requireAuth will reject with 401
  }

  next();
}

export function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): void {
  if (!req.user) {
    next(errors.unauthorized('Authentication required'));
    return;
  }
  next();
}

export function requireRole(...allowed: readonly string[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) {
      next(errors.unauthorized('Authentication required'));
      return;
    }
    if (req.user.isSuperAdmin) {
      next();
      return;
    }
    const ok = req.user.roles.some((r: string) => allowed.includes(r));
    if (!ok) {
      next(errors.forbidden('Insufficient role'));
      return;
    }
    next();
  };
}
