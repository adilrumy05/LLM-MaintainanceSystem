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

const { createModelCaller, evidenceBlocks, animate: runPipeline, BudgetReached, PRICES } = require('../../backend-node/server/services/animation/pipeline');

const RETRIEVAL_URL = process.env.RETRIEVAL_SERVICE_URL || 'http://localhost:8001';
const RESULTS_DIR = path.join(__dirname, 'results');
const LEDGER_FILE = path.join(RESULTS_DIR, 'ledger.json');
const CAP_USD = 5;
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

const ledger = fs.existsSync(LEDGER_FILE) ? JSON.parse(fs.readFileSync(LEDGER_FILE, 'utf8')) : { capUsd: CAP_USD, spentUsd: 0, calls: 0, unknownCostCalls: 0 };
const saveLedger = () => { fs.mkdirSync(RESULTS_DIR, { recursive: true }); fs.writeFileSync(LEDGER_FILE, JSON.stringify(ledger, null, 2)); };

// The pipeline is the backend's. The cap across all runs is kept here.
const callModel = createModelCaller({
  apiKey: process.env.OPENAI_API_KEY,
  maySpend: worstCase => ledger.spentUsd + worstCase <= CAP_USD,
  onSpend: (costUsd, known) => { ledger.spentUsd += costUsd; ledger.calls += 1; if (!known) ledger.unknownCostCalls += 1; saveLedger(); },
});

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

  return evidenceBlocks(data.context_blocks);
}

// ── The pipeline, for one question and one model ──────────────────────────────

async function animate(item, blocks, model) {
  const result = await runPipeline(item, blocks, model, callModel);
  return { questionId: item.id, category: item.category, expect: item.expect, ...result };
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
