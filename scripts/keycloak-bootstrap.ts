/**
 * Keycloak Bootstrap Script
 *
 * Provisions the `govprojects` realm, API + Web clients, realm roles,
 * and a dev test user via the Keycloak Admin REST API.
 *
 * Usage:  pnpm tsx scripts/keycloak-bootstrap.ts
 *
 * Env (all optional — defaults target local docker-compose):
 *   KEYCLOAK_URL          default http://localhost:8080
 *   KEYCLOAK_ADMIN        default admin
 *   KEYCLOAK_ADMIN_PASSWORD  default admin
 */

const KC_URL = process.env.KEYCLOAK_URL ?? 'http://localhost:8080';
const KC_ADMIN = process.env.KEYCLOAK_ADMIN ?? 'admin';
const KC_ADMIN_PW = process.env.KEYCLOAK_ADMIN_PASSWORD ?? 'admin';

const REALM = 'govprojects';
const API_CLIENT_ID = 'govprojects-api';
const WEB_CLIENT_ID = 'govprojects-web';

const REALM_ROLES = [
  'super_admin',
  'admin',
  'bu_head',
  'project_manager',
  'site_engineer',
  'procurement_officer',
  'finance_officer',
  'viewer',
] as const;

const TEST_USER = {
  username: 'testuser',
  email: 'test@govprojects.local',
  firstName: 'Test',
  lastName: 'User',
  password: 'Test@1234',
  roles: ['admin'] as readonly string[],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let accessToken = '';

async function getAdminToken(): Promise<string> {
  const res = await fetch(
    `${KC_URL}/realms/master/protocol/openid-connect/token`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'password',
        client_id: 'admin-cli',
        username: KC_ADMIN,
        password: KC_ADMIN_PW,
      }),
    },
  );
  if (!res.ok) {
    throw new Error(`Failed to get admin token: ${res.status} ${await res.text()}`);
  }
  const data = (await res.json()) as { access_token: string };
  return data.access_token;
}

async function kc(
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; data: unknown }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
  };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${KC_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: res.status, data };
}

function log(msg: string): void {
  // eslint-disable-next-line no-console
  console.log(`[keycloak-bootstrap] ${msg}`);
}

// ---------------------------------------------------------------------------
// Provisioning steps
// ---------------------------------------------------------------------------

async function createRealm(): Promise<void> {
  const { status } = await kc('GET', `/admin/realms/${REALM}`);
  if (status === 200) {
    log(`Realm "${REALM}" already exists — skipping creation`);
    return;
  }

  const { status: createStatus, data } = await kc('POST', '/admin/realms', {
    realm: REALM,
    enabled: true,
    displayName: 'GovProjects Platform',
    loginWithEmailAllowed: true,
    duplicateEmailsAllowed: false,
    resetPasswordAllowed: true,
    editUsernameAllowed: false,
    sslRequired: 'none', // dev only
    accessTokenLifespan: 900, // 15 min
    ssoSessionIdleTimeout: 1800,
    ssoSessionMaxLifespan: 36000, // 10h
  });

  if (createStatus === 201) {
    log(`Realm "${REALM}" created`);
  } else {
    throw new Error(`Failed to create realm: ${createStatus} ${JSON.stringify(data)}`);
  }
}

