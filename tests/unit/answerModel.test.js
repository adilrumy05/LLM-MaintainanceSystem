// Newer OpenAI models reject the request settings gpt-4o-mini takes. Sending
// the wrong ones is an HTTP 400 on every question, so the mapping is tested.

describe('answer model request settings', () => {
  const load = (model) => {
    jest.resetModules();
    if (model) process.env.ANSWER_MODEL = model; else delete process.env.ANSWER_MODEL;
    return require('../../server/services/answerModel');
  };
  afterEach(() => { delete process.env.ANSWER_MODEL; });

  test('defaults to gpt-6-luna, which takes max_completion_tokens and no temperature', () => {
    const { ANSWER_MODEL, modelRequest } = load();
    expect(ANSWER_MODEL).toBe('gpt-6-luna');
    expect(modelRequest({ temperature: 0.2, maxTokens: 2048 }))
      .toEqual({ model: 'gpt-6-luna', max_completion_tokens: 4096, reasoning_effort: 'low' });
  });

  // The model's thinking counts toward the limit. A photo reading asks for only
  // 300 tokens, so without headroom the reply itself could be cut off.
  test('short replies get headroom for the thinking that comes first', () => {
    const { modelRequest } = load();
    expect(modelRequest({ temperature: 0, maxTokens: 300 }).max_completion_tokens).toBe(1800);
    expect(modelRequest({ temperature: 0, maxTokens: 700 }).max_completion_tokens).toBe(2200);
  });

  test('ANSWER_MODEL=gpt-4o-mini restores the earlier request exactly', () => {
    const { modelRequest } = load('gpt-4o-mini');
    expect(modelRequest({ temperature: 0.2, maxTokens: 2048 }))
      .toEqual({ model: 'gpt-4o-mini', temperature: 0.2, max_tokens: 2048 });
    expect(modelRequest({ temperature: 0, maxTokens: 300 }))
      .toEqual({ model: 'gpt-4o-mini', temperature: 0, max_tokens: 300 });
  });
});

// Photo reading and spoken answers go through the same setting.
describe('photo reading and spoken answers use the configured model', () => {
  const bodyOf = (fetchImpl) => JSON.parse(fetchImpl.mock.calls[0][1].body);
  const reply = (content) => jest.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ finish_reason: 'stop', message: { content } }] }) });

  afterEach(() => { delete process.env.ANSWER_MODEL; jest.resetModules(); });

  test.each([
    ['gpt-6-luna', undefined, { max_completion_tokens: 1800, reasoning_effort: 'low' }, { max_completion_tokens: 2200, reasoning_effort: 'low' }],
    ['gpt-4o-mini', 'gpt-4o-mini', { temperature: 0, max_tokens: 300 }, { temperature: 0, max_tokens: 700 }],
  ])('%s', async (model, env, photoSettings, spokenSettings) => {
    jest.resetModules();
    if (env) process.env.ANSWER_MODEL = env; else delete process.env.ANSWER_MODEL;
    const { extractFromImage } = require('../../server/services/visionIntake');
    const { generateSpokenAnswer } = require('../../server/services/spokenAnswer');

    const vision = reply(JSON.stringify({ legible: true, confidence: 0.9, modelNumber: 'CS-S10TKH', otherModelNumbers: [], serialNumber: null, faultCode: null, visibleText: null, observation: null }));
    expect((await extractFromImage('aGVsbG8=', 'key', { fetchImpl: vision })).ok).toBe(true);
    expect(bodyOf(vision)).toMatchObject({ model, ...photoSettings });
    expect(bodyOf(vision).response_format.json_schema.name).toBe('equipment_photo_reading');

    const spoken = reply(JSON.stringify({ spokenText: 'Switch off the unit.', complete: true }));
    expect((await generateSpokenAnswer({ text: 'Switch off the unit.', apiKey: 'key', fetchImpl: spoken })).spokenText).toBe('Switch off the unit.');
    expect(bodyOf(spoken)).toMatchObject({ model, ...spokenSettings });
    if (model === 'gpt-6-luna') {
      expect(bodyOf(vision)).not.toHaveProperty('temperature');
      expect(bodyOf(vision)).not.toHaveProperty('max_tokens');
      expect(bodyOf(spoken)).not.toHaveProperty('temperature');
      expect(bodyOf(spoken)).not.toHaveProperty('max_tokens');
    }
  });
});
