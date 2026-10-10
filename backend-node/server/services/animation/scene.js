// Animation feasibility spike: the scene a model may propose, and the checks
// that decide whether it can be shown.
//
// A scene is data, never code: a list of parts to draw and a list of steps,
// each pointing at verified facts (see facts.js). It has no coordinates, no
// captions and no markup. The player lays the parts out, and captions are the
// manual's own words, built here from the facts.
//
// A valid format is not a correct explanation, so the checks are about
// relationships: which terminal connects to which, which way a part moves,
// what order the steps come in, and what value a label shows.
//
// validateScene() only judges. repairScene() then fixes what can be fixed
// without inventing anything: it removes a drawing that fails a check, puts
// steps back in the manual's order, and adds a verified step or safety fact
// that was left out. Whatever is still wrong after that keeps the scene off
// the screen.

const { canonical, readable } = require('./facts');
const { figures } = require('../responseDetail');

const KINDS = ['procedural', 'conceptual', 'unavailable'];
const SHAPES = ['indoor_unit', 'outdoor_unit', 'unit', 'panel', 'cover', 'filter', 'cable', 'terminal_block', 'board', 'screw',
  'clamp', 'tape', 'hose', 'pipe', 'tool', 'remote', 'button', 'led', 'display', 'switch', 'bottle', 'generic'];
