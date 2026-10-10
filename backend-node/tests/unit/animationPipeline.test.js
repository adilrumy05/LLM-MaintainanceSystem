// The model caller and evidence shaping in the animation pipeline.

const { createModelCaller, evidenceBlocks, BudgetReached } = require('../../server/services/animation/pipeline');

const reply = (content, usage = { prompt_tokens: 1000, completion_tokens: 1000 }, finish_reason = 'stop') =>
  ({ ok: true, status: 200, json: async () => ({ usage, choices: [{ finish_reason, message: { content } }] }) });
const call = caller => caller({ model: 'gpt-6-sol', system: 's', payload: {}, schema: {}, maxOut: 1000 });

beforeEach(() => { global.fetch = jest.fn(); });

test('no call is made when its worst case would pass the cap', async () => {
  const caller = createModelCaller({ apiKey: 'k', maySpend: () => false });
  await expect(call(caller)).rejects.toBeInstanceOf(BudgetReached);
  expect(global.fetch).not.toHaveBeenCalled();
});

test('spend is counted from the tokens the model reports', async () => {
  global.fetch.mockResolvedValue(reply('{"a":1}'));
  const onSpend = jest.fn();
  const result = await call(createModelCaller({ apiKey: 'k', onSpend }));
  expect(result).toMatchObject({ ok: true, parsed: { a: 1 } });
  // 1000 in at $2 per million + 1000 out at $10 per million.
  expect(onSpend).toHaveBeenCalledWith(expect.closeTo(0.012, 6), true);
});

test('a model with no listed price is costed as the dearest', async () => {
  global.fetch.mockResolvedValue(reply('{}'));
  const onSpend = jest.fn();
  await createModelCaller({ apiKey: 'k', onSpend })({ model: 'some-new-model', system: 's', payload: {}, schema: {}, maxOut: 10 });
  expect(onSpend).toHaveBeenCalledWith(expect.closeTo(0.012, 6), true);
});

test('a cut-off reply is tried once more, and both attempts are paid for', async () => {
  global.fetch.mockResolvedValueOnce(reply('{"a":', undefined, 'length')).mockResolvedValueOnce(reply('{"a":2}'));
  const onSpend = jest.fn();
  const result = await call(createModelCaller({ apiKey: 'k', onSpend }));
  expect(result.parsed).toEqual({ a: 2 });
  expect(onSpend).toHaveBeenCalledTimes(2);
});

test.each([
  ['a refusal', () => ({ ok: true, status: 200, json: async () => ({ usage: {}, choices: [{ finish_reason: 'stop', message: { refusal: 'no' } }] }) }), 'refused'],
  ['an HTTP error', () => ({ ok: false, status: 500, json: async () => ({ error: { message: 'down' } }) }), 'http_500: down'],
])('%s is not retried', async (_name, response, error) => {
  global.fetch.mockResolvedValue(response());
  const result = await call(createModelCaller({ apiKey: 'k' }));
  expect(result).toMatchObject({ ok: false, error });
  expect(global.fetch).toHaveBeenCalledTimes(1);
});

test('a network failure is charged at the worst case, as its cost is unknown', async () => {
  global.fetch.mockRejectedValue(new Error('socket'));
  const onSpend = jest.fn();
  const result = await call(createModelCaller({ apiKey: 'k', onSpend }));
  expect(result).toMatchObject({ ok: false, error: 'network_error' });
  expect(onSpend).toHaveBeenCalledWith(expect.any(Number), false);
  expect(onSpend.mock.calls[0][0]).toBeGreaterThan(0.01);
});

test('a passage contained in another is dropped, and empty ones are ignored', () => {
  const blocks = evidenceBlocks([
    { text: 'Remove the cover.', page: 5, document_group_id: 'g', filename: 'm.pdf', chunk_type: 'child' },
    { text: 'Loosen the screw. Remove the cover. Connect the cable.', page: 5, document_group_id: 'g', filename: 'm.pdf', chunk_type: 'parent' },
    { text: '   ' }, null,
  ]);
  expect(blocks).toEqual([{ id: 'b0', page: 5, group: 'g', filename: 'm.pdf', chunkType: 'parent', text: 'Loosen the screw. Remove the cover. Connect the cable.' }]);
});
