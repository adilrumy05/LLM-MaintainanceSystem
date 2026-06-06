const request = require('supertest');

// Mock all external dependencies before requiring the app
jest.mock('../../server/config/firebaseAdmin', () => ({ db: null }));
jest.mock('../../server/services/auditLogger',  () => ({ logAuditRecord: jest.fn() }));
jest.mock('../../server/agents/priorityAdjustmentAgent', () => ({
  runPriorityAdjustmentAgent: jest.fn().mockResolvedValue(null),
}));

global.fetch = jest.fn();

const app = require('../../server');

describe('GET /api/health', () => {
  test('returns 200 with status ok', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: 'ok' });
  });
});
