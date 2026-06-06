/** @type {import('jest').Config} */
module.exports = {
  testEnvironment:        'node',
  rootDir:                '.',
  roots:                  ['<rootDir>/tests'],
  testMatch:              ['**/*.test.js'],
  testTimeout:            10000,
  testPathIgnorePatterns: ['<rootDir>/LLM-Mobile/'],
};