async function createClient(
  clientId: string,
  opts: {
    publicClient: boolean;
    redirectUris: string[];
    webOrigins: string[];
    serviceAccountsEnabled?: boolean;
    directAccessGrantsEnabled?: boolean;
  },
): Promise<string> {
  // Check if client already exists
  const { status, data } = await kc(
    'GET',
    `/admin/realms/${REALM}/clients?clientId=${clientId}`,
  );
  if (status === 200 && Array.isArray(data) && data.length > 0) {
    const existing = data[0] as { id: string };
    log(`Client "${clientId}" already exists (id=${existing.id}) — skipping`);
    return existing.id;
  }

  const payload = {
    clientId,
    name: clientId,
    enabled: true,
    publicClient: opts.publicClient,
    standardFlowEnabled: true,
    directAccessGrantsEnabled: opts.directAccessGrantsEnabled ?? true,
    serviceAccountsEnabled: opts.serviceAccountsEnabled ?? false,
    redirectUris: opts.redirectUris,
    webOrigins: opts.webOrigins,
    protocol: 'openid-connect',
    // For the API client (confidential), include audience in tokens
    ...(opts.publicClient
      ? {}
      : {
          attributes: {
            'access.token.lifespan': '900',
          },
        }),
  };

  const createRes = await kc('POST', `/admin/realms/${REALM}/clients`, payload);
  if (createRes.status !== 201) {
    throw new Error(
      `Failed to create client "${clientId}": ${createRes.status} ${JSON.stringify(createRes.data)}`,
    );
  }

  // Fetch back to get the internal UUID
  const { data: clients } = await kc(
    'GET',
    `/admin/realms/${REALM}/clients?clientId=${clientId}`,
  );
  const id = ((clients as Array<{ id: string }>)[0]).id;
  log(`Client "${clientId}" created (id=${id})`);
  return id;
}

async function addAudienceMapper(apiClientUuid: string): Promise<void> {
  // Add a protocol mapper that puts the client_id into the `aud` claim
  // so jose can verify audience
  const mapperName = 'audience-mapper';
  const { status, data } = await kc(
    'GET',
    `/admin/realms/${REALM}/clients/${apiClientUuid}/protocol-mappers/models`,
  );
  if (
    status === 200 &&
    Array.isArray(data) &&
    (data as Array<{ name: string }>).some((m) => m.name === mapperName)
  ) {
    log('Audience mapper already exists — skipping');
    return;
  }

  const { status: createStatus } = await kc(
    'POST',
    `/admin/realms/${REALM}/clients/${apiClientUuid}/protocol-mappers/models`,
    {
      name: mapperName,
      protocol: 'openid-connect',
      protocolMapper: 'oidc-audience-mapper',
      config: {
        'included.client.audience': API_CLIENT_ID,
        'id.token.claim': 'false',
        'access.token.claim': 'true',
        'introspection.token.claim': 'true',
      },
    },
  );

  if (createStatus === 201) {
    log('Audience mapper added to API client');
  } else {
    log(`Audience mapper creation returned ${createStatus} — may already exist`);
  }
}

async function createRealmRoles(): Promise<void> {
  for (const roleName of REALM_ROLES) {
    const { status } = await kc(
      'GET',
      `/admin/realms/${REALM}/roles/${roleName}`,
    );
    if (status === 200) {
      log(`Role "${roleName}" already exists — skipping`);
      continue;
    }

    const { status: createStatus, data } = await kc(
      'POST',
      `/admin/realms/${REALM}/roles`,
      {
        name: roleName,
        description: `Platform role: ${roleName}`,
      },
    );

    if (createStatus === 201) {
      log(`Role "${roleName}" created`);
    } else {
      throw new Error(
        `Failed to create role "${roleName}": ${createStatus} ${JSON.stringify(data)}`,
      );
    }
  }
}

