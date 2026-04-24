import React, { useState } from 'react';
import { useMobileOrientation } from '../../hooks/useMobileOrientation';
import './OrientationPrompt.css';

/**
 * OrientationPrompt
 *
 * Shown on mobile devices when the orientation is portrait.
 * Automatically dismisses when the user rotates to landscape.
 * Stores a session flag so "Continue anyway" dismissal persists for the
 * lifetime of the browser session (but not across sessions).
 */

const SESSION_KEY = 'azterra_orient_dismissed';

export default function OrientationPrompt() {
  const { isMobile, isPortrait } = useMobileOrientation();

  // Read the session flag once on mount
  const [dismissed, setDismissed] = useState(() => {
    try {
      return sessionStorage.getItem(SESSION_KEY) === '1';
    } catch {
      return false;
    }
  });

  // Show only when: mobile device AND portrait orientation AND not manually dismissed
  const visible = isMobile && isPortrait && !dismissed;

  const handleDismiss = () => {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch {
      // sessionStorage blocked (private mode edge case) — just dismiss in state
    }
    setDismissed(true);
  };

  if (!visible) return null;

  return (
    <div
      className="orient-prompt"
      role="dialog"
      aria-modal="true"
      aria-label="Please rotate your device to landscape"
    >
      <div className="orient-prompt__card">
        {/* Brand lockup */}
        <div className="orient-prompt__brand">
          <div className="orient-prompt__sigil" aria-hidden="true">A</div>
          <span className="orient-prompt__wordmark">Azterra</span>
        </div>

        {/* CSS-animated phone icon rotating to landscape */}
        <div className="orient-prompt__phone-wrap" aria-hidden="true">
          <div className="orient-prompt__phone">
            <div className="orient-prompt__phone-notch" />
            <div className="orient-prompt__phone-screen" />
          </div>
        </div>

        <h2 className="orient-prompt__title">Grab your map sideways</h2>

        <p className="orient-prompt__body">
          Azterra is built for landscape view. Rotate your device horizontally
          for the best experience exploring the world.
        </p>

        <button
          type="button"
          className="orient-prompt__dismiss"
          onClick={handleDismiss}
        >
          Continue in portrait →
        </button>
      </div>
    </div>
  );
}
