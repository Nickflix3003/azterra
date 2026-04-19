/**
 * ServerWarmingBanner — shown when the Render backend is cold-starting.
 *
 * Subscribes to serverStatus warming events and slides in from the bottom
 * of the screen when a 503-retry is in progress. Automatically disappears
 * once the server responds successfully.
 */

import { useEffect, useState } from 'react';
import { subscribeWarming, getIsWarming } from '../../utils/serverStatus';

export default function ServerWarmingBanner() {
  const [warming, setWarming] = useState(getIsWarming());
  const [dots, setDots] = useState('');

  useEffect(() => {
    const unsub = subscribeWarming(setWarming);
    return unsub;
  }, []);

  // Animated ellipsis while warming
  useEffect(() => {
    if (!warming) return;
    const id = setInterval(() => {
      setDots((d) => (d.length >= 3 ? '' : d + '.'));
    }, 500);
    return () => clearInterval(id);
  }, [warming]);

  if (!warming) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '1.5rem',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.65rem 1.25rem',
        borderRadius: '9999px',
        background: 'rgba(15, 15, 20, 0.92)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255,255,255,0.12)',
        boxShadow: '0 4px 24px rgba(0,0,0,0.45)',
        color: '#e2d9c8',
        fontSize: '0.875rem',
        fontFamily: 'inherit',
        whiteSpace: 'nowrap',
        animation: 'azterra-banner-in 0.3s ease',
      }}
    >
      {/* Pulsing orb */}
      <span
        style={{
          display: 'inline-block',
          width: '0.55rem',
          height: '0.55rem',
          borderRadius: '50%',
          background: '#f4a442',
          animation: 'azterra-pulse 1.2s ease-in-out infinite',
          flexShrink: 0,
        }}
      />
      <span>
        Server waking up{dots}&nbsp;
        <span style={{ opacity: 0.6, fontSize: '0.8rem' }}>
          (free tier cold start — ~30–50s)
        </span>
      </span>

      <style>{`
        @keyframes azterra-banner-in {
          from { opacity: 0; transform: translateX(-50%) translateY(0.75rem); }
          to   { opacity: 1; transform: translateX(-50%) translateY(0); }
        }
        @keyframes azterra-pulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50%       { opacity: 0.4; transform: scale(0.75); }
        }
      `}</style>
    </div>
  );
}
