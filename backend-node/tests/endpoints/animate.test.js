// POST /api/animate, and the reference /api/query hands out for it.
//
// The pipeline itself (facts, scene, checks) is covered in
// tests/unit/animationChecks.test.js. These tests are about who may ask, how
// often, at what cost, and that the route has no side effects.

const request = require('supertest');

jest.mock('../../server/config/firebaseAdmin', () => ({ db: {} }));
jest.mock('firebase-admin/auth', () => ({
  getAuth: () => ({
    verifyIdToken: jest.fn(async (token) => {
      if (!token.startsWith('token-')) throw new Error('bad token');
      return { uid: token.slice(6), email: `${token.slice(6)}@example.com` };
    }),
  }),
}), { virtual: true });
jest.mock('../../server/services/auditLogger', () => ({ logAuditRecord: jest.fn() }));
jest.mock('../../server/agents/priorityAdjustmentAgent', () => ({
  runPriorityAdjustmentAgent: jest.fn().mockResolvedValue(null),
}));
jest.mock('fs', () => ({
  ...jest.requireActual('fs'),
  writeFile: jest.fn((p, d, e, cb) => cb && cb(null)),
}));
jest.mock('../../server/services/animation/pipeline', () => ({
  ...jest.requireActual('../../server/services/animation/pipeline'),
  animate: jest.fn(),
  playable: jest.fn(() => ({ title: 'Clean the filters', steps: [{}], parts: [], facts: [], captions: [[]], missingDetails: [] })),
}));

global.fetch = jest.fn();
const app = require('../../server');
const pipeline = require('../../server/services/animation/pipeline');
const animations = require('../../server/services/animation/service');
const { logAuditRecord } = require('../../server/services/auditLogger');
const { runPriorityAdjustmentAgent } = require('../../server/agents/priorityAdjustmentAgent');

const CONTEXT = 'Switch off the power supply before cleaning. Wash the filters with water below 40 °C.';
const STEPS = JSON.stringify({ is_procedural: true, steps: [
  { title: 'Switch off', description: 'Switch off the power supply.', warning_level: 'caution', tools_required: [] },
  { title: 'Wash', description: 'Wash the filters.', warning_level: 'none', tools_required: [] },
] });
const NO_STEPS = JSON.stringify({ is_procedural: false, steps: [] });

function mockAnswer({ steps = STEPS, groups = ['manual-a'] } = {}) {
  global.fetch.mockImplementation((url, opts) => {
    if (url.includes('/filters')) return Promise.resolve({ ok: true, json: async () => ({ model_numbers: [], document_group_ids: [] }) });
    if (url.includes('/retrieve')) {
      return Promise.resolve({ ok: true, json: async () => ({
        prompt: `CONTEXT: ${CONTEXT}`,
        context_blocks: groups.map((group, index) => ({ chunk_id: `c${index}`, text: `${CONTEXT} (${index})`, chunk_type: 'text', page: 33, document_group_id: group, filename: 'manual.pdf' })),
        sources: [{ filename: 'manual.pdf', page: 33 }],
      }) });
    }
    const schema = JSON.parse(opts.body).response_format?.json_schema?.name;
    const content = schema === 'step_extraction' ? steps
      : schema === 'spoken_answer' ? JSON.stringify({ spokenText: '', complete: false })
      : JSON.stringify({ sufficient: true, answer: 'Switch off the power, then wash the filters below 40 °C (p.33).', follow_up_query: '' });
    return Promise.resolve({ ok: true, status: 200, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content } }] }) });
  });
}

const ask = (body = {}) => request(app).post('/api/query').send({
  query: 'How do I clean the filter?', role: 'beginner', userId: 'u1', userEmail: 'u1@example.com', sessionId: 's1', animate: true, ...body,
});
const animateAs = (uid, animationRef) => request(app).post('/api/animate').set('Authorization', `Bearer token-${uid}`).send({ animationRef });
const refFor = async (body) => (await ask(body)).body.animationRef;

const READY = { status: 'ready', reasons: [], facts: [{}], factsDropped: [], repairs: [], missingDetails: [], ms: 10, costUsd: 0.03 };

