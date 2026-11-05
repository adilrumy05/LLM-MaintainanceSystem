// The chat's last answer and the question it answered, sent with a typed
// follow-up. The backend keeps no chat history, so before this "explain that
// more simply" was answered as a new question and came back almost unchanged.

export const SIMPLER_QUESTION = 'Explain this more simply, for a beginner.';

// The backend reads the first 4,000 characters; sending more is wasted upload.
const MAX_ANSWER_CHARS = 4000;

// A manual answer, not a "which model?" prompt, an error or a status line.
const isAnswer = (m) => m?.from === 'bot' && typeof m.isProcedural === 'boolean' && !!m.text?.trim();

// `answerId` picks a specific answer; otherwise the chat's latest one is used.
export function previousExchange(messages = [], answerId) {
  let at = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (answerId ? messages[i].id === answerId : isAnswer(messages[i])) { at = i; break; }
  }
  if (at < 0 || !isAnswer(messages[at])) return null;
  for (let i = at - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.from === 'user' && m.text?.trim()) {
      return { question: m.text.trim(), answer: messages[at].text.trim().slice(0, MAX_ANSWER_CHARS) };
    }
  }
  return null;
}
