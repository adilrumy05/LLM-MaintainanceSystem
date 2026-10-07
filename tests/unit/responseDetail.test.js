// Brief answers are written short by the answer model, so there is no longer
// answer to compare them with. These check the one automatic safeguard: every
// measurement and code in a Brief answer must be in the manual text it came from.

const { checkBriefFigures, detailRules, plainMeasurements, DETAILED_TOP_K } = require('../../server/services/responseDetail');

const MANUAL = [
  'Switch off the power supply and unplug before cleaning. Wash the filters with water below 40 °C.',
  'Clean the filters every 2 weeks. Cable: 4 x 1.5 mm² (1.0–1.5HP) or 4 x 2.5 mm² (2.0–2.5HP).',
  'H11: indoor/outdoor abnormal communication. Model CS-S10TKH.',
];

describe('Brief figure check', () => {
  test.each([
    ['a measurement from the manual', 'Wash below 40°C (p.33).'],
    ['a differently spaced unit', 'Use 4 x 1.5mm² cable.'],
    ['the lower end of a range', 'For 1.0 HP units use 1.5 mm² cable.'],
    ['a plural or abbreviated time unit', 'Clean every 2 weeks.'],
    ['a fault code and a model number', 'H11 on the CS-S10TKH is a communication fault.'],
    ['step numbers and page citations', '1. Switch off. 2. Unplug. (manual.pdf, p.56)'],
    ['an answer with no figures', 'The manual does not cover this.'],
  ])('accepts %s', (_label, answer) => {
    expect(checkBriefFigures(answer, MANUAL)).toEqual({ ok: true, missing: [] });
  });

  test.each([
    ['a changed value', 'Wash below 60 °C.', '60 °c'],
    ['a changed unit', 'Use 1.5 mm cable.', '1.5 mm'],
    ['a changed time unit', 'Clean every 2 days.', '2 day'],
    ['an invented measurement', 'Tighten to 12 Nm.', '12 nm'],
    ['a fault code that is not in the manual', 'This is fault H19.', 'H19'],
    ['a different model number', 'On the CS-C18DKV, unplug first.', 'CS-C18DKV'],
  ])('rejects %s', (_label, answer, missing) => {
    const result = checkBriefFigures(answer, MANUAL);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain(missing);
  });

  // Found live: the ingested manual writes ranges and units with markup, and a
  // correct "1.0 HP" was rejected.
  test('reads ranges and units through the manual\'s markup', () => {
    const ingested = ['$4 \\times 1.5 \\text{mm}^2$ (1.0 \\~ 1.5HP) or 4 × 2.5 mm² (2.0 \\~ 2.5HP). Circuit breaker rated 15/16A.'];
    expect(checkBriefFigures('For 1.0 to 1.5 HP units use 4 x 1.5 mm² cable on a 15 A breaker.', ingested).ok).toBe(true);
    expect(checkBriefFigures('For 2.0 HP units use 2.5 mm² cable.', ingested).ok).toBe(true);
    expect(checkBriefFigures('For 3.0 HP units use 2.5 mm² cable.', ingested).missing).toEqual(['3.0 hp']);
  });

  test('a figure the user typed in the question counts as known', () => {
    expect(checkBriefFigures('The manual does not list a 12 V supply.', [...MANUAL, 'is it a 12 V supply?']).ok).toBe(true);
  });

  test('missing evidence parts are ignored rather than crashing', () => {
    expect(checkBriefFigures('Wash below 40 °C.', [null, undefined, ...MANUAL]).ok).toBe(true);
  });
});

// Found on the iPhone: a Brief answer showed "$4 \\times 1.5 , \\text{mm}^2$" literally.
describe('measurements copied out as LaTeX', () => {
  test('are shown as plain text', () => {
    expect(plainMeasurements('Use $4 \\times 1.5 , \\text{mm}^2$ (1.0 \\~ 1.5HP) or $4 \\times 2.5 \\, \\text{mm}^2$ cable (p. 56).'))
      .toBe('Use 4 × 1.5 mm² (1.0 ~ 1.5HP) or 4 × 2.5 mm² cable (p. 56).');
  });

  test('ordinary text, prices and Markdown are left alone', () => {
    const text = '**WARNING**: costs $5 to $10. Wash below 40 °C. Use 4 × 1.5 mm² cable.';
    expect(plainMeasurements(text)).toBe(text);
  });
});

