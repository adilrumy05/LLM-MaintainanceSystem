// Animation feasibility spike: the checks that stand between a model's
// proposal and the screen. No model is called here.
//
// The adversarial cases all use labels that really are in the manual. A check
// that only looked for the right words would pass every one of them; these
// have to be caught by what connects to what, which way a part moves, what
// order the steps come in, and what value is shown.

const { verifyFact, terminalTableFacts, numberFacts, canonical } = require('../../server/services/animation/facts');
const { validateScene, repairScene, buildCaptions } = require('../../server/services/animation/scene');

const CABLE_GROUP = 'panasonic_aircon_CS-S10TKH';
const SCOPE = { group: CABLE_GROUP };

// Page 56 of the CS-S10TKH manual, as the retrieval service returns it.
const PAGE_56 = `# 10.3.4 Connect the cable to the Outdoor Unit

1 Remove the control board cover from the unit by loosening the screw.

2 Connection cable between indoor unit and outdoor unit shall be approved polychloroprene sheathed $4 \\times 1.5 \\, \\text{mm}^2$ (1.0 \\~ 1.5HP) or $4 \\times 2.5 \\, \\text{mm}^2$ (2.0 \\~ 2.5HP) flexible cord, type designation 60245 IEC 57 or heavier cord. Do not use joint connection cable. Replace the wire if the existing wire (from concealed wiring, or otherwise) is too short.

[Row 0] Terminals on the outdoor unit | 1 | 2 | 3 |  |
[Row 1] Colour of wires |  |  |  |  |
[Row 2] Terminals on the indoor unit | 1 | 2 | 3 |  |

3 Secure the cable onto the control board with the holder (clamper).

4 Attach the control board cover back to the original position with screw.

- Earth wire shall be Yellow/Green (Y/G) in colour and longer than the other AC wires for safety reason.`;

const BLOCKS = [
  { id: 'b0', page: 56, group: CABLE_GROUP, text: PAGE_56 },
  { id: 'b1', page: 33, group: 'panasonic_aircon_CS-C18DKV', text: 'Switch off the power supply before cleaning. Do not use water with temperature higher than 40 °C.' },
];

const RAW = {
  remove:  { type: 'action', blockId: 'b0', quote: '1 Remove the control board cover from the unit by loosening the screw.', verb: 'remove', verbText: 'Remove', object: 'control board cover' },
  loosen:  { type: 'action', blockId: 'b0', quote: 'Remove the control board cover from the unit by loosening the screw.', verb: 'loosen', verbText: 'loosening', object: 'screw' },
  size:    { type: 'quantity', blockId: 'b0', quote: 'Connection cable between indoor unit and outdoor unit shall be approved polychloroprene sheathed 4 × 1.5 mm² (1.0 ~ 1.5HP)', value: '1.5', unit: 'mm²', subject: 'Connection cable' },
  noJoint: { type: 'prohibition', blockId: 'b0', quote: 'Do not use joint connection cable.' },
  secure:  { type: 'action', blockId: 'b0', quote: '3 Secure the cable onto the control board with the holder (clamper).', verb: 'secure', verbText: 'Secure', object: 'cable' },
  attach:  { type: 'action', blockId: 'b0', quote: '4 Attach the control board cover back to the original position with screw.', verb: 'attach', verbText: 'Attach', object: 'control board cover' },
  earth:   { type: 'warning', blockId: 'b0', quote: 'Earth wire shall be Yellow/Green (Y/G) in colour and longer than the other AC wires for safety reason.' },
};

function cableFacts() {
  const table = terminalTableFacts(BLOCKS, SCOPE);
  const model = Object.values(RAW).map(raw => verifyFact(raw, BLOCKS, SCOPE));
  expect(model.every(result => result.ok)).toBe(true);
  const facts = numberFacts(table.facts, model.map(result => result.fact));
  const id = quoteStart => facts.find(fact => fact.source === 'model' && canonical(fact.quote).includes(canonical(quoteStart)) ).id;
  return { facts, missingDetails: table.missingDetails, ids: {
    c1: 'f1', c2: 'f2', c3: 'f3',
    remove: facts.find(f => f.verb === 'remove').id, loosen: facts.find(f => f.verb === 'loosen').id,
    size: facts.find(f => f.type === 'quantity').id, noJoint: facts.find(f => f.type === 'prohibition').id,
    secure: facts.find(f => f.verb === 'secure').id, attach: facts.find(f => f.verb === 'attach').id,
    earth: id('Earth wire shall be'),
  } };
}

