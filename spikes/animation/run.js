// Animation feasibility spike: runner.
//
//   node spikes/animation/run.js                      all questions, both models
//   node spikes/animation/run.js --only cable,off-topic --models gpt-6-luna
//
// For each question it retrieves the manual passages once, then for each model:
//   passages -> facts (model) -> checked against the passages (facts.js)
//            -> scene (model) -> checked against the facts (scene.js)
//
// It calls the retrieval service and OpenAI directly. No Express route is
// involved, so nothing is written to the audit log, alerts or tasks.
//
// Bounds, from the Sprint 5 plan:
//   - a spending cap across ALL runs, kept in results/ledger.json; a call is
//     not made if its worst case could pass the cap
//   - at most 2 attempts per call, the second only after a cut-off or
//     unreadable reply; never after a refusal, an HTTP error or a timeout
//   - 60 seconds per call

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

const { canonical, verifyFact, terminalTableFacts, numberFacts, uncoveredSafetySentences } = require('./facts');
const { validateScene, repairScene, buildCaptions } = require('./scene');
const { FACTS_SCHEMA, FACTS_PROMPT, SCENE_SCHEMA, SCENE_PROMPT } = require('./prompts');

const RETRIEVAL_URL = process.env.RETRIEVAL_SERVICE_URL || 'http://localhost:8001';
const RESULTS_DIR = path.join(__dirname, 'results');
const LEDGER_FILE = path.join(RESULTS_DIR, 'ledger.json');
const CAP_USD = 5;
const TIMEOUT_MS = 60000;
const MAX_ATTEMPTS = 2;
// USD per 1M tokens, OpenAI pricing page, 8 Oct 2026.
const PRICES = { 'gpt-6-luna': { in: 0.10, out: 0.50 }, 'gpt-6-sol': { in: 2.00, out: 10.00 } };

const S10 = { model: 'CS-S10TKH', group: 'panasonic_aircon_CS-S10TKH' };
const C18 = { model: 'CS-C18DKV', group: 'panasonic_aircon_CS-C18DKV' };
const NONE = { model: null, group: null };

// `expect` is what a correct system does, for the automatic part of the score:
// "animate" a procedure the manuals cover, answer an "explain" question in text
// only (explanations are not animated), and "decline" the rest.
const QUESTIONS = [
  { id: 'airflow',         category: 'conceptual',      ...S10,  expect: 'explain',  question: 'How does air flow through the indoor unit of the CS-S10TKH?' },
  { id: 'refrigerant',     category: 'conceptual',      ...S10,  expect: 'explain',  question: 'How does the refrigeration cycle work on the CS-S10TKH?' },
  { id: 'filter-role',     category: 'conceptual',      ...C18,  expect: 'explain',  question: 'What do the air filters do on the CS-C18DKV, and what happens if they are dirty?' },
  { id: 'filter-clean',    category: 'procedural',      ...C18,  expect: 'animate',  question: 'How do I clean the air filters on the CS-C18DKV?' },
  { id: 'drain-hose',      category: 'procedural',      ...S10,  expect: 'animate',  question: 'How do I install the drain hose on the CS-S10TKH?' },
  { id: 'cable',           category: 'under-specified', ...S10,  expect: 'animate',  question: 'How do I connect the connecting cable between the indoor and outdoor unit on the CS-S10TKH?' },
  { id: 'timer-blink',     category: 'troubleshooting', ...S10,  expect: 'animate',  question: 'What should I do when the TIMER indicator blinks on the CS-S10TKH?' },
  { id: 'error-h11',       category: 'troubleshooting', ...S10,  expect: 'explain',  question: 'What does error code H11 mean on the CS-S10TKH and what should I check?' },
  { id: 'no-model-filter', category: 'ambiguous',       ...NONE, expect: 'decline', question: 'How do I clean the air filter?' },
  { id: 'no-model-cable',  category: 'ambiguous',       ...NONE, expect: 'decline', question: 'How do I connect the cable between the indoor and outdoor unit?' },
  { id: 'off-topic',       category: 'unsupported',     ...NONE, expect: 'decline', question: 'How do I change the engine oil in a car?' },
  { id: 'unknown-model',   category: 'unsupported',     ...NONE, expect: 'decline', question: 'How do I clean the air filter on a Daikin FTXM35?' },
];

// ── Spending ──────────────────────────────────────────────────────────────────

class BudgetReached extends Error {}

const ledger = fs.existsSync(LEDGER_FILE) ? JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')) : { capUsd: CAP_USD, spentUsd: 0, calls: 0, unknownCostCalls: 0 };
const saveLedger = () => { fs.mkdirSync(RESULTS_DIR, { recursive: true }); fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2)); };
const usd = (model, tokensIn, tokensOut) => (tokensIn * PRICES[model].in + tokensOut * PRICES[model].out) / 1e6;

// ── One model call ────────────────────────────────────────────────────────────

