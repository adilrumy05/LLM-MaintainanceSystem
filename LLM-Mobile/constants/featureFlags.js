// Sprint 5 chat UX switches. Turning one off hides that feature entirely;
// the server treats a missing `quote` as an ordinary question.
export const FEATURES = {
  CHAT_COPY:   true,  // copy a whole answer
  CHAT_SELECT: true,  // select part of an answer (inline on Android/web, sheet everywhere)
  CHAT_QUOTE:  true,  // reply to a selected passage
};
