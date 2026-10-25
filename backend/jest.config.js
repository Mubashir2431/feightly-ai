module.exports = {
  testEnvironment: 'node',
  // Source dirs are listed (not just test/) so coverage also reports files that have no tests yet.
  roots: ['<rootDir>/test', '<rootDir>/lambda', '<rootDir>/lib'],
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  modulePathIgnorePatterns: ['<rootDir>/cdk.out', '<rootDir>/lambda/node_modules'],
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { diagnostics: { ignoreCodes: [151002] } }],
  },
  // uuid v13 ships ESM only; Jest runs CommonJS, so map it to a tiny crypto-based shim.
  // (Deployed Lambdas use the uuid version pinned in lambda/package.json.)
  moduleNameMapper: {
    '^uuid$': '<rootDir>/test/helpers/uuid-shim.ts',
  },
  setupFilesAfterEnv: ['aws-cdk-lib/testhelpers/jest-autoclean'],
  collectCoverageFrom: [
    'lambda/**/*.ts',
    'lib/**/*.ts',
    '!lambda/node_modules/**',
    '!**/*.d.ts',
  ],
  coverageReporters: ['text', 'text-summary', 'lcov'],
  // CI fails if coverage of the core search / booking / LLM-parsing logic drops.
  coverageThreshold: {
    './lambda/corridor-search.ts': { lines: 90, branches: 85, functions: 90 },
    './lambda/book-load.ts': { lines: 90, branches: 85, functions: 90 },
    './lambda/copilot.ts': { lines: 90, branches: 85, functions: 90 },
  },
};
