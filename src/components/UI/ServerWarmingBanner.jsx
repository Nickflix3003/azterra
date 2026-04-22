import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { API_BASE_URL } from '../../utils/apiBase';
import { fetchWithRetry } from '../../utils/fetchWithRetry';
import { getServerStatus, subscribeServerStatus } from '../../utils/serverStatus';
import './ServerWarmingBanner.css';

const OVERLAY_ROUTE_MATCHERS = [
  (pathname) => pathname === '/',
  (pathname) => pathname.startsWith('/campaign'),
  (pathname) => pathname.startsWith('/atlas'),
  (pathname) => pathname.startsWith('/secrets'),
  (pathname) => pathname.startsWith('/people'),
  (pathname) => pathname.startsWith('/magic'),
  (pathname) => pathname.startsWith('/compendium'),
];

function getRouteCopy(pathname) {
  if (pathname.startsWith('/campaign')) {
    return {
      eyebrow: 'Campaign',
      title: 'Opening the campaign ledger',
    };
  }
  if (pathname.startsWith('/secrets')) {
    return {
      eyebrow: 'Secrets',
      title: 'Unlocking the archive',
    };
  }
  if (pathname.startsWith('/atlas') || pathname === '/') {
    return {
      eyebrow: 'Map',
      title: 'Loading the atlas',
    };
  }
  if (pathname.startsWith('/magic')) {
    return {
      eyebrow: 'Magic',
      title: 'Stirring the ley lines',
    };
  }
  return {
    eyebrow: 'Azterra',
    title: 'Waking the world',
  };
}

function formatElapsed(startedAt, nowMs) {
  if (!startedAt) return null;
  const seconds = Math.max(1, Math.round((nowMs - startedAt) / 1000));
  return `${seconds}s`;
}

export default function ServerWarmingBanner() {
  const location = useLocation();
  const [status, setStatus] = useState(getServerStatus());
  const [nowMs, setNowMs] = useState(Date.now());
  const [manualWake, setManualWake] = useState(false);

  useEffect(() => {
    const unsubscribe = subscribeServerStatus(setStatus);
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (status.phase !== 'warming') return undefined;
    const timer = window.setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => window.clearInterval(timer);
  }, [status.phase]);

  const routeCopy = useMemo(
    () => getRouteCopy(location.pathname || '/'),
    [location.pathname]
  );

  const showNotice = status.phase !== 'idle';
  const elapsedLabel = formatElapsed(status.startedAt, nowMs);
  const shouldUseOverlay =
    showNotice &&
    OVERLAY_ROUTE_MATCHERS.some((matcher) => matcher(location.pathname || '/')) &&
    ((status.phase === 'warming' && status.startedAt && nowMs - status.startedAt >= 4500) ||
      status.phase === 'offline');

  const bodyText =
    status.phase === 'warming'
      ? 'Render put the backend to sleep. Give it about 30-50 seconds and this page will fill in automatically.'
      : status.lastError || 'The backend is still unavailable. Try waking it again in a moment.';

  const secondaryText =
    status.phase === 'warming'
      ? 'No refresh needed. Azterra will reconnect on its own.'
      : 'If the server was sleeping, waking it again usually fixes it.';

  async function handleWakeServer() {
    setManualWake(true);
    try {
      await fetchWithRetry(`${API_BASE_URL}/auth/me`, {
        credentials: 'include',
        cache: 'no-store',
      });
    } catch {
      // The status bus will surface the current backend state.
    } finally {
      window.setTimeout(() => setManualWake(false), 350);
    }
  }

  if (!showNotice) return null;

  const actionLabel =
    status.phase === 'warming' || manualWake ? 'Starting...' : 'Wake Server';

  return (
    <>
      {shouldUseOverlay && (
        <div className="server-status-overlay" role="presentation">
          <section
            className="server-status-card server-status-card--overlay"
            role="status"
            aria-live="polite"
          >
            <div className="server-status-card__halo" />
            <div className="server-status-card__orb" aria-hidden="true" />
            <div className="server-status-card__copy">
              <p className="server-status-card__eyebrow">{routeCopy.eyebrow}</p>
              <h2 className="server-status-card__title">{routeCopy.title}</h2>
              <p className="server-status-card__body">{bodyText}</p>
              <p className="server-status-card__sub">{secondaryText}</p>
              <div className="server-status-card__meta">
                <span className="server-status-chip">
                  {status.phase === 'warming' ? 'Backend waking up' : 'Backend unavailable'}
                </span>
                {elapsedLabel && <span className="server-status-chip">About {elapsedLabel} so far</span>}
              </div>
            </div>
            <div className="server-status-card__actions">
              <button
                type="button"
                className="server-status-button"
                onClick={handleWakeServer}
                disabled={status.phase === 'warming' || manualWake}
              >
                {actionLabel}
              </button>
            </div>
            <div className="server-status-progress" aria-hidden="true">
              <span />
            </div>
          </section>
        </div>
      )}

      {!shouldUseOverlay && (
        <section
          className="server-status-card server-status-card--compact"
          role="status"
          aria-live="polite"
        >
          <div className="server-status-card__orb" aria-hidden="true" />
          <div className="server-status-card__copy">
            <p className="server-status-card__eyebrow">Azterra</p>
            <p className="server-status-card__compact-title">
              {status.phase === 'warming'
                ? 'Azterra is waking the world server'
                : 'The backend is still unavailable'}
            </p>
            <p className="server-status-card__compact-body">
              {status.phase === 'warming'
                ? 'Wait about 30-50 seconds. No refresh needed.'
                : 'Try waking it again or wait a moment.'}
            </p>
          </div>
          <div className="server-status-card__side">
            {elapsedLabel && <span className="server-status-card__elapsed">{elapsedLabel}</span>}
            <button
              type="button"
              className="server-status-button server-status-button--compact"
              onClick={handleWakeServer}
              disabled={status.phase === 'warming' || manualWake}
            >
              {actionLabel}
            </button>
          </div>
        </section>
      )}
    </>
  );
}
