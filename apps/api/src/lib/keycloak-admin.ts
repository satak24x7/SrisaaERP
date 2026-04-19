import { env } from '../config/env.js';
import { logger } from './logger.js';

const KC_URL = process.env.KEYCLOAK_URL ?? 'http://localhost:8080';
const REALM = process.env.KEYCLOAK_REALM ?? 'govprojects';
const ADMIN_USER = env.KEYCLOAK_ADMIN_USER;
const ADMIN_PW = env.KEYCLOAK_ADMIN_PASSWORD;
const DEFAULT_PASSWORD = 'Test@1234';

let cachedToken: { token: string; expiresAt: number } | null = null;

async function getAdminToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 10_000) {
    return cachedToken.token;
  }

  const res = await fetch(
    `${KC_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: ADMIN_USER,
        password: ADMIN_PW,
      }),
    },
  );

  if (!res.ok) {
    throw new Error(`Keycloak admin token failed: ${res.status}`);
  }

  const data = await res.json() as { access_token: string; expires_in: number };
  cachedToken = {
    token: data.access_token,
    expiresAt: Date.now() + data.expires_in * 1000,
  };
  return data.access_token;
}

async function kcRequest(method: string, path: string, body?: unknown): Promise<{ status: number; data: unknown }> {
  const token = await getAdminToken();
  const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${KC_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data: unknown;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
}

function splitName(fullName: string): { firstName: string; lastName: string } {
  const parts = fullName.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: '' };
  const firstName = parts[0];
  const lastName = parts.slice(1).join(' ');
  return { firstName, lastName };
}

/**
 * Create a Keycloak user. Returns the Keycloak user ID (UUID).
 * Username is set to the email address.
 * Default password: Test@1234 (non-temporary).
 */
export async function createKeycloakUser(opts: {
  email: string;
  fullName: string;
  password?: string;
}): Promise<string> {
  const { firstName, lastName } = splitName(opts.fullName);

  // Check if user already exists by email
  const { data: existing } = await kcRequest('GET', `/admin/realms/${REALM}/users?email=${encodeURIComponent(opts.email)}&exact=true`);
  if (Array.isArray(existing) && existing.length > 0) {
    const kcUser = existing[0] as { id: string };
    // Update name to match
    await kcRequest('PUT', `/admin/realms/${REALM}/users/${kcUser.id}`, {
      ...(existing[0] as Record<string, unknown>),
      firstName,
      lastName,
      username: opts.email,
    });
    logger.info({ kcUserId: kcUser.id, email: opts.email }, 'Keycloak user already exists — updated name');
    return kcUser.id;
  }

  // Create new user
  const { status, data } = await kcRequest('POST', `/admin/realms/${REALM}/users`, {
    username: opts.email,
    email: opts.email,
    firstName,
    lastName,
    enabled: true,
    emailVerified: true,
    credentials: [{
      type: 'password',
      value: opts.password ?? DEFAULT_PASSWORD,
      temporary: false,
    }],
  });

  if (status !== 201) {
    throw new Error(`Failed to create Keycloak user: ${status} ${JSON.stringify(data)}`);
  }

  // Fetch back to get the ID
  const { data: users } = await kcRequest('GET', `/admin/realms/${REALM}/users?email=${encodeURIComponent(opts.email)}&exact=true`);
  const kcId = ((users as Array<{ id: string }>)[0]).id;
  logger.info({ kcUserId: kcId, email: opts.email }, 'Keycloak user created');
  return kcId;
}

/**
 * Update a Keycloak user's profile (name, email).
 */
export async function updateKeycloakUser(keycloakId: string, opts: {
  email?: string;
  fullName?: string;
}): Promise<void> {
  const { status: getStatus, data: userData } = await kcRequest('GET', `/admin/realms/${REALM}/users/${keycloakId}`);
  if (getStatus !== 200) {
    logger.warn({ keycloakId }, 'Keycloak user not found for update — skipping');
    return;
  }

  const update: Record<string, unknown> = { ...(userData as Record<string, unknown>) };
  if (opts.email) {
    update.email = opts.email;
    update.username = opts.email;
  }
  if (opts.fullName) {
    const { firstName, lastName } = splitName(opts.fullName);
    update.firstName = firstName;
    update.lastName = lastName;
  }

  await kcRequest('PUT', `/admin/realms/${REALM}/users/${keycloakId}`, update);
  logger.info({ keycloakId }, 'Keycloak user updated');
}

/**
 * Sync realm roles for a Keycloak user.
 * Replaces all app-managed roles with the given set.
 * Keycloak default roles (e.g. default-roles-*) are left untouched.
 */
export async function syncKeycloakRoles(keycloakId: string, roleNames: string[]): Promise<void> {
  // Get all available realm roles
  const { data: allRoles } = await kcRequest('GET', `/admin/realms/${REALM}/roles`);
  const realmRoles = allRoles as Array<{ id: string; name: string }>;

  // App-managed role names (from the bootstrap script)
  const APP_ROLES = new Set([
    'super_admin', 'admin', 'bu_head', 'project_manager',
    'site_engineer', 'procurement_officer', 'finance_officer', 'viewer',
  ]);

  // Get user's current realm roles
  const { data: currentRoles } = await kcRequest(
    'GET',
    `/admin/realms/${REALM}/users/${keycloakId}/role-mappings/realm`,
  );
  const current = currentRoles as Array<{ id: string; name: string }>;

  // Remove app-managed roles that are no longer assigned
  const toRemove = current.filter((r) => APP_ROLES.has(r.name) && !roleNames.includes(r.name));
  if (toRemove.length > 0) {
    await kcRequest(
      'DELETE',
      `/admin/realms/${REALM}/users/${keycloakId}/role-mappings/realm`,
      toRemove.map((r) => ({ id: r.id, name: r.name })),
    );
  }

  // Add new roles
  const currentNames = new Set(current.map((r) => r.name));
  const toAdd = roleNames
    .filter((name) => !currentNames.has(name))
    .map((name) => realmRoles.find((r) => r.name === name))
    .filter((r): r is { id: string; name: string } => r !== undefined);

  if (toAdd.length > 0) {
    await kcRequest(
      'POST',
      `/admin/realms/${REALM}/users/${keycloakId}/role-mappings/realm`,
      toAdd.map((r) => ({ id: r.id, name: r.name })),
    );
  }

  logger.info({ keycloakId, roles: roleNames, added: toAdd.length, removed: toRemove.length }, 'Keycloak roles synced');
}

/**
 * Disable a Keycloak user (on app soft-delete).
 */
export async function disableKeycloakUser(keycloakId: string): Promise<void> {
  const { status, data } = await kcRequest('GET', `/admin/realms/${REALM}/users/${keycloakId}`);
  if (status !== 200) return;

  await kcRequest('PUT', `/admin/realms/${REALM}/users/${keycloakId}`, {
    ...(data as Record<string, unknown>),
    enabled: false,
  });
  logger.info({ keycloakId }, 'Keycloak user disabled');
}

/**
 * Sync all app DB users to Keycloak. Creates missing accounts, updates names.
 * Returns summary of actions taken.
 */
export async function syncAllUsersToKeycloak(
  users: Array<{ id: string; email: string; fullName: string; externalId: string }>,
  updateExternalId: (userId: string, externalId: string) => Promise<void>,
): Promise<{ created: number; updated: number; errors: number }> {
  let created = 0;
  let updated = 0;
  let errorCount = 0;

  for (const user of users) {
    try {
      const { firstName, lastName } = splitName(user.fullName);

      // Check if user exists in Keycloak by email
      const { data: existing } = await kcRequest(
        'GET',
        `/admin/realms/${REALM}/users?email=${encodeURIComponent(user.email)}&exact=true`,
      );

      if (Array.isArray(existing) && existing.length > 0) {
        const kcUser = existing[0] as { id: string; username: string; firstName?: string; lastName?: string };

        // Update name and username to match app
        await kcRequest('PUT', `/admin/realms/${REALM}/users/${kcUser.id}`, {
          ...(existing[0] as Record<string, unknown>),
          username: user.email,
          firstName,
          lastName,
        });

        // Link externalId if not set
        if (user.externalId !== kcUser.id) {
          await updateExternalId(user.id, kcUser.id);
        }

        updated++;
        logger.info({ email: user.email, kcId: kcUser.id }, 'Synced existing Keycloak user');
      } else {
        // Create new Keycloak account
        const kcId = await createKeycloakUser({ email: user.email, fullName: user.fullName });
        await updateExternalId(user.id, kcId);
        created++;
      }
    } catch (err) {
      logger.error({ err, email: user.email }, 'Failed to sync user to Keycloak');
      errorCount++;
    }
  }

  return { created, updated, errors: errorCount };
}