beforeEach(() => {
  jest.clearAllMocks();
  animations.reset();
  process.env.OPENAI_API_KEY = 'test-key';
  process.env.ANIMATIONS_ENABLED = 'true';
  delete process.env.ANIMATION_DAILY_USD;
  mockAnswer();
  pipeline.animate.mockResolvedValue(READY);
});
afterAll(() => { delete process.env.ANIMATIONS_ENABLED; });

describe('the reference from /api/query', () => {
  test('a step-by-step answer asked with animate gets a reference, and no animation is made yet', async () => {
    const res = await ask();
    expect(res.body.animationRef).toMatch(/^[0-9a-f]{32}$/);
    expect(pipeline.animate).not.toHaveBeenCalled();
  });

  test.each([
    ['animate is off', { animate: false }],
    ['animate is not sent', { animate: undefined }],
    ['the question is hands-free', { voice: true }],
    ['there is no user', { userId: undefined }],
  ])('none when %s', async (_name, body) => {
    expect((await ask(body)).body.animationRef).toBeUndefined();
  });

  test('none for an answer without guided steps', async () => {
    mockAnswer({ steps: NO_STEPS });
    expect((await ask()).body.animationRef).toBeUndefined();
  });

  test('none while ANIMATIONS_ENABLED is not true', async () => {
    delete process.env.ANIMATIONS_ENABLED;
    expect((await ask()).body.animationRef).toBeUndefined();
  });

  test('animate must be a boolean', async () => {
    expect((await ask({ animate: 'yes' })).status).toBe(400);
  });
});

describe('who may ask', () => {
  test('no token is refused', async () => {
    const ref = await refFor();
    expect((await request(app).post('/api/animate').send({ animationRef: ref })).status).toBe(401);
    expect((await request(app).post('/api/animate').set('Authorization', 'Bearer nonsense').send({ animationRef: ref })).status).toBe(401);
    expect(pipeline.animate).not.toHaveBeenCalled();
  });

  test('another account\'s reference is refused', async () => {
    const ref = await refFor();
    const res = await animateAs('u2', ref);
    expect(res.status).toBe(403);
    expect(pipeline.animate).not.toHaveBeenCalled();
  });

  test('a malformed reference is refused', async () => {
    expect((await animateAs('u1', 'not-a-ref')).status).toBe(400);
    expect((await animateAs('u1', undefined)).status).toBe(400);
  });

  test('a body over 2 KB is refused', async () => {
    const res = await request(app).post('/api/animate').set('Authorization', 'Bearer token-u1')
      .send({ animationRef: 'a'.repeat(32), padding: 'x'.repeat(3000) });
    expect(res.status).toBe(413);
  });

  test('switched off refuses everyone', async () => {
    const ref = await refFor();
    process.env.ANIMATIONS_ENABLED = 'false';
    const res = await animateAs('u1', ref);
    expect(res.status).toBe(503);
    expect(res.body.code).toBe('animations_disabled');
  });
});

describe('what comes back', () => {
  test('a ready animation, drawn from the passages the answer used', async () => {
    const ref = await refFor();
    const res = await animateAs('u1', ref);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'ready', animation: { title: 'Clean the filters' } });
    const [item, blocks, model] = pipeline.animate.mock.calls[0];
    expect(item).toEqual({ question: 'How do I clean the filter?', model: null, group: 'manual-a' });
    expect(blocks.map(block => block.text)).toEqual([`${CONTEXT} (0)`]);
    expect(model).toBe('gpt-6-sol');
  });

  test('passages from more than one manual give no manual scope', async () => {
    mockAnswer({ groups: ['manual-a', 'manual-b'] });
    await animateAs('u1', await refFor());
    expect(pipeline.animate.mock.calls[0][0].group).toBeNull();
  });

  test('an unknown reference says to ask again', async () => {
    const res = await animateAs('u1', 'f'.repeat(32));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'unavailable', reason: 'expired', message: 'Ask again with animations on.' });
  });

  test('a reference older than two hours has expired', async () => {
    const ref = await refFor();
    const now = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(now + animations.REF_TTL_MS + 1000);
    const res = await animateAs('u1', ref);
    Date.now.mockRestore();
    expect(res.body.reason).toBe('expired');
    expect(pipeline.animate).not.toHaveBeenCalled();
  });

  test('not enough in the manual is reported with what is missing', async () => {
    pipeline.animate.mockResolvedValue({ ...READY, status: 'unavailable', reasons: ['no_fact_survived_checking'], missingDetails: ['wire colours'] });
    const res = await animateAs('u1', await refFor());
    expect(res.body).toMatchObject({ status: 'unavailable', reason: 'not_enough_detail', missing: ['wire colours'] });
    expect(res.body.message).toMatch(/does not give enough detail/);
  });

  test('a question with no model is told a model is needed', async () => {
    pipeline.animate.mockResolvedValue({ ...READY, status: 'unavailable', reasons: ['model_needed: a step-by-step animation needs to know which model it is for'] });
    expect((await animateAs('u1', await refFor())).body.reason).toBe('model_needed');
  });
});

