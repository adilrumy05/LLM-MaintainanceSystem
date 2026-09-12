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

// Fields carrying encoded binary rather than user prose.
//
// The 1000-character cap below applies to EVERY string field, not just `query`.
// A photograph as base64 is 300kB-2MB, so without this exemption every
// photo-and-ask request is rejected with "Input too long" before it reaches the
// route. stripTags() is skipped for the same reason: it would corrupt the
// payload, and base64 cannot contain markup.
//
// Injection screening is unaffected - that loop is scoped to key === 'query'
// below, and still runs in full.
//
// Size and charset for these fields are enforced in validate.js, which checks
// the DECODED byte count rather than string length.
const BINARY_FIELDS = new Set(['imageBase64']);

const sanitize = (req, res, next) => {
  for (let key in req.body) {
    if (BINARY_FIELDS.has(key)) continue;

    if (typeof req.body[key] === 'string') {
      let value = stripTags(req.body[key]);

      if (value.length > 1000) {
        return res.status(400).json({ error: "Input too long" });
      }

      if (key === 'query') {
        for (let pattern of injectionPatterns) {
          if (pattern.test(value)) {
            return res.status(400).json({ error: "Malicious input detected" });
          }
        }
      }

      req.body[key] = value;
    }
  }
  next();
};

module.exports = sanitize;
