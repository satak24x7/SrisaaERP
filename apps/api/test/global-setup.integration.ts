/**
 * Runs ONCE before all integration test suites.
 * Ensures the test database schema is up to date via `prisma db push`.
 */
import { execSync } from 'child_process';
import path from 'path';

const TEST_DB_URL = 'mysql://govprojects:govprojects@localhost:3307/govprojects_test';

export default async function globalSetup(): Promise<void> {
  const schemaPath = path.resolve(__dirname, '../../../prisma/schema.prisma');

  // Push schema to test DB (fast — no migration history needed for tests)
  execSync(
    `npx prisma db push --schema="${schemaPath}" --accept-data-loss --skip-generate`,
    {
      env: {
        ...process.env,
        DATABASE_URL: TEST_DB_URL,
        PRISMA_CLI_QUERY_ENGINE_TYPE: 'binary',
        PRISMA_CLIENT_ENGINE_TYPE: 'binary',
      },
      stdio: 'pipe',
    },
  );

  // eslint-disable-next-line no-console
  console.log('[integration] Schema pushed to govprojects_test');
}
