import React, { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// ============================================================================
// CLOUD SYSTEM CONFIGURATION
// ============================================================================
// Layers are ordered from "Highest" (Closest to Camera) to "Lowest" (Closest to Map).
// parallax: How much the layer moves relative to the map.
//    1.0 = Moves exactly with the map (glued to ground).
//    >1.0 = Moves faster than map (appears ABOVE ground).
//    <1.0 = Moves slower than map (appears BELOW ground/background).
// zoomScale: How fast it scales up. >1.0 = Expands faster (diving effect).
const LAYERS = [
  {
    id: 'primary',
    texture: 'new_cloud.png',
    baseSize: 2400,        // LARGE clouds
    parallax: 1.20,        // Highest layer, moves fastest
    zoomScale: 1.15,
    baseOpacity: 0.5,      // Sparse, so slightly lower opacity
    blend: 'normal',
    minZoom: 0,            // Always visible
    maxZoom: 10
  },
  {
    id: 'secondary',
    texture: 'scatter_1.png',
    baseSize: 1400,        // MEDIUM clouds
    parallax: 1.10,        // Mid layer
    zoomScale: 1.10,
    baseOpacity: 0.55,
    blend: 'normal',
    minZoom: 0,            // Always visible
    maxZoom: 10
  },
  {
    id: 'tertiary',
    texture: 'scatter_2.png',
    baseSize: 600,         // SMALL detail clouds
    parallax: 1.03,        // Low layer, close to ground
    zoomScale: 1.05,
    baseOpacity: 0.65,     // More visible for detail
    blend: 'normal',
    minZoom: 5.5,          // Only visible when zoomed in
    maxZoom: 10
  }
];

const POSITION_SMOOTHING = 0.12; // Lerp factor for smoother movement (0.1 = loose, 1.0 = rigid)

function CloudLayer({ enabled = true, intensity = 1, onDiagnostics }) {
  const map = useMap();
  const containerRef = useRef(null);
  const reqId = useRef(null);

  // State to track current visual position (for smoothing)
  const visualState = useRef(LAYERS.map(() => ({ x: 0, y: 0, scale: 1 })));

  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;

  useEffect(() => {
    onDiagnostics?.('clouds', { status: 'ok', message: 'Active (Parallax 2.0)' });
  }, [onDiagnostics]);

  useEffect(() => {
    if (!map || !enabled) return;

    // We use a continuous loop to handle the smoothing and "camera" feel
    const loop = () => {
      if (!containerRef.current) return;

      const center = map.getCenter();
      const zoom = map.getZoom();
      const size = map.getSize();
      const centerPoint = map.project(center, zoom);

      // Calculate where the "center" of the world is in screen coordinates
      // This is our anchor.
      const pixelOrigin = map.getPixelOrigin();
      // Or simply: centerPoint.x - pixelOrigin.x = screen center x?
      // map.latLngToContainerPoint(center) should be size.x/2, size.y/2.

      // We want an infinite scroll effect.
      // Position = (WorldPos * ParallaxFactor) % PatternSize

      // Convert map center (lat/lng) to a stable world-space unit (e.g. at zoom 0)
      // centerPoint is in pixels at current zoom.

      // Better approach for seamless tiling:
      // Offset = CenterPointInPixels * ParallaxFactor

      const layerDivs = containerRef.current.children;

      LAYERS.forEach((layer, index) => {
        const div = layerDivs[index];
        if (!div) return;

        // 1. Calculate Target Scale
        // Base scale at zoom 4 (arbitrary reference)
        const zoomDelta = zoom - 4;
        const scale = Math.pow(2, zoomDelta * layer.zoomScale);

        // 2. Calculate Opacity with zoom-based visibility
        let opacity = layer.baseOpacity * intensity;

        // Check zoom bounds
        if (layer.minZoom !== undefined && zoom < layer.minZoom) {
          // Fade in smoothly as we approach minZoom
          const fadeRange = 0.5; // Fade over 0.5 zoom levels
          const fadeProgress = Math.max(0, Math.min(1, (zoom - (layer.minZoom - fadeRange)) / fadeRange));
          opacity *= fadeProgress;
        }

        if (layer.maxZoom !== undefined && zoom > layer.maxZoom) {
          // Fade out smoothly as we exceed maxZoom
          const fadeRange = 0.5;
          const fadeProgress = Math.max(0, Math.min(1, 1 - (zoom - layer.maxZoom) / fadeRange));
          opacity *= fadeProgress;
        }

        div.style.opacity = Math.max(0, opacity);
        if (opacity <= 0.01) {
          div.style.display = 'none';
          return;
        } else {
          div.style.display = 'block';
        }

        // 3. Calculate Position
        // We use modular arithmetic to wrap the texture
        const patternSize = layer.baseSize * scale;

        // World position in pixels at current zoom
        // We use map.project(center) to get absolute pixel coords of center
        const worldX = centerPoint.x;
        const worldY = centerPoint.y;

        // Calculate offset (Center of screen - WorldPos * Parallax)
        // We center the pattern at the screen center initially
        const screenCenterX = size.x / 2;
        const screenCenterY = size.y / 2;

        // Parallax shift:
        // shift = worldPos * factor
        const shiftX = worldX * layer.parallax;
        const shiftY = worldY * layer.parallax;

        // Modulo to keep it within bounds (Infinite tiling)
        // We subtract shift from center to simulate camera moving right -> layer moving left
        // But we want parallax differential.
        // Actually, for background-position:
        // bgPos = -shift + constant

        // Wrap logic
        const bgX = ((-shiftX) % patternSize);
        const bgY = ((-shiftY) % patternSize);

        // Smoothing: REMOVED for tight sync with map (prevents jerky catch-up)
        // We apply scale and position DIRECTLY from the map's current state.

        div.style.backgroundSize = `${layer.baseSize * scale}px ${layer.baseSize * scale}px`;
        div.style.backgroundPosition = `${bgX + screenCenterX}px ${bgY + screenCenterY}px`;
      });
    };

    reqId.current = requestAnimationFrame(function animate() {
      loop();
      reqId.current = requestAnimationFrame(animate);
    });

    return () => {
      if (reqId.current) cancelAnimationFrame(reqId.current);
    };
  }, [map, enabled, intensity]);

  if (!enabled) return null;

  return (
    <div
      ref={containerRef}
      style={{
        zIndex: 50,
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
      }}
    >
      {LAYERS.map((layer) => (
        <div
          key={layer.id}
          style={{
            position: 'absolute',
            inset: -100, // Margin for wrapping safety
            backgroundRepeat: 'repeat',
            backgroundImage: `url(${cleanBase}/clouds/${layer.texture})`,
            mixBlendMode: layer.blend,
            willChange: 'background-position, background-size, opacity',
            transition: 'opacity 0.5s ease',
          }}
        />
      ))}
    </div>
  );
}

export default CloudLayer;
