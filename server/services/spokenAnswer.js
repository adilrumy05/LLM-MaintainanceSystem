// services/spokenAnswer.js
//
// Hands-free mode reads answers aloud. The on-screen answer is multi-step
// markdown with citations, which is unusable as speech - but shortening
// maintenance instructions is where the real risk is: an action can survive
// while the "isolate the power supply first" that belongs to it does not.
//
// So a spoken form is only returned when it passes deterministic checks against
// the full answer. Anything that fails returns null, and the app shows the full
// answer on screen and says audio is unavailable for that one. Silence is safe;
// a truncated procedure is not.

const SPOKEN_SCHEMA_NAME = 'spoken_answer';

const SPOKEN_SCHEMA = {
  type: 'json_schema',
  json_schema: {
    name: SPOKEN_SCHEMA_NAME,
    strict: true,
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['spokenText', 'complete'],
      properties: {
        spokenText: {
          type: 'string',
          description: 'The answer rewritten to be read aloud.',
        },
        complete: {
          type: 'boolean',
          description:
            'True only if every step, warning, prerequisite, number, unit and waiting period from the answer is in spokenText.',
        },
      },
    },
  },
};

const SYSTEM_PROMPT = `You rewrite maintenance answers so they can be read aloud to a technician whose hands are busy.

Rules:
- Plain spoken sentences. No markdown, bullet symbols, tables, headings, or page citations.
- Say steps in order, as "First", "Next", "Then", "Finally".
- Keep EVERY warning, caution, safety precaution and prerequisite, and say each one BEFORE the step it applies to.
- Begin every safety precaution with the word "Warning" or "Caution", even if the answer did not label it, so the listener can tell it apart from an ordinary step.
- Keep every number exactly as digits, with its unit, and every waiting period.
- Do not add anything that is not in the answer. Do not drop anything that matters for doing the job safely.
- Be concise: remove citations, repetition and filler only.
- If the answer is too long or too complex to say safely in under about 150 words, set complete to false.
- If the answer says the information is not available, say that briefly.`;

const MAX_SPOKEN_CHARS = 1500;

// Concept groups rather than exact words: a safe rewrite may say "switch off"
// where the answer said "isolate". If the answer touches a concept, the spoken
// form must too, in any of its phrasings.
const SAFETY_CONCEPTS = [
  { name: 'warning',     pattern: /\b(warning|caution|danger|hazard)\b/i },
  { name: 'power off',   pattern: /\b(isolat\w*|disconnect\w*|unplug\w*|switch(ed|ing)? off|turn(ed|ing)? off|power(ed)? off|lock ?out|loto)\b/i },
  { name: 'ppe',         pattern: /\b(ppe|gloves?|goggles|safety glasses|protective)\b/i },
  { name: 'electrical',  pattern: /\b(electric(al)? shock|high voltage|live (wire|part|terminal)s?)\b/i },
  { name: 'refrigerant', pattern: /\brefrigerant\b/i },
  { name: 'heat',        pattern: /\b(hot surface|burns?|scald)\b/i },
];

// A number with a unit or duration: a torque, a clearance, a wait. Page numbers
// are deliberately not matched, because citations are dropped when spoken.
const MEASUREMENT = /(\d+(?:\.\d+)?)\s*(?:mm|cm|kg|nm|n·m|kpa|mpa|psi|bar|kw|w|v|a|°c|℃|minutes?|mins?|hours?|hrs?|seconds?|secs?|%)(?![a-z])/gi;

function measurementValues(text) {
  const values = new Set();
  for (const m of String(text).matchAll(MEASUREMENT)) values.add(m[1]);
  return values;
}

/**
 * Check a spoken rewrite against the full answer.
 * @returns {{ ok: true } | { ok: false, reason: string }}
 */
function validateSpoken(fullText, spoken) {
  if (typeof spoken !== 'string' || !spoken.trim()) return { ok: false, reason: 'empty' };
  if (spoken.length > MAX_SPOKEN_CHARS) return { ok: false, reason: 'too_long' };
  if (/```|\|.*\|/.test(spoken)) return { ok: false, reason: 'not_speakable' };

  for (const concept of SAFETY_CONCEPTS) {
    if (concept.pattern.test(fullText) && !concept.pattern.test(spoken)) {
      return { ok: false, reason: `missing_safety:${concept.name}` };
    }
  }

  const spokenNumbers = measurementValues(spoken);
  const bareSpokenNumbers = new Set(String(spoken).match(/\d+(?:\.\d+)?/g) || []);
  for (const value of measurementValues(fullText)) {
    if (!spokenNumbers.has(value) && !bareSpokenNumbers.has(value)) {
      return { ok: false, reason: `missing_measurement:${value}` };
    }
  }

  return { ok: true };
}

/** Remove markdown residue that would be read out as symbols. */
function tidyForSpeech(text) {
  return String(text)
    .replace(/[*_#`>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Produce a validated spoken form of an answer.
 * @returns {Promise<{ spokenText: string|null, reason: string|null }>}
 */
async function generateSpokenAnswer({ text, apiKey, fetchImpl = fetch }) {
  let response;
  try {
    response = await fetchImpl('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        temperature: 0,
        max_tokens: 700,
        response_format: SPOKEN_SCHEMA,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: text },
        ],
      }),
    });
  } catch {
    return { spokenText: null, reason: 'unavailable' };
  }

  if (!response?.ok) return { spokenText: null, reason: 'unavailable' };

  const data = await response.json().catch(() => null);
  const choice = data?.choices?.[0];
  if (!choice) return { spokenText: null, reason: 'unavailable' };
  if (choice.message?.refusal) return { spokenText: null, reason: 'refused' };
  if (choice.finish_reason === 'length') return { spokenText: null, reason: 'truncated' };

  let parsed;
  try {
    parsed = JSON.parse(choice.message?.content);
  } catch {
    return { spokenText: null, reason: 'unreadable_output' };
  }

  if (parsed?.complete !== true) return { spokenText: null, reason: 'incomplete' };

  const spoken = tidyForSpeech(parsed.spokenText);
  const check = validateSpoken(text, spoken);
  // `rejected` is for the server log only, to see what a failed rewrite dropped.
  if (!check.ok) return { spokenText: null, reason: check.reason, rejected: spoken };

  return { spokenText: spoken, reason: null };
}

module.exports = {
  generateSpokenAnswer,
  validateSpoken,
  tidyForSpeech,
  SPOKEN_SCHEMA_NAME,
};