// A correct scene for the cable job. Each adversarial test changes one thing.
function cableScene(ids) {
  const connect = (factId, terminal) => ({ kind: 'connect', part: 'outdoor', target: 'indoor', factId,
    fromUnit: 'outdoor unit', fromTerminal: terminal, toUnit: 'indoor unit', toTerminal: terminal, value: null, unit: null });
  const motion = (kind, part, factId, extra = {}) => ({ kind, part, target: null, factId,
    fromUnit: null, fromTerminal: null, toUnit: null, toTerminal: null, value: null, unit: null, ...extra });
  return {
    kind: 'procedural', unavailableReason: null, title: 'Connect the cable to the outdoor unit',
    parts: [
      { id: 'cover', label: 'control board cover', shape: 'cover', factId: ids.remove },
      { id: 'screw', label: 'screw', shape: 'screw', factId: ids.loosen },
      { id: 'cable', label: 'cable', shape: 'cable', factId: ids.secure },
      { id: 'outdoor', label: 'outdoor unit', shape: 'outdoor_unit', factId: ids.c1 },
      { id: 'indoor', label: 'indoor unit', shape: 'indoor_unit', factId: ids.c1 },
    ],
    steps: [
      { factIds: [ids.remove, ids.loosen], motions: [motion('rotate_ccw', 'screw', ids.loosen), motion('move_away', 'cover', ids.remove)] },
      { factIds: [ids.size, ids.noJoint], motions: [motion('show_value', 'cable', ids.size, { value: '1.5', unit: 'mm²' })] },
      { factIds: [ids.c1, ids.c2, ids.c3, ids.earth], motions: [connect(ids.c1, '1'), connect(ids.c2, '2'), connect(ids.c3, '3')] },
      { factIds: [ids.secure], motions: [motion('move_toward', 'cable', ids.secure)] },
      { factIds: [ids.attach], motions: [motion('move_toward', 'cover', ids.attach)] },
    ],
    missingDetails: [],
  };
}

const change = (scene, edit) => { const copy = JSON.parse(JSON.stringify(scene)); edit(copy); return copy; };

