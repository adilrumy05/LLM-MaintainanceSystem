// OPENROUTER API INTEGRATION with RAG Server,js
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { logAuditRecord } = require('./server/services/auditLogger');
const fs = require('fs');
const path = require('path');

dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());

const RETRIEVAL_SERVICE_URL = process.env.RETRIEVAL_SERVICE_URL || 'http://localhost:8001';
const PROMPT_FILE_PATH = path.join(__dirname, 'latest_prompt.txt');

app.post('/api/query', async (req, res) => {
  try {
    const {
      query,
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

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing OPENROUTER_API_KEY in environment variables.' });
    }

    // GET FILTERS INSIDE REQUEST
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
    const finalPrompt = retrievalData.prompt;

    console.log(`Retrieved ${retrievalData.context_blocks.length} context blocks`);

    // ── Save latest prompt to file (overwrites) ──────────────────────────────
    fs.writeFile(PROMPT_FILE_PATH, finalPrompt, 'utf8', (err) => {
      if (err) {
        console.error('Failed to write latest prompt file:', err);
      } else {
        console.log(`Latest prompt saved to ${PROMPT_FILE_PATH}`);
      }
    });

    // ── Step 2: Send enriched prompt to OpenRouter ────────────────────────────
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-oss-20b:free',
        // model: 'google/gemma-3-27b-it:free',
        messages: [
          {
            role: "user",
            content: finalPrompt
          }
        ]
      }),
    });

    const data = await response.json();
    console.log('OpenRouter status:', response.status);

    if (!response.ok) {
      console.error('OpenRouter error:', JSON.stringify(data, null, 2));
      return res.status(response.status).json({
        error: 'OpenRouter API request failed',
        details: data,
      });
    }

    const text = data?.choices?.[0]?.message?.content || 'No response text returned.';

    // ── NEW STEP: Fire the Audit Logger (Session Based) ──────────────────────
    try {
      await logAuditRecord(
        query, 
        text, 
        retrievalData.sources, 
        userId || "anonymous",
        sessionId 
      );
    } catch (auditErr) {
      console.error("[AUDIT LOGGING FAILED]:", auditErr);
    }

    // ── Step 3: Return LLM answer + sources from retrieval ───────────────────
    res.json({
      text,
      sources: retrievalData.sources,   // Real document sources
      context_blocks: retrievalData.context_blocks, // Optional debug info
      reasoning: 'Generated via OpenRouter with RAG context',
    });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
});

// Keep the approve / reject / health endpoints unchanged
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

const PORT = process.env.PORT || 8000;
app.get('/api/documents', async (req, res) => {
  try {
    const data = await getKnownFilters();
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Node backend running at http://localhost:${PORT}`);
  console.log(`Expecting retrieval service at ${RETRIEVAL_SERVICE_URL}`);
});

function extractFilters(query, knownGroups = [], knownFiles = [], knownClassifications = [], knownCat1 = [], knownCat2 = [], knownModels = []) {
  const q = query.toLowerCase();

  let matchedGroup = null;
  let matchedFile = null;
  let matchedClassification = null;
  let matchedCategory1 = null;
  let matchedCategory2 = null;
  let matchedModel = null;

  for (const g of knownGroups) {
    if (q.includes(g.toLowerCase())) { matchedGroup = g; break; }
  }
  for (const f of knownFiles) {
    if (q.includes(f.toLowerCase())) { matchedFile = f; break; }
  }
  for (const c of knownClassifications) {
    if (q.includes(c.toLowerCase())) { matchedClassification = c; break; }
  }
  for (const c1 of knownCat1) {
    if (q.includes(c1.toLowerCase())) { matchedCategory1 = c1; break; }
  }
  for (const c2 of knownCat2) {
    if (q.includes(c2.toLowerCase())) { matchedCategory2 = c2; break; }
  }
  for (const m of knownModels) {
    if (q.includes(m.toLowerCase())) { matchedModel = m; break; }
  }

  return {
    matchedGroup,
    matchedFile,
    matchedClassification,
    matchedCategory1,
    matchedCategory2,
    matchedModel,
  };
}

async function getKnownFilters() {
  const res = await fetch(`${RETRIEVAL_SERVICE_URL}/filters`);
  if (!res.ok) {
    console.error(`Failed to fetch filters: ${res.status} ${res.statusText}`);
    return {
      document_group_ids: [],
      filenames: [],
      classifications: [],
      category_level_1: [],
      category_level_2: [],
      model_numbers: [],
    };
  }
  return await res.json();
}