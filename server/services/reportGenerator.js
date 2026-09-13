// Repair report generation.
//
// Turns a completed chat session into a one-page structured repair report.
// This is deliberately NOT a transcript export: the model is asked to read the
// conversation and extract what was actually diagnosed and done, so the output
// is a summary a supervisor can read in under a minute.
//
// Source of truth is audit_logs, not phone-local chat state. A repair report is
// a compliance artifact in a system whose premise is a verifiable audit trail,
// so it must be derived from the audited record — which also carries the manual
// citations (sources_used) that make the report traceable.
const { db } = require('../config/firebaseAdmin');
const { FieldValue } = require('firebase-admin/firestore');

const REPORT_SYSTEM_PROMPT = `You are a maintenance documentation assistant. You will be given the transcript of a conversation between a maintenance technician and an AI assistant, covering a single job.

Write a concise one-page repair report summarising what was diagnosed and what was done.

STRICT RULES:
- Use ONLY information present in the transcript. Never invent part numbers, torque values, measurements, model numbers, or actions.
- If the transcript does not establish a field, output exactly "Not recorded" for that field. Do not guess.
- The transcript is guidance the technician RECEIVED. Do not state that a repair was completed unless the technician's own messages indicate it.
- Keep it factual and brief. This is a maintenance record, not prose.
- Preserve any safety-critical warnings (LOTO, PPE, high voltage) that appeared.

Respond with JSON matching exactly this shape:
{
  "title": "short job title, e.g. 'Air conditioner refrigerant leak — compressor service'",
  "equipment": "equipment/model discussed, or 'Not recorded'",
  "problem_reported": "the issue as first described, 1-2 sentences",
  "diagnosis": "what the cause was determined to be, 2-4 sentences, or 'Not recorded'",
  "actions_taken": ["each step actually performed or advised, as a short phrase"],
  "parts_replaced": ["part names/numbers explicitly mentioned"],
  "safety_notes": ["safety-critical warnings raised during the job"],
  "outcome": "resolution status as evidenced by the transcript, or 'Not recorded'",
  "follow_up": "outstanding items or recommended checks, or 'None recorded'"
}
Arrays may be empty. Every string field must be present.`;

function buildTranscript(messages = []) {
  return messages
    .map((m, i) => {
      const t = m.timestamp ? ` [${m.timestamp}]` : '';
      return `--- Exchange ${i + 1}${t} ---\nTECHNICIAN: ${m.user_prompt || ''}\nASSISTANT: ${m.ai_response || ''}`;
    })
    .join('\n\n');
}

// Collapse sources_used across every exchange into a unique, ordered citation
// list. This is what makes the report traceable back to specific manual pages.
function collectSources(messages = []) {
  const seen = new Map();
  for (const m of messages) {
    for (const src of m.sources_used || []) {
      const key = `${src.filename || '?'}|${src.page ?? '?'}`;
      if (!seen.has(key)) {
        seen.set(key, {
          filename: src.filename || 'Unknown',
          page: src.page ?? null,
          document_group_id: src.document_group_id || null,
          classification: src.classification || null,
        });
      }
    }
  }
  return [...seen.values()].sort(
    (a, b) => a.filename.localeCompare(b.filename) || (a.page ?? 0) - (b.page ?? 0)
  );
}

async function generateRepairReport({ sessionId, requestedBy, requestedByEmail, role }) {
  if (!sessionId) {
    const e = new Error('sessionId is required');
    e.status = 400;
    throw e;
  }
  if (!db) {
    const e = new Error('Firebase Admin not configured — cannot read the session or store the report');
    e.status = 503;
    throw e;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const e = new Error('Missing OPENAI_API_KEY in environment variables');
    e.status = 500;
    throw e;
  }

  const snap = await db.collection('audit_logs').doc(sessionId).get();
  if (!snap.exists) {
    const e = new Error(`No session found for id "${sessionId}"`);
    e.status = 404;
    throw e;
  }

  const session = snap.data();
  const messages = session.messages || [];
  if (messages.length === 0) {
    const e = new Error('This session has no messages to summarise');
    e.status = 422;
    throw e;
  }

  const transcript = buildTranscript(messages);
  const sources = collectSources(messages);

  const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: REPORT_SYSTEM_PROMPT },
        { role: 'user', content: `Transcript of the job:\n\n${transcript}` },
      ],
      // Forces syntactically valid JSON so the PDF renderer never has to parse
      // prose. The shape itself is still validated below.
      response_format: { type: 'json_object' },
      temperature: 0.1,
      max_tokens: 1500,
    }),
  });

  const data = await openaiResponse.json();
  if (!openaiResponse.ok) {
    const e = new Error(data?.error?.message || 'OpenAI request failed');
    e.status = openaiResponse.status;
    throw e;
  }

  let parsed;
  try {
    parsed = JSON.parse(data?.choices?.[0]?.message?.content || '{}');
  } catch {
    const e = new Error('Model did not return valid JSON');
    e.status = 502;
    throw e;
  }

  // Normalise: the PDF template assumes every field exists and that the list
  // fields are arrays, so fill gaps here rather than defending in the UI.
  const asArray = (v) => (Array.isArray(v) ? v.filter(Boolean).map(String) : []);
  const asText = (v, fallback = 'Not recorded') =>
    typeof v === 'string' && v.trim() ? v.trim() : fallback;

  const report = {
    title: asText(parsed.title, 'Maintenance Report'),
    equipment: asText(parsed.equipment),
    problem_reported: asText(parsed.problem_reported),
    diagnosis: asText(parsed.diagnosis),
    actions_taken: asArray(parsed.actions_taken),
    parts_replaced: asArray(parsed.parts_replaced),
    safety_notes: asArray(parsed.safety_notes),
    outcome: asText(parsed.outcome),
    follow_up: asText(parsed.follow_up, 'None recorded'),
  };

  const generatedAt = new Date().toISOString().replace('T', ' ').split('.')[0];
  const record = {
    report_id: sessionId,
    session_id: sessionId,
    generated_at: generatedAt,
    generated_by: requestedBy || session.user_id || 'unknown',
    generated_by_email: requestedByEmail || null,
    generated_by_role: role || null,
    session_user_id: session.user_id || null,
    session_status: session.status || null,
    exchange_count: messages.length,
    sources,
    report,
    model: 'gpt-4o-mini',
    created_at: FieldValue.serverTimestamp(),
  };

  // Keyed by sessionId: one canonical report per job. Regenerating overwrites
  // rather than accumulating near-duplicates that a reviewer would have to
  // choose between.
  await db.collection('repair_reports').doc(sessionId).set(record, { merge: true });

  return { ...record, created_at: generatedAt };
}

module.exports = { generateRepairReport, collectSources, buildTranscript };
