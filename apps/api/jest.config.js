/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src', '<rootDir>/test'],
  testMatch: ['**/*.test.ts'],
  testPathIgnorePatterns: ['\\.integration\\.test\\.ts$'],
  setupFiles: ['<rootDir>/test/setup.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  // Strip the explicit `.js` suffix used in TS source so Jest resolves `.ts` files.
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
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts'],
  coverageDirectory: 'coverage',
};
