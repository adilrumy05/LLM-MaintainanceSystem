const {
  matchModelNumber,
  buildRetrievalQuery,
  extractFromImage,
  resolveVisualIntake,
  normaliseCode,
} = require('../../server/services/visionIntake');

// Mirrors the real corpus: 8 of 9 document groups cover several models.
const KNOWN_MODELS = [
  'CS-C18DKV', 'CU-C18DKV', 'CS-C24DKV', 'CU-C24DKV',
  'CS-E7JKEW', 'CU-E7JKE', 'CS-E9JKEW', 'CU-E9JKE',
  'RAS-30-BKVS-A', 'RAS-34-BKVS-A', 'RAS-36-BKVS-A',
];

const known = (extra = {}) => ({ model_numbers: KNOWN_MODELS, ...extra });

/** Build a fake OpenAI vision response. */
function visionReply(obj, { refusal = null, finish = 'stop', httpOk = true, status = 200 } = {}) {
  return jest.fn().mockResolvedValue({
    ok: httpOk,
    status,
    json: async () => ({
      choices: [{
        finish_reason: finish,
        message: refusal ? { refusal } : { content: JSON.stringify(obj) },
      }],
    }),
  });
}

const legible = (over = {}) => ({
  legible: true, confidence: 0.9,
  modelNumber: null, serialNumber: null, faultCode: null,
  visibleText: null, observation: null, ...over,
});

describe('normaliseCode', () => {
  test('folds case and punctuation so label formatting does not matter', () => {
    expect(normaliseCode('cs-c18dkv')).toBe('CSC18DKV');
    expect(normaliseCode('CS C18 DKV')).toBe('CSC18DKV');
  });
});

describe('matchModelNumber', () => {
  test('accepts an exact match automatically', () => {
    expect(matchModelNumber('CS-C18DKV', KNOWN_MODELS))
      .toEqual({ status: 'exact', model: 'CS-C18DKV' });
  });

  test('accepts an exact match despite different punctuation', () => {
    expect(matchModelNumber('csc18dkv', KNOWN_MODELS).status).toBe('exact');
  });

  test('asks for confirmation on a UNIQUE prefix match', () => {
    // The safeguard that matters: unique is not the same as correct. With only
    // nine manuals, a prefix can be unique purely because the corpus is small.
    const r = matchModelNumber('RAS-30', KNOWN_MODELS);
    expect(r.status).toBe('confirm');
    expect(r.model).toBe('RAS-30-BKVS-A');
  });

  test('asks which when several models share a prefix', () => {
    const r = matchModelNumber('CS-C', KNOWN_MODELS);
    expect(r.status).toBe('ambiguous');
    expect(r.candidates).toEqual(expect.arrayContaining(['CS-C18DKV', 'CS-C24DKV']));
  });

  test('reports no match for a model absent from the catalogue', () => {
    expect(matchModelNumber('LG-XYZ999', KNOWN_MODELS).status).toBe('none');
  });

  test('treats an empty reading as no match, not a wildcard', () => {
    expect(matchModelNumber('', KNOWN_MODELS).status).toBe('none');
    expect(matchModelNumber(null, KNOWN_MODELS).status).toBe('none');
  });
});

describe('buildRetrievalQuery', () => {
  test('folds the fault code into the text used for retrieval', () => {
    const q = buildRetrievalQuery('what does this mean?', legible({ faultCode: 'H27' }));
    expect(q).toContain('H27');
  });

  test('includes the visual observation', () => {
    const q = buildRetrievalQuery('is this bad?', legible({ observation: 'corroded fan bearing' }));
    expect(q).toContain('corroded fan bearing');
  });

  test('keeps a display message when no model was read', () => {
    const q = buildRetrievalQuery('what now?', legible({ visibleText: 'FILTER CLEAN REQUIRED' }));
    expect(q).toContain('FILTER CLEAN REQUIRED');
  });

  test('drops nameplate text once a model is read, so it cannot swamp the question', () => {
    const q = buildRetrievalQuery('how do I clean the air filter?', legible({
      modelNumber: 'CS-S10TKH',
      visibleText: 'SERIAL No. 4A1234567 220-240V 50Hz R32',
    }));
    expect(q).toBe('how do I clean the air filter?');
  });

  test('leaves a photo-free query untouched', () => {
    expect(buildRetrievalQuery('how do I clean the filter?', legible()))
      .toBe('how do I clean the filter?');
  });
});

