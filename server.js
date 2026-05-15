// GEMINI API INTEGRATION with RAG Server.js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { logAuditRecord } = require('./server/services/auditLogger');
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


app.post('/api/query', sanitize, validate, outputSanitize, async (req, res) => {
  try {
    const {
      query,
      role,
      userId,
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

    // ── Use Gemini API key ────────────────────────────────────────────────────
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing GEMINI_API_KEY in environment variables.' });
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

    // ── Step 2: Send enriched prompt to Gemini 2.0 Flash ─────────────────────
    const systemPrompt = ROLE_SYSTEM_PROMPTS[role] || DEFAULT_SYSTEM_PROMPT;
    const geminiUrl    = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;

    const geminiResponse = await fetch(geminiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          role: 'user',
          parts: [{ text: `${systemPrompt}\n\n${finalPrompt}` }],
        }],
        generationConfig: {
          temperature:      0.2,
          maxOutputTokens:  2048,
        },
      }),
    });

    const data = await geminiResponse.json();
    console.log('Gemini status:', geminiResponse.status);

    if (!geminiResponse.ok) {
      console.error('Gemini error:', JSON.stringify(data, null, 2));
      return res.status(geminiResponse.status).json({
        error:   'Gemini API request failed',
        details: data,
      });
    }

    const text = data?.candidates?.[0]?.content?.parts?.[0]?.text
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

    // ── Step 5: Return answer + sources + alert metadata ──────────────────────
    res.json({
      text,
      sources:        retrievalData.sources,
      context_blocks: retrievalData.context_blocks,
      reasoning:      'Generated via Gemini 2.0 Flash with RAG context',
      alert,
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      error:   'Internal server error',
      details: error.message,
    });
  }
});

// ── HITL endpoints ────────────────────────────────────────────────────────────
app.post('/api/approve', (req, res) => {
  console.log('Approved:', req.body);
  res.json({ status: 'approved' });
});

app.post('/api/reject', (req, res) => {
  console.log('Rejected:', req.body);
  res.json({ status: 'rejected' });
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
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Node backend running at http://localhost:${PORT}`);
  console.log(`Expecting retrieval service at ${RETRIEVAL_SERVICE_URL}`);
});

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