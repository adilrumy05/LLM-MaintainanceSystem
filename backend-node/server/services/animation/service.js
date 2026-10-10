// Animations: who may ask for one, how often, and at what cost.
//
// /api/query keeps the evidence an answer was written from under a random
// reference and returns the reference. /api/animate takes only that reference,
// so the pipeline never runs on text supplied by the caller: an animation is
// always drawn from the passages the answer itself used.
//
// Everything here is in memory. A restart (or the host putting the app to
// sleep) forgets the references, and the app is told to ask again.

const crypto = require('crypto');
const { createModelCaller, evidenceBlocks, animate, playable, BudgetReached } = require('./pipeline');

const REF_TTL_MS = 2 * 60 * 60 * 1000;
const MAX_REFS = 300;
const PER_MINUTE = 3;
const PER_DAY = 30;
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * 60 * 1000;

const refs = new Map();      // ref -> { uid, item, blocks, answerHash, createdAt, running, result }
const requests = new Map();  // uid -> [timestamps of generations started in the last day]
let spend = { day: '', usd: 0 };

const enabled = () => process.env.ANIMATIONS_ENABLED === 'true';
const animationModel = () => process.env.ANIMATION_MODEL || 'gpt-6-sol';
const dailyCapUsd = () => { const cap = Number(process.env.ANIMATION_DAILY_USD); return Number.isFinite(cap) && cap >= 0 ? cap : 1; };
const today = () => new Date().toISOString().slice(0, 10);
const spentToday = () => { if (spend.day !== today()) spend = { day: today(), usd: 0 }; return spend.usd; };

const unavailable = (reason, message, missing = []) => ({ status: 'unavailable', reason, message, missing });

// What the technician is told when nothing can be shown. The pipeline's own
// reasons are for the log.
function unavailableMessage(reasons) {
  const first = reasons[0] || '';
  if (first.startsWith('model_needed')) return unavailable('model_needed', 'An animation needs to know which model this is for. Ask again with the model number.');
  if (first.startsWith('explanation_only')) return unavailable('not_a_procedure', 'Only step-by-step procedures are animated.');
  return unavailable('not_enough_detail', 'The manual does not give enough detail to draw this.');
}

/**
 * Keeps the evidence behind an answer and returns the reference to it, or null
 * when no animation can be offered for this answer.
 */
function issueRef({ uid, question, model, group, contextBlocks, answer }) {
  if (!enabled() || !uid || typeof uid !== 'string') return null;
  const blocks = evidenceBlocks(contextBlocks);
  if (!blocks.length) return null;

  const now = Date.now();
  for (const [ref, entry] of refs) if (now - entry.createdAt > REF_TTL_MS) refs.delete(ref);
  // A Map keeps insertion order, so the first key is the oldest.
  while (refs.size >= MAX_REFS) refs.delete(refs.keys().next().value);

  // Where the answer was not tied to one manual, the passages decide: one
  // manual between them is the scope, more than one is none.
  const groups = [...new Set(blocks.map(block => block.group).filter(Boolean))];
  const scopeGroup = group || (groups.length === 1 ? groups[0] : null);

  const ref = crypto.randomBytes(16).toString('hex');
  refs.set(ref, {
    uid, blocks, createdAt: now, running: null, result: null,
    item: { question, model: model || null, group: scopeGroup },
    answerHash: crypto.createHash('sha256').update(String(answer || '')).digest('hex'),
  });
  return ref;
}

// True when this user may start another generation now; records it if so.
function withinLimits(uid) {
  const now = Date.now();
  const recent = (requests.get(uid) || []).filter(time => now - time < DAY);
  if (recent.filter(time => now - time < MINUTE).length >= PER_MINUTE || recent.length >= PER_DAY) {
    requests.set(uid, recent);
    return false;
  }
  requests.set(uid, [...recent, now]);
  return true;
}

async function generate(entry) {
  const callModel = createModelCaller({
    apiKey: process.env.OPENAI_API_KEY,
    maySpend: worstCase => spentToday() + worstCase <= dailyCapUsd(),
    onSpend: costUsd => { spentToday(); spend.usd += costUsd; },
  });
  let result;
  try {
    result = await animate(entry.item, entry.blocks, animationModel(), callModel);
  } catch (error) {
    if (error instanceof BudgetReached) return unavailable('daily_limit', 'Animations have reached today\'s limit. Try again tomorrow.');
    throw error;
  }
  // Counts and codes only, never manual or question text.
  console.info('[ANIMATION]', JSON.stringify({ status: result.status, reasons: result.reasons.map(reason => reason.split(':')[0]),
    facts: result.facts.length, dropped: result.factsDropped.length, repairs: result.repairs.length, ms: result.ms, usd: +result.costUsd.toFixed(4) }));

  if (result.status === 'ready') return { status: 'ready', animation: playable(result) };
  if (result.status === 'failed') return { status: 'failed', message: 'The animation could not be made. Try again.' };
  return { ...unavailableMessage(result.reasons), missing: (result.missingDetails || []).slice(0, 6) };
}

/**
 * Answers POST /api/animate.
 * @returns {Promise<{ http: number, body: object }>}
 */
async function requestAnimation(ref, uid) {
  if (!enabled()) return { http: 503, body: { error: 'Animations are switched off.', code: 'animations_disabled' } };

  const entry = typeof ref === 'string' ? refs.get(ref) : null;
  if (!entry || Date.now() - entry.createdAt > REF_TTL_MS) {
    if (entry) refs.delete(ref);
    return { http: 200, body: unavailable('expired', 'Ask again with animations on.') };
  }
  if (entry.uid !== uid) return { http: 403, body: { error: 'This animation belongs to another account.', code: 'forbidden' } };

  if (entry.result) return { http: 200, body: entry.result };
  // A repeated request joins the one already running.
  if (!entry.running) {
    if (!process.env.OPENAI_API_KEY) return { http: 503, body: { error: 'Animations are not configured.', code: 'animations_unconfigured' } };
    if (!withinLimits(uid)) {
      return { http: 429, body: { error: 'Too many animations requested. Wait a minute and try again.', code: 'rate_limited' } };
    }
    if (spentToday() >= dailyCapUsd()) return { http: 200, body: unavailable('daily_limit', 'Animations have reached today\'s limit. Try again tomorrow.') };

    entry.running = generate(entry)
      .catch((error) => {
        console.error('[ANIMATION] failed:', error.message);
        return { status: 'failed', message: 'The animation could not be made. Try again.' };
      })
      .then((body) => {
        entry.running = null;
        // A failure is not kept, so Retry runs it again.
        if (body.status !== 'failed' && body.reason !== 'daily_limit') entry.result = body;
        return body;
      });
  }
  return { http: 200, body: await entry.running };
}

// For tests.
function reset() { refs.clear(); requests.clear(); spend = { day: '', usd: 0 }; }

module.exports = { issueRef, requestAnimation, reset, REF_TTL_MS, MAX_REFS, PER_MINUTE, PER_DAY };
