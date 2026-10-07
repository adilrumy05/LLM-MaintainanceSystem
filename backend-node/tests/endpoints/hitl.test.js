const request = require('supertest');

// Control db mock value per test
let mockDb = null;

jest.mock('../../server/config/firebaseAdmin', () => ({
  get db() { return mockDb; },
}));
jest.mock('../../server/services/auditLogger', () => ({ logAuditRecord: jest.fn() }));
jest.mock('../../server/agents/priorityAdjustmentAgent', () => ({
  runPriorityAdjustmentAgent: jest.fn().mockResolvedValue(null),
}));

global.fetch = jest.fn();

const app = require('../../server');

// ── /api/approve ────────────────────────────────────────────────────────────

describe('POST /api/approve', () => {
  test('returns 400 when sessionId is missing', async () => {
    const res = await request(app).post('/api/approve').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sessionId required/i);
  });

  test('returns 503 when Firebase Admin is not configured', async () => {
    mockDb = null;
    const res = await request(app)
      .post('/api/approve')
      .send({ sessionId: 'sess-001' });
    expect(res.status).toBe(503);
    expect(res.body.error).toMatch(/firebase admin not configured/i);
  });

  test('returns 200 and approved status when db is available', async () => {
    const mockUpdate = jest.fn().mockResolvedValue({});
    mockDb = {
      collection: () => ({ doc: () => ({ update: mockUpdate }) }),
    };

    const res = await request(app)
      .post('/api/approve')
      .send({ sessionId: 'sess-001', reviewedBy: 'admin@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('approved');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'approved', reviewed_by: 'admin@test.com' })
    );
  });

  test('sets reviewed_by to "admin" when not provided', async () => {
    const mockUpdate = jest.fn().mockResolvedValue({});
    mockDb = {
      collection: () => ({ doc: () => ({ update: mockUpdate }) }),
    };

    await request(app).post('/api/approve').send({ sessionId: 'sess-002' });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ reviewed_by: 'admin' })
    );
  });

  test('returns 500 when Firestore update throws', async () => {
    mockDb = {
      collection: () => ({
        doc: () => ({ update: jest.fn().mockRejectedValue(new Error('Firestore error')) }),
      }),
    };

    const res = await request(app)
      .post('/api/approve')
      .send({ sessionId: 'sess-003' });

    expect(res.status).toBe(500);
    expect(res.body.error).toBe('Firestore error');
  });
});

// ── /api/reject ─────────────────────────────────────────────────────────────

describe('POST /api/reject', () => {
  test('returns 400 when sessionId is missing', async () => {
    const res = await request(app).post('/api/reject').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/sessionId required/i);
  });

  test('returns 503 when Firebase Admin is not configured', async () => {
    mockDb = null;
    const res = await request(app)
      .post('/api/reject')
      .send({ sessionId: 'sess-001' });
    expect(res.status).toBe(503);
  });

  test('returns 200 and rejected status when db is available', async () => {
    const mockUpdate = jest.fn().mockResolvedValue({});
    mockDb = {
      collection: () => ({ doc: () => ({ update: mockUpdate }) }),
    };

    const res = await request(app)
      .post('/api/reject')
      .send({ sessionId: 'sess-004', reviewedBy: 'admin@test.com' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('rejected');
    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'rejected' })
    );
  });

  test('includes rejection_reason in Firestore update when provided', async () => {
    const mockUpdate = jest.fn().mockResolvedValue({});
    mockDb = {
      collection: () => ({ doc: () => ({ update: mockUpdate }) }),
    };

    await request(app)
      .post('/api/reject')
      .send({ sessionId: 'sess-005', reason: 'Procedure not followed correctly' });

    expect(mockUpdate).toHaveBeenCalledWith(
      expect.objectContaining({ rejection_reason: 'Procedure not followed correctly' })
    );
  });

  test('does not include rejection_reason when reason not provided', async () => {
    const mockUpdate = jest.fn().mockResolvedValue({});
    mockDb = {
      collection: () => ({ doc: () => ({ update: mockUpdate }) }),
    };

    await request(app).post('/api/reject').send({ sessionId: 'sess-006' });

    const callArg = mockUpdate.mock.calls[0][0];
    expect(callArg).not.toHaveProperty('rejection_reason');
  });
});
