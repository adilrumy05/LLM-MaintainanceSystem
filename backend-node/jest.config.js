// ============================================
//  Jest Configuration — Maintenance Copilot
//  GRP6-15 End-to-End Test Suite
// ============================================
//
//  This configuration file does four things:
//
//  1. Scopes all test discovery to the /tests folder only,
//     preventing Jest from picking up stray test files inside
//     node_modules, the LLM-Mobile Expo app, or the RAG pipeline.
//
//  2. Enforces a 10 second timeout per test so that any test
//     hanging on a mock that never resolves fails cleanly
//     rather than blocking the entire suite indefinitely.
//
//  3. Sets minimum coverage thresholds so the suite fails
//     if test coverage drops below acceptable levels,
//     catching gaps introduced by future code changes.
//
//  4. Outputs coverage as both a terminal summary and a full
//     HTML report you can open in a browser for line-by-line detail.
//
// ── Test Suite Summary ───────────────────────────────────────────
//
//  Layer 1 — Unit tests (tests/middleware/)
//    sanitize.test.js        10 tests  input sanitisation middleware
//    validate.test.js         9 tests  schema validation middleware
//    outputSanitize.test.js  10 tests  output HTML encoding middleware
//
//  Layer 2 — Integration tests (tests/endpoints/)
//    health.test.js           1 test   GET /api/health
//    hitl.test.js            11 tests  POST /api/approve, POST /api/reject
//    query.test.js            9 tests  POST /api/query full RAG pipeline
//
//  Total: 50 tests across 6 suites — all passing
//
// ── How to run ───────────────────────────────────────────────────
//
//  All tests:            npm test
//  Coverage report:      npm run test:coverage
//  Watch mode:           npm run test:watch
//  Single file:          npx jest tests/endpoints/query.test.js
//  Verbose output:       npm test -- --verbose
//
// ── External dependencies ────────────────────────────────────────
//
//  Firebase, OpenAI, and the FastAPI retrieval service are all
//  mocked using Jest module mocks. The suite runs fully offline
//  with no credentials required. See TEST_DOCUMENTATION.md
//  for full design decisions and mock architecture details.
//
// ============================================

/** @type {import('jest').Config} */
const config = {

  // ── Test discovery ─────────────────────────────────────────────
  // Only run files inside the /tests folder
  testMatch: [
    "**/tests/**/*.test.js"
  ],

  // Never look inside these folders even if they contain test files
  testPathIgnorePatterns: [
    "/node_modules/",
    "/LLM-Mobile/",
    "/server/rag/"
  ],

  // ── Environment ────────────────────────────────────────────────
  // Node environment — correct for an Express backend test suite
  testEnvironment: "node",

  // Print every individual test name to the terminal while running
  verbose: true,

  // ── Timeout ────────────────────────────────────────────────────
  // Fail any test that takes longer than 10 seconds
  // Prevents a hanging mock from blocking the full suite
  testTimeout: 10000,

  // ── Coverage ───────────────────────────────────────────────────
  // Which files to measure coverage against
  collectCoverageFrom: [
    "server/**/*.js",
    "!server/config/**",
    "!server/rag/**",
    "!**/node_modules/**"
  ],

  // Minimum acceptable coverage — suite fails if these drop below threshold
  // Ensures future changes do not silently remove test coverage
  coverageThreshold: {
    global: {
      lines:      60,
      functions:  60,
      branches:   50,
      statements: 60
    }
  },

  // Output formats — terminal summary + HTML file for browser inspection
  // After running npm run test:coverage open:
  // coverage/lcov-report/index.html
  coverageReporters: [
    "text",
    "lcov",
    "html"
  ]

};

module.exports = config;