describe('extractFromImage', () => {
  test('returns the parsed reading on success', async () => {
    const r = await extractFromImage('AAAA', 'k',
      { fetchImpl: visionReply(legible({ modelNumber: 'CS-C18DKV' })) });
    expect(r.ok).toBe(true);
    expect(r.data.modelNumber).toBe('CS-C18DKV');
  });

  test('sends every photo in one extraction call', async () => {
    const fetchImpl = visionReply(legible());
    await extractFromImage(['AAAA', 'BBBB', 'CCCC'], 'k', { fetchImpl });
    const sent = JSON.parse(fetchImpl.mock.calls[0][1].body);
    const parts = sent.messages[1].content;
    expect(parts.filter((p) => p.type === 'image_url')).toHaveLength(3);
    expect(parts[0].text).toMatch(/3 photographs/);
  });

  test('handles a model refusal without throwing', async () => {
    const r = await extractFromImage('AAAA', 'k',
      { fetchImpl: visionReply(null, { refusal: 'I cannot help with that.' }) });
    expect(r).toMatchObject({ ok: false, reason: 'refused' });
  });

  test('detects a truncated response rather than trusting partial JSON', async () => {
    const r = await extractFromImage('AAAA', 'k',
      { fetchImpl: visionReply(legible(), { finish: 'length' }) });
    expect(r).toMatchObject({ ok: false, reason: 'truncated' });
  });

  test('rejects prose where structured output was required', async () => {
    const fetchImpl = jest.fn().mockResolvedValue({
      ok: true, status: 200,
      json: async () => ({ choices: [{ finish_reason: 'stop', message: { content: 'It looks like a fan.' } }] }),
    });
    const r = await extractFromImage('AAAA', 'k', { fetchImpl });
    expect(r).toMatchObject({ ok: false, reason: 'unreadable_output' });
  });

  test('separates a vision API outage from an unreadable photo', async () => {
    const r = await extractFromImage('AAAA', 'k',
      { fetchImpl: visionReply(null, { httpOk: false, status: 503 }) });
    expect(r).toMatchObject({ ok: false, reason: 'vision_unavailable' });
  });
});