async function createTestUser(): Promise<void> {
  // Check if user exists
  const { status, data } = await kc(
    'GET',
    `/admin/realms/${REALM}/users?username=${TEST_USER.username}&exact=true`,
  );
  if (status === 200 && Array.isArray(data) && data.length > 0) {
    log(`User "${TEST_USER.username}" already exists — skipping`);
    return;
  }

  // Create user
  const { status: createStatus, data: createData } = await kc(
    'POST',
    `/admin/realms/${REALM}/users`,
    {
      username: TEST_USER.username,
      email: TEST_USER.email,
      firstName: TEST_USER.firstName,
      lastName: TEST_USER.lastName,
      enabled: true,
      emailVerified: true,
      credentials: [
        {
          type: 'password',
          value: TEST_USER.password,
          temporary: false,
        },
      ],
    },
  );

  if (createStatus !== 201) {
    throw new Error(
      `Failed to create test user: ${createStatus} ${JSON.stringify(createData)}`,
    );
  }

  // Fetch user id
  const { data: users } = await kc(
    'GET',
    `/admin/realms/${REALM}/users?username=${TEST_USER.username}&exact=true`,
  );
  const userId = ((users as Array<{ id: string }>)[0]).id;
  log(`User "${TEST_USER.username}" created (id=${userId})`);

  // Assign realm roles
  for (const roleName of TEST_USER.roles) {
    const { data: roleData } = await kc(
      'GET',
      `/admin/realms/${REALM}/roles/${roleName}`,
    );
    const role = roleData as { id: string; name: string };

    const { status: assignStatus } = await kc(
      'POST',
      `/admin/realms/${REALM}/users/${userId}/role-mappings/realm`,
      [{ id: role.id, name: role.name }],
    );

    if (assignStatus === 204) {
      log(`Assigned role "${roleName}" to user "${TEST_USER.username}"`);
    }
  }
}

async function getClientSecret(apiClientUuid: string): Promise<string> {
  const { status, data } = await kc(
    'GET',
    `/admin/realms/${REALM}/clients/${apiClientUuid}/client-secret`,
  );
  if (status === 200) {
    return (data as { value: string }).value;
  }
  return '<could not retrieve>';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log(`Bootstrapping Keycloak at ${KC_URL}`);

  accessToken = await getAdminToken();
  log('Admin token acquired');

  await createRealm();

  const apiClientUuid = await createClient(API_CLIENT_ID, {
    publicClient: false,
    redirectUris: ['http://localhost:3000/*'],
    webOrigins: ['http://localhost:3000'],
    serviceAccountsEnabled: true,
    directAccessGrantsEnabled: true,
  });

  // Add audience mapper to API client so `aud` claim includes "govprojects-api"
  await addAudienceMapper(apiClientUuid);

  await createClient(WEB_CLIENT_ID, {
    publicClient: true,
    redirectUris: [
      'http://localhost:4200/*',
      'http://localhost:8100/*', // Ionic
      'capacitor://localhost/*',
    ],
    webOrigins: [
      'http://localhost:4200',
      'http://localhost:8100',
    ],
    directAccessGrantsEnabled: true,
  });

  // Add audience mapper to web client so tokens from the web client also have the API audience
  const { data: webClients } = await kc(
    'GET',
    `/admin/realms/${REALM}/clients?clientId=${WEB_CLIENT_ID}`,
  );
  const webClientUuid = ((webClients as Array<{ id: string }>)[0]).id;
  await addAudienceMapper(webClientUuid);

  await createRealmRoles();
  await createTestUser();

  const secret = await getClientSecret(apiClientUuid);

  log('');
  log('=== Bootstrap complete ===');
  log('');
  log(`Realm:          ${REALM}`);
  log(`API Client:     ${API_CLIENT_ID} (confidential, secret: ${secret})`);
  log(`Web Client:     ${WEB_CLIENT_ID} (public)`);
  log(`Roles:          ${REALM_ROLES.join(', ')}`);
  log(`Test user:      ${TEST_USER.username} / ${TEST_USER.password} (roles: ${TEST_USER.roles.join(', ')})`);
  log('');
  log(`Issuer URL:     ${KC_URL}/realms/${REALM}`);
  log(`JWKS URL:       ${KC_URL}/realms/${REALM}/protocol/openid-connect/certs`);
  log(`Token URL:      ${KC_URL}/realms/${REALM}/protocol/openid-connect/token`);
  log('');
  log('Update .env:');
  log(`  KEYCLOAK_CLIENT_SECRET=${secret}`);
}

main().catch((err: unknown) => {
  // eslint-disable-next-line no-console
  console.error('[keycloak-bootstrap] FATAL:', err);
  process.exit(1);
});
