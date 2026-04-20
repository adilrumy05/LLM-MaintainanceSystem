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
    if (!query?.trim()) return res.status(400).json({ error: 'Query required' });

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: [
          { role: 'user', content: `You are a maintenance assistant. Give a clear, safe, step-by-step response to this task:\n\n${query}` }
        ]
      }),
    });

    const data = await response.json();
    console.log('OpenRouter response:', JSON.stringify(data, null, 2));
    const text = data?.choices?.[0]?.message?.content || 'No response returned.';
    res.json({ text, sources: [], reasoning: 'Generated via OpenRouter' });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/approve', (req, res) => res.json({ status: 'approved' }));
app.post('/api/reject', (req, res) => res.json({ status: 'rejected' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = 8000;
app.listen(PORT, () => console.log(`Backend running at http://localhost:${PORT}`));