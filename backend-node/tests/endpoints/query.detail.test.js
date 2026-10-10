// /api/query with a response detail (Brief / Standard / Detailed).
//
// Brief and Detailed are written that way by the answer model, so these assert
// on what is sent to /retrieve and to OpenAI, and on what happens when a Brief
// answer fails its figure check.

const request = require('supertest');

jest.mock('../../server/config/firebaseAdmin', () => ({ db: null }));
jest.mock('../../server/services/auditLogger', () => ({ logAuditRecord: jest.fn() }));
jest.mock('../../server/agents/priorityAdjustmentAgent', () => ({
  runPriorityAdjustmentAgent: jest.fn().mockResolvedValue(null),
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFile: jest.fn((p, d, e, cb) => cb && cb(null)),
}));

global.fetch = jest.fn();
const app = require('../../server');
const { logAuditRecord } = require('../../server/services/auditLogger');

const CONTEXT  = 'Switch off the power supply before cleaning. Wash the filters with water below 40 °C.';
const STANDARD = 'Switch off the power supply before cleaning, then wash the filters with water below 40 °C. This keeps the unit efficient (manual.pdf, p.33).';
const BRIEF    = 'Switch off the power first. Wash filters below 40 °C (manual.pdf, p.33).';
const NO_STEPS = JSON.stringify({ is_procedural: false, steps: [] });

const isBrief = (sent) => sent.messages[0].content.includes('Brief response:');

function mockPipeline({ brief = BRIEF, briefFinish = 'stop' } = {}) {
  const calls = { retrieve: [], answer: [], steps: [], spoken: [] };
  global.fetch.mockImplementation((url, opts) => {
    if (url.includes('/filters')) {
      return Promise.resolve({ ok: true, json: async () => ({ model_numbers: ['CS-S10TKH'], document_group_ids: [] }) });
    }
    const sent = JSON.parse(opts.body);
    if (url.includes('/retrieve')) {
      calls.retrieve.push(sent);
      return Promise.resolve({ ok: true, json: async () => ({
        prompt: `CONTEXT: ${CONTEXT}`,
        context_blocks: [{ text: CONTEXT, chunk_type: 'text', page: 33 }],
        sources: [{ filename: 'manual.pdf', page: 33 }],
      })});
    }
    const schema = sent.response_format?.json_schema?.name;
    let content = NO_STEPS;
    let finish_reason = 'stop';
    if (schema === 'step_extraction') calls.steps.push(sent);
    else if (schema === 'spoken_answer') { calls.spoken.push(sent); content = JSON.stringify({ spokenText: '', complete: false }); }
    else if (schema === 'answer_or_followup') {
      // The answer call returns JSON: the answer, or a request for another search.
      calls.answer.push(sent);
      content = JSON.stringify({ sufficient: true, answer: isBrief(sent) ? brief : STANDARD, follow_up_query: '' });
      if (isBrief(sent)) finish_reason = briefFinish;
    }
    else throw new Error(`Unexpected call: ${schema || 'no schema'}`);
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason, message: { content } }] }) });
  });
  return calls;
}

const post = (body = {}) => request(app).post('/api/query').send({
  query: 'How do I clean the filter?', role: 'beginner',
  userId: 'u1', userEmail: 'u@example.com', sessionId: 's1', ...body,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.OPENAI_API_KEY = 'test-key';
  delete process.env.EFFORT_LEVELS_ENABLED;
});
afterEach(() => { delete process.env.EFFORT_LEVELS_ENABLED; });

describe('Standard is unchanged', () => {
  test('REGRESSION: no detail and Standard send identical requests', async () => {
    const before = mockPipeline();
    const a = await post();
    const after = mockPipeline();
    const b = await post({ detail: 'standard' });

    expect(a.status).toBe(200);
    expect(after.retrieve).toEqual(before.retrieve);
    expect(after.answer).toEqual(before.answer);
    expect(before.answer).toHaveLength(1);
    expect(before.answer[0].messages[0].content).not.toMatch(/Brief response|Detailed response/);
    expect(before.retrieve[0].top_k).toBe(5);
    expect(b.body).toMatchObject({ text: STANDARD, responseDetail: 'standard' });
    expect(b.body.detailFallback).toBeUndefined();
  });
});


