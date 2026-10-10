// From a checked animation to what is drawn for one step.
//
// What moves, and which way, comes from each fact's verb and object. The server
// checked both against the manual's sentence, so nothing here is the model's
// own idea of the drawing. The model's suggestions are used only where they
// add a part to point at. No drawing library is used in this file.

// The stage is 420 x 262 units; the player scales it to the screen.
export const STAGE = { width: 420, height: 262 };

export const KIND_LABELS = {
  action: 'Step', connection: 'Wiring', quantity: 'Value', warning: 'Warning',
  prohibition: 'Do not', prerequisite: 'Before you start', statement: 'Note',
};
export const isSafety = type => type === 'warning' || type === 'prohibition' || type === 'prerequisite';

const SHAPES = ['indoor_unit', 'outdoor_unit', 'unit', 'cover', 'panel', 'screw', 'cable', 'terminal_block', 'board', 'clamp', 'tape',
  'filter', 'hose', 'pipe', 'tool', 'remote', 'button', 'led', 'display', 'switch', 'bottle', 'generic'];

// The picture is chosen from the manual's own name for the part first, and
// from the model's suggestion only when the name gives no clue.
const SHAPE_WORDS = [
  [/indoor unit/, 'indoor_unit'], [/outdoor unit/, 'outdoor_unit'], [/display/, 'display'], [/button/, 'button'], [/remote/, 'remote'],
  [/holder|clamp/, 'clamp'], [/\bleds?\b|\blamps?\b|indicator/, 'led'], [/screw|bolt/, 'screw'], [/cover|panel|grille|door|\blid\b/, 'cover'], [/terminal/, 'terminal_block'],
  [/board|pcb/, 'board'], [/tape/, 'tape'], [/filter/, 'filter'], [/hose/, 'hose'], [/pip(e|ing)|tube/, 'pipe'],
  [/cable|wire|cord|\blead\b/, 'cable'], [/power supply|switch|breaker|plug/, 'switch'], [/detergent|soap/, 'bottle'],
  [/driver|wrench|cutter|reamer|\btool\b/, 'tool'], [/\bunit\b/, 'unit'],
];

const lc = text => String(text == null ? '' : text).toLowerCase();
const tidyUnit = unit => String(unit || '').replace(/\\text\{([^}]*)\}/g, '$1').replace(/\^\{?2\}?/g, '²').replace(/[\\$]/g, '');
export const capitalise = text => { const value = String(text || ''); return value.charAt(0).toUpperCase() + value.slice(1); };

export function shapeOf(part) {
  const name = lc(part.label);
  const named = SHAPE_WORDS.find(([words]) => words.test(name));
  if (named) return named[1];
  return part.shape && part.shape !== 'generic' && SHAPES.includes(part.shape) ? part.shape : 'generic';
}

const longest = (best, part) => !best || lc(part.label).length > lc(best.label).length;

function partNamedIn(parts, text, skip = []) {
  const haystack = lc(text);
  let best = null;
  parts.forEach((part) => {
    const name = lc(part.label);
    if (name && haystack.includes(name) && !skip.includes(part.id) && longest(best, part)) best = part;
  });
  return best;
}

function partForObject(parts, object) {
  const wanted = lc(object);
  let best = null;
  let bestAt = Infinity;
  parts.forEach((part) => {
    const name = lc(part.label);
    let at = name ? wanted.indexOf(name) : -1;
    if (at < 0 && name && wanted && name.includes(wanted)) at = 0;
    if (at < 0) return;
    if (at < bestAt || (at === bestAt && longest(best, part))) { best = part; bestAt = at; }
  });
  return best || { id: `object:${wanted}`, label: String(object || '').replace(/^(the|a|an)\s+/i, ''), shape: 'generic' };
}

function partAfter(parts, text, words, skip) {
  const haystack = lc(text);
  let best = null;
  parts.forEach((part) => {
    if (skip.includes(part.id)) return;
    const name = lc(part.label).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (name && new RegExp(`\\b(?:${words})\\s+(?:the\\s+|a\\s+|an\\s+)?${name}`).test(haystack) && longest(best, part)) best = part;
  });
  return best;
}

