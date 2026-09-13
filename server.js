// OpenAI gpt-4o-mini with RAG Server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { logAuditRecord } = require('./server/services/auditLogger');
const firebaseAdmin = require('./server/config/firebaseAdmin');
const { runPriorityAdjustmentAgent } = require('./server/agents/priorityAdjustmentAgent');
const fs = require('fs');
const path = require('path');
const sanitize = require('./server/middleware/sanitize');
const validate = require('./server/middleware/validate');
const outputSanitize = require('./server/middleware/outputSanitize');
const { resolveVisualIntake } = require('./server/services/visionIntake');
const { generateSpokenAnswer } = require('./server/services/spokenAnswer');

dotenv.config();

process.on('unhandledRejection', (reason) => {
  console.error('💥 UNHANDLED REJECTION:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('💥 UNCAUGHT EXCEPTION:', err);
});

const app = express();
app.use(cors());

// Photo-and-ask posts a base64 image, which is 300kB-2MB - far past express's
// 100kB default. This parser is mounted BEFORE the global one and scoped to the
// single route that needs it: express runs middleware in order, so this claims
// /api/query, and the global parser below then sees req.body already populated
// and skips. Mounting a larger limit after the global parser would never run,
// and raising the global limit would open 12MB on every route including the
// unauthenticated ones.
app.use('/api/query', express.json({ limit: '12mb' }));
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
      topK = 5,
      imageBase64,
      confirmedModel,
      voice,
    } = req.body;

    console.log('📥 Query received:', query);

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    // ── Use OpenAI API key ────────────────────────────────────────────────────
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({
        error: 'Missing OPENAI_API_KEY in environment variables.',
        code: 'server_misconfigured',
      });
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

    // A model the technician already confirmed in this chat (from a nameplate
    // photo or the model picker) scopes typed follow-ups too. It is only trusted
    // if it exactly names a model in the catalogue, and a model typed in the
    // question itself still wins - the technician may have moved on.
    const trustedConfirmedModel =
      confirmedModel && (known.model_numbers || []).includes(confirmedModel) ? confirmedModel : null;

    // ── Photo intake ──────────────────────────────────────────────────────────
    // When a photo is attached we read it FIRST and only continue once we know
    // which machine we are looking at.
    //
    // Response contract (docs/API_REFERENCE.md):
    //  - EXPECTED outcomes that need the technician (retake, confirm the model,
    //    no manual, conflict) return 200 with `needsInput`, so the app renders a
    //    normal reply and keeps the photo.
    //  - SERVICE FAILURES (catalogue or vision unavailable) are not outcomes. They
    //    return 503 with `error`, `code` and `retryable`, like any other outage.
    let visualReading   = null;
    let visualModel     = null;
    let retrievalQuery  = query;

    if (imageBase64) {
      const intake = await resolveVisualIntake({
        imageBase64,
        query,
        docGroup: docGroup || null,
        confirmedModel: confirmedModel || null,
        known,
        knownOk: known.ok !== false,
        apiKey,
      });

      if (intake.action === 'error') {
        console.error(`[VISION] service failure: ${intake.reason}`);
        return serviceFailure(res, 503, intake.reason, intake.message, true);
      }

      if (intake.action !== 'proceed') {
        console.log(`[VISION] stopped: ${intake.action} (${intake.reason || 'n/a'})`);
        return res.status(200).json({
          text: intake.message,
          sources: [],
          needsInput: intake.action,      // ask_photo | ask_model | no_manual | conflict
          candidates: intake.candidates || [],
          readModel: intake.readModel || intake.model || null,
          imageAttached: true,
        });
      }

      visualReading  = intake.reading;
      visualModel    = intake.model;
      // The photo's findings go into the text we EMBED AND SEARCH WITH, not
      // just the answer prompt. Without this, "what does this mean?" retrieves
      // vaguely from the right manual instead of the page about this fault.
      retrievalQuery = intake.retrievalQuery;
      console.log(`[VISION] model=${visualModel} fault=${visualReading?.faultCode || '-'}`);
    }

    // ── Step 1: Get RAG context from Python retrieval service ─────────────────
    console.log(`Calling retrieval service for: "${query}"`);
    const retrievalResponse = await fetch(`${RETRIEVAL_SERVICE_URL}/retrieve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        // Enriched with the photo's findings when one was attached.
        question: retrievalQuery,
        document_group_id: matchedGroup || docGroup || null,
        filename: matchedFile || null,
        classification: matchedClassification || classification || null,
        category_level_1: matchedCategory1 || category1 || null,
        category_level_2: matchedCategory2 || category2 || null,
        // A model read off the nameplate is stronger evidence than a substring
        // match against the typed text, so it wins.
        model_number: visualModel || matchedModel || (imageBase64 ? null : trustedConfirmedModel) || null,
        date_added: matchedDate || null,
        top_k: topK,
      }),
    }).catch((err) => {
      console.error('Retrieval service unreachable:', err.message);
      return null;
    });

    if (!retrievalResponse || !retrievalResponse.ok) {
      if (retrievalResponse) {
        const errText = await retrievalResponse.text().catch(() => '');
        console.error('Retrieval service error:', retrievalResponse.status, errText);
      }
      // The raw upstream body stays in the server log. The app shows `error`
      // verbatim, and a Python traceback is not something a technician can act on.
      return serviceFailure(res, 503, 'retrieval_unavailable',
        'Retrieval service unavailable. Try again in a moment. If it keeps failing, check that the retrieval service is running.',
        Boolean(imageBase64));
    }

    const retrievalData = await retrievalResponse.json();
    const finalPrompt   = retrievalData.prompt;

    console.log(`Retrieved ${retrievalData.context_blocks.length} context blocks`);

    // Stop rather than answer from the image alone.
    //
    // Qdrant ANDs its filters (vector_store.py builds Filter(must=conditions)),
    // so a model filter that disagrees with the selected document group returns
    // nothing at all. Answering anyway would mean the LLM inventing maintenance
    // guidance with no manual behind it - ungrounded and uncitable, which is the
    // one thing this system exists to avoid.
    const modelScopedByConfirmation = !imageBase64 && !matchedModel && Boolean(trustedConfirmedModel);
    if ((imageBase64 || modelScopedByConfirmation) && (retrievalData.context_blocks?.length || 0) === 0) {
      const scopedModel = visualModel || (modelScopedByConfirmation ? trustedConfirmedModel : null);
      console.log('[VISION] no context retrieved — refusing to answer unsupported');
      return res.status(200).json({
        text: scopedModel
          ? `I found nothing in the ${scopedModel} manual for this question. Try rephrasing, or check this is the right machine.`
          : 'I could not find anything in the manuals for this. Try rephrasing, or photograph the nameplate.',
        sources: [],
        needsInput: 'no_context',
        readModel: scopedModel || null,
        ...(imageBase64 ? { imageAttached: true } : {}),
      });
    }

    // ── Save latest prompt to file ────────────────────────────────────────────
    fs.writeFile(PROMPT_FILE_PATH, finalPrompt, 'utf8', (err) => {
      if (err) console.error('Failed to write latest prompt file:', err);
      else     console.log(`Latest prompt saved to ${PROMPT_FILE_PATH}`);
    });

    // ── Step 2: Send enriched prompt to OpenAI ───────────────────────────────
    const systemPrompt = ROLE_SYSTEM_PROMPTS[role] || DEFAULT_SYSTEM_PROMPT;

    // With a photo attached, the image rides alongside the retrieved context so
    // the model can describe what is shown - but the ANSWER still has to come
    // from the manual extracts, and still has to cite pages. The image adds
    // context; it is not a second source of truth.
    const visionRules = `

The user attached a photograph. It has already been read as: ${JSON.stringify({
      model: visualModel,
      faultCode: visualReading?.faultCode || null,
      observation: visualReading?.observation || null,
    })}.
Answer using ONLY the manual extracts above, and cite pages exactly as normal.
Refer to what is visible in the photo where it helps, but never state a
specification, torque figure, tolerance or procedure that is not in the extracts.`;

    const userContent = imageBase64
      ? [
          { type: 'text', text: finalPrompt },
          {
            type: 'image_url',
            image_url: { url: `data:image/jpeg;base64,${imageBase64}`, detail: 'auto' },
          },
        ]
      : finalPrompt;

    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type':  'application/json',
      },
      body: JSON.stringify({
        model:       'gpt-4o-mini',
        messages: [
          { role: 'system', content: imageBase64 ? systemPrompt + visionRules : systemPrompt },
          { role: 'user',   content: userContent },
        ],
        temperature: 0.2,
        max_tokens:  2048,
      }),
    }).catch((err) => {
      console.error('OpenAI unreachable:', err.message);
      return null;
    });

    if (!openaiResponse) {
      return serviceFailure(res, 503, 'answer_unavailable',
        'Could not reach the answer service. Try again in a moment.', Boolean(imageBase64));
    }

    const data = await openaiResponse.json().catch(() => null);
    console.log('OpenAI status:', openaiResponse.status);

    if (!openaiResponse.ok) {
      console.error('OpenAI error:', JSON.stringify(data, null, 2));
      // Never pass the provider's status through: a 401 from OpenAI means OUR key
      // is wrong, not the technician's session, and a 429 is our quota. 502 says
      // an upstream service failed.
      return serviceFailure(res, 502, 'answer_unavailable',
        'The answer service failed. Try again in a moment.', Boolean(imageBase64));
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

    // ── Step 5: Spoken form for hands-free mode ───────────────────────────────
    // Only when asked for, and only if it passes validation against the full
    // answer. `text` is untouched either way, so rendering, audit logging and
    // alert detection above see exactly what they always did.
    let spoken = null;
    if (voice === true) {
      spoken = await generateSpokenAnswer({ text, apiKey });
      if (!spoken.spokenText) {
        console.log(`[VOICE] no spoken form: ${spoken.reason}` +
          (spoken.rejected ? ` | rejected: "${spoken.rejected.slice(0, 300)}"` : ''));
      }
    }

    // ── Step 6: Return answer + sources + alert metadata ──────────────────────
    res.json({
      text,
      sources:        retrievalData.sources,
      context_blocks: retrievalData.context_blocks,
      reasoning:      'Generated via OpenAI gpt-4o-mini with RAG context',
      alert,
      priorityTask: priorityResult,
      // The model this answer is grounded in, so the app can hold it as the
      // chat's confirmed machine. Only a photo establishes one here.
      ...(imageBase64 ? { identifiedModel: visualModel, imageAttached: true } : {}),
      ...(voice === true ? { spokenText: spoken.spokenText, spokenUnavailable: spoken.reason } : {}),
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      error: 'Internal server error. Try again, and report it if it keeps happening.',
      code:  'internal_error',
    });
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

// ── Service failures ──────────────────────────────────────────────────────────
// One shape for every upstream outage on /api/query: a real error status, a
// message the app can show as-is, a stable code to branch on, and whether
// retrying makes sense. `imageAttached` tells the app to keep the photo.
function serviceFailure(res, status, code, message, imageAttached = false) {
  return res.status(status).json({
    error: message,
    code,
    retryable: true,
    ...(imageAttached ? { imageAttached: true } : {}),
  });
}

// ── Body parser errors ────────────────────────────────────────────────────────
// Without this, express answers an oversized or malformed body with its default
// HTML error page: not JSON, and nothing the app can show. Parser errors are
// routed here even though this is registered after the routes.
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  if (err.type === 'entity.too.large') {
    const isQuery = req.originalUrl.startsWith('/api/query');
    return res.status(413).json({
      error: isQuery
        ? 'Image too large. Retake the photo at a lower resolution and try again.'
        : 'Request body too large.',
      code: isQuery ? 'image_too_large' : 'payload_too_large',
    });
  }

  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Request body is not valid JSON.', code: 'invalid_json' });
  }

  console.error('Unhandled middleware error:', err);
  return res.status(500).json({
    error: 'Internal server error. Try again, and report it if it keeps happening.',
    code:  'internal_error',
  });
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
// The `ok` flag matters for photo-and-ask. This used to return empty arrays on
// failure, which is indistinguishable from "the corpus contains no models" -
// so a catalogue outage would tell the technician "there is no manual for this
// machine" and send them looking for the wrong problem. Callers that care can
// now tell a service fault from a fact about the corpus.
const EMPTY_FILTERS = {
  document_group_ids: [],
  filenames:          [],
  classifications:    [],
  category_level_1:   [],
  category_level_2:   [],
  model_numbers:      [],
};

async function getKnownFilters() {
  try {
    const res = await fetch(`${RETRIEVAL_SERVICE_URL}/filters`);
    if (!res.ok) {
      console.error(`Failed to fetch filters: ${res.status} ${res.statusText}`);
      return { ...EMPTY_FILTERS, ok: false };
    }
    const data = await res.json();
    return { ...data, ok: true };
  } catch (err) {
    console.error('Failed to fetch filters:', err.message);
    return { ...EMPTY_FILTERS, ok: false };
  }
}
