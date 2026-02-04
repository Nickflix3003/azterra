import React, { useEffect, useRef, useState } from 'react';
import { useMap } from 'react-leaflet';
import L from 'leaflet';

// ============================================================================
// CLOUD SYSTEM CONFIGURATION
// ============================================================================
// Layers are ordered from HIGHEST (top, closest to camera) to LOWEST (bottom, closest to map).
//
// parallax: How much the layer moves relative to the map.
//    1.0 = Moves exactly with the map (glued to ground).
//    >1.0 = Moves faster than map (appears ABOVE ground).
//    <1.0 = Moves slower than map (appears in background).
//
// zoomScale: How fast it scales when zooming. >1.0 = Expands faster (diving effect).
// fadeOnZoom: Whether this layer fades out during zoom transitions.
//
const LAYERS = [
  // TOP LAYER: Large, sparse, slow-moving clouds - distinct and visible
  {
    id: 'top',
    texture: 'new_cloud.png',
    baseSize: 4000,        // Very large = fewer clouds visible
    parallax: 1.20,        // Highest layer, slow movement
    zoomScale: 1.15,
    baseOpacity: 0.55,     // More visible/distinct
    blend: 'normal',
    minZoom: 0,
    maxZoom: 10,
    fadeOnZoom: true,
  },
  // BOTTOM LAYER: Medium clouds, more apparent
  {
    id: 'bottom',
    texture: 'scatter_1.png',
    baseSize: 2400,        // Larger = fewer clouds
    parallax: 1.08,        // Closer to map movement
    zoomScale: 1.06,
    baseOpacity: 0.65,     // Higher opacity - more distinct
    blend: 'normal',
    minZoom: 3,            // Only visible when zoomed in a bit
    maxZoom: 10,
    fadeOnZoom: false,     // Stays visible for continuity
  }
];

// Zoom fade configuration
const ZOOM_FADE_OUT_DURATION = 150; // ms - quick fade out
const ZOOM_FADE_IN_DURATION = 300;  // ms - slightly slower fade in

function CloudLayer({ enabled = true, intensity = 1, onDiagnostics }) {
  const map = useMap();
  const containerRef = useRef(null);
  const reqId = useRef(null);
  const [isZooming, setIsZooming] = useState(false);
  const zoomTimeoutRef = useRef(null);

  // State to track current visual position (for smoothing)
  const visualState = useRef(LAYERS.map(() => ({ x: 0, y: 0, scale: 1 })));

  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;

  useEffect(() => {
    onDiagnostics?.('clouds', { status: 'ok', message: 'Active (Parallax 2.0)' });
  }, [onDiagnostics]);

  // Handle zoom fade effect
  useEffect(() => {
    if (!map || !enabled) return;

    const handleZoomStart = () => {
      // Clear any pending fade-in
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
        zoomTimeoutRef.current = null;
      }
      setIsZooming(true);
    };

    const handleZoomEnd = () => {
      // Delay the fade-in slightly to let the map settle
      zoomTimeoutRef.current = setTimeout(() => {
        setIsZooming(false);
        zoomTimeoutRef.current = null;
      }, 50);
    };

    map.on('zoomstart', handleZoomStart);
    map.on('zoomend', handleZoomEnd);

    return () => {
      map.off('zoomstart', handleZoomStart);
      map.off('zoomend', handleZoomEnd);
      if (zoomTimeoutRef.current) {
        clearTimeout(zoomTimeoutRef.current);
      }
    };
  }, [map, enabled]);

  // Restore opacity for fadeOnZoom layers after zoom ends
  useEffect(() => {
    if (!containerRef.current) return;
    const layerDivs = containerRef.current.children;

    LAYERS.forEach((layer, index) => {
      if (!layer.fadeOnZoom) return;
      const div = layerDivs[index];
      if (!div) return;

      if (isZooming) {
        // Fade out
        div.style.opacity = '0';
      } else {
        // Fade back to target opacity (stored by animation loop)
        const targetOpacity = div.dataset.targetOpacity || layer.baseOpacity;
        div.style.opacity = targetOpacity;
      }
    });
  }, [isZooming, intensity]);

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

        // Check zoom bounds - fade in/out based on zoom level
        if (layer.minZoom !== undefined && zoom < layer.minZoom) {
          const fadeRange = 0.5;
          const fadeProgress = Math.max(0, Math.min(1, (zoom - (layer.minZoom - fadeRange)) / fadeRange));
          opacity *= fadeProgress;
        }

        if (layer.maxZoom !== undefined && zoom > layer.maxZoom) {
          const fadeRange = 0.5;
          const fadeProgress = Math.max(0, Math.min(1, 1 - (zoom - layer.maxZoom) / fadeRange));
          opacity *= fadeProgress;
        }

        // Store the target opacity as a data attribute for the CSS transition to use
        div.dataset.targetOpacity = opacity;

        // Only set opacity directly if this layer doesn't fade on zoom,
        // or if we're not currently zooming
        // (layers with fadeOnZoom have their opacity controlled by CSS transition)
        if (!layer.fadeOnZoom) {
          div.style.opacity = Math.max(0, opacity);
        }

        if (opacity <= 0.01) {
          div.style.display = 'none';
          return;
        } else {
          div.style.display = 'block';
        }

        // 3. Calculate Position
        const patternSize = layer.baseSize * scale;
        const worldX = centerPoint.x;
        const worldY = centerPoint.y;
        const screenCenterX = size.x / 2;
        const screenCenterY = size.y / 2;

        // Parallax shift
        const shiftX = worldX * layer.parallax;
        const shiftY = worldY * layer.parallax;

        // Wrap with modulo for infinite tiling
        const bgX = ((-shiftX) % patternSize);
        const bgY = ((-shiftY) % patternSize);

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
      {LAYERS.map((layer) => {
        // Apply zoom fade only to layers that have fadeOnZoom enabled
        const shouldFade = layer.fadeOnZoom && isZooming;
        return (
          <div
            key={layer.id}
            data-layer={layer.id}
            style={{
              position: 'absolute',
              inset: -100, // Margin for wrapping safety
              backgroundRepeat: 'repeat',
              backgroundImage: `url(${cleanBase}/clouds/${layer.texture})`,
              mixBlendMode: layer.blend,
              willChange: 'background-position, background-size, opacity',
              pointerEvents: 'none',
              // Per-layer zoom fade
              opacity: shouldFade ? 0 : undefined, // undefined lets the animation loop control it
              transition: layer.fadeOnZoom
                ? (isZooming 
                    ? `opacity ${ZOOM_FADE_OUT_DURATION}ms ease-out` 
                    : `opacity ${ZOOM_FADE_IN_DURATION}ms ease-in`)
                : 'none',
            }}
          />
        );
      })}
    </div>
  );
}

export default CloudLayer;