async function callModel({ model, system, payload, schema, maxOut }) {
  const body = {
    model, max_completion_tokens: maxOut, reasoning_effort: 'low', response_format: schema,
    messages: [{ role: 'system', content: system }, { role: 'user', content: JSON.stringify(payload) }],
  };
  // About 3 characters per token is a deliberate over-estimate of the input.
  const worstCase = usd(model, Math.ceil(JSON.stringify(body).length / 3), maxOut);
  const calls = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    if (ledger.spentUsd + worstCase > CAP_USD) throw new BudgetReached(`cap of $${CAP_USD} would be passed`);

    const started = Date.now();
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let response, data;
    try {
      response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST', signal: controller.signal,
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      data = await response.json();
    } catch (error) {
      // A timed-out call may still be billed. Its cost is unknown, so the
      // worst case is charged to the ledger.
      ledger.spentUsd += worstCase; ledger.calls += 1; ledger.unknownCostCalls += 1; saveLedger();
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
    ledger.spentUsd += costUsd; ledger.calls += 1; saveLedger();
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
}

// ── Evidence ──────────────────────────────────────────────────────────────────

// What is sent to the search. The first full run sent the question as asked,
// as the app does today, and five of eight answerable questions came back with
// specification tables and parts lists: the model number in the text pulls in
// the pages that repeat it most. With the model used only as a filter, the
// search returns the pages about the task. "model-as-filter" is the default
// so the animation pipeline is tested on relevant passages; "as-asked" repeats
// the first run.
function searchText(item, mode) {
  if (mode === 'as-asked' || !item.model) return item.question;
  return item.question.replace(new RegExp(`\\s+(?:on|of|for)\\s+(?:the\\s+|a\\s+)?${item.model}`, 'i'), '');
}

async function retrieve(item, mode) {
  const response = await fetch(`${RETRIEVAL_URL}/retrieve`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ question: searchText(item, mode), top_k: 5, model_number: item.model }),
  });
  if (!response.ok) throw new Error(`retrieval failed: HTTP ${response.status}`);
  const data = await response.json();

  // The service returns a matched chunk and its parent section. Where one
  // block's text sits inside another's, keep the larger: the same sentence
  // should have one place in the evidence, so its position in the manual's
  // order means something.
  const raw = (data.context_blocks || []).filter(block => typeof block?.text === 'string' && block.text.trim());
  const forms = raw.map(block => canonical(block.text));
  const kept = raw.filter((block, index) => !forms.some((other, otherIndex) =>
    otherIndex !== index && other.includes(forms[index]) && (other.length > forms[index].length || otherIndex < index)));
  return kept.map((block, index) => ({ id: `b${index}`, page: block.page, group: block.document_group_id || null,
    filename: block.filename, chunkType: block.chunk_type, text: block.text }));
}

// ── The pipeline, for one question and one model ──────────────────────────────

async function animate(item, blocks, model) {
  const scope = { model: item.model, group: item.group };
  const result = { questionId: item.id, category: item.category, expect: item.expect, question: item.question, model, scope,
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
  // happened to be retrieved. (The second run did exactly that.)
  // The model says which passages' tables matter; what the tables say is read here.
  const wiring = new Set(Array.isArray(extraction.parsed.wiringBlocks) ? extraction.parsed.wiringBlocks : []);
  const table = extraction.parsed.relevant && scope.group
    ? terminalTableFacts(blocks.filter(block => wiring.has(block.id)), scope) : { facts: [], missingDetails: [] };
  result.facts = numberFacts(table.facts, verified.sort((a, b) => a.blockId.localeCompare(b.blockId, undefined, { numeric: true }) || a.offset - b.offset));
  // For the human review: safety-worded sentences the model did not extract.
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

// ── Run ───────────────────────────────────────────────────────────────────────

async function main() {
  const arg = name => { const index = process.argv.indexOf(`--${name}`); return index > 0 ? process.argv[index + 1].split(',') : null; };
  const models = arg('models') || Object.keys(PRICES);
  const only = arg('only');
  const search = (arg('search') || ['model-as-filter'])[0];
  const questions = QUESTIONS.filter(item => !only || only.includes(item.id));
  if (!process.env.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is not set');
  for (const model of models) if (!PRICES[model]) throw new Error(`no price known for ${model}`);

  const run = { startedAt: new Date().toISOString(), search, capUsd: CAP_USD, spentBeforeUsd: ledger.spentUsd, models, evidence: {}, results: [], stoppedAtCap: false };
  try {
    for (const item of questions) {
      const blocks = await retrieve(item, search);
      run.searchText = run.searchText || {};
      run.searchText[item.id] = searchText(item, search);
      run.evidence[item.id] = blocks;
      for (const model of models) {
        const result = await animate(item, blocks, model);
        run.results.push(result);
        console.log(`${item.id.padEnd(16)} ${model.padEnd(11)} ${result.status.padEnd(11)} facts ${String(result.facts.length).padStart(2)}/${String(result.factsProposed).padStart(2)}  ${(result.ms / 1000).toFixed(1).padStart(5)}s  $${result.costUsd.toFixed(4)}  ${result.proposedStatus && result.proposedStatus !== result.status ? `(as proposed: ${result.proposedStatus}, ${result.repairs.length} repairs) ` : ''}${result.reasons.join('; ').slice(0, 100)}`);
      }
    }
  } catch (error) {
    if (!(error instanceof BudgetReached)) throw error;
    run.stoppedAtCap = true;
    console.log(`STOPPED: ${error.message}`);
  }

  run.spentThisRunUsd = ledger.spentUsd - run.spentBeforeUsd;
  run.spentTotalUsd = ledger.spentUsd;
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  const file = path.join(RESULTS_DIR, `run-${run.startedAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(run, null, 2));
  fs.writeFileSync(path.join(RESULTS_DIR, 'latest.json'), JSON.stringify(run, null, 2));
  console.log(`\nthis run $${run.spentThisRunUsd.toFixed(4)} | all runs $${ledger.spentUsd.toFixed(4)} of $${CAP_USD} cap | ${path.relative(process.cwd(), file)}`);
}

if (require.main === module) main().catch(error => { console.error(error); process.exit(1); });

module.exports = { QUESTIONS, PRICES, CAP_USD, searchText };
