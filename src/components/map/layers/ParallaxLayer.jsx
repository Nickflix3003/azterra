import React, { useEffect, useRef } from 'react';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const lerp = (a, b, t) => a + (b - a) * t;

function ParallaxLayer({ enabled = true, map, containerRef, onDiagnostics }) {
  const rafRef = useRef(null);
  const targetRef = useRef({ x: 0, y: 0, zoom: 0 });
  const currentRef = useRef({ x: 0, y: 0 });
  const lastReportRef = useRef(0);

  const applyOffsets = (offsets) => {
    const el = containerRef?.current;
    if (!el) return;
    el.style.setProperty('--fog-parallax-x', `${offsets.fog.x.toFixed(2)}px`);
    el.style.setProperty('--fog-parallax-y', `${offsets.fog.y.toFixed(2)}px`);
    el.style.setProperty('--vignette-parallax-x', `${offsets.vignette.x.toFixed(2)}px`);
    el.style.setProperty('--vignette-parallax-y', `${offsets.vignette.y.toFixed(2)}px`);
  };

  useEffect(() => {
    if (!enabled) {
      applyOffsets({
        fog: { x: 0, y: 0 },
        vignette: { x: 0, y: 0 },
      });
      onDiagnostics?.('parallax', { status: 'off', message: 'Parallax disabled' });
      return undefined;
    }
    if (!map || !containerRef?.current) {
      onDiagnostics?.('parallax', { status: 'warn', message: 'Parallax waiting for map' });
      return undefined;
    }

    const step = () => {
      const current = currentRef.current;
      const target = targetRef.current;
      const next = {
        x: lerp(current.x, target.x, 0.12),
        y: lerp(current.y, target.y, 0.12),
      };
      currentRef.current = next;

      const zoomDampen = 1 - clamp((target.zoom - 3) * 0.08, 0, 0.6);
      const offsets = {
        fog: { x: next.x * 0.7 * zoomDampen, y: next.y * 0.6 * zoomDampen },
        vignette: { x: next.x * 0.25 * zoomDampen, y: next.y * 0.2 * zoomDampen },
      };

      applyOffsets(offsets);

      const now = performance.now();
      if (!lastReportRef.current || now - lastReportRef.current > 400) {
        lastReportRef.current = now;
        onDiagnostics?.('parallax', {
          status: 'ok',
          message: `Parallax active (Fog/Vignette)`,
        });
      }

      const stillMoving = Math.abs(next.x - target.x) > 0.25 || Math.abs(next.y - target.y) > 0.25;
      if (stillMoving) {
        rafRef.current = requestAnimationFrame(step);
      } else {
        rafRef.current = null;
      }
    };

    const handleMove = () => {
      const center = map.getCenter();
      const zoom = map.getZoom();
      const baseScale = 1 - clamp((zoom - 3) * 0.06, 0, 0.5);
      const baseX = ((center.lng % 2048) / 2048 - 0.5) * 48 * baseScale;
      const baseY = ((center.lat % 2048) / 2048 - 0.5) * 36 * baseScale;
      targetRef.current = { x: baseX, y: baseY, zoom };
      if (!rafRef.current) {
        rafRef.current = requestAnimationFrame(step);
      }
    };

    handleMove();
    map.on('move', handleMove);
    map.on('zoomend', handleMove);

    return () => {
      map.off('move', handleMove);
      map.off('zoomend', handleMove);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [enabled, map, containerRef?.current, onDiagnostics]);

  if (!enabled) return null;

  return <div className="map-layer map-layer--parallax" aria-hidden="true" />;
}

export default ParallaxLayer;
