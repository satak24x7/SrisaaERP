/**
 * Runs ONCE after all integration test suites complete.
 * Disconnects the Prisma client.
 */
export default async function globalTeardown(): Promise<void> {
  // Nothing to do here — per-suite afterAll handles disconnection.
  // eslint-disable-next-line no-console
  console.log('[integration] All suites complete');
}
