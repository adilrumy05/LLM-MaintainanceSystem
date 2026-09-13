const {
  validateSpoken,
  tidyForSpeech,
  generateSpokenAnswer,
  SPOKEN_SCHEMA_NAME,
} = require('../../server/services/spokenAnswer');

const FULL = `**WARNING:** Switch off the power supply before starting.

1. Open the front panel.
2. Remove the air filter.
3. Wash it and let it dry for 30 minutes before refitting.

(Source: p.75)`;

function reply(obj, { refusal = null, finish = 'stop', ok = true } = {}) {
  return jest.fn().mockResolvedValue({
    ok,
    json: async () => ({
      choices: [{ finish_reason: finish, message: refusal ? { refusal } : { content: JSON.stringify(obj) } }],
    }),
  });
}

describe('validateSpoken', () => {
  test('accepts a rewrite that keeps the warning and the waiting period', () => {
    const spoken = 'Warning: switch off the power supply first. Open the front panel, remove the air filter, wash it, and let it dry for 30 minutes before refitting.';
    expect(validateSpoken(FULL, spoken)).toEqual({ ok: true });
  });

  test('accepts a different phrasing of the same safety concept', () => {
    const spoken = 'Warning: isolate the unit before you start. Open the panel, take out the filter, wash it and dry it for 30 minutes.';
    expect(validateSpoken(FULL, spoken).ok).toBe(true);
  });

  test('REJECTS a rewrite that drops the power-off instruction', () => {
    // The failure this whole check exists for: the action survives, the
    // precaution that belongs to it does not.
    const spoken = 'Warning: be careful. Open the front panel, remove the filter, wash it and dry it for 30 minutes.';
    expect(validateSpoken(FULL, spoken)).toEqual({ ok: false, reason: 'missing_safety:power off' });
  });

  test('REJECTS a rewrite that drops the waiting period', () => {
    const spoken = 'Warning: switch off the power first. Open the panel, remove the filter, wash it and let it dry.';
    expect(validateSpoken(FULL, spoken)).toEqual({ ok: false, reason: 'missing_measurement:30' });
  });

  test('does not require page numbers, which are dropped when spoken', () => {
    const spoken = 'Warning: switch off the power. Open the panel, remove and wash the filter, dry it 30 minutes.';
    expect(validateSpoken(FULL, spoken).ok).toBe(true);
  });

  test('rejects empty, overlong and table-shaped output', () => {
    expect(validateSpoken(FULL, '').ok).toBe(false);
    expect(validateSpoken('ok', 'x'.repeat(1501)).reason).toBe('too_long');
    expect(validateSpoken('ok', '| a | b |').reason).toBe('not_speakable');
  });
});

describe('tidyForSpeech', () => {
  test('strips markdown symbols that would be read out loud', () => {
    expect(tidyForSpeech('**Warning:** do `this` #now')).toBe('Warning: do this now');
  });
});

describe('generateSpokenAnswer', () => {
  const good = {
    spokenText: 'Warning: switch off the power supply first. Open the panel, remove the filter, wash it and dry it for 30 minutes.',
    complete: true,
  };

  test('returns validated spoken text and declares its own schema name', async () => {
    const fetchImpl = reply(good);
    const r = await generateSpokenAnswer({ text: FULL, apiKey: 'k', fetchImpl });
    expect(r).toEqual({ spokenText: good.spokenText, reason: null });

    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(sent.response_format.json_schema.name).toBe(SPOKEN_SCHEMA_NAME);
    expect(sent.response_format.json_schema.strict).toBe(true);
  });

  test('returns null when the model says the rewrite is incomplete', async () => {
    const r = await generateSpokenAnswer({ text: FULL, apiKey: 'k', fetchImpl: reply({ ...good, complete: false }) });
    expect(r).toEqual({ spokenText: null, reason: 'incomplete' });
  });

  test('returns null when validation fails, even if the model claims completeness', async () => {
    const r = await generateSpokenAnswer({
      text: FULL, apiKey: 'k',
      fetchImpl: reply({ spokenText: 'Open the panel and wash the filter for 30 minutes.', complete: true }),
    });
    expect(r.spokenText).toBeNull();
    expect(r.reason).toMatch(/^missing_safety/);
  });

  test.each([
    ['refusal', reply(null, { refusal: 'no' }), 'refused'],
    ['truncation', reply(good, { finish: 'length' }), 'truncated'],
    ['HTTP failure', reply(good, { ok: false }), 'unavailable'],
    ['network failure', jest.fn().mockRejectedValue(new Error('down')), 'unavailable'],
  ])('handles %s without throwing', async (_label, fetchImpl, reason) => {
    const r = await generateSpokenAnswer({ text: FULL, apiKey: 'k', fetchImpl });
    expect(r).toEqual({ spokenText: null, reason });
  });

  test('handles prose where JSON was required', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'Sure! Here you go.' } }] }),
    });
    const r = await generateSpokenAnswer({ text: FULL, apiKey: 'k', fetchImpl });
    expect(r).toEqual({ spokenText: null, reason: 'unreadable_output' });
  });
});