describe('detail rules', () => {
  test('Standard adds nothing to the prompt', () => {
    expect(detailRules('standard')).toBe('');
    expect(detailRules(undefined)).toBe('');
  });

  test('Brief asks for a short answer but keeps the safety content', () => {
    expect(detailRules('brief')).toMatch(/Brief response/);
    expect(detailRules('brief')).toMatch(/warning, prohibition and\s+every quantity/);
  });

  test('Detailed asks only for what the extracts support, and searches more passages', () => {
    expect(detailRules('detailed')).toMatch(/Explain only what the manual extracts support/);
    expect(DETAILED_TOP_K).toBe(8);
  });
});

// Found live: on the cable question, Brief left out the earth-wire warning that
// the Standard answer gave. Brief is compared with Standard for this reason.
describe('Brief against the Standard answer', () => {
  const { checkBriefKeepsSafety } = require('../../server/services/responseDetail');
  const STANDARD = [
    '1. Switch off the power supply and unplug the unit.',
    '2. Use a 4 × 1.5 mm² cable. Do not use joint connection cable.',
    '3. Make sure the earth wire is Yellow/Green and longer than the other wires.',
  ].join('\n');

  test('passes when the measurements and safety items are all kept', () => {
    const brief = '1. Turn the power off and unplug.\n2. 4 × 1.5 mm² cable; do not use joint cable.\n3. Earth wire Y/G, longer than the rest.';
    expect(checkBriefKeepsSafety(brief, STANDARD, [STANDARD])).toEqual({ ok: true, missing: [] });
  });

  test.each([
    ['the earth-wire warning', '1. Switch off and unplug.\n2. 4 × 1.5 mm² cable; do not use joint cable.', 'earth'],
    ['the power-off step', '1. Unplug.\n2. 4 × 1.5 mm² cable; do not use joint cable.\n3. Earth wire Y/G.', 'power off'],
    ['the unplug step', '1. Switch off the power.\n2. 4 × 1.5 mm² cable; do not use joint cable.\n3. Earth wire Y/G.', 'unplug'],
    ['a prohibition', '1. Switch off and unplug.\n2. 4 × 1.5 mm² cable.\n3. Earth wire Y/G.', 'prohibition'],
    ['a measurement', '1. Switch off and unplug.\n2. Do not use joint cable.\n3. Earth wire Y/G.', '1.5 mm²'],
  ])('fails when Brief drops %s', (_label, brief, missing) => {
    const result = checkBriefKeepsSafety(brief, STANDARD, [STANDARD]);
    expect(result.ok).toBe(false);
    expect(result.missing).toContain(missing);
  });

  test('does not ask Brief for safety items the Standard answer never mentioned', () => {
    const standard = 'When the TIMER indicator blinks, the unit has detected an abnormal operation (p.74).';
    expect(checkBriefKeepsSafety('The TIMER light blinks on a fault.', standard, [standard]).ok).toBe(true);
  });

  test('a model number or part number left out of Brief is not a safety failure', () => {
    const standard = 'On the CS-C18DKV, replace damaged filters (CWD001137).';
    expect(checkBriefKeepsSafety('Replace damaged filters.', standard, [standard]).ok).toBe(true);
  });

  // Found live: three false alarms sent correct Brief answers back to Standard.
  test('a prohibition reworded as "not exceeding" still counts', () => {
    const manual = ['Do not use water with a temperature higher than 40 °C.'];
    expect(checkBriefKeepsSafety('Wash with water not exceeding 40 °C.', 'Do not use water higher than 40 °C.', manual).ok).toBe(true);
  });

  test('Brief is not held to things Standard added that the manual does not say', () => {
    const manual = ['Switch off the power supply. Do not use water with a temperature higher than 40 °C.'];
    const standard = 'Switch off the power and wear protective gloves. Do not use water above 40 °C (104 °F).';
    expect(checkBriefKeepsSafety('Switch off the power. Water not above 40 °C.', standard, manual).ok).toBe(true);
  });

  test('a cable size written with "\\times" is not read as "4 times"', () => {
    const manual = ['Use a $4 \\times 1.5 \\text{mm}^2$ cable.'];
    expect(checkBriefKeepsSafety('Use 4 × 1.5 mm² cable.', 'Use a 4 \\times 1.5 mm² cable.', manual).ok).toBe(true);
  });
});