describe('facts are tied to the manual text', () => {
  test('a terminal table gives one connection per column, and reports what it leaves blank', () => {
    const { facts, missingDetails } = terminalTableFacts(BLOCKS, SCOPE);
    expect(facts.map(f => `${f.from.unit} ${f.from.terminal} - ${f.to.unit} ${f.to.terminal}`)).toEqual([
      'outdoor unit 1 - indoor unit 1', 'outdoor unit 2 - indoor unit 2', 'outdoor unit 3 - indoor unit 3',
    ]);
    expect(facts.every(f => PAGE_56.includes(f.quote) && f.page === 56)).toBe(true);
    expect(missingDetails.join(' ')).toMatch(/Wire colours/);
    expect(missingDetails.join(' ')).toMatch(/column with no text/);
  });

  test('a terminal with no partner in the table is reported, not connected', () => {
    const blocks = [{ id: 'b0', page: 1, group: CABLE_GROUP, text: 'Terminals on the outdoor unit | 1 | 2 | 3 |\nTerminals on the indoor unit | 1 | 2 |  |' }];
    const { facts, missingDetails } = terminalTableFacts(blocks, SCOPE);
    expect(facts).toHaveLength(2);
    expect(missingDetails.join(' ')).toMatch(/Terminal "3" on the outdoor unit has no matching terminal/);
  });

  test('a table from another machine is not read', () => {
    expect(terminalTableFacts(BLOCKS, { group: 'panasonic_aircon_CS-C18DKV' }).facts).toEqual([]);
  });

  test('facts quoted from the manual are accepted, through its markup', () => {
    const { facts } = cableFacts();
    expect(facts).toHaveLength(10);
    expect(facts.find(f => f.type === 'quantity').figure).toBe('1.5 mm²');
    expect(facts.find(f => f.verb === 'remove').direction).toBe('away');
    expect(facts.find(f => f.verb === 'attach').direction).toBe('toward');
  });

  test.each([
    ['a quote that is not in the passage', { ...RAW.remove, quote: 'Remove the front grille before starting.' }, 'quote_not_in_passage'],
    ['a detail that is only in the answer, not the manual', { type: 'prerequisite', blockId: 'b0', quote: 'Switch off the power supply before starting work.' }, 'quote_not_in_passage'],
    ['a quote stitched from two places', { ...RAW.remove, quote: 'Remove the control board cover with the holder (clamper).' }, 'quote_not_in_passage'],
    ['a fact from another machine\'s manual', { type: 'prerequisite', blockId: 'b1', quote: 'Switch off the power supply before cleaning.' }, 'out_of_scope_passage'],
    ['a passage that was never retrieved', { ...RAW.remove, blockId: 'b9' }, 'unknown_passage'],
    ['"remove" filed as an inserting action', { ...RAW.remove, verb: 'insert' }, 'verb_does_not_match_its_class'],
    ['"loosening" filed as tightening', { ...RAW.loosen, verb: 'tighten' }, 'verb_does_not_match_its_class'],
    ['an object the sentence does not mention', { ...RAW.remove, object: 'front panel' }, 'object_not_in_quote'],
    ['a changed value', { ...RAW.size, value: '2.5' }, 'value_not_in_quote'],
    ['a changed unit', { ...RAW.size, unit: 'mm' }, 'value_not_in_quote'],
    ['a wiring connection proposed by the model', { type: 'connection', blockId: 'b0', quote: 'Terminals on the outdoor unit | 1 | 2 | 3' }, 'unknown_type'],
    ['a prohibition with no "do not" in it', { type: 'prohibition', blockId: 'b0', quote: 'Secure the cable onto the control board' }, 'prohibition_without_negation'],
  ])('rejects %s', (_label, raw, reason) => {
    expect(verifyFact(raw, BLOCKS, SCOPE)).toEqual({ ok: false, reason });
  });

  test('"do not use" filed as an action becomes a prohibition', () => {
    const result = verifyFact({ type: 'action', blockId: 'b0', quote: 'Do not use joint connection cable.', verb: 'use', verbText: 'use', object: 'joint connection cable' }, BLOCKS, SCOPE);
    expect(result.ok).toBe(true);
    expect(result.fact.type).toBe('prohibition');
    expect(result.fact.direction).toBeUndefined();
  });
});

describe('a correct scene', () => {
  test('is accepted, and its captions are the manual\'s words', () => {
    const { facts, ids } = cableFacts();
    const scene = cableScene(ids);
    expect(validateScene(scene, facts, SCOPE)).toEqual({ status: 'ready', reasons: [] });

    const captions = buildCaptions(scene, facts);
    expect(captions[0][0]).toEqual({ type: 'action', page: 56, text: '1 Remove the control board cover from the unit by loosening the screw.' });
    expect(captions[2][0].text).toBe('Outdoor unit terminal 1 connects to indoor unit terminal 1');
    expect(captions[1][0].text).toContain('4 × 1.5 mm²');
  });
});

