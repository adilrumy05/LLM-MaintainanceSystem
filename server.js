// const express = require('express');
// const cors = require('cors');
// const app = express();

// app.use(cors());
// app.use(express.json());

// // Mock endpoint for query
// app.post('/api/query', (req, res) => {
//   const { query } = req.body;
//   console.log('Received query:', query);

//   // Simulate processing delay
//   setTimeout(() => {
//     res.json({
//       text: "1. Power down the system.\n2. Remove the four bolts on the engine cover using a 10mm socket.\n3. Carefully lift the cover straight up.",
//       sources: [
//         { title: "Engine Manual X-1000", page: 42, section: "5.2" },
//         { title: "Safety Protocol", page: 12, section: "3.1" }
//       ],
//       reasoning: "Retrieved from engine manual; safety validation passed."
//     });
//   }, 2000);
// });

// // Optional: endpoint for approval (just log it)
// app.post('/api/approve', (req, res) => {
//   console.log('Approved:', req.body);
//   res.json({ status: 'approved' });
// });

// // Optional: endpoint for rejection
// app.post('/api/reject', (req, res) => {
//   console.log('Rejected:', req.body);
//   res.json({ status: 'rejected' });
// });

// const PORT = 8000;
// app.listen(PORT, () => {
//   console.log(`Mock backend running at http://localhost:${PORT}`);
// });


// // GEMINI API INTEGRATION
// const express = require('express');
// const cors = require('cors');
// const dotenv = require('dotenv');

// dotenv.config();

// const app = express();

// app.use(cors());
// app.use(express.json());

// app.post('/api/query', async (req, res) => {
//   try {
//     const { query } = req.body;

//     if (!query || !query.trim()) {
//       return res.status(400).json({ error: 'Query is required.' });
//     }

//     const apiKey = process.env.GEMINI_API_KEY;

//     if (!apiKey) {
//       return res.status(500).json({ error: 'Missing GEMINI_API_KEY in environment variables.' });
//     }

//     const url =
//       `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

//     const payload = {
//       contents: [
//         {
//           parts: [
//             {
//               text: `You are a maintenance assistant. Give a clear, safe, step-by-step response to this task:\n\n${query}`
//             }
//           ]
//         }
//       ]
//     };

//     const response = await fetch(url, {
//       method: 'POST',
//       headers: {
//         'Content-Type': 'application/json',
//       },
//       body: JSON.stringify(payload),
//     });

//     const data = await response.json();

//     if (!response.ok) {
//       return res.status(response.status).json({
//         error: 'Gemini API request failed',
//         details: data,
//       });
//     }

//     const text =
//       data?.candidates?.[0]?.content?.parts?.map(part => part.text).join('\n') ||
//       'No response text returned.';

//     res.json({
//       text,
//       sources: [
//         { title: 'Gemini API Response', page: '-', section: '-' }
//       ],
//       reasoning: 'Generated via Gemini API',
//     });
//   } catch (error) {
//     console.error('Server error:', error);
//     res.status(500).json({
//       error: 'Internal server error',
//       details: error.message,
//     });
//   }
// });

// app.post('/api/approve', (req, res) => {
//   console.log('Approved:', req.body);
//   res.json({ status: 'approved' });
// });

// app.post('/api/reject', (req, res) => {
//   console.log('Rejected:', req.body);
//   res.json({ status: 'rejected' });
// });

// app.get('/api/test-models', async (req, res) => {
//   try {
//     const apiKey = process.env.GEMINI_API_KEY;

//     const response = await fetch(
//       `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
//     );

//     const data = await response.json();
//     res.status(response.status).json(data);
//   } catch (error) {
//     res.status(500).json({ error: error.message });
//   }
// });

// const PORT = 8000;
// app.listen(PORT, () => {
//   console.log(`Backend running at http://localhost:${PORT}`);
// });

// OPENROUTER API INTEGRATION with RAG
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
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
      docGroup,
      classification,
      category1,
      category2,
      topK = 5
    } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'Missing OPENROUTER_API_KEY in environment variables.' });
    }

    // ✅ GET FILTERS INSIDE REQUEST
    const known = await getKnownFilters();

    // ✅ extract from query
    const { matchedGroup, matchedFile } = extractFilters(
      query,
      known.document_group_ids,
      known.filenames
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
        classification: classification || null,
        category_level_1: category1 || null,
        category_level_2: category2 || null,
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
        // model: 'openai/gpt-oss-20b:free',
        // model: 'google/gemma-3-27b-it:free',
        // model: 'meta-llama/llama-3.3-70b-instruct:free',
        model: 'nvidia/nemotron-3-super-120b-a12b:free',
        // model: 'openai/gpt-oss-20b:free',   // or any model you prefer
        // model: 'google/gemma-4-26b-a4b-it:free',  
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
app.listen(PORT, () => {
  console.log(`Node backend running at http://localhost:${PORT}`);
  console.log(`Expecting retrieval service at ${RETRIEVAL_SERVICE_URL}`);
});

function extractFilters(query, knownGroups = [], knownFiles = []) {
  const q = query.toLowerCase();

  let matchedGroup = null;
  let matchedFile = null;

  for (const g of knownGroups) {
    if (q.includes(g.toLowerCase())) {
      matchedGroup = g;
      break;
    }
  }

  for (const f of knownFiles) {
    if (q.includes(f.toLowerCase())) {
      matchedFile = f;
      break;
    }
  }

  return { matchedGroup, matchedFile };
}

async function getKnownFilters() {
  const res = await fetch(`${RETRIEVAL_SERVICE_URL}/filters`);
  if (!res.ok) return { document_group_ids: [], filenames: [] };
  return await res.json();
}

