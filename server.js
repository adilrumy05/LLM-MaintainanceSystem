// OpenAI gpt-4o-mini with RAG Server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { logAuditRecord, logTimerEvent } = require('./server/services/auditLogger');
const firebaseAdmin = require('./server/config/firebaseAdmin');
const { runPriorityAdjustmentAgent } = require('./server/agents/priorityAdjustmentAgent');
const { generateRepairReport } = require('./server/services/reportGenerator');
const fs = require('fs');
const path = require('path');
const sanitize = require('./server/middleware/sanitize');
const validate = require('./server/middleware/validate');
const outputSanitize = require('./server/middleware/outputSanitize');

dotenv.config();

process.on('unhandledRejection', (reason) => {
  console.error('💥 UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION:', err);
});

const app = express();
app.use(cors());
app.use(express.json());
const transcribeRouter = require('./server/routes/transcribe');
app.use('/api', transcribeRouter);
const RETRIEVAL_SERVICE_URL = process.env.RETRIEVAL_SERVICE_URL || 'http://localhost:8001';
const PROMPT_FILE_PATH = path.join(__dirname, 'latest_prompt.txt');

const ROLE_SYSTEM_PROMPTS = {
  beginner: `You are a Guidance Helper for a junior maintenance technician.
Use plain, everyday language. Never use jargon without explaining it.
Always prioritise safety: flag any step requiring LOTO or PPE with a clear WARNING.
Structure every response as a numbered step-by-step list.
End with: "If you are unsure about any step, stop and contact a senior technician."
Base all guidance strictly on the retrieved manual content provided.`,

  intermediate: `You are a Task Assistance Helper for an intermediate maintenance technician.
Provide the relevant procedure from the manual context.
Flag steps rated HIGH difficulty or requiring specialist tools with a CAUTION note.
List all required tools and torque specifications when present in the source material.
If the task falls outside standard procedures, state: "Escalate to Expert Technician."
Base all guidance strictly on the retrieved manual content provided.`,

  expert: `You are a Technical Decision Support Helper for an expert maintenance technician.
Provide in-depth technical detail: tolerances, specifications, failure modes, root cause indicators.
Reference relevant standards and compliance requirements in the source documents.
Structure responses as: Summary, Technical Detail, Specifications, Risk Considerations.
Assume full technical competency — do not simplify.
Base all analysis strictly on the retrieved manual content provided.`,

  admin: `You are an Approval and Oversight Helper for a maintenance system administrator.
Summarise the procedure's risk level, compliance flags, and audit-relevant considerations.
Highlight steps requiring documented sign-off or falling under regulatory requirements.
Note whether the procedure matches approved SOPs in the source material.
Do not approve or reject autonomously — present findings for human review only.
Base all analysis strictly on the retrieved manual content provided.`,
};

// Appended to every role prompt. The model decides what is a real wait, not a
// regex on the response: "wait 3 minutes before restarting" and "the unit has
// a 3-minute restart delay" contain the same tokens, and only the model has
// the context to tell an instruction from a specification. A scan of the
// corpus found ~12 unique wait/duration phrasings, of which only about a third
// were actual instructions — the rest were spec tables and descriptions of
// built-in compressor delays.
const TIMER_INSTRUCTION = `

PROCEDURE TIMERS:
RULE: if your answer tells the technician to wait a specific length of time before continuing, you MUST put a marker on the line immediately after that step:
[[TIMER:<seconds>|<short label>]]

This is not optional. Any sentence of the form "wait N minutes", "wait for N seconds", "leave it for N minutes", "allow N minutes before ..." gets a marker.
  "Wait for 3 minutes before restarting the compressor."  ->  [[TIMER:180|Compressor restart wait]]
  "You must wait 3 minutes before the unit restarts."     ->  [[TIMER:180|Restart wait]]
  "Leave the vacuum pump running for 30 minutes."         ->  [[TIMER:1800|Evacuation]]

Do NOT emit a marker when you are only describing equipment behaviour rather than instructing a wait:
  "The compressor will not turn on for 3 minutes after operation stops."   (describes the unit, no marker)
  "Time Delay Safety Control: 2min"                                        (specification table, no marker)
  "Cooling Operation Delay: 3 minutes (minimum)"                           (rating, no marker)

Test to apply: is the technician being told to stop and wait right now? Marker. Are you describing how the equipment behaves, or quoting a spec? No marker.
If a range is given, use the LONGER value and say so in the label ("Pressure hold, 10 min max").
Use whole seconds. Never more than 3 markers in one response.`;

