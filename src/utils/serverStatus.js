/**
 * serverStatus - lightweight event bus for backend availability state.
 *
 * The app mostly cares about three states:
 * - idle: backend is responding normally
 * - warming: Render returned 503 and retry logic is waiting for the backend
 * - offline: retries were exhausted or a hard network failure occurred
 */

const listeners = new Set();

let state = {
  phase: 'idle',
  warmingCount: 0,
  pendingCount: 0,
  startedAt: null,
  lastError: '',
  lastUpdatedAt: Date.now(),
};

function notify() {
  const snapshot = { ...state };
  listeners.forEach((fn) => fn(snapshot));
}

function setState(patch) {
  state = {
    ...state,
    ...patch,
    lastUpdatedAt: Date.now(),
  };
  notify();
}

function getWarmStartedAt() {
  return state.phase === 'warming' && state.startedAt ? state.startedAt : Date.now();
}

export function markWarmupPending() {
  const nextCount = state.pendingCount + 1;
  setState({
    phase: 'warming',
    pendingCount: nextCount,
    startedAt: getWarmStartedAt(),
    lastError: '',
  });
}

export function clearWarmupPending({ outcome = 'success', message = '' } = {}) {
  const nextCount = Math.max(0, state.pendingCount - 1);
  const stillWarming = nextCount > 0 || state.warmingCount > 0;

  if (stillWarming) {
    setState({
      phase: 'warming',
      pendingCount: nextCount,
      lastError: outcome === 'failed' ? message || state.lastError : '',
    });
    return;
  }

  if (outcome === 'failed') {
    setState({
      phase: 'offline',
      pendingCount: 0,
      warmingCount: 0,
      startedAt: null,
      lastError: message || 'The backend is still unavailable.',
    });
    return;
  }

  setState({
    phase: 'idle',
    pendingCount: 0,
    warmingCount: 0,
    startedAt: null,
    lastError: '',
  });
}

export function markRetryStart() {
  const nextCount = state.warmingCount + 1;
  setState({
    phase: 'warming',
    warmingCount: nextCount,
    startedAt: getWarmStartedAt(),
    lastError: '',
  });
}

export function markRetryEnd({ outcome = 'success', message = '' } = {}) {
  const nextCount = Math.max(0, state.warmingCount - 1);
  if (nextCount > 0) {
    setState({
      warmingCount: nextCount,
      phase: 'warming',
      lastError: outcome === 'failed' ? message || state.lastError : '',
    });
    return;
  }

  if (outcome === 'failed') {
    setState({
      phase: state.pendingCount > 0 ? 'warming' : 'offline',
      warmingCount: 0,
      startedAt: state.pendingCount > 0 ? state.startedAt || Date.now() : null,
      lastError: message || 'The backend is still unavailable.',
    });
    return;
  }

  setState({
    phase: state.pendingCount > 0 ? 'warming' : 'idle',
    warmingCount: 0,
    startedAt: state.pendingCount > 0 ? state.startedAt || Date.now() : null,
    lastError: '',
  });
}

export function markServerFailure(message = 'Could not reach the backend.') {
  setState({
    phase: state.pendingCount > 0 ? 'warming' : 'offline',
    warmingCount: 0,
    startedAt: state.pendingCount > 0 ? state.startedAt || Date.now() : null,
    lastError: message,
  });
}

export function markServerRecovered() {
  if (state.phase === 'idle' && state.warmingCount === 0 && state.pendingCount === 0 && !state.lastError) {
    return;
  }
  setState({
    phase: state.pendingCount > 0 ? 'warming' : 'idle',
    warmingCount: 0,
    startedAt: state.pendingCount > 0 ? state.startedAt || Date.now() : null,
    lastError: '',
  });
}

export function getServerStatus() {
  return { ...state };
}

export function getIsWarming() {
  return state.phase === 'warming';
}

export function subscribeServerStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function subscribeWarming(fn) {
  const listener = (snapshot) => fn(snapshot.phase === 'warming');
  listeners.add(listener);
  return () => listeners.delete(listener);
}
