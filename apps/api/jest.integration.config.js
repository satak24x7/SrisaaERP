/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testMatch: ['**/*.integration.test.ts'],
  setupFiles: ['<rootDir>/test/setup.integration.ts'],
  globalSetup: '<rootDir>/test/global-setup.integration.ts',
  globalTeardown: '<rootDir>/test/global-teardown.integration.ts',
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
        useESM: false,
      },
    ],
  },
  clearMocks: true,
  // Integration tests are slower; give 30s per test
  testTimeout: 30_000,
};
