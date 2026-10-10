// Only the most recent request may write to the chat.
//
// A single shared "cancelled" flag is not enough: Cancel sets it, the next
// question clears it, and the cancelled reply - still in flight - then arrives
// and is shown as if it answered the new question. Each request gets its own
// id instead, and anything that is no longer the latest is dropped.

export function createRequestGuard() {
  let latest = 0;
  let controller = null;

  return {
    /** Start a request: aborts the previous one and returns its id and signal. */
    begin() {
      controller?.abort();
      controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
      latest += 1;
      return { id: latest, signal: controller?.signal };
    },
    /** True only for the request that is still the latest. */
    isCurrent(id) {
      return id === latest;
    },
    /** Cancel: abort the in-flight request and make every earlier id stale. */
    cancel() {
      controller?.abort();
      controller = null;
      latest += 1;
    },
  };
}