describe('ADVERSARIAL: wrong relationships with valid labels are rejected', () => {
  const run = edit => {
    const { facts, ids } = cableFacts();
    return validateScene(change(cableScene(ids), scene => edit(scene, ids)), facts, SCOPE);
  };

  test.each([
    ['a wrong connection (terminal 1 to terminal 2)', scene => { scene.steps[2].motions[0].toTerminal = '2'; }, /wrong_connection/],
    ['a connection between the same unit', scene => { scene.steps[2].motions[0].toUnit = 'outdoor unit'; }, /wrong_connection/],
    // The cable-size sentence names both units, but states no terminal connection.
    ['a connection that no table states', (scene, ids) => { scene.steps[2].factIds.push(ids.size); scene.steps[2].motions[0].factId = ids.size; }, /wrong_connection/],
    ['reversed movement: "remove" drawn as fitting on', scene => { scene.steps[0].motions[1].kind = 'move_toward'; }, /wrong_direction/],
    ['reversed movement: "attach" drawn as taking off', scene => { scene.steps[4].motions[0].kind = 'move_away'; }, /wrong_direction/],
    ['reversed rotation: "loosening" drawn as tightening', scene => { scene.steps[0].motions[0].kind = 'rotate_cw'; }, /wrong_rotation/],
    ['reordered steps: cover refitted before the cable is secured', scene => { [scene.steps[3], scene.steps[4]] = [scene.steps[4], scene.steps[3]]; }, /step_out_of_order/],
    ['reordered steps: the first step moved to the end', scene => { scene.steps.push(scene.steps.shift()); }, /step_out_of_order/],
    ['a wrong quantity (2.5 mm² shown for 1.5 mm²)', scene => { scene.steps[1].motions[0].value = '2.5'; }, /wrong_value/],
    ['a wrong unit (1.5 mm shown for 1.5 mm²)', scene => { scene.steps[1].motions[0].unit = 'mm'; }, /wrong_value/],
    ['a movement applied to a part the sentence does not mention', scene => { scene.steps[0].motions[1].part = 'cable'; }, /motion_part_not_in_fact/],
    ['a dropped warning (the earth wire)', (scene, ids) => { scene.steps[2].factIds = scene.steps[2].factIds.filter(id => id !== ids.earth); }, /safety_fact_not_shown/],
    ['a dropped prohibition (no joint cable)', (scene, ids) => { scene.steps[1].factIds = [ids.size]; }, /safety_fact_not_shown/],
    ['a part named with words that are not in the manual', scene => { scene.parts[2].label = 'power supply'; }, /part_label_not_in_manual/],
    ['a step that cites a fact that was never verified', scene => { scene.steps[3].factIds = ['f99']; scene.steps[3].motions = []; }, /unknown_fact/],
    ['a motion that cites a fact outside its step', (scene, ids) => { scene.steps[3].motions[0].factId = ids.attach; }, /motion_without_fact/],
    ['markup in the title', scene => { scene.title = '<b>Connect</b>'; }, /bad_title/],
    ['markup in a part label', scene => { scene.parts[0].label = 'cover<script>'; }, /bad_label/],
    ['too many steps', scene => { scene.steps = Array.from({ length: 13 }, () => scene.steps[2]); }, /step_count_out_of_range/],
  ])('%s', (_label, edit, reason) => {
    const result = run(edit);
    expect(result.status).toBe('rejected');
    expect(result.reasons.join(' | ')).toMatch(reason);
  });

  test('a prerequisite shown after the first action is rejected', () => {
    const blocks = [{ id: 'b0', page: 33, group: CABLE_GROUP, text: 'Switch off the power supply before cleaning. Remove the air filters from the unit. Wash the air filters with water.' }];
    const results = [
      verifyFact({ type: 'prerequisite', blockId: 'b0', quote: 'Switch off the power supply before cleaning.' }, blocks, SCOPE),
      verifyFact({ type: 'action', blockId: 'b0', quote: 'Remove the air filters from the unit.', verb: 'remove', verbText: 'Remove', object: 'air filters' }, blocks, SCOPE),
      verifyFact({ type: 'action', blockId: 'b0', quote: 'Wash the air filters with water.', verb: 'clean', verbText: 'Wash', object: 'air filters' }, blocks, SCOPE),
    ];
    const facts = numberFacts([], results.map(r => r.fact));
    const scene = { kind: 'procedural', unavailableReason: null, title: 'Clean the filters',
      parts: [{ id: 'filters', label: 'air filters', shape: 'filter', factId: 'f2' }],
      steps: [{ factIds: ['f2'], motions: [] }, { factIds: ['f1'], motions: [] }, { factIds: ['f3'], motions: [] }], missingDetails: [] };
    expect(validateScene(scene, facts, SCOPE).reasons.join(' ')).toMatch(/prerequisite_after_first_action/);
    scene.steps = [scene.steps[1], scene.steps[0], scene.steps[2]];
    expect(validateScene(scene, facts, SCOPE).status).toBe('ready');
  });
});