describe('resolveVisualIntake', () => {
  const base = { imageBase64: 'AAAA', query: 'what is this?', apiKey: 'k' };

  test('proceeds on an exact model and enriches the retrieval query', async () => {
    const r = await resolveVisualIntake({
      ...base,
      query: 'what does this code mean?',
      known: known(),
      fetchImpl: visionReply(legible({ modelNumber: 'CS-C18DKV', faultCode: 'H27' })),
    });
    expect(r.action).toBe('proceed');
    expect(r.model).toBe('CS-C18DKV');
    expect(r.retrievalQuery).toContain('H27');
  });

  test('asks for another photo when the image is not legible', async () => {
    const r = await resolveVisualIntake({
      ...base, known: known(),
      fetchImpl: visionReply(legible({ legible: false })),
    });
    expect(r.action).toBe('ask_photo');
  });

  test('asks for another photo when confidence is low', async () => {
    const r = await resolveVisualIntake({
      ...base, known: known(),
      fetchImpl: visionReply(legible({ modelNumber: 'CS-C18DKV', confidence: 0.2 })),
    });
    expect(r.action).toBe('ask_photo');
  });

  test('asks for confirmation on a unique prefix match', async () => {
    const r = await resolveVisualIntake({
      ...base, known: known(),
      fetchImpl: visionReply(legible({ modelNumber: 'RAS-30' })),
    });
    expect(r.action).toBe('ask_model');
    expect(r.candidates).toContain('RAS-30-BKVS-A');
  });

  test('reports no manual for a model outside the catalogue', async () => {
    const r = await resolveVisualIntake({
      ...base, known: known(),
      fetchImpl: visionReply(legible({ modelNumber: 'LG-XYZ999' })),
    });
    expect(r.action).toBe('no_manual');
    expect(r.message).toContain('LG-XYZ999');
  });

  test('PATH B: a confirmed model plus a label-less part photo proceeds', async () => {
    // The case a nameplate-only design silently drops: a damaged component with
    // no readable model on it.
    const r = await resolveVisualIntake({
      ...base,
      query: 'is this bad?',
      confirmedModel: 'CS-C18DKV',
      known: known(),
      fetchImpl: visionReply(legible({ observation: 'corroded fan bearing' })),
    });
    expect(r.action).toBe('proceed');
    expect(r.model).toBe('CS-C18DKV');
    expect(r.retrievalQuery).toContain('corroded fan bearing');
  });

  test('a document group alone does NOT establish the model', async () => {
    // 8 of 9 real document groups span several models; one covers 19. Selecting
    // a manual narrows scope, it does not identify the machine.
    const r = await resolveVisualIntake({
      ...base,
      docGroup: 'panasonic_aircon_E7JKEW',
      confirmedModel: null,
      known: known(),
      fetchImpl: visionReply(legible({ observation: 'a fan blade' })),
    });
    expect(r.action).toBe('ask_model');
  });

  test('stops when the photo contradicts the confirmed model', async () => {
    const r = await resolveVisualIntake({
      ...base,
      confirmedModel: 'CS-E7JKEW',
      known: known(),
      fetchImpl: visionReply(legible({ modelNumber: 'CS-C18DKV' })),
    });
    expect(r.action).toBe('conflict');
    expect(r.message).toContain('CS-E7JKEW');
  });

  test('stops when the photo model is outside the selected document group', async () => {
    const r = await resolveVisualIntake({
      ...base,
      docGroup: 'panasonic_aircon_E7JKEW',
      known: known({ group_models: { panasonic_aircon_E7JKEW: ['CS-E7JKEW', 'CU-E7JKE'] } }),
      fetchImpl: visionReply(legible({ modelNumber: 'CS-C18DKV' })),
    });
    expect(r.action).toBe('conflict');
  });

  test('REAL-DEVICE BUG: confirming a suffixed nameplate proceeds instead of asking again', async () => {
    // Found on an iPhone: the plate read CS-S10TKH-1, the catalogue lists
    // CS-S10TKH. The technician confirmed it, the app resent the photo, and the
    // server asked "Which model is it?" again, forever.
    const r = await resolveVisualIntake({
      ...base,
      confirmedModel: 'CS-S10TKH',
      known: known({ model_numbers: [...KNOWN_MODELS, 'CS-S10TKH', 'CS-S13TKH'] }),
      fetchImpl: visionReply(legible({ modelNumber: 'CS-S10TKH-1' })),
    });
    expect(r.action).toBe('proceed');
    expect(r.model).toBe('CS-S10TKH');
  });

  test('the same suffixed nameplate WITHOUT a confirmation still asks', async () => {
    const r = await resolveVisualIntake({
      ...base,
      known: known({ model_numbers: [...KNOWN_MODELS, 'CS-S10TKH'] }),
      fetchImpl: visionReply(legible({ modelNumber: 'CS-S10TKH-1' })),
    });
    expect(r.action).toBe('ask_model');
    expect(r.candidates).toEqual(['CS-S10TKH']);
  });

  test('a confirmation that is NOT one of the candidates does not settle a partial match', async () => {
    // Left over from a different machine earlier in the chat.
    const r = await resolveVisualIntake({
      ...base,
      confirmedModel: 'CS-E7JKEW',
      known: known({ model_numbers: [...KNOWN_MODELS, 'CS-S10TKH'] }),
      fetchImpl: visionReply(legible({ modelNumber: 'CS-S10TKH-1' })),
    });
    expect(r.action).toBe('ask_model');
  });

  test('photos showing two different models ask which one, never pick', async () => {
    const r = await resolveVisualIntake({
      ...base,
      images: ['AAAA', 'BBBB'],
      known: known(),
      fetchImpl: visionReply(legible({ modelNumber: 'CS-C18DKV', otherModelNumbers: ['RAS-30-BKVS-A'] })),
    });
    expect(r.action).toBe('ask_model');
    expect(r.reason).toBe('multiple_models');
    expect(r.candidates).toEqual(expect.arrayContaining(['CS-C18DKV', 'RAS-30-BKVS-A']));
  });

  test('the same model repeated across photos is not a conflict', async () => {
    const r = await resolveVisualIntake({
      ...base,
      images: ['AAAA', 'BBBB'],
      known: known(),
      fetchImpl: visionReply(legible({ modelNumber: 'CS-C18DKV', otherModelNumbers: ['cs-c18dkv'] })),
    });
    expect(r.action).toBe('proceed');
  });

  test('a catalogue outage is NOT reported as "no manual"', async () => {
    // These must never collapse into one message: one is a service fault to
    // retry, the other is a fact about the corpus.
    const r = await resolveVisualIntake({
      ...base, known: known(), knownOk: false,
      fetchImpl: visionReply(legible({ modelNumber: 'CS-C18DKV' })),
    });
    expect(r.action).toBe('error');
    expect(r.reason).toBe('catalogue_unavailable');
    expect(r.message).not.toMatch(/no manual/i);
  });

  test('a vision outage is NOT reported as an unreadable photo', async () => {
    const r = await resolveVisualIntake({
      ...base, known: known(),
      fetchImpl: visionReply(null, { httpOk: false, status: 500 }),
    });
    expect(r.action).toBe('error');
    expect(r.reason).toBe('vision_unavailable');
  });
});
