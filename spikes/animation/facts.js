// Animation feasibility spike: the facts an animation may show, and the checks
// that tie each one to the manual text.
//
// Nothing here calls a model. A model proposes facts; this file decides which
// of them are backed by the retrieved passages. Wiring connections are never
// taken from a model at all: they come only from terminal tables read here.

const { figures } = require('../../server/services/responseDetail');

// The ingested manuals carry LaTeX and Markdown leftovers ("$4 \times 1.5 \,
// \text{mm}^2$", "1.0 \~ 1.5HP", "mm$^{2}$", "TIMER $\leftarrow$"), and a
// model copying a sentence tends to write the plain form.
const SYMBOLS = { times: '×', leftarrow: '←', rightarrow: '→', uparrow: '↑', downarrow: '↓', simeq: '≃', geq: '≥', leq: '≤', pm: '±' };
const plainSymbols = text => String(text ?? '')
  .replace(/\\(times|leftarrow|rightarrow|uparrow|downarrow|simeq|geq|leq|pm)\b/g, (match, name) => SYMBOLS[name])
  .replace(/\\text\{([^}]*)\}/g, '$1')
  .replace(/\^\{?\\circ\}?/g, '°')
  .replace(/\^\{?2\}?/g, '²')
  .replace(/\\,/g, ' ')
  .replace(/[\\$]/g, '');

// One comparable form for manual text and for quotes copied out of it.
const canonical = text => plainSymbols(text)
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[–—]/g, '-')
  .replace(/\s+/g, ' ')
  .trim()
  .toLowerCase();