describe('when an animation is not shown at all', () => {
  test('a step-by-step scene with no known model asks for the model', () => {
    const { facts, ids } = cableFacts();
    const result = validateScene(cableScene(ids), facts, { group: null });
    expect(result.status).toBe('unavailable');
    expect(result.reasons[0]).toMatch(/model_needed/);
  });

  // Scope decision, 8 Oct 2026: explanations are answered in text, not animated.
  test('a scene filed as an explanation is not animated, with or without a known model', () => {
    const { facts, ids } = cableFacts();
    const scene = change(cableScene(ids), s => { s.kind = 'conceptual'; });
    expect(validateScene(scene, facts, { group: null }).status).toBe('unavailable');
    expect(validateScene(scene, facts, SCOPE)).toEqual({ status: 'unavailable', reasons: [expect.stringMatching(/^explanation_only/)] });
  });

  // Found in the third full run: "Replace the drain hose" shown alone, from
  // two pages, as the animation for installing a drain hose.
  test('a procedure with only one step in it is not an animation', () => {
    const blocks = [
      { id: 'b0', page: 49, group: CABLE_GROUP, text: 'For the right rear piping: Replace the drain hose' },
      { id: 'b1', page: 60, group: CABLE_GROUP, text: 'Change the piping direction. Replace the drain hose' },
    ];
    const facts = numberFacts([], blocks.map(block => verifyFact({ type: 'action', blockId: block.id, quote: 'Replace the drain hose', verb: 'replace', verbText: 'Replace', object: 'drain hose' }, blocks, SCOPE).fact));
    const scene = { kind: 'procedural', unavailableReason: null, title: 'Drain hose', missingDetails: [],
      parts: [{ id: 'hose', label: 'drain hose', shape: 'hose', factId: 'f1' }],
      steps: [{ factIds: ['f1'], motions: [] }, { factIds: ['f2'], motions: [] }] };
    const verdict = validateScene(repairScene(scene, facts, SCOPE).scene, facts, SCOPE);
    expect(verdict.status).toBe('unavailable');
    expect(verdict.reasons[0]).toMatch(/too_little_to_show/);
  });

  test('a scene the model declined is unavailable, with its reason', () => {
    const scene = { kind: 'unavailable', unavailableReason: 'The passages do not cover this question.', title: '', parts: [], steps: [], missingDetails: [] };
    expect(validateScene(scene, [], SCOPE)).toEqual({ status: 'unavailable', reasons: ['declined: The passages do not cover this question.'] });
  });

  test('a procedure with nothing to do in it is rejected', () => {
    const { facts, ids } = cableFacts();
    const scene = change(cableScene(ids), s => { s.steps = [{ factIds: [ids.size, ids.noJoint, ids.earth], motions: [] }]; });
    expect(validateScene(scene, facts, SCOPE).reasons).toContain('procedure_without_steps');
  });

  test('anything that is not a scene is rejected', () => {
    expect(validateScene(null, [], SCOPE).status).toBe('rejected');
    expect(validateScene({ kind: 'video', parts: [], steps: [] }, [], SCOPE).status).toBe('rejected');
  });
});

