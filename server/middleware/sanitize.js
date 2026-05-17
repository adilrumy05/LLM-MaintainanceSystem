// middleware/sanitize.js
const injectionPatterns = [
  /ignore\s+instructions/i,
  /system\s+prompt/i,
  /reveal\s+secrets/i,
  /password/i,
  /api\s*key/i,
  /fedex/i,
  /confidential/i,
  /internal\s+data/i,
  /<script>/i,          // block script tags
  /alert\s*\(/i,        // block alert() calls
  /onerror\s*=/i,       // block inline JS handlers
  /drop\s+table/i,      // block SQL DROP TABLE
  /union\s+select/i,    // block UNION SELECT
  /or\s+1=1/i,          // block OR 1=1
  /--/i,                // block SQL comments
];

function stripTags(str) {
  return str.replace(/<[^>]*>?/gm, '');
}

const sanitize = (req, res, next) => {
  for (let key in req.body) {
    if (typeof req.body[key] === 'string') {
      let value = stripTags(req.body[key]);

      if (value.length > 1000) {
        return res.status(400).json({ error: "Input too long" });
      }

      for (let pattern of injectionPatterns) {
        if (pattern.test(value)) {
          return res.status(400).json({ error: "Malicious input detected" });
        }
      }

      req.body[key] = value;
    }
  }
  next();
};

module.exports = sanitize;
