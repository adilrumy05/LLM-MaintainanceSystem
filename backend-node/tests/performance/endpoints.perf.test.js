const request = require('supertest');

let mockDb = null;
jest.mock('../../server/config/firebaseAdmin', () => ({
  get db() { return mockDb; },
}));
jest.mock('../../server/services/auditLogger', () => ({ logAuditRecord: jest.fn() }));
jest.mock('../../server/agents/priorityAdjustmentAgent', () => ({
  runPriorityAdjustmentAgent: jest.fn().mockResolvedValue(null),
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFile: jest.fn((path, data, enc, cb) => cb && cb(null)),
}));

global.fetch = jest.fn();
const app = require('../../server');

function mockSuccessfulPipeline(answerText = 'Step 1: Turn off power. Step 2: Clean the filter.') {
  global.fetch.mockImplementation((url) => {
    if (url.includes('/filters')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          document_group_ids: ['panasonic_aircon_E7JKEW'],
          filenames:          ['CS-E7JKEW_SM.pdf'],
          classifications:    ['MANUAL'],
          category_level_1:   ['Maintenance'],
          category_level_2:   ['Wiring'],
          model_numbers:      ['E7JKEW'],
        }),
      });
    }
    if (url.includes('/retrieve')) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({
          prompt:         'Retrieved context prompt',
          context_blocks: [{ text: 'context chunk', chunk_type: 'text', page: 1 }],
          sources:        [{ filename: 'CS-E7JKEW_SM.pdf', page: 1 }],
        }),
      });
    }
    if (url.includes('openai.com')) {
      return Promise.resolve({
        ok:     true,
        status: 200,
        json: () => Promise.resolve({
          choices: [{ message: { content: answerText } }],
        }),
      });
    }
  });
}

async function timedRequest(fn) {
  const start = process.hrtime.bigint();
  const res   = await fn();
  const end   = process.hrtime.bigint();
  return { res, ms: Number(end - start) / 1e6 };
}

async function runIterations(fn, iterations) {
  const times = [];
  for (let i = 0; i < iterations; i++) {
    const { ms } = await timedRequest(fn);
    times.push(ms);
  }
  const avg = times.reduce((a, b) => a + b, 0) / times.length;
  const min = Math.min(...times);
  const max = Math.max(...times);
  const sorted = [...times].sort((a, b) => a - b);
  const p95 = sorted[Math.floor(sorted.length * 0.95)];
  console.log(`\n  Iterations : ${iterations}`);
  console.log(`  Avg        : ${avg.toFixed(2)} ms`);
  console.log(`  Min        : ${min.toFixed(2)} ms`);
  console.log(`  Max        : ${max.toFixed(2)} ms`);
  console.log(`  p95        : ${p95.toFixed(2)} ms`);
  return { avg, min, max, p95 };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.OPENAI_API_KEY = 'test-key';
});

describe('Endpoint Performance Benchmarks', () => {

  describe('GET /api/health', () => {
    test('100 requests — avg under 50ms', async () => {
      console.log('\n  [GET /api/health — 100 requests]');
      const result = await runIterations(
        () => request(app).get('/api/health'),
        100
      );
      expect(result.avg).toBeLessThan(50);
    });
  });

  describe('POST /api/query', () => {
    test('50 requests with mocked pipeline — avg under 200ms', async () => {
      mockSuccessfulPipeline();
      console.log('\n  [POST /api/query — 50 requests, mocked pipeline]');
      const result = await runIterations(
        () => request(app)
          .post('/api/query')
          .send({ query: 'How do I service the compressor?', role: 'beginner', topK: 5 }),
        50
      );
      expect(result.avg).toBeLessThan(200);
    });

    test('20 requests blocked by sanitize — avg under 50ms', async () => {
      console.log('\n  [POST /api/query — 20 requests, blocked by sanitize]');
      const result = await runIterations(
        () => request(app)
          .post('/api/query')
          .send({ query: '<script>alert(1)</script>' }),
        20
      );
      expect(result.avg).toBeLessThan(50);
    });

    test('20 requests blocked by validate — avg under 50ms', async () => {
      console.log('\n  [POST /api/query — 20 requests, blocked by validate]');
      const result = await runIterations(
        () => request(app)
          .post('/api/query')
          .send({ query: '' }),
        20
      );
      expect(result.avg).toBeLessThan(50);
    });
  });

  describe('POST /api/approve', () => {
    test('50 requests — avg under 100ms', async () => {
      const mockUpdate = jest.fn().mockResolvedValue({});
      mockDb = { collection: () => ({ doc: () => ({ update: mockUpdate }) }) };

      console.log('\n  [POST /api/approve — 50 requests]');
      const result = await runIterations(
        () => request(app)
          .post('/api/approve')
          .send({ sessionId: 'sess-perf-001', reviewedBy: 'admin@test.com' }),
        50
      );
      expect(result.avg).toBeLessThan(100);
    });
  });

  describe('POST /api/reject', () => {
    test('50 requests — avg under 100ms', async () => {
      const mockUpdate = jest.fn().mockResolvedValue({});
      mockDb = { collection: () => ({ doc: () => ({ update: mockUpdate }) }) };

      console.log('\n  [POST /api/reject — 50 requests]');
      const result = await runIterations(
        () => request(app)
          .post('/api/reject')
          .send({ sessionId: 'sess-perf-002', reason: 'Test rejection' }),
        50
      );
      expect(result.avg).toBeLessThan(100);
    });
  });

  describe('Concurrent requests', () => {
    test('10 simultaneous /api/health requests complete under 500ms total', async () => {
      console.log('\n  [Concurrency — 10 simultaneous GET /api/health]');
      const start = process.hrtime.bigint();
      const results = await Promise.all(
        Array.from({ length: 10 }, () => request(app).get('/api/health'))
      );
      const totalMs = Number(process.hrtime.bigint() - start) / 1e6;
      console.log(`  Total wall time: ${totalMs.toFixed(2)} ms`);
      console.log(`  All 200s: ${results.every(r => r.status === 200)}`);
      expect(results.every(r => r.status === 200)).toBe(true);
      expect(totalMs).toBeLessThan(500);
    });

    test('10 simultaneous /api/query requests all return valid responses', async () => {
      mockSuccessfulPipeline();
      console.log('\n  [Concurrency — 10 simultaneous POST /api/query]');
      const start = process.hrtime.bigint();
      const results = await Promise.all(
        Array.from({ length: 10 }, (_, i) =>
          request(app)
            .post('/api/query')
            .send({ query: `How do I service unit ${i}?`, role: 'beginner', topK: 3 })
        )
      );
      const totalMs = Number(process.hrtime.bigint() - start) / 1e6;
      console.log(`  Total wall time: ${totalMs.toFixed(2)} ms`);
      console.log(`  All 200s: ${results.every(r => r.status === 200)}`);
      expect(results.every(r => r.status === 200)).toBe(true);
    });
  });

});
