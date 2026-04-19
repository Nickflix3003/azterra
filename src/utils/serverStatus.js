/**
 * serverStatus — lightweight event bus for tracking Render cold-start warm-up state.
 *
 * When one or more API requests are retrying after a 503, `isWarming` is true.
 * React components subscribe via useServerWarming() (see hooks/useServerWarming.js).
 */

const listeners = new Set();
let warmingCount = 0;

function notify() {
  const warming = warmingCount > 0;
  listeners.forEach((fn) => fn(warming));
}

/** Called by fetchWithRetry when a request starts its retry loop. */
export function markRetryStart() {
  warmingCount++;
  if (warmingCount === 1) notify();
}

/** Called by fetchWithRetry when a request finishes (success or final failure). */
export function markRetryEnd() {
  warmingCount = Math.max(0, warmingCount - 1);
  if (warmingCount === 0) notify();
}

/** Returns whether at least one request is currently retrying. */
export function getIsWarming() {
  return warmingCount > 0;
}

/** Subscribe to warming-state changes. Returns an unsubscribe function. */
export function subscribeWarming(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