export function effectOf(fact) {
  if (fact.verb === 'loosen') return 'ccw';
  if (fact.verb === 'tighten') return 'cw';
  if (fact.direction === 'away') return 'away';
  if (fact.direction === 'toward') return 'toward';
  if (/press|push/.test(lc(fact.verbText))) return 'press';
  if (fact.verb === 'clean') return 'clean';
  if (fact.verb === 'check') return 'check';
  if (fact.verb === 'replace') return 'replace';
  if (fact.verb === 'switch_off') return 'off';
  if (fact.verb === 'wait') return 'wait';
  return 'highlight';
}

const stepFacts = (animation, step) => {
  const byId = new Map(animation.facts.map(fact => [fact.id, fact]));
  return (step.factIds || []).map(id => byId.get(id)).filter(Boolean);
};

/** The parts shown for a step and what each does: at most three. */
export function actorsFor(animation, step) {
  const parts = animation.parts || [];
  const facts = stepFacts(animation, step);
  const actors = [];
  const seen = new Map();
  const add = (actor) => {
    if (seen.has(actor.part.id)) return seen.get(actor.part.id);
    seen.set(actor.part.id, actor); actors.push(actor);
    return actor;
  };

  facts.filter(fact => fact.type === 'action').forEach((fact) => {
    const part = partForObject(parts, fact.object);
    const effect = effectOf(fact);
    const actor = add({ part, effect, tag: lc(fact.verbText) });
    if (actor.effect !== effect || actor.tag !== lc(fact.verbText)) return;
    const skip = [part.id];
    if (effect === 'toward') actor.target = partAfter(parts, fact.text, 'onto|into|to|on|in|at|between', skip);
    if (effect === 'away') actor.source = partAfter(parts, fact.text, 'from|off', skip);
    if (actor.target) skip.push(actor.target.id);
    if (actor.source) skip.push(actor.source.id);
    actor.instrument = partAfter(parts, fact.text, 'with|using', skip);
  });
  facts.filter(fact => fact.type === 'quantity').forEach((fact) => {
    const part = partNamedIn(parts, fact.subject) || partNamedIn(parts, fact.text) || partForObject(parts, fact.subject);
    const actor = add({ part, effect: 'none', tag: '' });
    const value = `${fact.value} ${tidyUnit(fact.unit)}`.trim();
    if (!(actor.values || []).includes(value)) actor.values = [...(actor.values || []), value];
  });
  facts.filter(fact => fact.type === 'prerequisite' && /(switch|turn|power)\w*\s+off|unplug|isolat/.test(lc(fact.text))).forEach((fact) => {
    const part = partNamedIn(parts, fact.text);
    if (part) add({ part, effect: 'off', tag: 'off' });
  });
  facts.filter(fact => fact.type === 'statement').forEach((fact) => {
    const part = partNamedIn(parts, fact.text);
    if (part) add({ part, effect: 'highlight', tag: '' });
  });
  (step.motions || []).forEach((motion) => {
    const part = parts.find(candidate => candidate.id === motion.part);
    if (part && motion.kind === 'highlight') add({ part, effect: 'highlight', tag: '' });
  });

  // Loosening comes before taking off, and tightening after fitting on.
  const rank = { ccw: 0, away: 1, toward: 2, cw: 3 };
  const order = actor => rank[actor.effect] ?? 1.5;
  return actors.map((actor, index) => ({ actor, index }))
    .sort((a, b) => (order(a.actor) - order(b.actor)) || (a.index - b.index))
    .map(item => item.actor).slice(0, 3);
}

const picture = (part, x, y, scale) => ({ shape: shapeOf(part), label: part.label, x, y, scale });

