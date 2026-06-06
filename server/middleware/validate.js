// middleware/validate.js

// Middleware to validate incoming request body for /api/query
const validate = (req, res, next) => {
  const { query, userId, userEmail, sessionId, docGroup, classification, category1, category2, topK } = req.body;

  // Query is required and must be a non-empty string
  if (!query || typeof query !== 'string' || !query.trim()) {
    return res.status(400).json({ error: "Query is required and must be a non-empty string." });
  }

  // Optional fields validation
  if (userId && typeof userId !== 'string') {
    return res.status(400).json({ error: "userId must be a string." });
  }

  if (userEmail && typeof userEmail !== 'string') {
    return res.status(400).json({ error: "userEmail must be a string." });
  }

  if (sessionId && typeof sessionId !== 'string') {
    return res.status(400).json({ error: "sessionId must be a string." });
  }

  if (docGroup && typeof docGroup !== 'string') {
    return res.status(400).json({ error: "docGroup must be a string." });
  }

  if (classification && typeof classification !== 'string') {
    return res.status(400).json({ error: "classification must be a string." });
  }

  if (category1 && typeof category1 !== 'string') {
    return res.status(400).json({ error: "category1 must be a string." });
  }

  if (category2 && typeof category2 !== 'string') {
    return res.status(400).json({ error: "category2 must be a string." });
  }

  if (topK !== undefined && topK !== null && (typeof topK !== 'number' || topK <= 0)) {
    return res.status(400).json({ error: "topK must be a positive number." });
  }

  // If everything is valid, move on
  next();
};

module.exports = validate;
