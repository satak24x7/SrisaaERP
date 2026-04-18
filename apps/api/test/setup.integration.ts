// Integration test bootstrap: point at the real test database + Redis.
// No Prisma/Redis mocks — we hit real services.

process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL ??= 'error';
process.env.API_PUBLIC_URL ??= 'http://localhost:3000/api/v1';
process.env.DATABASE_URL = 'mysql://govprojects:govprojects@localhost:3307/govprojects_test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.JWT_ISSUER ??= 'http://localhost:8080/realms/govprojects';
process.env.JWT_AUDIENCE ??= 'govprojects-api';

// ---------------------------------------------------------------------------
// Mock `jose` so integration tests don't require a running Keycloak for auth.
// The auth layer is already verified end-to-end (Session 3). Integration tests
// focus on DB + business logic, not JWT crypto. Same mock as unit tests.
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
      if (payload.__reject) throw new Error('Rejected by test');
      return { payload, protectedHeader: { alg: 'RS256' } };
    } catch {
      throw new Error('Token decode failed');
    }
  },
}));
