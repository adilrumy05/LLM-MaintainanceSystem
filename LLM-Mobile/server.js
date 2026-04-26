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

    // ✅ STEP 1: Call FastAPI retrieval service to get relevant chunks from Qdrant
    let context = '';
    let sources = [];
    let contextBlocks = [];

    try {
      const retrievalResponse = await fetch('http://localhost:8001/retrieve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: query, top_k: 5 }),
      });

      if (!retrievalResponse.ok) {
        const errText = await retrievalResponse.text();
        console.error('Retrieval service returned error:', errText);
      } else {
        const retrievalData = await retrievalResponse.json();
        sources = retrievalData.sources || [];
        context = retrievalData.prompt || '';
        contextBlocks = retrievalData.context_blocks || [];
        console.log(`Retrieved ${contextBlocks.length} chunks from Qdrant`);
        console.log('Sources:', JSON.stringify(sources, null, 2));
      }
    } catch (retrievalError) {
      console.error('Retrieval service error:', retrievalError.message);
    }

    // ✅ STEP 2: Build system prompt with retrieved manual context
    const systemPrompt = context
      ? `You are a maintenance assistant for Panasonic and Toshiba air conditioners.
Answer ONLY based on the following manual excerpts. Be specific and reference the manual content.
If the answer is not in the excerpts, say "I could not find this in the available manuals."

${context}`
      : `You are a maintenance assistant for Panasonic and Toshiba air conditioners.
No manual context was retrieved for this query. Answer based on general knowledge but clearly state that this is not sourced from the manuals.`;

    // ✅ STEP 3: Send context + query to LLM via OpenRouter
    const llmResponse = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openrouter/free',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: query }
        ]
      }),
    });

    const llmData = await llmResponse.json();
    console.log('OpenRouter response:', JSON.stringify(llmData, null, 2));

    const text = llmData?.choices?.[0]?.message?.content || 'No response returned.';

    res.json({
      text,
      sources,
      context_blocks: contextBlocks,
      reasoning: sources.length > 0
        ? `Grounded in ${sources.length} manual source(s) via RAG`
        : 'No manual sources retrieved — general knowledge used',
    });

  } catch (error) {
    console.error('Error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.post('/api/approve', (req, res) => res.json({ status: 'approved' }));
app.post('/api/reject', (req, res) => res.json({ status: 'rejected' }));
app.get('/api/health', (req, res) => res.json({ status: 'ok' }));

const PORT = 8000;
app.listen(PORT, '0.0.0.0', () => console.log(`Backend running at http://0.0.0.0:${PORT}`));