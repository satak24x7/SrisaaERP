// Test bootstrap: load required env before any module that calls env.ts runs.
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL ??= 'error';
process.env.API_PUBLIC_URL ??= 'http://localhost:3000/api/v1';
process.env.DATABASE_URL ??= 'mysql://test:test@localhost:3306/test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ISSUER ??= 'http://localhost:8080/realms/govprojects';
process.env.JWT_AUDIENCE ??= 'govprojects-api';

// ---------------------------------------------------------------------------
// Mock `jose` so the auth middleware doesn't need a real Keycloak / JWKS
// endpoint during unit tests.  jwtVerify decodes the base64url payload from
// the fake JWT and returns it as `payload`.  Tests that send an invalid token
// (no dots, bad base64) will get a rejection → no req.user → 401.
// ---------------------------------------------------------------------------
jest.mock('jose', () => ({
  createRemoteJWKSet: () => () => Promise.resolve(),
  jwtVerify: async (token: string) => {
    const parts = token.split('.');
    if (parts.length !== 3) throw new Error('Invalid token');
    try {
      const payload = JSON.parse(
        Buffer.from(parts[1]!, 'base64url').toString('utf-8'),
      );
      // Simulate audience / issuer checks: if the test payload includes
      // `__reject`, throw so tests can exercise the 401 path.
      if (payload.__reject) throw new Error('Rejected by test');
      return { payload, protectedHeader: { alg: 'RS256' } };
    } catch {
      throw new Error('Token decode failed');
    }
  },
}));