// Where one actor and what belongs to it sit on the stage.
function placeActor(actor, cx, cy, s, alone) {
  const context = actor.target || actor.source;
  const ax = context ? cx + 22 * s : cx;
  const ay = context ? cy - 14 * s : cy;
  const moving = actor.effect === 'away' || actor.effect === 'toward';
  const dx = moving ? 38 * s : 0;
  const dy = moving ? -36 * s : 0;
  const placed = {
    key: actor.part.id, effect: actor.effect, values: (actor.values || []).slice(0, 2),
    part: picture(actor.part, ax, ay, s), dx, dy,
    // Beside something it goes onto or comes off, its name moves aside so the two names do not collide.
    label: { text: actor.part.label, x: context ? ax + 22 * s : ax, y: cy + 62 * s, wide: alone && !context },
    tag: actor.tag ? { text: actor.tag, x: moving ? ax - 46 * s : ax, y: moving ? ay - 74 * s : actor.effect === 'press' ? ay - 68 * s : ay - 54 * s } : null,
  };
  if (context) placed.context = { ...picture(context, cx - 50 * s, cy + 14 * s, s * 0.95), labelX: cx - 66 * s };
  if (moving) {
    // The dashed outline is where the part is before it moves.
    const gx = actor.effect === 'away' ? ax : ax + dx;
    const gy = actor.effect === 'away' ? ay : ay + dy;
    placed.ghost = { x: gx - 48 * s, y: gy - 32 * s, width: 96 * s, height: 64 * s };
    const near = [ax - 58 * s, ay - 40 * s];
    const far = [near[0] + dx * 0.6, near[1] + dy * 0.6];
    const [from, to] = actor.effect === 'away' ? [near, far] : [far, near];
    placed.arrow = { x1: from[0], y1: from[1], x2: to[0], y2: to[1] };
  }
  if (['check', 'replace', 'wait'].includes(actor.effect)) placed.badge = { kind: actor.effect, x: ax + 50 * s, y: ay - 34 * s };
  if (actor.instrument && alone) placed.instrument = picture(actor.instrument, cx + 158, cy + 26, 0.62);
  return placed;
}

/**
 * Everything the stage draws for one step.
 * @returns {{ wiring: object|null, actors: object[], safety: boolean, empty: boolean }}
 */
export function stepLayout(animation, index) {
  const step = animation.steps[index];
  const facts = stepFacts(animation, step);
  const safety = facts.some(fact => isSafety(fact.type));
  const wires = facts.filter(fact => fact.type === 'connection' && fact.from && fact.to);

  if (wires.length) {
    const count = wires.length;
    const top = count > 1 ? 70 : 104;
    const gap = count > 1 ? Math.min(36, 104 / (count - 1)) : 0;
    return {
      safety, empty: false, actors: [],
      wiring: {
        top, bottom: top + gap * (count - 1),
        fromUnit: capitalise(wires[0].from.unit), toUnit: capitalise(wires[0].to.unit),
        wires: wires.map((fact, i) => ({ y: top + i * gap, from: String(fact.from.terminal), to: String(fact.to.terminal) })),
        coloursMissing: (animation.missingDetails || []).some(item => /colou?r/i.test(item)),
      },
    };
  }

  const actors = actorsFor(animation, step);
  const slots = { 1: [200], 2: [106, 300], 3: [72, 210, 344] }[actors.length] || [];
  const scale = { 1: 1.12, 2: 0.9, 3: 0.68 }[actors.length];
  return {
    safety, wiring: null, empty: actors.length === 0,
    actors: actors.map((actor, i) => placeActor(actor, actor.instrument && actors.length === 1 ? 150 : slots[i], 118, scale, actors.length === 1)),
  };
}

// A stored animation is drawn only if it has the shape the player expects.
export function isPlayable(animation) {
  return !!animation && Array.isArray(animation.steps) && animation.steps.length > 0 && Array.isArray(animation.facts) &&
    Array.isArray(animation.parts) && Array.isArray(animation.captions) && animation.captions.length === animation.steps.length;
}