// Rejecting a whole scene over one bad arrow wastes the rest of it. Repair
// removes or corrects only what failed, and never adds anything that is not a
// verified fact. After it, the wrong element must be gone, not just reported.
describe('REPAIR: a wrong element is removed, never shown', () => {
  const repair = edit => {
    const { facts, ids } = cableFacts();
    const broken = change(cableScene(ids), scene => edit(scene, ids));
    const { scene, repairs } = repairScene(broken, facts, SCOPE);
    return { scene, repairs, facts, ids, verdict: validateScene(scene, facts, SCOPE) };
  };
  const motions = scene => scene.steps.flatMap(step => step.motions);
  const stepOf = (scene, factId) => scene.steps.findIndex(step => step.factIds.includes(factId));

  test('a correct scene is left exactly as it was', () => {
    const { facts, ids } = cableFacts();
    const scene = cableScene(ids);
    expect(repairScene(scene, facts, SCOPE)).toEqual({ scene, repairs: [] });
  });

  test('a wrong connection is not drawn; the other two wires and the caption stay', () => {
    const { scene, verdict, facts } = repair(s => { s.steps[2].motions[0].toTerminal = '2'; });
    expect(verdict.status).toBe('ready');
    const wires = motions(scene).filter(m => m.kind === 'connect').map(m => `${m.fromTerminal}-${m.toTerminal}`);
    expect(wires).toEqual(['2-2', '3-3']);
    expect(buildCaptions(scene, facts)[2][0].text).toBe('Outdoor unit terminal 1 connects to indoor unit terminal 1');
  });

  test.each([
    ['"remove" drawn as fitting on', s => { s.steps[0].motions[1].kind = 'move_toward'; }, m => m.kind === 'move_toward' && m.part === 'cover' && m.factId === 'f4'],
    ['"loosening" drawn as tightening', s => { s.steps[0].motions[0].kind = 'rotate_cw'; }, m => m.kind === 'rotate_cw'],
    ['2.5 mm² shown for 1.5 mm²', s => { s.steps[1].motions[0].value = '2.5'; }, m => m.kind === 'show_value'],
    ['a movement on a part the sentence does not mention', s => { s.steps[0].motions[1].part = 'cable'; }, m => m.kind === 'move_away' && m.part === 'cable'],
  ])('%s is removed', (_label, edit, isWrong) => {
    const { scene, verdict, repairs } = repair(edit);
    expect(verdict.status).toBe('ready');
    expect(motions(scene).some(isWrong)).toBe(false);
    expect(repairs).toHaveLength(1);
    expect(scene.steps).toHaveLength(5);
  });

  test('steps out of the manual\'s order are put back in it', () => {
    const { scene, verdict, ids } = repair(s => { s.steps.reverse(); });
    expect(verdict.status).toBe('ready');
    expect(['size', 'remove', 'c1', 'secure', 'attach'].map(name => stepOf(scene, ids[name]))).toEqual([0, 1, 2, 3, 4]);
  });

  test('a dropped warning is shown in the first step', () => {
    const { scene, verdict, ids } = repair((s, i) => { s.steps[2].factIds = s.steps[2].factIds.filter(id => id !== i.earth); });
    expect(verdict.status).toBe('ready');
    expect(scene.steps[0].factIds[0]).toBe(ids.earth);
  });

  test('a step the model left out is added back, as text, at its place in the manual', () => {
    const { scene, verdict, ids } = repair(s => { s.steps.splice(3, 1); });
    expect(verdict.status).toBe('ready');
    expect(stepOf(scene, ids.secure)).toBe(3);
    expect(scene.steps[3].motions).toEqual([]);
  });

  test('a part named with words that are not in the manual goes, with its drawings', () => {
    const { scene, verdict } = repair(s => { s.parts[2].label = 'power supply'; });
    expect(verdict.status).toBe('ready');
    expect(scene.parts.map(part => part.id)).not.toContain('cable');
    expect(motions(scene).some(m => m.part === 'cable')).toBe(false);
  });

  test('a reference to a fact that was never verified is removed', () => {
    const { scene, verdict } = repair(s => { s.steps[3].factIds.push('f99'); });
    expect(verdict.status).toBe('ready');
    expect(scene.steps.flatMap(step => step.factIds)).not.toContain('f99');
  });

  test('markup in the title is cleared', () => {
    const { scene, verdict } = repair(s => { s.title = '<b>Connect</b>'; });
    expect(verdict.status).toBe('ready');
    expect(scene.title).toBe('');
  });

  test('what cannot be fixed stays rejected', () => {
    const { facts, ids } = cableFacts();
    const tooLong = change(cableScene(ids), s => { s.steps = Array.from({ length: 13 }, () => s.steps[2]); });
    expect(validateScene(repairScene(tooLong, facts, SCOPE).scene, facts, SCOPE).status).toBe('rejected');
    expect(validateScene(repairScene(null, facts, SCOPE).scene, facts, SCOPE).status).toBe('rejected');
  });

  test('repair does not get a procedure past a missing model', () => {
    const { facts, ids } = cableFacts();
    const scene = change(cableScene(ids), s => { s.kind = 'conceptual'; s.steps = [{ factIds: [ids.earth], motions: [] }]; });
    const repaired = repairScene(scene, facts, { group: null }).scene;
    expect(validateScene(repaired, facts, { group: null }).status).not.toBe('rejected');
    expect(validateScene(change(cableScene(ids), s => s), facts, { group: null }).status).toBe('unavailable');
  });
});