describe('cost', () => {
  test('a repeated request reuses the result', async () => {
    const ref = await refFor();
    await animateAs('u1', ref);
    const again = await animateAs('u1', ref);
    expect(again.body.status).toBe('ready');
    expect(pipeline.animate).toHaveBeenCalledTimes(1);
  });

  test('requests made at the same time share one run', async () => {
    const ref = await refFor();
    let finish;
    pipeline.animate.mockReturnValue(new Promise((resolve) => { finish = resolve; }));
    const first = animateAs('u1', ref).then(res => res);
    const second = animateAs('u1', ref).then(res => res);
    await new Promise(resolve => setTimeout(resolve, 100));
    finish(READY);
    const results = await Promise.all([first, second]);
    expect(results.map(res => res.body.status)).toEqual(['ready', 'ready']);
    expect(pipeline.animate).toHaveBeenCalledTimes(1);
  });

  test('a failure is not kept, so Retry runs again', async () => {
    const ref = await refFor();
    pipeline.animate.mockResolvedValueOnce({ ...READY, status: 'failed', reasons: ['facts_call: timeout'] });
    expect((await animateAs('u1', ref)).body.status).toBe('failed');
    expect((await animateAs('u1', ref)).body.status).toBe('ready');
    expect(pipeline.animate).toHaveBeenCalledTimes(2);
  });

  test('a crash in the pipeline is a failure, not a server error', async () => {
    pipeline.animate.mockRejectedValueOnce(new Error('boom'));
    const res = await animateAs('u1', await refFor());
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('failed');
  });

  test('a fourth animation within a minute is refused, for that user only', async () => {
    for (let i = 0; i < animations.PER_MINUTE; i++) expect((await animateAs('u1', await refFor())).status).toBe(200);
    const res = await animateAs('u1', await refFor());
    expect(res.status).toBe(429);
    expect(res.body.code).toBe('rate_limited');
    expect(pipeline.animate).toHaveBeenCalledTimes(animations.PER_MINUTE);
    expect((await animateAs('u2', await refFor({ userId: 'u2' }))).status).toBe(200);
  });

  test('the daily count is enforced', async () => {
    const start = Date.now();
    const clock = jest.spyOn(Date, 'now');
    for (let i = 0; i < animations.PER_DAY; i++) {
      clock.mockReturnValue(start + i * 61 * 1000);
      expect((await animateAs('u1', await refFor())).status).toBe(200);
    }
    clock.mockReturnValue(start + animations.PER_DAY * 61 * 1000);
    const res = await animateAs('u1', await refFor());
    clock.mockRestore();
    expect(res.status).toBe(429);
  });

  test('nothing is made once the daily spending cap is reached', async () => {
    process.env.ANIMATION_DAILY_USD = '0';
    const res = await animateAs('u1', await refFor());
    expect(res.body).toMatchObject({ status: 'unavailable', reason: 'daily_limit' });
    expect(pipeline.animate).not.toHaveBeenCalled();
  });

  test('a run stopped by the cap is reported as the daily limit and can be asked again tomorrow', async () => {
    pipeline.animate.mockRejectedValueOnce(new pipeline.BudgetReached('cap'));
    const ref = await refFor();
    expect((await animateAs('u1', ref)).body.reason).toBe('daily_limit');
    expect((await animateAs('u1', ref)).body.status).toBe('ready');
  });
});

test('the route writes no audit record and raises no alert or task', async () => {
  const ref = await refFor();
  jest.clearAllMocks();
  pipeline.animate.mockResolvedValue(READY);
  await animateAs('u1', ref);
  expect(logAuditRecord).not.toHaveBeenCalled();
  expect(runPriorityAdjustmentAgent).not.toHaveBeenCalled();
  expect(global.fetch).not.toHaveBeenCalled();
});
