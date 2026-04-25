const { logAuditRecord } = require('../services/auditLogger');
const RETRIEVAL_SERVICE_URL = 'http://localhost:8001';

async function handleQuery(req, res) {
  try {
    const { query, userId } = req.body;
    if (!query || !query.trim()) return res.status(400).json({ error: 'Query is required.' });

    const apiKey = process.env.OPENROUTER_API_KEY;

    // --- RAG RETRIEVAL ---
    const retrievalResponse = await fetch(`${RETRIEVAL_SERVICE_URL}/retrieve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ question: query, top_k: 5 }),
    });
    
    if (!retrievalResponse.ok) throw new Error("RAG Service failed");
    const retrievalData = await retrievalResponse.json();

    // --- LLM GENERATION ---
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'meta-llama/llama-3-8b-instruct:free',
        messages: [{ role: "user", content: retrievalData.prompt }]
      }),
    });

    const data = await response.json();
    const text = data?.choices?.[0]?.message?.content || 'No response text returned.';

    // --- FIRE AUDIT LOGGER ---
    const transcriptId = await logAuditRecord(query, text, retrievalData.sources, userId);

    res.json({ text, sources: retrievalData.sources, transcriptId });

  } catch (error) {
    console.error('Server error:', error);
    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
}

module.exports = { handleQuery };