import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';

const FOG_TEXTURES = ['fog/new_fog.png']; // New asset

// ... (keep helper functions) ...



const computeOpacity = (zoom = 0) => {
  if (zoom >= 6) return 0;
  if (zoom >= 4) return 0.2; // Subtle fog
  return 0.35; // Base fog (was 0.8)
};

const computeScale = (zoom = 0) => {
  if (zoom < 3) return 1;
  // More noticeable scale for fog too
  return 1 + Math.pow(zoom - 3, 1.5) * 0.3;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function FogLayer({ enabled = true, intensity = 1, onDiagnostics }) {
  const map = useMap();
  const containerRef = useRef(null);
  const layerRef = useRef(null);
  const reqId = useRef(null);

  // State for loading only
  const [loaded, setLoaded] = useState(false);

  const texture = useMemo(() => {
    const choice = FOG_TEXTURES[Math.floor(Math.random() * FOG_TEXTURES.length)];
    const base = import.meta.env.BASE_URL || '/';
    return `${base}${choice}`;
  }, []);

  useEffect(() => {
    if (!texture) return undefined;
    const img = new Image();
    img.onload = () => {
      setLoaded(true);
      console.log('Fog texture loaded successfully:', texture);
      onDiagnostics?.('fog', { status: 'ok', message: 'Fog texture loaded', src: texture });
    };
    img.onerror = () => {
      setLoaded(false);
      onDiagnostics?.('fog', { status: 'error', message: 'Fog texture missing', src: texture });
    };
    img.src = texture;
    return () => {
      img.onload = null;
      img.onerror = null;
    };
  }, [texture, onDiagnostics]);

  useEffect(() => {
    if (!map || !enabled) return;

    const loop = () => {
      const zoom = map.getZoom();
      const origin = map.getPixelOrigin();

      const opacity = computeOpacity(zoom);
      const scale = computeScale(zoom);

      const finalOpacity = clamp(opacity * intensity, 0, 1);
      const visibleOpacity = loaded ? finalOpacity : 0;

      // Update Container (Scale & Visibility)
      if (containerRef.current) {
        containerRef.current.style.display = visibleOpacity <= 0.01 ? 'none' : 'block';
        containerRef.current.style.transform = `scale(${scale})`;
      }

      // Update Layer (Opacity & Position)
      if (layerRef.current) {
        layerRef.current.style.opacity = visibleOpacity;
        layerRef.current.style.backgroundPosition = `${-origin.x}px ${-origin.y}px`;
        layerRef.current.style.setProperty('--layer-opacity', visibleOpacity);
      }

      reqId.current = requestAnimationFrame(loop);
    };

    reqId.current = requestAnimationFrame(loop);

    return () => {
      if (reqId.current) cancelAnimationFrame(reqId.current);
    };
  }, [map, enabled, intensity, loaded]);

  if (!enabled) return null;

  return (
    <div
      ref={containerRef}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 40,
        pointerEvents: 'none',
        transformOrigin: 'center center',
        transition: 'none',
        overflow: 'hidden',
        willChange: 'transform',
        opacity: 0, // Ensure initial invisible before JS syncs
      }}
    >
      <div
        ref={layerRef}
        className="map-layer map-layer--fog"
        style={{
          '--layer-opacity': 0, // Initial
          backgroundImage: `url(${texture})`,
          backgroundSize: 'cover',
          backgroundRepeat: 'repeat, no-repeat',
          mixBlendMode: 'screen',
          opacity: 0, // Initial
          transition: 'none',
          willChange: 'opacity, background-position',
        }}
        aria-hidden="true"
      />
    </div>
  );
}

export default FogLayer;
