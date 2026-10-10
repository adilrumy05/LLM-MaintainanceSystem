// Animation feasibility spike: build the review page from a run.
//
//   node spikes/animation/report.js [results/run-file.json]
//
// Writes results/review.html, a self-contained page (no <html>/<body> wrapper:
// it is published as an Artifact, which adds its own). The page shows every
// result so people who know the equipment can judge the animations.

const fs = require('fs');
const path = require('path');
const { readable } = require('../../backend-node/server/services/animation/facts');
const { QUESTIONS } = require('./run');
const { validateScene, repairScene, buildCaptions } = require('../../backend-node/server/services/animation/scene');

const RESULTS_DIR = path.join(__dirname, 'results');
const runFile = process.argv[2] ? path.resolve(process.argv[2]) : path.join(RESULTS_DIR, 'latest.json');
const run = JSON.parse(fs.readFileSync(runFile, 'utf8'));

// Judge every stored proposal again with the checks as they stand now. The
// rules were tightened between runs; no model is called to do this.
for (const result of run.results) {
  if (!result.sceneProposed) continue;
  result.proposedStatus = validateScene(result.sceneProposed, result.facts, result.scope).status;
  const { scene, repairs } = repairScene(result.sceneProposed, result.facts, result.scope);
  const verdict = validateScene(scene, result.facts, result.scope);
  Object.assign(result, { scene, repairs, status: verdict.status, reasons: verdict.reasons,
    captions: verdict.status === 'ready' ? buildCaptions(scene, result.facts) : null });
}

const sentence = text => { const clean = String(text || '').trim(); return clean.charAt(0).toUpperCase() + clean.slice(1); };
const FIXES = {
  drop_motion: 'Removed a drawing', drop_part: 'Removed a part', reorder: 'Moved a step into the manual’s order',
  show_first: 'Brought a safety note forward', add_step: 'Added a step the model left out', clear_title: 'Cleared the title',
  generic_shape: 'Used a plain shape', drop_fact_ref: 'Removed a reference to an unverified fact', drop_step: 'Removed an empty step',
};
// 'drop_motion: wrong_rotation: step 3 turns ...' -> 'Removed a drawing (wrong rotation: step 3 turns ...)'
const repairText = repair => {
  const [fix, ...rest] = repair.split(': ');
  return `${FIXES[fix] || fix} (${rest.join(': ').replace(/_/g, ' ')})`;
};
const reasonText = reason => sentence(reason.replace(/^(declined|model_needed):\s*/, '').replace(/_/g, ' '));
const factText = fact => fact.type === 'connection'
  ? `${sentence(fact.from.unit)} terminal ${fact.from.terminal} connects to ${fact.to.unit} terminal ${fact.to.terminal}`
  : readable(fact.quote);

const questions = QUESTIONS.filter(item => run.evidence[item.id]).map(item => ({
  id: item.id, category: item.category, question: item.question, equipment: item.model, expect: item.expect,
  passages: run.evidence[item.id].map(block => ({ page: block.page, text: readable(block.text).slice(0, 6000) })),
  results: run.results.filter(result => result.questionId === item.id).map(result => {
    const ready = result.status === 'ready';
    return {
      model: result.model, status: result.status, ms: result.ms, costUsd: result.costUsd,
      reasons: [...new Set(result.reasons.map(reasonText))],
      // The player draws from these: the verb, its direction and its object were
      // each checked against the manual's sentence in facts.js.
      facts: result.facts.map(fact => ({ id: fact.id, type: fact.type, page: fact.page, text: factText(fact),
        verb: fact.verb || null, verbText: fact.verbText || null, direction: fact.direction || null, object: fact.object ? readable(fact.object) : null,
        subject: fact.subject ? readable(fact.subject) : null, value: fact.value ? readable(fact.value) : null, unit: fact.unit ? readable(fact.unit) : null, from: fact.from || null, to: fact.to || null })),
      dropped: result.factsDropped.map(item => ({ reason: item.reason.replace(/_/g, ' '), quote: readable(item.quote) })),
      scene: ready ? { kind: result.scene.kind, title: readable(result.scene.title),
        parts: result.scene.parts.map(part => ({ id: part.id, label: readable(part.label), shape: part.shape })),
        steps: result.scene.steps } : null,
      // Two facts quoted from one sentence would print it twice.
      captions: ready ? result.captions.map(lines => lines.filter((line, index) => lines.findIndex(other => other.text === line.text) === index)) : null,
      missingDetails: (result.missingDetails || []).map(readable),
      repairs: [...new Set((result.repairs || []).map(repairText))],
      uncoveredSafety: ready ? (result.uncoveredSafety || []) : [],
    };
  }),
}));

