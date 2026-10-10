// Animations: from manual passages to a checked scene.
//
//   passages -> facts (model) -> checked against the passages (facts.js)
//            -> scene (model) -> checked against the facts (scene.js)
//
// The model proposes; facts.js and scene.js decide what is shown. This file
// only orders the calls. Who may ask, how often and at what cost is decided by
// the caller (service.js for the app, spikes/animation/run.js for test runs).

const { canonical, readable, verifyFact, terminalTableFacts, numberFacts, uncoveredSafetySentences } = require('./facts');
const { validateScene, repairScene, buildCaptions } = require('./scene');
const { FACTS_SCHEMA, FACTS_PROMPT, SCENE_SCHEMA, SCENE_PROMPT } = require('./prompts');

const TIMEOUT_MS = 60000;
const MAX_ATTEMPTS = 2;
// USD per 1M tokens, OpenAI pricing page, 8 Oct 2026.
const PRICES = { 'gpt-6-luna': { in: 0.10, out: 0.50 }, 'gpt-6-sol': { in: 2.00, out: 10.00 } };
// A model with no listed price is costed as the dearest one, so a cap still holds.
const price = model => PRICES[model] || PRICES['gpt-6-sol'];
const usd = (model, tokensIn, tokensOut) => (tokensIn * price(model).in + tokensOut * price(model).out) / 1e6;

class BudgetReached extends Error {}

/**
 * Builds the function that makes one model call.
 *   - at most 2 attempts, the second only after a cut-off or unreadable reply;
 *     never after a refusal, an HTTP error or a timeout
 *   - 60 seconds per call
 * @param {object} options
 * @param {(worstCaseUsd: number) => boolean} [options.maySpend]  asked before every attempt
 * @param {(costUsd: number, known: boolean) => void} [options.onSpend]  told after every attempt
 */
function createModelCaller({ apiKey, maySpend = () => true, onSpend = () => {} }) {
  return async function callModel({ model, system, payload, schema, maxOut }) {
    const body = {
      model, max_completion_tokens: maxOut, reasoning_effort: 'low', response_format: schema,
      messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(payload) }],
    };
    // About 3 characters per token is a deliberate over-estimate of the input.
    const worstCase = usd(model, Math.ceil(JSON.stringify(body).length / 3), maxOut);
    const calls = [];

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      if (!maySpend(worstCase)) throw new BudgetReached('the spending cap would be passed');

      const started = Date.now();
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
      let response, data;
      try {
        response = await fetch('https://api.openai.com/v1/chat/completions', {
          method: 'POST', signal: controller.signal,
          headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        data = await response.json();
      } catch (error) {
        // A timed-out call may still be billed. Its cost is unknown, so the
        // worst case is charged.
        onSpend(worstCase, false);
        calls.push({ attempt, ms: Date.now() - started, outcome: controller.signal.aborted ? 'timeout' : 'network_error', costUsd: worstCase, costKnown: false });
        return { ok: false, error: controller.signal.aborted ? 'timeout' : 'network_error', calls };
      } finally {
        clearTimeout(timer);
      }

      const ms = Date.now() - started;
      if (!response.ok) {
        calls.push({ attempt, ms, outcome: `http_${response.status}`, costUsd: 0, costKnown: true });
        return { ok: false, error: `http_${response.status}: ${data?.error?.message || ''}`.slice(0, 200), calls };
      }

      const usage = data.usage || {};
      const costUsd = usd(model, usage.prompt_tokens || 0, usage.completion_tokens || 0);
      onSpend(costUsd, true);
      const choice = data.choices?.[0];
      const record = { attempt, ms, costUsd, costKnown: true, tokensIn: usage.prompt_tokens, tokensOut: usage.completion_tokens,
        reasoningTokens: usage.completion_tokens_details?.reasoning_tokens ?? null };

      if (choice?.message?.refusal) { calls.push({ ...record, outcome: 'refused' }); return { ok: false, error: 'refused', calls }; }

      let parsed = null;
      if (choice?.finish_reason === 'stop') {
        try { parsed = JSON.parse(choice.message.content); } catch { /* handled below */ }
      }
      if (parsed) { calls.push({ ...record, outcome: 'ok' }); return { ok: true, parsed, calls }; }

      const outcome = choice?.finish_reason === 'length' ? 'cut_off' : 'unreadable';
      calls.push({ ...record, outcome });
      if (attempt === MAX_ATTEMPTS) return { ok: false, error: outcome, calls };
    }
  };
}

