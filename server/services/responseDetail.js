// Response detail (Brief / Standard / Detailed) for /api/query.
//
// Standard adds nothing to the prompt, so it is today's request exactly. Brief
// and Detailed are written that way by the answer model itself; nothing is
// rewritten afterwards. This changes how much is explained, not the user's
// skill level and not the model.

const DETAILED_TOP_K = 8;

const RULES = {
  brief: `

Brief response: answer in as few words as the question allows. Use a short
numbered list for a procedure, so the order is kept, and short bullets or one
short paragraph otherwise. Leave out background, repeated model names,
introductions and summaries. Do NOT leave out anything a technician needs to do
the job safely: keep every step, order, prerequisite, warning, prohibition and
every quantity with its unit, with the same values as the manual extracts. Being
brief is never a reason to drop a warning or a step. Write measurements as
plain text (4 × 1.5 mm², 40 °C), never as LaTeX or formulas. Keep the page
citations. Use only the manual extracts; if they do not cover the question, say
so briefly.`,
  detailed: `

Detailed response: keep all safety rules and the user's skill-level requirements.
Start with the complete steps or the direct answer, in order, before any summary
or compliance section: every step a standard answer would give, from all the
relevant extracts, none left out. Then go further than a standard answer would, but only with
what the manual extracts say about THIS task:
- the specifications, part numbers, limits and cable or part types the extracts
  give for it, each with its page;
- every warning and precaution the extracts give for it;
- a reason or consequence for a step ONLY where the extracts state one. Do not
  write your own "skipping this may..." or "this protects..." explanations;
- tools ONLY if the extracts name them for this task;
- checks to make afterwards ONLY if the extracts give them.
Extracts about a different job (for example piping, when the question is about
wiring) are not part of this task: leave their tools, warnings and checks out.
Explain only what the manual extracts support, and cite the page for each point.
Write measurements as plain text (4 × 1.5 mm², 40 °C), never as LaTeX. Do not
invent missing details or pad the answer; a shorter answer is better than an
unsupported one. End with a short "Not covered in the manual" line listing
anything relevant the extracts do not say.`,
};

const detailRules = detail => RULES[detail] || '';

// The ingested manuals hold some measurements as LaTeX, and the answer model
// sometimes copies them out as "$4 \times 1.5 , \text{mm}^2$". The app shows
// that literally, so turn it back into "4 × 1.5 mm²".
const tidyMath = inner => inner
  .replace(/\\times/g, '×')
  .replace(/\\,|\s,\s/g, ' ')
  .replace(/\\text\{([^}]*)\}/g, '$1')
  .replace(/\^\{?2\}?/g, '²')
  .replace(/\\/g, '')
  .replace(/\s+/g, ' ')
  .trim();

const plainMeasurements = text => text
  .replace(/\$([^$\n]{1,80})\$/g, (span, inner) => /\\[a-z]|\^/i.test(inner) ? tidyMath(inner) : span)
  .replace(/\\text\{([^}]*)\}\^\{?2\}?/g, '$1²')
  .replace(/\\~/g, '~');

// ── Brief number check ────────────────────────────────────────────────────────
//
// A Brief answer has no longer answer beside it to compare against, so the
// figures in it are checked against the manual text the answer was written
// from. A measurement ("40 °C", "1.5 mm²", "2 weeks") or a code ("H11",
// "CS-S10TKH") that is not in that text fails the check, and the caller
// answers in Standard instead.
//
// This catches invented or altered figures. It cannot tell whether a
// precaution was left out, and bare numbers (step numbers, terminal numbers)
// are not checked.

const UNITS = ['mm²', 'mm2', 'mm', 'cm', 'm', '°c', '°f', 'kv', 'v', 'ma', 'a', 'kw', 'w', 'hz', '%',
  'kg', 'g', 'mpa', 'kpa', 'psi', 'bar', 'n·m', 'nm', 'hp', 'ml', 'l', 'ω', 'ohms?',
  'seconds?', 'secs?', 'minutes?', 'mins?', 'hours?', 'hrs?', 'days?', 'weeks?', 'months?', 'years?', 'times?'];
const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const UNIT = `(${UNITS.join('|')})(?![a-z²°])`;
const MEASUREMENT = new RegExp(String.raw`(${NUMBER})\s*${UNIT}`, 'gi');
// "1.0–1.5 HP" states both ends, so the lower figure carries the unit too.
const RANGE = new RegExp(String.raw`(${NUMBER})\s*(?:–|-|~|/|to)\s*${NUMBER}\s*${UNIT}`, 'gi');

// The ingested manuals carry Markdown and LaTeX leftovers: "1.0 \~ 1.5HP",
// "$4 \times 2.5 \text{mm}^2$". Read them as the plain figures they stand for.
const plain = text => text
  .replace(/\\times\b/g, '×')
  .replace(/\\text\{([^}]*)\}/g, '$1')
  .replace(/\^\{?2\}?/g, '²')
  .replace(/[\\$]/g, '');
