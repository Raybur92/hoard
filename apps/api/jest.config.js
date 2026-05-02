/** @type {import('jest').Config} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: ['<rootDir>/src/**/*.test.ts'],
  moduleNameMapper: {
    '^@hoard/types$': '<rootDir>/../../packages/types/src/index.ts',
  },
  clearMocks: true,
};
