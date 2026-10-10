// The OpenAI chat model used by the Node backend: written answers, guided
// steps, photo reading and spoken answers. Set ANSWER_MODEL in .env to change
// it; restart the backend after. Voice transcription (Whisper) and the Python
// ingestion pipeline choose their own models.
//
// gpt-4o-mini takes `temperature` and `max_tokens`. The GPT-5 and GPT-6
// families reject both: they take `max_completion_tokens`, only the default
// temperature, and a `reasoning_effort`. Their thinking is billed as output
// and counts toward the limit, so they get headroom on top of the limit asked
// for. Without it a short reply (a photo reading is ~150 tokens) can be cut
// off by the thinking that came before it.

const ANSWER_MODEL = process.env.ANSWER_MODEL || 'gpt-6-luna';
const THINKING_HEADROOM = 1500;

const isLegacyChatModel = model => /^gpt-(3|4)/.test(model);

/**
 * @param {{ temperature: number, maxTokens: number }} wanted
 * @returns {object} `model` plus the limit and sampling settings it accepts
 */
function modelRequest({ temperature, maxTokens }, model = ANSWER_MODEL) {
  if (isLegacyChatModel(model)) return { model, temperature, max_tokens: maxTokens };
  return {
    model,
    max_completion_tokens: Math.max(maxTokens * 2, maxTokens + THINKING_HEADROOM),
    reasoning_effort: 'low',
  };
}

module.exports = { ANSWER_MODEL, modelRequest };