// Found in the first full run: the stronger model grouped facts from two pages
// into one step, and no rearrangement of its steps satisfied both pages.
describe('order when the model groups facts from different places', () => {
  const { uncoveredSafetySentences } = require('../../server/services/animation/facts');
  const stepOf = (scene, factId) => scene.steps.findIndex(step => step.factIds.includes(factId));

  test('a step holding the first and last action is split so the middle one can go between', () => {
    const { facts, ids } = cableFacts();
    const scene = change(cableScene(ids), s => {
      s.steps = [
        { factIds: [ids.noJoint, ids.remove, ids.loosen, ids.attach, ids.earth], motions: [s.steps[0].motions[1], s.steps[4].motions[0]] },
        { factIds: [ids.secure], motions: [] },
      ];
    });
    expect(validateScene(scene, facts, SCOPE).reasons.join(' ')).toMatch(/step_out_of_order/);

    const { scene: repaired } = repairScene(scene, facts, SCOPE);
    expect(validateScene(repaired, facts, SCOPE)).toEqual({ status: 'ready', reasons: [] });
    expect(['remove', 'secure', 'attach'].map(name => stepOf(repaired, ids[name]))).toEqual([0, 1, 2]);
    // Safety facts stay with the first piece, and each drawing follows its fact.
    expect(repaired.steps[0].factIds).toEqual(expect.arrayContaining([ids.noJoint, ids.earth]));
    expect(repaired.steps[2].motions.map(m => m.kind)).toEqual(['move_toward']);
    expect(repaired.steps[0].motions.map(m => m.kind)).toEqual(['move_away']);
  });

  test('wiring shown after later steps of its own page is moved back to its place', () => {
    const { facts, ids } = cableFacts();
    const scene = change(cableScene(ids), s => { s.steps.push(s.steps.splice(2, 1)[0]); });
    expect(validateScene(scene, facts, SCOPE).status).toBe('rejected');
    const { scene: repaired } = repairScene(scene, facts, SCOPE);
    expect(validateScene(repaired, facts, SCOPE).status).toBe('ready');
    expect(['remove', 'c1', 'secure', 'attach'].map(name => stepOf(repaired, ids[name]))).toEqual([0, 2, 3, 4]);
  });

  test('two facts quoted from the same sentence may come in either order', () => {
    const { facts, ids } = cableFacts();
    const scene = change(cableScene(ids), s => {
      s.steps.splice(0, 1, { factIds: [ids.loosen], motions: [s.steps[0].motions[0]] }, { factIds: [ids.remove], motions: [s.steps[0].motions[1]] });
    });
    expect(validateScene(scene, facts, SCOPE).status).toBe('ready');
  });

  test('a safety-worded sentence filed as a plain statement becomes a warning that must be shown', () => {
    const result = verifyFact({ type: 'statement', blockId: 'b0', quote: RAW.earth.quote }, BLOCKS, SCOPE);
    expect(result.fact.type).toBe('warning');
    expect(verifyFact({ type: 'statement', blockId: 'b0', quote: '3 Secure the cable onto the control board' }, BLOCKS, SCOPE).fact.type).toBe('statement');
  });

  test('safety sentences that no fact covers are listed for a person to check', () => {
    const only = numberFacts([], [verifyFact(RAW.remove, BLOCKS, SCOPE).fact]);
    const missed = uncoveredSafetySentences(BLOCKS, only).map(item => item.text);
    expect(missed.join(' | ')).toMatch(/do not use joint connection cable/i);
    expect(missed.join(' | ')).toMatch(/earth wire shall be yellow\/green/i);
    expect(missed.every(text => !/remove the control board cover/i.test(text))).toBe(true);

    expect(uncoveredSafetySentences(BLOCKS, cableFacts().facts)).toEqual([]);
    // A passage that gave no facts is not searched: it may be about another job.
    expect(uncoveredSafetySentences([BLOCKS[1]], only)).toEqual([]);
  });
});