// The headline, in plain counts.
const procedures = questions.filter(item => item.expect === 'animate');
const others = questions.filter(item => item.expect !== 'animate');
const count = (set, model, test) => set.filter(item => item.results.some(result => result.model === model && test(result))).length;
const perModel = run.models.map(model =>
  `${model} animated ${count(procedures, model, r => r.status === 'ready')} of the ${procedures.length} procedures, and correctly showed nothing for ${count(others, model, r => r.status !== 'ready')} of the ${others.length} other questions`);
const tally = `Only procedures are animated; explanations are answered in text. ${sentence(perModel.join('; '))}. Both models together cost $${run.spentThisRunUsd.toFixed(2)} for this run. Whether the animations that were shown are right is the question this sheet is for.`;

const data = { generatedAt: run.startedAt, models: run.models, tally, questions };
const template = fs.readFileSync(path.join(__dirname, 'review.template.html'), 'utf8');
// "<" is escaped so that manual text can never close the data block.
const html = template.replace('__DATA__', () => JSON.stringify(data).replace(/</g, '\\u003c'));
const out = path.join(RESULTS_DIR, 'review.html');
fs.writeFileSync(out, html);
console.log(`${path.relative(process.cwd(), out)}  ${(html.length / 1024).toFixed(0)} KB  from ${path.basename(runFile)}`);
console.log(tally);

// Figures for the write-up.
for (const model of run.models) {
  const mine = run.results.filter(result => result.model === model);
  const shown = mine.filter(result => result.status === 'ready');
  const motions = {};
  shown.flatMap(result => result.scene.steps.flatMap(step => step.motions)).forEach(motion => { motions[motion.kind] = (motions[motion.kind] || 0) + 1; });
  const repairs = {};
  shown.flatMap(result => result.repairs).forEach(repair => { const kind = repair.split(': ')[0]; repairs[kind] = (repairs[kind] || 0) + 1; });
  console.log(JSON.stringify({ model,
    shown: shown.map(result => result.questionId),
    shownAsProposed: shown.filter(result => result.proposedStatus === 'ready').map(result => result.questionId),
    notShown: mine.filter(result => result.status !== 'ready').map(result => `${result.questionId}: ${result.reasons[0].split(':')[0]}`),
    calls: mine.flatMap(result => result.calls).length,
    retries: mine.flatMap(result => result.calls).filter(call => call.attempt > 1).length,
    failedCalls: mine.flatMap(result => result.calls).filter(call => call.outcome !== 'ok').length,
    factsProposed: mine.reduce((sum, result) => sum + result.factsProposed, 0),
    factsDropped: mine.reduce((sum, result) => sum + result.factsDropped.length, 0),
    avgSecondsPerShown: +(shown.reduce((sum, result) => sum + result.ms, 0) / shown.length / 1000).toFixed(1),
    avgUsdPerShown: +(shown.reduce((sum, result) => sum + result.costUsd, 0) / shown.length).toFixed(4),
    totalUsd: +mine.reduce((sum, result) => sum + result.costUsd, 0).toFixed(3),
    drawings: motions, repairs,
    uncoveredSafetySentences: shown.reduce((sum, result) => sum + (result.uncoveredSafety || []).length, 0),
  }));
}
