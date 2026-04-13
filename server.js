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

// OPENROUTER API INTEGRATION
const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.post('/api/query', async (req, res) => {
  try {
    const { query } = req.body;

    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    const apiKey = process.env.OPENROUTER_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ error: 'Missing OPENROUTER_API_KEY in environment variables.' });
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        // model: 'google/gemma-4-31b-it:free',
        // model: 'openai/gpt-4o-mini',
        model: 'openai/gpt-oss-20b:free',
        messages: [
          {
            role: 'system',
            content: 'You are a maintenance assistant. Give a clear, safe, step-by-step response to technical inspection and maintenance tasks.'
          },
          {
            role: 'user',
            content: query
          }
        ]
      }),
    });

    const data = await response.json();
    console.log('OpenRouter status:', response.status);
    console.log('OpenRouter raw response:', JSON.stringify(data, null, 2));

    if (!response.ok) {
      return res.status(response.status).json({
        error: 'OpenRouter API request failed',
        details: data,
      });
    }

    const text =
      data?.choices?.[0]?.message?.content || 'No response text returned.';

    res.json({
      text,
      sources: [
        { title: 'OpenRouter API Response', page: '-', section: '-' }
      ],
      reasoning: 'Generated via OpenRouter API',
    });
  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({
      error: 'Internal server error',
      details: error.message,
    });
  }
});

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

const PORT = 8000;
app.listen(PORT, () => {
  console.log(`Backend running at http://localhost:${PORT}`);
});