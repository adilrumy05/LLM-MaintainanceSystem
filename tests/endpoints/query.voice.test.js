// /api/query for hands-free mode (voice: true) and for chats that already have
// a confirmed machine. OpenAI calls are told apart by the schema they declare,
// never by call order: extraction, spoken answer and the answer itself.

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
const { SPOKEN_SCHEMA_NAME } = require('../../server/services/spokenAnswer');

const EXTRACTION_SCHEMA_NAME = 'equipment_photo_reading';
const STEP_SCHEMA_NAME = 'step_extraction';   // guided response, runs on every answer
const NO_STEPS = JSON.stringify({ is_procedural: false, steps: [] });
const MODELS = ['CS-S10TKH', 'CS-S13TKH', 'RAS-30-BKVS-A'];

const ANSWER = 'WARNING: Switch off the power supply. Remove the filter and let it dry for 30 minutes. (p.75)';
const GOOD_SPOKEN = { spokenText: 'Warning: switch off the power supply. Remove the filter and let it dry for 30 minutes.', complete: true };

function mockPipeline({
  spoken = GOOD_SPOKEN,
  vision = { legible: true, confidence: 0.95, modelNumber: 'CS-S10TKH', serialNumber: null, faultCode: null, visibleText: null, observation: null },
  blocks = [{ text: 'ctx', chunk_type: 'text', page: 75 }],
} = {}) {
  const calls = { retrieve: [], extraction: [], spoken: [], answer: [], steps: [] };

  global.fetch.mockImplementation((url, opts) => {
    if (url.includes('/filters')) {
      return Promise.resolve({ ok: true, json: async () => ({
        document_group_ids: [], filenames: [], classifications: [],
        category_level_1: [], category_level_2: [], model_numbers: MODELS,
      })});
    }
    if (url.includes('/retrieve')) {
      calls.retrieve.push(JSON.parse(opts.body));
      return Promise.resolve({ ok: true, json: async () => ({
        prompt: 'PROMPT', context_blocks: blocks,
        sources: blocks.map((b) => ({ filename: 'manual.pdf', page: b.page })),
      })});
    }
    if (url.includes('openai.com')) {
      const sent = JSON.parse(opts.body);
      const schema = sent.response_format?.json_schema?.name;
      let content;
      if (schema === EXTRACTION_SCHEMA_NAME) { calls.extraction.push(sent); content = JSON.stringify(vision); }
      else if (schema === SPOKEN_SCHEMA_NAME) { calls.spoken.push(sent); content = JSON.stringify(spoken); }
      else if (schema === STEP_SCHEMA_NAME) { calls.steps.push(sent); content = NO_STEPS; }
      else { calls.answer.push(sent); content = ANSWER; }
      return Promise.resolve({ ok: true, status: 200, json: async () => ({
        choices: [{ finish_reason: 'stop', message: { content } }],
      })});
    }
    return Promise.resolve({ ok: true, json: async () => ({}) });
  });

  return calls;
}

const post = (body) => request(app).post('/api/query').send({
  query: 'how do I clean the filter?', role: 'beginner',
  userId: 'u1', userEmail: 'u@example.com', sessionId: 's1', ...body,
});

beforeEach(() => {
  jest.clearAllMocks();
  process.env.OPENAI_API_KEY = 'test-key';
});

const decode = (s) => s.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');

describe('hands-free — spoken answers', () => {
  test('voice:true returns a validated spokenText alongside the untouched full text', async () => {
    const calls = mockPipeline();
    const res = await post({ voice: true });

    expect(res.status).toBe(200);
    expect(decode(res.body.text)).toBe(ANSWER);
    expect(res.body.spokenText).toBe(GOOD_SPOKEN.spokenText);
    expect(res.body.spokenUnavailable).toBeNull();
    expect(calls.spoken).toHaveLength(1);
    // The spoken form is derived from the finished answer, not a second answer.
    expect(calls.spoken[0].messages[1].content).toBe(ANSWER);
  });

  test('a spoken form that drops the warning is withheld, and the full text still returns', async () => {
    mockPipeline({ spoken: { spokenText: 'Remove the filter and dry it for 30 minutes.', complete: true } });
    const res = await post({ voice: true });

    expect(res.status).toBe(200);
    expect(res.body.spokenText).toBeNull();
    expect(res.body.spokenUnavailable).toMatch(/^missing_safety/);
    expect(decode(res.body.text)).toBe(ANSWER);
  });

  test('without voice there is no spoken call and no spoken fields', async () => {
    const calls = mockPipeline();
    const res = await post({});

    expect(calls.spoken).toHaveLength(0);
    expect(calls.answer).toHaveLength(1);
    expect(res.body).not.toHaveProperty('spokenText');
  });

  test('voice must be a boolean', async () => {
    mockPipeline();
    const res = await post({ voice: 'yes' });
    expect(res.status).toBe(400);
  });
});

describe('confirmed model — carried into typed follow-ups', () => {
  test('a successful photo answer reports the model it identified', async () => {
    mockPipeline();
    const res = await post({ imageBase64: 'A'.repeat(2000) });
    expect(res.body.identifiedModel).toBe('CS-S10TKH');
  });

  test('a typed follow-up is scoped to the confirmed model', async () => {
    const calls = mockPipeline();
    await post({ confirmedModel: 'CS-S13TKH' });
    expect(calls.retrieve[0].model_number).toBe('CS-S13TKH');
  });

  test('a model typed in the question wins over the confirmed one', async () => {
    const calls = mockPipeline();
    await post({ query: 'filter on the RAS-30-BKVS-A?', confirmedModel: 'CS-S13TKH' });
    expect(calls.retrieve[0].model_number).toBe('RAS-30-BKVS-A');
  });

  test('a confirmed model not in the catalogue is ignored, not trusted', async () => {
    const calls = mockPipeline();
    await post({ confirmedModel: 'MADE-UP-1' });
    expect(calls.retrieve[0].model_number).toBeNull();
  });

  test('nothing retrieved under a confirmed model stops instead of answering unsupported', async () => {
    const calls = mockPipeline({ blocks: [] });
    const res = await post({ confirmedModel: 'CS-S13TKH' });

    expect(res.body.needsInput).toBe('no_context');
    expect(res.body.readModel).toBe('CS-S13TKH');
    expect(calls.answer).toHaveLength(0);
  });
});
