// Sprint 5 chat UX switches. Turning one off hides that feature entirely;
// the server treats a missing `quote` as an ordinary question.
export const FEATURES = {
  EFFORT_LEVELS: true,  // Standard / Detailed (not reasoning effort)
  BRIEF_ANSWERS: false, // offer Brief too; hidden after the 10 Oct 2026 evaluation
  ANIMATIONS:  true, // the Animate toggle (docs/ANIMATIONS.md); the server needs ANIMATIONS_ENABLED=true
  CHAT_COPY:   true,  // copy a whole answer
  CHAT_SELECT: true,  // select part of an answer (inline on Android/web, sheet everywhere)
  CHAT_QUOTE:  true,  // reply to a selected passage
};