const MOTIONS = ['move_away', 'move_toward', 'rotate_ccw', 'rotate_cw', 'highlight', 'show_value', 'connect', 'flow'];
const LIMITS = { parts: 20, steps: 12, motionsPerStep: 6, title: 80, label: 40 };
const UNSAFE_TEXT = /[<>{}`]|javascript:|\bon\w+\s*=/i;
const SAFETY_TYPES = ['warning', 'prohibition', 'prerequisite'];
// Scope, decided by Adil on 8 Oct 2026 after seeing the first results: only
// procedures are animated. An explanation or a fault-code meaning has nothing
// to move, and came out as a highlighted box beside the manual's sentence.
// Set to true to show those again.
const SHOW_EXPLANATIONS = false;
const EXPLANATION_ONLY = 'explanation_only: this answer explains something; there is no procedure to animate';
const MODEL_NEEDED = 'model_needed: a step-by-step animation needs to know which model it is for';
const TOO_LITTLE = 'too_little_to_show: the manual passages give only one step for this, so there is nothing to animate';

const sameEnd = (a, b) => canonical(a.unit) === canonical(b.unit) && canonical(a.terminal) === canonical(b.terminal);
const measurement = (value, unit) => [...figures(`${value} ${unit}`)].find(figure => figure.includes(' '));
// The facts that make a scene a procedure, and that have a place in the
// manual's sequence: things done, and the wiring. Notes, values and safety
// facts may be shown wherever they help.
const isStepLike = fact => fact.type === 'action' || fact.type === 'connection';
// One fact comes before another when its quote ends before the other's begins.
// Two facts quoted from the same sentence have no order between them.
const comesBefore = (a, b) => a.blockId === b.blockId && a.end <= b.offset;

/**
 * Every problem with a scene, each tagged with how repairScene() may fix it.
 * @returns {{ verdict: 'ok'|'unavailable'|'malformed', issues: object[], reason?: string }}
 */
function inspect(scene, facts, scope) {
  if (!scene || !KINDS.includes(scene.kind) || !Array.isArray(scene.parts) || !Array.isArray(scene.steps)) {
    return { verdict: 'malformed', issues: [] };
  }
  if (scene.kind === 'unavailable') {
    return { verdict: 'unavailable', issues: [], reason: `declined: ${readable(scene.unavailableReason) || 'no reason given'}` };
  }
  if (scene.kind === 'conceptual' && !SHOW_EXPLANATIONS) return { verdict: 'unavailable', issues: [], reason: EXPLANATION_ONLY };
  // A procedure is for one machine. Without a known model it is not shown.
  if (scene.kind === 'procedural' && !scope?.group) return { verdict: 'unavailable', issues: [], reason: MODEL_NEEDED };

  const issues = [];
  const issue = (code, message, fix = null) => { issues.push({ code, message: message ? `${code}: ${message}` : code, ...fix }); };

  // ── Format ──────────────────────────────────────────────────────────────
  if (scene.parts.length > LIMITS.parts) issue('too_many_parts');
  if (scene.steps.length < 1 || scene.steps.length > LIMITS.steps) issue('step_count_out_of_range');
  if (typeof scene.title !== 'string' || scene.title.length > LIMITS.title || UNSAFE_TEXT.test(scene.title)) issue('bad_title', null, { fix: 'clear_title' });

  const factById = new Map(facts.map(fact => [fact.id, fact]));
  const partById = new Map();
  scene.parts.forEach((part, partIndex) => {
    const dropPart = { fix: 'drop_part', partIndex };
    if (!part || typeof part.id !== 'string' || partById.has(part.id)) { issue('bad_part_id', null, dropPart); return; }
    partById.set(part.id, part);
    if (!SHAPES.includes(part.shape)) issue('unknown_shape', part.id, { fix: 'generic_shape', partIndex });
    if (typeof part.label !== 'string' || !part.label.trim() || part.label.length > LIMITS.label || UNSAFE_TEXT.test(part.label)) {
      issue('bad_label', part.id, dropPart);
      return;
    }
    // A part's name must be the manual's, taken from the fact it points at.
    const fact = factById.get(part.factId);
    if (!fact) issue('part_without_fact', part.id, dropPart);
    else if (!canonical(fact.quote).includes(canonical(part.label))) issue('part_label_not_in_manual', `"${part.label}"`, dropPart);
  });
  const named = (part, fact) => part && typeof part.label === 'string' && canonical(fact.quote).includes(canonical(part.label));

  // ── Steps and motions ───────────────────────────────────────────────────
  const shownAt = new Map();           // factId -> first step index that shows it
  const shownEarlier = [];             // step-like facts from earlier steps, with the step that showed them
  let firstActionStep = null;
  let currentPassage = null;           // the passage the step-like steps are currently following
  const passagesLeft = new Set();      // passages already finished with

  scene.steps.forEach((step, stepIndex) => {
    const number = stepIndex + 1;
    if (!step || !Array.isArray(step.factIds) || !step.factIds.length || !Array.isArray(step.motions)) {
      issue('malformed_step', `${number}`, { fix: 'drop_step', stepIndex });
      return;
    }

    const stepFacts = [];
    for (const id of step.factIds) {
      const fact = factById.get(id);
      if (!fact) { issue('unknown_fact', `${id} in step ${number}`, { fix: 'drop_fact_ref', stepIndex, factId: id }); continue; }
      stepFacts.push(fact);
      if (!shownAt.has(id)) shownAt.set(id, stepIndex);
    }

    // Sequence: within one passage, steps follow the manual's order.
    const placed = stepFacts.filter(isStepLike);
    if (placed.length && firstActionStep === null) firstActionStep = stepIndex;
    for (const fact of placed) {
      const later = shownEarlier.find(earlier => comesBefore(fact, earlier.fact));
      if (later) issue('step_out_of_order', `step ${number} comes before step ${later.step + 1} in the manual`, { fix: 'reorder' });
    }
    for (const fact of placed) shownEarlier.push({ fact, step: stepIndex });

    // One passage at a time. The manual gives the order within a passage; it
    // says nothing about weaving one procedure's steps into another's.
    const passages = [...new Set(placed.map(fact => fact.blockId))];
    if (passages.length > 1) issue('passages_mixed', `step ${number} mixes steps from two places in the manual`, { fix: 'reorder' });
    for (const blockId of passages) {
      if (passagesLeft.has(blockId)) issue('passages_interleaved', `step ${number} returns to an earlier part of the manual`, { fix: 'reorder' });
    }
    if (passages.length === 1 && currentPassage !== null && currentPassage !== passages[0]) passagesLeft.add(currentPassage);
    if (passages.length === 1) currentPassage = passages[0];

    step.motions.forEach((motion, motionIndex) => {
      const dropMotion = { fix: 'drop_motion', stepIndex, motionIndex };
      if (motionIndex >= LIMITS.motionsPerStep) { issue('too_many_motions', `step ${number}`, dropMotion); return; }
      if (!motion || !MOTIONS.includes(motion.kind)) { issue('unknown_motion', `step ${number}`, dropMotion); return; }
      const fact = factById.get(motion.factId);
      if (!fact || !step.factIds.includes(motion.factId)) { issue('motion_without_fact', `step ${number}`, dropMotion); return; }
      const part = partById.get(motion.part);
      const target = motion.target == null ? null : partById.get(motion.target);
      if (!part || (motion.target != null && !target)) { issue('motion_on_unknown_part', `step ${number}`, dropMotion); return; }
      // The thing that moves must be named in the sentence that says it moves.
      if (!named(part, fact) || (target && !named(target, fact))) { issue('motion_part_not_in_fact', `step ${number}`, dropMotion); return; }

      if (motion.kind === 'connect') {
        const from = { unit: motion.fromUnit, terminal: motion.fromTerminal };
        const to = { unit: motion.toUnit, terminal: motion.toTerminal };
        const matches = fact.type === 'connection' &&
          ((sameEnd(from, fact.from) && sameEnd(to, fact.to)) || (sameEnd(from, fact.to) && sameEnd(to, fact.from)));
        if (!matches) issue('wrong_connection', `step ${number} joins ${from.unit} ${from.terminal} to ${to.unit} ${to.terminal}`, dropMotion);
      } else if (motion.kind === 'move_away' || motion.kind === 'move_toward') {
        const wanted = motion.kind === 'move_away' ? 'away' : 'toward';
        if (fact.type !== 'action' || fact.direction !== wanted) issue('wrong_direction', `step ${number} moves "${part.label}" ${wanted} but the manual says "${fact.verbText || fact.type}"`, dropMotion);
      } else if (motion.kind === 'rotate_ccw' || motion.kind === 'rotate_cw') {
        const wanted = motion.kind === 'rotate_ccw' ? 'loosen' : 'tighten';
        if (fact.type !== 'action' || fact.verb !== wanted) issue('wrong_rotation', `step ${number} turns "${part.label}" to ${wanted} but the manual says "${fact.verbText || fact.type}"`, dropMotion);
      } else if (motion.kind === 'show_value') {
        if (fact.type !== 'quantity' || measurement(motion.value, motion.unit) !== fact.figure) issue('wrong_value', `step ${number} shows ${motion.value} ${motion.unit}`, dropMotion);
      } else if (motion.kind === 'flow') {
        if (scene.kind !== 'conceptual' || fact.type !== 'statement' || !target) issue('flow_not_supported', `step ${number}`, dropMotion);
      }
      // "highlight" asserts nothing beyond the part being named in the fact.
    });
  });

  // ── Safety facts ────────────────────────────────────────────────────────
  for (const fact of facts.filter(fact => SAFETY_TYPES.includes(fact.type))) {
    const at = shownAt.get(fact.id);
    if (at === undefined) issue('safety_fact_not_shown', `${fact.type} ${fact.id}`, { fix: 'show_first', factId: fact.id });
    else if (fact.type === 'prerequisite' && firstActionStep !== null && at > firstActionStep) issue('prerequisite_after_first_action', fact.id, { fix: 'show_first', factId: fact.id });
  }

  // ── A procedure shows every step that was found for it ──────────────────
  if (scene.kind === 'procedural') {
    for (const fact of facts.filter(fact => fact.type === 'action')) {
      if (!shownAt.has(fact.id)) issue('action_not_shown', fact.id, { fix: 'add_step', factId: fact.id });
    }
  }

  // ── Something to show ───────────────────────────────────────────────────
  const shown = [...shownAt.keys()].map(id => factById.get(id));
  // Calling a scene "conceptual" does not make its steps safe to show for an
  // unknown machine: anything with actions or connections needs the model.
  if (!scope?.group && shown.some(isStepLike)) return { verdict: 'unavailable', issues: [], reason: MODEL_NEEDED };
  // One step is not an animation. Found in the third run: "Replace the drain
  // hose" was shown on its own, twice, for "how do I install the drain hose?".
  // Every action fact has to be shown in a procedure, so they are all counted.
  if (scene.kind === 'procedural') {
    const steps = new Set([
      ...facts.filter(fact => fact.type === 'action').map(fact => canonical(fact.quote)),
      ...shown.filter(fact => fact.type === 'connection').map(fact => `${fact.blockId} ${fact.from.terminal} ${fact.to.terminal}`),
    ]);
    if (steps.size === 1) return { verdict: 'unavailable', issues: [], reason: TOO_LITTLE };
  }
  if (scene.kind === 'procedural' && !shown.some(isStepLike)) issue('procedure_without_steps');
  if (!shown.length) issue('nothing_to_show');

  return { verdict: 'ok', issues };
}

/**
 * @param {object} scene   as proposed by the model, or as repaired
 * @param {object[]} facts verified, numbered facts
 * @param {{ group: string|null }} scope  the equipment the answer is about
 * @returns {{ status: 'ready'|'unavailable'|'rejected', reasons: string[] }}
 */
function validateScene(scene, facts, scope) {
  const { verdict, issues, reason } = inspect(scene, facts, scope);
  if (verdict === 'malformed') return { status: 'rejected', reasons: ['malformed_scene'] };
  if (verdict === 'unavailable') return { status: 'unavailable', reasons: [reason] };
  return { status: issues.length ? 'rejected' : 'ready', reasons: issues.map(found => found.message) };
}

// The steps in the manual's order, changing the model's arrangement as little
// as possible: a step moves only when a step-like fact in it has to come
// before or after one in another step. Returns null when no arrangement of
// these steps works, which happens when one step holds facts from two places
// in the manual and another step belongs between them.
function inManualOrder(steps, factById) {
  const placed = steps.map(step => (step.factIds || []).map(id => factById.get(id)).filter(fact => fact && isStepLike(fact)));
  const mustFollow = steps.map(() => new Set());
  steps.forEach((_, earlier) => steps.forEach((__, later) => {
    if (earlier !== later && placed[earlier].some(a => placed[later].some(b => comesBefore(a, b)))) mustFollow[later].add(earlier);
  }));
  const done = new Set();
  const order = [];
  while (order.length < steps.length) {
    const next = steps.findIndex((_, index) => !done.has(index) && [...mustFollow[index]].every(before => done.has(before)));
    if (next < 0) return null;
    done.add(next);
    order.push(steps[next]);
  }
  return order;
}

// Split a step that holds facts from more than one place in the manual, one
// piece per place. Notes, values and safety facts stay with the first piece.
function splitByPlace(steps, factById) {
  return steps.flatMap(step => {
    const facts = (step.factIds || []).map(id => factById.get(id)).filter(Boolean);
    const placed = facts.filter(isStepLike).sort((a, b) => a.blockId.localeCompare(b.blockId) || a.offset - b.offset);
    const groups = [];
    for (const fact of placed) {
      const last = groups[groups.length - 1];
      if (last && last.blockId === fact.blockId && fact.offset < last.end) { last.ids.push(fact.id); last.end = Math.max(last.end, fact.end); }
      else groups.push({ blockId: fact.blockId, end: fact.end, ids: [fact.id] });
    }
    if (groups.length < 2) return [step];
    const elsewhere = new Set(groups.slice(1).flatMap(group => group.ids));
    return groups.map((group, index) => {
      const ids = index === 0 ? step.factIds.filter(id => !elsewhere.has(id)) : group.ids;
      return { factIds: ids, motions: (step.motions || []).filter(motion => motion && ids.includes(motion.factId)) };
    });
  });
}

// Split a step whose step-like facts come from more than one passage, one
// piece per passage. Everything else in the step stays with the first piece.
function splitByPassage(steps, factById) {
  return steps.flatMap(step => {
    const placed = (step.factIds || []).map(id => factById.get(id)).filter(fact => fact && isStepLike(fact));
    const passages = [...new Set(placed.map(fact => fact.blockId))];
    if (passages.length < 2) return [step];
    const idsFor = blockId => placed.filter(fact => fact.blockId === blockId).map(fact => fact.id);
    const elsewhere = new Set(passages.slice(1).flatMap(idsFor));
    return passages.map((blockId, index) => {
      const ids = index === 0 ? step.factIds.filter(id => !elsewhere.has(id)) : idsFor(blockId);
      return { factIds: ids, motions: (step.motions || []).filter(motion => motion && ids.includes(motion.factId)) };
    });
  });
}

// Keep each passage's steps together, passages in the order the model first
// used them. A step with nothing step-like in it travels with the step before
// it; any such steps at the very start stay at the start.
function onePassageAtATime(steps, factById) {
  const order = [];
  let current = null;
  const keyed = steps.map(step => {
    const own = (step.factIds || []).map(id => factById.get(id)).find(fact => fact && isStepLike(fact));
    if (own) current = own.blockId;
    if (current !== null && !order.includes(current)) order.push(current);
    return { step, rank: current === null ? -1 : order.indexOf(current) };
  });
  return keyed.sort((a, b) => a.rank - b.rank).map(item => item.step);   // Array.prototype.sort is stable
}

function reorderSteps(scene, facts) {
  const factById = new Map(facts.map(fact => [fact.id, fact]));
  scene.steps = onePassageAtATime(splitByPassage(scene.steps, factById), factById);
  let ordered = inManualOrder(scene.steps, factById);
  if (!ordered) {
    scene.steps = splitByPlace(scene.steps, factById);
    ordered = inManualOrder(scene.steps, factById);
  }
  if (ordered) scene.steps = ordered;
}

/**
 * Fix what can be fixed without inventing anything.
 *
 * Removing a drawing never adds a claim, the manual's order is known, and a
 * verified safety fact is always safe to show. Nothing else is changed.
 *
 * @returns {{ scene: object, repairs: string[] }} a repaired copy and what was done
 */
function repairScene(scene, facts, scope) {
  const repaired = JSON.parse(JSON.stringify(scene ?? null));
  const repairs = [];

  for (let pass = 0; pass < 6; pass++) {
    const { verdict, issues } = inspect(repaired, facts, scope);
    const fixable = verdict === 'ok' ? issues.filter(found => found.fix) : [];
    if (!fixable.length) break;
    repairs.push(...fixable.map(found => `${found.fix}: ${found.message}`));

    // Indexes shift as things are removed, so mark first and sweep after.
    const gone = Symbol('removed');
    let reorder = false;
    for (const found of fixable) {
      const step = found.stepIndex === undefined ? null : repaired.steps[found.stepIndex];
      if (found.fix === 'clear_title') repaired.title = '';
      else if (found.fix === 'generic_shape') repaired.parts[found.partIndex].shape = 'generic';
      else if (found.fix === 'drop_part') repaired.parts[found.partIndex] = gone;
      else if (found.fix === 'drop_step') repaired.steps[found.stepIndex] = gone;
      else if (found.fix === 'drop_motion' && step !== gone) step.motions[found.motionIndex] = gone;
      else if (found.fix === 'drop_fact_ref' && step !== gone) step.factIds = step.factIds.filter(id => id !== found.factId);
      else if (found.fix === 'reorder') reorder = true;
      // A step the model left out goes in as text only, at its place in the manual.
      else if (found.fix === 'add_step') { repaired.steps.push({ factIds: [found.factId], motions: [] }); reorder = true; }
      else if (found.fix === 'show_first') {
        for (const each of repaired.steps) if (each !== gone && Array.isArray(each.factIds)) each.factIds = each.factIds.filter(id => id !== found.factId);
        const first = repaired.steps.find(each => each !== gone && Array.isArray(each.factIds));
        if (first) first.factIds.unshift(found.factId);
      }
    }
    repaired.parts = repaired.parts.filter(part => part !== gone);
    const partIds = new Set(repaired.parts.map(part => part.id));
    repaired.steps = repaired.steps.filter(step => step !== gone);
    for (const step of repaired.steps) {
      if (!Array.isArray(step.motions)) continue;
      // A motion goes with its part, and with the fact its step no longer shows.
      step.motions = step.motions.filter(motion => motion !== gone && partIds.has(motion?.part) &&
        (motion.target == null || partIds.has(motion.target)) && (step.factIds || []).includes(motion?.factId));
    }
    repaired.steps = repaired.steps.filter(step => Array.isArray(step.factIds) && step.factIds.length);
    if (reorder) reorderSteps(repaired, facts);
  }
  return { scene: repaired, repairs };
}

/**
 * The words shown with each step: the manual's own, never the model's.
 * @returns {Array<Array<{ type: string, text: string, page: number }>>}
 */
function buildCaptions(scene, facts) {
  const factById = new Map(facts.map(fact => [fact.id, fact]));
  const sentence = text => text.charAt(0).toUpperCase() + text.slice(1);
  return scene.steps.map(step => (step.factIds || []).map(id => factById.get(id)).filter(Boolean).map(fact => ({
    type: fact.type,
    page: fact.page,
    text: fact.type === 'connection'
      ? `${sentence(fact.from.unit)} terminal ${fact.from.terminal} connects to ${fact.to.unit} terminal ${fact.to.terminal}`
      : readable(fact.quote),
  })));
}

module.exports = { validateScene, repairScene, buildCaptions, KINDS, SHAPES, MOTIONS, LIMITS };