describe('Brief', () => {
  test('is written alongside the Standard answer, which becomes the Full view', async () => {
    const calls = mockPipeline();
    const res = await post({ detail: 'brief' });

    expect(res.status).toBe(200);
    expect(calls.answer).toHaveLength(2);
    expect(calls.answer.filter(isBrief)).toHaveLength(1);
    expect(res.body).toMatchObject({ text: BRIEF, fullText: STANDARD, responseDetail: 'brief' });
    expect(res.body.detailFallback).toBeUndefined();
    expect(res.body.sources).toEqual([expect.objectContaining({ filename: 'manual.pdf', page: 33 })]);
    expect(calls.retrieve[0].top_k).toBe(5);
  });

  test('keeps the role prompt and adds the safety-preserving rules', async () => {
    const calls = mockPipeline();
    await post({ detail: 'brief', role: 'admin' });
    const system = calls.answer.find(isBrief).messages[0].content;
    expect(system).toContain('Approval and Oversight Helper');
    expect(system).toMatch(/keep every step, order, prerequisite, warning, prohibition/);
  });

  test('the audit record is the Brief answer shown', async () => {
    mockPipeline();
    await post({ detail: 'brief' });
    expect(logAuditRecord.mock.calls[0][1]).toBe(BRIEF);
  });

  // The Brief answer is written while the guided steps are extracted from the
  // full answer, so a Brief request takes about as long as a Standard one.
  test('a Brief answer keeps guided steps, taken from the full answer', async () => {
    const calls = mockPipeline();
    await post({ detail: 'brief' });
    expect(calls.steps).toHaveLength(1);
    expect(calls.steps[0].messages.at(-1).content).toContain(STANDARD);
  });

  test('a Brief request that falls back to Standard still gets guided steps, from the Standard answer', async () => {
    const calls = mockPipeline({ brief: 'Wash filters below 40 °C (manual.pdf, p.33).' });
    await post({ detail: 'brief' });
    expect(calls.steps).toHaveLength(1);
    expect(calls.steps[0].messages.at(-1).content).toContain(STANDARD);
  });

  test.each([
    ['a changed figure', { brief: 'Switch off the power. Wash filters below 60 °C.' }, 'unverified_figures'],
    ['an invented fault code', { brief: 'This is fault H19. Switch off the power. Wash below 40 °C.' }, 'unverified_figures'],
    ['a truncated answer', { briefFinish: 'length' }, 'incomplete'],
    ['an empty answer', { brief: '   ' }, 'incomplete'],
    // Found live: Brief dropped a warning that Standard gave.
    ['a dropped power-off warning', { brief: 'Wash filters below 40 °C (manual.pdf, p.33).' }, 'missing_safety_detail'],
    ['a dropped measurement', { brief: 'Switch off the power first, then wash the filters.' }, 'missing_safety_detail'],
  ])('with %s shows the Standard answer instead, at no extra call', async (_label, options, reason) => {
    const calls = mockPipeline(options);
    const res = await post({ detail: 'brief' });

    expect(res.status).toBe(200);
    expect(calls.answer).toHaveLength(2);
    expect(res.body).toMatchObject({ text: STANDARD, responseDetail: 'standard', detailFallback: reason });
    expect(res.body.fullText).toBeUndefined();
    expect(logAuditRecord.mock.calls[0][1]).toBe(STANDARD);
    expect(logAuditRecord).toHaveBeenCalledTimes(1);
  });

  test('a figure from the quoted passage counts as known', async () => {
    mockPipeline({ brief: 'The 12 V figure is not in the manual. Switch off the power. Wash filters below 40 °C.' });
    const res = await post({ detail: 'brief', quote: { text: 'Use the 12 V supply.' } });
    expect(res.body.responseDetail).toBe('brief');
  });
});

describe('Detailed', () => {
  test('searches more passages and asks only for supported detail', async () => {
    const calls = mockPipeline();
    const res = await post({ detail: 'detailed', confirmedModel: 'CS-S10TKH' });

    expect(calls.retrieve[0].top_k).toBe(8);
    expect(calls.retrieve[0].model_number).toBe('CS-S10TKH');
    expect(calls.answer).toHaveLength(1);
    expect(calls.answer[0].messages[0].content).toMatch(/Detailed response/);
    expect(calls.answer[0].messages[0].content).toMatch(/Explain only what the manual extracts support/);
    expect(res.body.responseDetail).toBe('detailed');
  });

  test('never lowers a larger requested search size', async () => {
    const calls = mockPipeline();
    await post({ detail: 'detailed', topK: 10 });
    expect(calls.retrieve[0].top_k).toBe(10);
  });
});

describe('where detail does not apply', () => {
  test.each(['brief', 'detailed'])('hands-free ignores %s', async (detail) => {
    const calls = mockPipeline();
    const res = await post({ detail, voice: true });
    expect(calls.retrieve[0].top_k).toBe(5);
    expect(calls.answer).toHaveLength(1);
    expect(calls.answer[0].messages[0].content).not.toMatch(/Brief response|Detailed response/);
    expect(calls.spoken).toHaveLength(1);
    expect(res.body.responseDetail).toBe('standard');
  });

  test('EFFORT_LEVELS_ENABLED=false answers everything in Standard', async () => {
    process.env.EFFORT_LEVELS_ENABLED = 'false';
    const calls = mockPipeline();
    const res = await post({ detail: 'brief' });
    expect(calls.answer).toHaveLength(1);
    expect(res.body).toMatchObject({ text: STANDARD, responseDetail: 'standard' });
    expect(res.body.detailFallback).toBeUndefined();
  });

  test.each([
    { detail: 'fast' }, { detail: null }, { detail: 4 },
    { topK: 50 }, { topK: 1.5 }, { topK: 0 },
  ])('rejects %p before any paid call', async (body) => {
    mockPipeline();
    expect((await post(body)).status).toBe(400);
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
