const validate = require('../../server/middleware/validate');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json   = jest.fn().mockReturnValue(res);
  return res;
}

describe('validate middleware', () => {
  let next;

  beforeEach(() => {
    next = jest.fn();
  });

  test('calls next() for a valid query', () => {
    const req = { body: { query: 'How do I service the compressor?' } };
    validate(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });

  test('rejects missing query', () => {
    const req = { body: {} };
    const res = mockRes();
    validate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('Query is required') })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects empty string query', () => {
    const req = { body: { query: '   ' } };
    const res = mockRes();
    validate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects non-string query', () => {
    const req = { body: { query: 123 } };
    const res = mockRes();
    validate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(next).not.toHaveBeenCalled();
  });

  test('rejects non-string userId', () => {
    const req = { body: { query: 'valid', userId: 99 } };
    const res = mockRes();
    validate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('userId') })
    );
  });

  test('rejects non-string userEmail', () => {
    const req = { body: { query: 'valid', userEmail: true } };
    const res = mockRes();
    validate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('rejects non-positive topK', () => {
    const req = { body: { query: 'valid', topK: -1 } };
    const res = mockRes();
    validate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ error: expect.stringContaining('topK') })
    );
  });

  test('rejects topK of zero', () => {
    const req = { body: { query: 'valid', topK: 0 } };
    const res = mockRes();
    validate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('accepts valid optional fields', () => {
    const req = {
      body: {
        query:      'valid query',
        userId:     'user-123',
        userEmail:  'user@example.com',
        sessionId:  'sess-abc',
        docGroup:   'panasonic_aircon',
        topK:       5,
      },
    };
    validate(req, mockRes(), next);
    expect(next).toHaveBeenCalled();
  });
});