/**
 * Retrieved passages, as the checks expect them. The retrieval service returns
 * a matched chunk and its parent section. Where one block's text sits inside
 * another's, the larger is kept: the same sentence should have one place in
 * the evidence, so its position in the manual's order means something.
 */
function evidenceBlocks(contextBlocks) {
  const raw = (contextBlocks || []).filter(block => typeof block?.text === 'string' && block.text.trim());
  const forms = raw.map(block => canonical(block.text));
  const kept = raw.filter((block, index) => !forms.some((other, otherIndex) =>
    otherIndex !== index && other.includes(forms[index]) && (other.length > forms[index].length || otherIndex < index)));
  return kept.map((block, index) => ({ id: `b${index}`, page: block.page, group: block.document_group_id || null,
    filename: block.filename, chunkType: block.chunk_type, text: block.text }));
}

/**
 * One question, one model.
 * @param {{ question: string, model: string|null, group: string|null }} item  the question and the equipment it is about
 * @param {Array} blocks  from evidenceBlocks()
 * @param {string} model  the OpenAI model to use
 * @param {Function} callModel  from createModelCaller()
 * @returns {Promise<object>} status is 'ready', 'unavailable' or 'failed'
 */
async function animate(item, blocks, model, callModel) {
  const scope = { model: item.model, group: item.group };
  const result = { question: item.question, model, scope,
    calls: [], factsProposed: 0, factsDropped: [], facts: [], missingDetails: [], sceneProposed: null, proposedStatus: null, proposedReasons: [],
    repairs: [], scene: null, captions: null, status: null, reasons: [] };
  const finish = (status, reasons) => {
    result.status = status; result.reasons = reasons;
    result.costUsd = result.calls.reduce((sum, call) => sum + call.costUsd, 0);
    result.ms = result.calls.reduce((sum, call) => sum + call.ms, 0);
    return result;
  };
  if (!blocks.length) return finish('unavailable', ['no_passages_retrieved']);

  // 1. Facts
  const extraction = await callModel({ model, system: FACTS_PROMPT, schema: FACTS_SCHEMA, maxOut: 5000, payload: {
    question: item.question, equipment: item.model,
    passages: blocks.map(block => ({ blockId: block.id, manual: block.group, page: block.page, text: block.text })),
  } });
  result.calls.push(...extraction.calls.map(call => ({ stage: 'facts', ...call })));
  if (!extraction.ok) return finish('failed', [`facts_call: ${extraction.error}`]);

  const proposed = Array.isArray(extraction.parsed.facts) ? extraction.parsed.facts : [];
  result.factsProposed = proposed.length;
  result.relevant = extraction.parsed.relevant;
  const verified = [];
  for (const raw of proposed) {
    const check = verifyFact(raw, blocks, scope);
    if (check.ok) verified.push(check.fact);
    else result.factsDropped.push({ reason: check.reason, type: raw?.type, quote: String(raw?.quote || '').slice(0, 160) });
  }
  // A table is only read from a passage the model flagged for this question, so
  // a filter question cannot pick up wiring from an installation page that
  // happened to be retrieved. (The second test run did exactly that.)
  // The model says which passages' tables matter; what the tables say is read here.
  const wiring = new Set(Array.isArray(extraction.parsed.wiringBlocks) ? extraction.parsed.wiringBlocks : []);
  const table = extraction.parsed.relevant && scope.group
    ? terminalTableFacts(blocks.filter(block => wiring.has(block.id)), scope) : { facts: [], missingDetails: [] };
  result.facts = numberFacts(table.facts, verified.sort((a, b) => a.blockId.localeCompare(b.blockId, undefined, { numeric: true }) || a.offset - b.offset));
  // For human review: safety-worded sentences the model did not extract.
  result.uncoveredSafety = uncoveredSafetySentences(blocks, result.facts);
  result.missingDetails = [...table.missingDetails, ...(extraction.parsed.missingDetails || [])];
  if (!result.facts.length) {
    return finish('unavailable', [extraction.parsed.relevant ? 'no_fact_survived_checking' : 'declined: the passages do not cover this question']);
  }

  // 2. Scene
  const generation = await callModel({ model, system: SCENE_PROMPT, schema: SCENE_SCHEMA, maxOut: 4000, payload: {
    question: item.question, equipment: item.model,
    facts: result.facts.map(({ id, type, blockId, page, quote, verb, direction, object, from, to, value, unit, subject }) =>
      ({ id, type, blockId, page, quote, verb, direction, object, from, to, value, unit, subject })),
    missingDetails: result.missingDetails,
  } });
  result.calls.push(...generation.calls.map(call => ({ stage: 'scene', ...call })));
  if (!generation.ok) return finish('failed', [`scene_call: ${generation.error}`]);

  // 3. Check the proposal as it came, repair what can be repaired without
  //    inventing anything, and check again. Both verdicts are kept: the first
  //    says how well the model followed the rules, the second what a
  //    technician would actually be shown.
  result.sceneProposed = generation.parsed;
  result.missingDetails = [...new Set([...result.missingDetails, ...(generation.parsed.missingDetails || [])])];
  const asProposed = validateScene(result.sceneProposed, result.facts, scope);
  result.proposedStatus = asProposed.status;
  result.proposedReasons = asProposed.reasons;
  const { scene, repairs } = repairScene(result.sceneProposed, result.facts, scope);
  result.scene = scene;
  result.repairs = repairs;
  const validation = validateScene(scene, result.facts, scope);
  if (validation.status === 'ready') result.captions = buildCaptions(scene, result.facts);
  return finish(validation.status, validation.reasons);
}