// Found in the second full run: with facts from the outdoor-unit page and the
// indoor-unit page, the stronger model wove the two procedures together and
// drew the outdoor wiring during an indoor step. Each page's own order held,
// so the order check alone passed it.
describe('one passage at a time', () => {
  const INDOOR = { id: 'b2', page: 60, group: CABLE_GROUP, text: '3 Bind all the power supply cord lead wire with tape. 4 Remove the tapes and connect the connection cable between indoor unit and outdoor unit according to the diagram below. - Secure the connection cable onto the control board with the holder.' };
  const blocks = [...BLOCKS, INDOOR];
  // f1-f3 wiring, f4 remove, f5 secure, f6 attach (page 56); f7 bind, f8 connect, f9 secure (page 60)
  const twoPageFacts = () => numberFacts(terminalTableFacts(blocks, SCOPE).facts, [
    RAW.remove, RAW.secure, RAW.attach,
    { type: 'action', blockId: 'b2', quote: '3 Bind all the power supply cord lead wire with tape.', verb: 'attach', verbText: 'Bind', object: 'power supply cord lead wire' },
    { type: 'action', blockId: 'b2', quote: '4 Remove the tapes and connect the connection cable between indoor unit and outdoor unit according to the diagram below.', verb: 'connect', verbText: 'connect', object: 'connection cable' },
    { type: 'action', blockId: 'b2', quote: 'Secure the connection cable onto the control board with the holder.', verb: 'secure', verbText: 'Secure', object: 'connection cable' },
  ].map(raw => verifyFact(raw, blocks, SCOPE).fact));
  const scene = (...steps) => ({ kind: 'procedural', unavailableReason: null, title: 'Connect the cable', parts: [], missingDetails: [],
    steps: steps.map(factIds => ({ factIds, motions: [] })) });
  const order = result => result.steps.map(step => step.factIds.join('+'));

  test('one procedure after the other is accepted as it is', () => {
    const facts = twoPageFacts();
    const tidy = scene(['f4'], ['f1', 'f2', 'f3'], ['f5'], ['f6'], ['f7'], ['f8'], ['f9']);
    expect(validateScene(tidy, facts, SCOPE)).toEqual({ status: 'ready', reasons: [] });
    expect(repairScene(tidy, facts, SCOPE)).toEqual({ scene: tidy, repairs: [] });
  });

  test('two procedures woven together are rejected, then untangled', () => {
    const facts = twoPageFacts();
    const woven = scene(['f4'], ['f7'], ['f8', 'f1', 'f2', 'f3'], ['f5'], ['f6'], ['f9']);
    const verdict = validateScene(woven, facts, SCOPE);
    expect(verdict.status).toBe('rejected');
    expect(verdict.reasons.join(' ')).toMatch(/passages_mixed/);
    expect(verdict.reasons.join(' ')).toMatch(/passages_interleaved/);

    const { scene: repaired } = repairScene(woven, facts, SCOPE);
    expect(validateScene(repaired, facts, SCOPE)).toEqual({ status: 'ready', reasons: [] });
    // The wiring goes back to its own page, between "remove" and "secure".
    expect(order(repaired)).toEqual(['f4', 'f1+f2+f3', 'f5', 'f6', 'f7', 'f8', 'f9']);
  });

  test('a note with no step in it stays with the step before it', () => {
    const facts = numberFacts(terminalTableFacts(blocks, SCOPE).facts, [RAW.remove, RAW.earth,
      { type: 'action', blockId: 'b2', quote: '3 Bind all the power supply cord lead wire with tape.', verb: 'attach', verbText: 'Bind', object: 'power supply cord lead wire' },
      RAW.secure].map(raw => verifyFact(raw, blocks, SCOPE).fact));
    // f4 remove (p56), f5 earth warning, f6 bind (p60), f7 secure (p56)
    const woven = scene(['f4'], ['f6'], ['f5'], ['f7']);
    const { scene: repaired } = repairScene(woven, facts, SCOPE);
    expect(validateScene(repaired, facts, SCOPE).status).toBe('ready');
    expect(order(repaired)).toEqual(['f4', 'f7', 'f6', 'f5']);
  });
});