const CODE = /\b(?=[A-Z0-9-]*\d)(?=[A-Z0-9-]*[A-Z])[A-Z0-9]+(?:-[A-Z0-9]+)*\b/g;
const ALIASES = { mm2: 'mm²', sec: 'second', min: 'minute', hr: 'hour', hrs: 'hour', ohm: 'ω' };

function unitKey(unit) {
  const lower = unit.toLowerCase();
  const singular = lower.length > 3 && lower.endsWith('s') ? lower.slice(0, -1) : lower;
  return ALIASES[singular] || singular;
}

function figures(raw) {
  const text = plain(raw);
  const found = new Set();
  for (const pattern of [MEASUREMENT, RANGE]) {
    for (const [, value, unit] of text.matchAll(pattern)) {
      found.add(`${value.replace(',', '.')} ${unitKey(unit)}`);
    }
  }
  for (const [code] of text.matchAll(CODE)) found.add(code);
  return found;
}

/**
 * @param {string} answer      the Brief answer
 * @param {string[]} evidence  everything the answer may legitimately quote
 *                             figures from: manual extracts, the question,
 *                             a quoted passage, a model read from a photo
 * @returns {{ ok: boolean, missing: string[] }}
 */
function checkBriefFigures(answer, evidence) {
  const known = figures(evidence.filter(part => typeof part === 'string').join('\n'));
  const missing = [...figures(answer)].filter(figure => !known.has(figure));
  return { ok: missing.length === 0, missing };
}

// ── Brief against Standard ────────────────────────────────────────────────────
//
// Found live: on a cable-connection question, Brief left out the earth-wire
// warning that Standard gave. So Brief is compared with the Standard answer
// written for the same question, and must keep:
//   - every measurement Standard states, and
//   - every kind of safety item Standard mentions (below),
// as long as the manual text has it too. Standard sometimes adds things the
// manual does not say (a Fahrenheit conversion, generic protective gear), and
// Brief is not held to those.
//
// This is a word-level comparison. It catches a safety topic that has gone
// missing, not one that is still mentioned but has been reworded wrongly, and
// it only knows the topics listed here.
const SAFETY_ITEMS = {
  'power off':        /\b(?:switch(?:ed|ing)?|turn(?:ed|ing)?|power(?:ed|ing)?|shut(?:ting)?)\s+(?:\w+\s+){0,3}off\b|\bisolat\w*|\bde-?energi[sz]\w*|\bdisconnect\w*\s+(?:the\s+)?(?:power|mains|supply)/i,
  'unplug':           /\bunplug\w*/i,
  'lockout':          /\block-?out\b|\bloto\b|\btag-?out\b/i,
  'earth':            /\bearth\w*|\bground(?:ed|ing)?\b/i,
  'prohibition':      /\bdo\s+not\b|\bdon't\b|\bnever\b|\bmust\s+not\b/i,
  'protective gear':  /\bppe\b|\bgloves?\b|\bgoggles\b|\bprotective\b/i,
  'electric shock':   /\bshock\b|\belectrocut\w*/i,
  'fire':             /\bfire\b|\bflammable\b|\bignit\w*/i,
  'explosion':        /\bexplo[sd]\w*/i,
  'leak':             /\bleak\w*/i,
  'burn':             /\bburns?\b|\bscald\w*/i,
  'toxic':            /\btoxic\b|\bpoison\w*/i,
  'refrigerant':      /\brefrigerant\b/i,
  'qualified person': /\bqualified\b|\bauthori[sz]ed\b|\blicen[sc]ed\b/i,
};
// "Do not use water above 40 °C" and "water not exceeding 40 °C" say the same
// thing, so in the Brief answer any negative wording counts as a prohibition.
const ANY_NEGATIVE = /\bnot\b|\bnever\b|\bno\b|\bavoid\w*|\bwithout\b|n't\b/i;

/**
 * @param {string} brief       the Brief answer
 * @param {string} standard    the Standard answer to the same question
 * @param {string[]} evidence  the manual text both were written from
 * @returns {{ ok: boolean, missing: string[] }}  measurements and safety items
 *          that the manual and Standard both have and Brief lacks
 */
function checkBriefKeepsSafety(brief, standard, evidence) {
  const manual = evidence.filter(part => typeof part === 'string').join('\n');
  const inManual = figures(manual);
  const inBrief = figures(brief);
  const isMeasurement = figure => figure.includes(' ');
  const missing = [...figures(standard)]
    .filter(figure => isMeasurement(figure) && inManual.has(figure) && !inBrief.has(figure));
  for (const [item, pattern] of Object.entries(SAFETY_ITEMS)) {
    const kept = item === 'prohibition' ? ANY_NEGATIVE.test(brief) : pattern.test(brief);
    if (pattern.test(standard) && pattern.test(manual) && !kept) missing.push(item);
  }
  return { ok: missing.length === 0, missing };
}

module.exports = { detailRules, checkBriefFigures, checkBriefKeepsSafety, figures, plainMeasurements, DETAILED_TOP_K };