const sentence = text => { const clean = String(text || '').trim(); return clean.charAt(0).toUpperCase() + clean.slice(1); };

/**
 * What the player draws from. The verb, its direction and its object were each
 * checked against the manual's sentence in facts.js. Only for a 'ready' result.
 */
function playable(result) {
  return {
    title: readable(result.scene.title),
    parts: result.scene.parts.map(part => ({ id: part.id, label: readable(part.label), shape: part.shape })),
    steps: result.scene.steps,
    facts: result.facts.map(fact => ({ id: fact.id, type: fact.type, page: fact.page,
      text: fact.type === 'connection'
        ? `${sentence(fact.from.unit)} terminal ${fact.from.terminal} connects to ${fact.to.unit} terminal ${fact.to.terminal}`
        : readable(fact.quote),
      verb: fact.verb || null, verbText: fact.verbText || null, direction: fact.direction || null,
      object: fact.object ? readable(fact.object) : null, subject: fact.subject ? readable(fact.subject) : null,
      value: fact.value ? readable(fact.value) : null, unit: fact.unit ? readable(fact.unit) : null,
      from: fact.from || null, to: fact.to || null })),
    // Two facts quoted from one sentence would print it twice.
    captions: result.captions.map(lines => lines.filter((line, index) => lines.findIndex(other => other.text === line.text) === index)),
    missingDetails: (result.missingDetails || []).map(readable),
  };
}

module.exports = { createModelCaller, evidenceBlocks, animate, playable, BudgetReached, PRICES };
