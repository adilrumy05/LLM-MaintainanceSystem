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

  const { confirmedModel, voice } = req.body;

  if (confirmedModel !== undefined && confirmedModel !== null &&
      (typeof confirmedModel !== 'string' || confirmedModel.length > 100)) {
    return res.status(400).json({ error: "confirmedModel must be a model number string.", code: "invalid_request" });
  }

  if (voice !== undefined && typeof voice !== 'boolean') {
    return res.status(400).json({ error: "voice must be true or false.", code: "invalid_request" });
  }

  // ── Optional photo attachment ──────────────────────────────────────────────
  // sanitize.js deliberately skips this field, so it is validated here instead.
  // The limit is on DECODED bytes, not string length: base64 inflates by ~4/3,
  // so a 4MB image is a ~5.5MB string and a string-length check would mislead.
  const { imageBase64 } = req.body;
  //
  // Invalid uploads are 400 and oversized ones 413, each with a message the app
  // can show as-is and a stable `code` to branch on.
  if (imageBase64 !== undefined && imageBase64 !== null) {
    if (typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: "imageBase64 must be a string.", code: "invalid_image" });
    }
    // The most likely client mistake: sending the data URL the image picker
    // produces instead of the base64 payload inside it.
    if (/^data:/i.test(imageBase64)) {
      return res.status(400).json({
        error: "imageBase64 must be the base64 data only. Remove the data URL prefix and send again.",
        code: "invalid_image",
      });
    }
    if (!/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
      return res.status(400).json({
        error: "imageBase64 is not valid base64. Send the photo as a base64-encoded JPEG.",
        code: "invalid_image",
      });
    }
    const decodedBytes = Math.floor((imageBase64.length * 3) / 4);
    if (decodedBytes > 4 * 1024 * 1024) {
      return res.status(413).json({
        error: "Image too large (over 4 MB). Retake the photo at a lower resolution and try again.",
        code: "image_too_large",
      });
    }
  }

  // If everything is valid, move on
  next();
};

module.exports = validate;