const DEFAULT_SYSTEM_PROMPT = `You are a maintenance assistant. Give a clear, safe, step-by-step response to technical inspection and maintenance tasks. Base all guidance strictly on the retrieved manual content provided.`;

function extractDateFromQuery(query) {
  // Match YYYY-MM-DD
  let match = query.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (match) return match[1];

  // Match DD/MM/YYYY or D/M/YYYY
  match = query.match(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/);
  if (match) {
    const day = match[1].padStart(2, '0');
    const month = match[2].padStart(2, '0');
    const year = match[3];
    return `${year}-${month}-${day}`;
  }
  return null;
}

app.post('/api/query', sanitize, validate, outputSanitize, async (req, res) => {
  try {
    const {
      query,
      role,
      userId,
      userEmail,
      sessionId,
      docGroup,
      classification,
      category1,
      category2,
      topK = 5
    } = req.body;

    console.log('📥 Query received:', query);

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    // ── Use OpenAI API key ────────────────────────────────────────────────────
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing OPENAI_API_KEY in environment variables.' });
    }

    // ── Get filters from retrieval service ────────────────────────────────────
    const known = await getKnownFilters();

    const {
      matchedGroup,
      matchedFile,
      matchedClassification,
      matchedCategory1,
      matchedCategory2,
      matchedModel
    } = extractFilters(
      query,
      known.document_group_ids || [],
      known.filenames || [],
      known.classifications || [],
      known.category_level_1 || [],
      known.category_level_2 || [],
      known.model_numbers || []
    );

    // Auto-detect date from query
    const matchedDate = extractDateFromQuery(query);

    // ── Step 1: Get RAG context from Python retrieval service ─────────────────
    console.log(`Calling retrieval service for: "${query}"`);
    const retrievalResponse = await fetch(`${RETRIEVAL_SERVICE_URL}/retrieve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question: query,
        document_group_id: matchedGroup || docGroup || null,
        filename: matchedFile || null,
        classification: matchedClassification || classification || null,
        category_level_1: matchedCategory1 || category1 || null,
        category_level_2: matchedCategory2 || category2 || null,
        model_number: matchedModel || null,
        date_added: matchedDate || null,
        top_k: topK,
      }),
    });

    if (!retrievalResponse.ok) {
      const errText = await retrievalResponse.text();
      console.error('Retrieval service error:', retrievalResponse.status, errText);
      return res.status(503).json({
        error: 'Retrieval service unavailable',
        details: errText,
      });
    }

    const retrievalData = await retrievalResponse.json();
    const finalPrompt   = retrievalData.prompt;

    console.log(`Retrieved ${retrievalData.context_blocks.length} context blocks`);

    // ── Save latest prompt to file ────────────────────────────────────────────
    fs.writeFile(PROMPT_FILE_PATH, finalPrompt, 'utf8', (err) => {
      if (err) console.error('Failed to write latest prompt file:', err);
      else     console.log(`Latest prompt saved to ${PROMPT_FILE_PATH}`);
    });

    // ── Step 2: Send enriched prompt to OpenAI ───────────────────────────────
    const systemPrompt = (ROLE_SYSTEM_PROMPTS[role] || DEFAULT_SYSTEM_PROMPT) + TIMER_INSTRUCTION;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user',   content: finalPrompt  },
        ],
        temperature: 0.2,
        max_tokens:  2048,
      }),
    });

    const data = await openaiResponse.json();
    console.log('OpenAI status:', openaiResponse.status);

    if (!openaiResponse.ok) {
      console.error('OpenAI error:', JSON.stringify(data, null, 2));
      return res.status(openaiResponse.status).json({
        error:   'OpenAI API request failed',
        details: data,
      });
    }

    const text = data?.choices?.[0]?.message?.content
      || 'No response text returned.';

    // ── Step 3: Fire the Audit Logger (Session Based) ────────────────────────
    try {
      await logAuditRecord(
        query,
        text,
        retrievalData.sources,
        userId || 'anonymous',
        sessionId
      );
    } catch (auditErr) {
      console.error('[AUDIT LOGGING FAILED]:', auditErr);
    }

    // ── Step 4: Alert Agent — detect safety-critical content ─────────────────
    const alert = detectAlerts(query, text, role);
    const priorityResult = await runPriorityAdjustmentAgent(
      alert,
      query,
      role,
      userId,
      userEmail,
      sessionId,
      retrievalData.sources
    );

    // ── Step 5: Return answer + sources + alert metadata ──────────────────────
    res.json({
      text,
      sources:        retrievalData.sources,
      context_blocks: retrievalData.context_blocks,
      reasoning:      'Generated via OpenAI gpt-4o-mini with RAG context',
      alert,
      priorityTask: priorityResult,
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      error:   'Internal server error',
      details: error.message,
    });
  }
});

// ── Procedure timers ──────────────────────────────────────────────────────────
// Records that a manual-mandated wait was actually observed, so the audit trail
// evidences the procedure rather than just the advice.
app.post('/api/timer-event', sanitize, async (req, res) => {
  const { sessionId, label, seconds, completedAt } = req.body;
  try {
    const entry = await logTimerEvent(sessionId, { label, seconds, completed_at: completedAt });
    res.json({ status: 'recorded', entry });
  } catch (err) {
    console.error('[TIMER] Failed:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// ── Repair report ─────────────────────────────────────────────────────────────
// Summarises one completed job from its audit_logs session into a structured
// report, and stores it in repair_reports. The client renders the PDF; keeping
// generation server-side means the OpenAI key never leaves the backend and the
// stored record is the single traceable source behind every exported PDF.
// Middleware note: `sanitize` yes (input hygiene), but NOT `validate` — that
// one requires a non-empty `query` field, which a report request has no reason
// to carry — and NOT `outputSanitize`, which HTML-escapes every response
// string, so "don't" would reach the preview as "don&#39;t". The PDF template
// on the client escapes its own interpolations, which is where escaping
// actually belongs for this route.
app.post('/api/report', sanitize, async (req, res) => {
  const { sessionId, userId, userEmail, role } = req.body;
  try {
    const result = await generateRepairReport({
      sessionId,
      requestedBy: userId,
      requestedByEmail: userEmail,
      role,
    });
    console.log(`[REPORT] Generated for session ${sessionId}`);
    res.json(result);
  } catch (err) {
    console.error('[REPORT] Failed:', err.message);
    res.status(err.status || 500).json({ error: err.message });
  }
});

// Fetch a previously generated report without paying for a second LLM call.
app.get('/api/report/:sessionId', async (req, res) => {
  if (!firebaseAdmin.db) {
    return res.status(503).json({ error: 'Firebase Admin not configured' });
  }
  try {
    const snap = await firebaseAdmin.db
      .collection('repair_reports')
      .doc(req.params.sessionId)
      .get();
    if (!snap.exists) return res.status(404).json({ error: 'No report for this session' });
    res.json(snap.data());
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ── HITL endpoints ────────────────────────────────────────────────────────────
app.post('/api/approve', async (req, res) => {
  const { sessionId, reviewedBy, reviewedAt } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }
  if (!firebaseAdmin.db) {
    return res.status(503).json({ error: 'Firebase Admin not configured' });
  }

  const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];

  try {
    await firebaseAdmin.db.collection('audit_logs').doc(sessionId).update({
      status: 'approved',
      reviewed_by: reviewedBy || 'admin',
      reviewed_at: reviewedAt || timestamp,
      last_updated: timestamp,
    });
    res.json({ status: 'approved' });
  } catch (err) {
    console.error('[HITL APPROVE FAILED]:', err);
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reject', async (req, res) => {
  const { sessionId, reviewedBy, reviewedAt, reason } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: 'sessionId required' });
  }
  if (!firebaseAdmin.db) {
    return res.status(503).json({ error: 'Firebase Admin not configured' });
  }

  const timestamp = new Date().toISOString().replace('T', ' ').split('.')[0];

  try {
    await firebaseAdmin.db.collection('audit_logs').doc(sessionId).update({
      status: 'rejected',
      reviewed_by: reviewedBy || 'admin',
      reviewed_at: reviewedAt || timestamp,
      last_updated: timestamp,
      ...(reason && { rejection_reason: reason }),
    });
    res.json({ status: 'rejected' });
  } catch (err) {
    console.error('[HITL REJECT FAILED]:', err);
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok' });
});


app.get('/api/documents', async (req, res) => {
  try {
    const data = await getKnownFilters();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ── Start server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8000;
if (require.main === module) {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Node backend running at http://localhost:${PORT}`);
    console.log(`Expecting retrieval service at ${RETRIEVAL_SERVICE_URL}`);
  });
}