// The same clean-up without lower-casing, for text shown to a person.
const readable = text => plainSymbols(text)
  .replace(/^\s*#+\s*/gm, '')
  .replace(/\[Row \d+\]\s*/g, '')
  .replace(/\s+/g, ' ')
  .trim();

// What a verb does to the part it acts on. An animation may only move a part
// away for an "away" verb and toward for a "toward" verb; "neutral" verbs can
// be highlighted but never shown as a movement.
const VERBS = {
  remove:     { direction: 'away',    forms: /^(remov\w*|detach\w*|take\w*( off| out)?|pull\w*( out)?|lift\w*)$/ },
  open:       { direction: 'away',    forms: /^open\w*$/ },
  loosen:     { direction: 'away',    forms: /^(loosen\w*|unscrew\w*)$/ },
  disconnect: { direction: 'away',    forms: /^(disconnect\w*|unplug\w*)$/ },
  attach:     { direction: 'toward',  forms: /^(attach\w*|install\w*|refit\w*|fit\w*|mount\w*|fix\w*|put back|plac\w*|bind\w*|wrap\w*)$/ },
  insert:     { direction: 'toward',  forms: /^(insert\w*|push\w*|plug\w*)$/ },
  close:      { direction: 'toward',  forms: /^clos\w*$/ },
  tighten:    { direction: 'toward',  forms: /^(tighten\w*|screw\w*)$/ },
  secure:     { direction: 'toward',  forms: /^(secur\w*|clamp\w*|fasten\w*)$/ },
  connect:    { direction: 'toward',  forms: /^connect\w*$/ },
  clean:      { direction: 'neutral', forms: /^(clean\w*|wash\w*|wip\w*|rins\w*|dry\w*|vacuum\w*)$/ },
  check:      { direction: 'neutral', forms: /^(check\w*|inspect\w*|ensur\w*|confirm\w*|verif\w*|make sure|refer\w*)$/ },
  switch_off: { direction: 'neutral', forms: /^((switch|turn|power)\w* off|isolat\w*|stop\w*)$/ },
  switch_on:  { direction: 'neutral', forms: /^((switch|turn|power)\w* on|start\w*)$/ },
  wait:       { direction: 'neutral', forms: /^wait\w*$/ },
  replace:    { direction: 'neutral', forms: /^(replac\w*|purchas\w*|chang\w*)$/ },
  use:        { direction: 'neutral', forms: /^(us(e|es|ed|ing)|appl\w*|cut\w*|rout\w*|carry out|press\w*|set\w*)$/ },
  other:      { direction: 'neutral', forms: /./ },
};

const FACT_TYPES = ['action', 'quantity', 'warning', 'prohibition', 'prerequisite', 'statement'];
const NEGATION = /\b(do not|don't|never|must not|shall not|cannot|not)\b/;
// Wording that marks a sentence as a safety note, whatever it was filed as.
const SAFETY_WORDING = /\b(warning|caution|danger|hazard\w*|for safety|safety reason|electric(al)? shock|fire|explo\w*|gas leak\w*|injur\w*)\b/;
const escapeRegExp = text => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const drop = reason => ({ ok: false, reason });

/**
 * Check one model-proposed fact against the passages.
 *
 * @param {object} raw     the fact as the model returned it
 * @param {Array<{id: string, page: number, group: string|null, text: string}>} blocks
 * @param {{ group: string|null }} scope  the equipment the answer is about
 * @returns {{ ok: true, fact: object } | { ok: false, reason: string }}
 */
function verifyFact(raw, blocks, scope) {
  if (!raw || !FACT_TYPES.includes(raw.type)) return drop('unknown_type');

  const block = blocks.find(b => b.id === raw.blockId);
  if (!block) return drop('unknown_passage');
  if (scope?.group && block.group !== scope.group) return drop('out_of_scope_passage');

  const quote = canonical(raw.quote);
  if (quote.length < 8) return drop('quote_too_short');
  const offset = canonical(block.text).indexOf(quote);
  if (offset < 0) return drop('quote_not_in_passage');

  // `offset` and `end` are where the quote sits in the passage. They give the
  // fact its place in the manual's order.
  const fact = { type: raw.type, blockId: block.id, page: block.page, quote: raw.quote, offset, end: offset + quote.length, source: 'model' };
  const inQuote = value => typeof value === 'string' && value.trim() && quote.includes(canonical(value));

  if (raw.type === 'action') {
    if (!VERBS[raw.verb]) return drop('unknown_verb');
    if (!inQuote(raw.verbText)) return drop('verb_not_in_quote');
    if (!VERBS[raw.verb].forms.test(canonical(raw.verbText))) return drop('verb_does_not_match_its_class');
    if (!inQuote(raw.object)) return drop('object_not_in_quote');
    // "Do not use joint connection cable" is a prohibition, whatever it was filed as.
    const negated = new RegExp(`${NEGATION.source}\\s+(?:\\w+\\s+){0,2}${escapeRegExp(canonical(raw.verbText))}`).test(quote);
    if (negated) return { ok: true, fact: { ...fact, type: 'prohibition', retyped: 'negated_action' } };
    return { ok: true, fact: { ...fact, verb: raw.verb, verbText: raw.verbText, object: raw.object, direction: VERBS[raw.verb].direction } };
  }

  if (raw.type === 'quantity') {
    const stated = [...figures(`${raw.value} ${raw.unit}`)].filter(figure => figure.includes(' '));
    if (stated.length !== 1) return drop('not_a_measurement');
    if (!figures(raw.quote).has(stated[0])) return drop('value_not_in_quote');
    if (!inQuote(raw.subject)) return drop('subject_not_in_quote');
    return { ok: true, fact: { ...fact, value: raw.value, unit: raw.unit, figure: stated[0], subject: raw.subject } };
  }

  if (raw.type === 'prohibition' && !NEGATION.test(quote)) return drop('prohibition_without_negation');
  // "Earth wire shall be Yellow/Green ... for safety reason" filed as a plain
  // statement would not have to be shown. As a warning it must be.
  if (raw.type === 'statement' && SAFETY_WORDING.test(quote)) return { ok: true, fact: { ...fact, type: 'warning', retyped: 'safety_wording' } };
  return { ok: true, fact };
}

/**
 * Read wiring connections from terminal tables in the passages.
 *
 * The manuals give connections as a table whose columns line up, for example
 *   [Row 0] Terminals on the outdoor unit | 1 | 2 | 3 |  |
 *   [Row 1] Colour of wires |  |  |  |  |
 *   [Row 2] Terminals on the indoor unit | 1 | 2 | 3 |  |
 * A column with a label in both terminal rows is a connection. Anything the
 * table leaves blank is reported as missing, never filled in.
 */
function terminalTableFacts(blocks, scope) {
  const facts = [];
  const missingDetails = [];
  const ROW = /^[ \t]*(?:\[Row \d+\][ \t]*)?Terminals on the (outdoor|indoor) unit[ \t]*\|(.*)$/gim;
  const COLOUR = /^[ \t]*(?:\[Row \d+\][ \t]*)?Colou?r of wires?[ \t]*\|(.*)$/im;
  // Every row ends with "|", which leaves one empty piece that is not a column.
  const cells = row => {
    const parts = row.split('|').map(cell => cell.trim());
    if (parts.length && parts[parts.length - 1] === '') parts.pop();
    return parts;
  };

  for (const block of blocks) {
    if (scope?.group && block.group !== scope.group) continue;
    const rows = {};
    for (const match of block.text.matchAll(ROW)) {
      const unit = match[1].toLowerCase();
      if (!rows[unit]) rows[unit] = { cells: cells(match[2]), start: match.index, end: match.index + match[0].length };
    }
    if (!rows.outdoor || !rows.indoor) continue;

    const start = Math.min(rows.outdoor.start, rows.indoor.start);
    const end = Math.max(rows.outdoor.end, rows.indoor.end);
    const quote = block.text.slice(start, end);
    const offset = canonical(block.text).indexOf(canonical(quote));
    const span = { offset, end: offset + canonical(quote).length };
    const width = Math.max(rows.outdoor.cells.length, rows.indoor.cells.length);
    let blankColumns = 0;

    for (let column = 0; column < width; column++) {
      const outdoor = rows.outdoor.cells[column] || '';
      const indoor = rows.indoor.cells[column] || '';
      if (outdoor && indoor) {
        facts.push({ type: 'connection', blockId: block.id, page: block.page, quote, ...span, source: 'table',
          from: { unit: 'outdoor unit', terminal: outdoor }, to: { unit: 'indoor unit', terminal: indoor } });
      } else if (outdoor || indoor) {
        missingDetails.push(`Terminal "${outdoor || indoor}" on the ${outdoor ? 'outdoor' : 'indoor'} unit has no matching terminal in the manual's table (page ${block.page}).`);
      } else {
        blankColumns += 1;
      }
    }

    const colour = quote.match(COLOUR);
    if (colour && cells(colour[1]).every(cell => !cell)) {
      missingDetails.push(`Wire colours: the table on page ${block.page} has a "Colour of wires" row with no colours in the extracted text.`);
    }
    if (blankColumns > 0) {
      missingDetails.push(`The terminal table on page ${block.page} has a column with no text in either terminal row; what it shows is not in the extracted text.`);
    }
  }
  return { facts, missingDetails };
}

/** Give facts their ids. Table facts first, then the model's, each in the manual's order. */
function numberFacts(tableFacts, modelFacts) {
  return [...tableFacts, ...modelFacts].map((fact, index) => ({ id: `f${index + 1}`, ...fact }));
}

/**
 * Safety-worded sentences in the passages that no fact covers.
 *
 * The checks can tell when a scene drops a fact. They cannot tell when the
 * model never extracted one. This lists candidates for a person to look at:
 * it only reads passages that already gave at least one fact, and it cannot
 * tell whether a sentence belongs to this job or to the one next to it.
 */
function uncoveredSafetySentences(blocks, facts) {
  const MARKED = new RegExp(`${SAFETY_WORDING.source}|${NEGATION.source.replace('|not)', ')')}`);
  const found = [];
  for (const block of blocks) {
    const mine = facts.filter(fact => fact.blockId === block.id);
    if (!mine.length) continue;
    const text = canonical(block.text);
    // Sentences, bullets and numbered steps, with where each one starts.
    const pieces = text.split(/(?<=[.!?])\s+(?=[^\s])|\s+(?=-\s)|\s+(?=#\s)/);
    let cursor = 0;
    for (const piece of pieces) {
      const start = text.indexOf(piece, cursor);
      const end = start + piece.length;
      cursor = end;
      if (piece.length < 15 || !MARKED.test(piece)) continue;
      if (mine.some(fact => fact.offset < end && start < fact.end)) continue;
      const sentence = piece.replace(/^[-#]\s*/, '');
      found.push({ page: block.page, text: sentence.charAt(0).toUpperCase() + sentence.slice(1) });
    }
  }
  return found;
}

module.exports = { canonical, readable, verifyFact, terminalTableFacts, numberFacts, uncoveredSafetySentences, VERBS, FACT_TYPES };
