// middleware/outputSanitize.js

// Simple HTML entity escaping function
const escapeOutput = (str) => {
  if (typeof str !== 'string') return str;
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

// Middleware to sanitize response payloads
const outputSanitize = (req, res, next) => {
  // Keep a reference to the original res.json
  const originalJson = res.json;

  res.json = function (data) {
    // Recursively sanitize all string fields in the response
    const sanitizeData = (obj) => {
      if (typeof obj === 'string') {
        return escapeOutput(obj);
      } else if (Array.isArray(obj)) {
        return obj.map(sanitizeData);
      } else if (obj && typeof obj === 'object') {
        const sanitized = {};
        for (const key in obj) {
          sanitized[key] = sanitizeData(obj[key]);
        }
        return sanitized;
      }
      return obj;
    };

    const safeData = sanitizeData(data);
    return originalJson.call(this, safeData);
  };

  next();
};

module.exports = outputSanitize;