module.exports = app;

// ── Alert Agent ───────────────────────────────────────────────────────────────
function detectAlerts(query, responseText, role) {
  const text = responseText.toLowerCase();

  const criticalKeywords = [
    'loto', 'lockout', 'tagout', 'high voltage',
    'electrical hazard', 'life-threatening', 'fatal', 'electrocution',
  ];
  const warningKeywords = [
    'warning', 'caution', 'ppe', 'personal protective equipment',
    'hazard', 'danger', 'high risk', 'critical safety', 'do not operate',
  ];

  for (const kw of criticalKeywords) {
    if (text.includes(kw)) {
      return {
        level:  'critical',
        icon:   '🚨',
        title:  'CRITICAL Safety Procedure Detected',
        reason: `Response contains critical safety requirement: "${kw}"`,
      };
    }
  }

  for (const kw of warningKeywords) {
    if (text.includes(kw)) {
      return {
        level:  'warning',
        icon:   '⚠️',
        title:  'Safety Warning in Response',
        reason: `Response contains safety content: "${kw}"`,
      };
    }
  }

  return null;
}

// ── Filter extractor ──────────────────────────────────────────────────────────
function extractFilters(
  query,
  knownGroups        = [],
  knownFiles         = [],
  knownClassifications = [],
  knownCat1          = [],
  knownCat2          = [],
  knownModels        = []
) {
  const q = query.toLowerCase();

  let matchedGroup          = null;
  let matchedFile           = null;
  let matchedClassification = null;
  let matchedCategory1      = null;
  let matchedCategory2      = null;
  let matchedModel          = null;

  for (const g  of knownGroups)           { if (q.includes(g.toLowerCase()))  { matchedGroup          = g;  break; } }
  for (const f  of knownFiles)            { if (q.includes(f.toLowerCase()))  { matchedFile           = f;  break; } }
  for (const c  of knownClassifications)  { if (q.includes(c.toLowerCase()))  { matchedClassification = c;  break; } }
  for (const c1 of knownCat1)             { if (q.includes(c1.toLowerCase())) { matchedCategory1      = c1; break; } }
  for (const c2 of knownCat2)             { if (q.includes(c2.toLowerCase())) { matchedCategory2      = c2; break; } }
  for (const m  of knownModels)           { if (q.includes(m.toLowerCase()))  { matchedModel          = m;  break; } }

  return {
    matchedGroup,
    matchedFile,
    matchedClassification,
    matchedCategory1,
    matchedCategory2,
    matchedModel,
  };
}

// ── Fetch known filters from retrieval service ────────────────────────────────
async function getKnownFilters() {
  const res = await fetch(`${RETRIEVAL_SERVICE_URL}/filters`);
  if (!res.ok) {
    console.error(`Failed to fetch filters: ${res.status} ${res.statusText}`);
    return {
      document_group_ids: [],
      filenames:          [],
      classifications:    [],
      category_level_1:   [],
      category_level_2:   [],
      model_numbers:      [],
    };
  }
  return await res.json();
}
