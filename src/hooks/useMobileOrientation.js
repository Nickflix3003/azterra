import { useState, useEffect, useCallback } from 'react';

/**
 * Detects whether the current device is a mobile/touch device and its orientation.
 *
 * Detection strategy:
 *   - `pointer: coarse`  → touch or stylus (not a desktop mouse)
 *   - `screen.width/height` shorter side < 900px → phone-class screen
 *
 * Avoids unreliable user-agent sniffing. The `isMobile` flag is computed once
 * (screen dimensions don't change) while `isPortrait` reacts to resize /
 * orientationchange events.
 */

function detectMobile() {
  if (typeof window === 'undefined') return false;
  const coarsePointer = window.matchMedia('(pointer: coarse)').matches;
  const shortSide = Math.min(window.screen.width, window.screen.height);
  return coarsePointer && shortSide < 900;
}

function detectPortrait() {
  if (typeof window === 'undefined') return false;
  return window.innerHeight > window.innerWidth;
}

export function useMobileOrientation() {
  // isMobile is stable — computed once on mount
  const [isMobile] = useState(detectMobile);
  const [isPortrait, setIsPortrait] = useState(detectPortrait);

  const update = useCallback(() => {
    setIsPortrait(detectPortrait());
  }, []);

  useEffect(() => {
    if (!isMobile) return;
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true });
    return () => {
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, [isMobile, update]);

  return {
    isMobile,
    isPortrait,
    isLandscape: !isPortrait,
  };
}
