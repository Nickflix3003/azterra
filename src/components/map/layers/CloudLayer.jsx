import React, { useEffect, useState, useRef } from 'react';
import { useMap } from 'react-leaflet';

const TEXTURE_PRIMARY = 'scatter_1.png'; // Scattered clouds
const TEXTURE_SECONDARY = 'scatter_2.png'; // Wispy clouds

// Zoom Configuration
// ============================================================================
// TUNEABLE CONFIGURATION - Adjust these to fix zoom behavior
// ============================================================================
const SCALE_SMOOTHING = 0.15;        // How smooth the zoom is (0.01 = very smooth/laggy, 1.0 = instant/jerky)
const POSITION_SMOOTHING = 1.0;      // How smooth the pan is (0.01 = laggy, 1.0 = instant)
const PARALLAX_FACTOR = 0.95;        // Second layer scale multiplier (0.9 = more parallax, 1.0 = none)
const SCALE_CURVE_POWER = 1.5;       // Exponential zoom curve (1.0 = linear, 2.0 = aggressive)
const SCALE_LINEAR_MULTIPLIER = 0.4; // Linear zoom speed
const SCALE_EXP_MULTIPLIER = 0.15;   // Exponential zoom speed

// Position offset correction (adjust if clouds shift during zoom)
const POSITION_SCALE_CORRECTION = 1.0; // Multiply position by this based on scale (try 0.5 to 2.0)
const POSITION_ZOOM_OFFSET_X = 0;      // Add this many pixels per zoom level (X-axis)
const POSITION_ZOOM_OFFSET_Y = 0;      // Add this many pixels per zoom level (Y-axis)
// ============================================================================

const MAX_OPACITY = 0.5;
const ZOOM_FOG_START = 2;
const ZOOM_FOG_END = 6;

const computeOpacity = (zoom = 0) => {
  if (zoom <= ZOOM_FOG_START) return 0;
  if (zoom >= ZOOM_FOG_END) return MAX_OPACITY;
  return ((zoom - ZOOM_FOG_START) / (ZOOM_FOG_END - ZOOM_FOG_START)) * MAX_OPACITY;
};

const computeScale = (zoom = 0) => {
  if (zoom <= ZOOM_FOG_START) return 1;
  const zoomDelta = zoom - ZOOM_FOG_START;
  return 1 + (zoomDelta * SCALE_LINEAR_MULTIPLIER) + Math.pow(zoomDelta, SCALE_CURVE_POWER) * SCALE_EXP_MULTIPLIER;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function CloudLayer({ enabled = true, intensity = 1, onDiagnostics }) {
  const map = useMap();
  const containerRef = useRef(null);
  const layer1Ref = useRef(null);
  const layer2Ref = useRef(null);
  const reqId = useRef(null);

  // Track a reference point in lat/lng space (map center at initialization)
  const referencePoint = useRef(null);
  const referencePixel = useRef(null);

  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const urlPrimary = `${cleanBase}/clouds/${TEXTURE_PRIMARY}`;
  const urlSecondary = `${cleanBase}/clouds/${TEXTURE_SECONDARY}`;

  useEffect(() => {
    onDiagnostics?.('clouds', { status: 'ok', message: 'Active (Transform Sync)' });
  }, [onDiagnostics]);

  useEffect(() => {
    if (!map || !enabled) return;

    // Define a fixed reference point in lat/lng (map center when component loads)
    const mapBounds = map.getBounds();
    const center = mapBounds.getCenter();
    const referenceLatLng = center;

    // Define map-locked markers at specific lat/lng positions
    const ne = mapBounds.getNorthEast();
    const sw = mapBounds.getSouthWest();

    const mapMarkers = [
      { lat: center.lat, lng: center.lng, color: '#FF00AA', size: 28 },
      { lat: ne.lat * 0.75 + center.lat * 0.25, lng: ne.lng * 0.75 + center.lng * 0.25, color: '#00FF88', size: 20 },
      { lat: ne.lat * 0.75 + center.lat * 0.25, lng: sw.lng * 0.75 + center.lng * 0.25, color: '#0088FF', size: 20 },
      { lat: sw.lat * 0.75 + center.lat * 0.25, lng: ne.lng * 0.75 + center.lng * 0.25, color: '#FFAA00', size: 20 },
      { lat: sw.lat * 0.75 + center.lat * 0.25, lng: sw.lng * 0.75 + center.lng * 0.25, color: '#AA00FF', size: 20 },
    ];

    let currentScale1 = 1;
    let currentScale2 = PARALLAX_FACTOR;

    // Store marker screen positions
    let markerPositions = mapMarkers.map(() => ({ x: 0, y: 0 }));

    const loop = () => {
      const zoom = map.getZoom();
      const targetScale = computeScale(zoom);
      const opacity = computeOpacity(zoom);

      // Get screen position of reference point
      const refScreen = map.latLngToContainerPoint(referenceLatLng);
      const mapSize = map.getSize();

      // Background position should keep the reference point centered
      // This makes clouds stick to map positions
      const bgX = refScreen.x - (mapSize.x / 2);
      const bgY = refScreen.y - (mapSize.y / 2);

      // Update map marker positions
      mapMarkers.forEach((marker, i) => {
        const screenPos = map.latLngToContainerPoint([marker.lat, marker.lng]);
        markerPositions[i] = { x: screenPos.x, y: screenPos.y };
      });

      // Smooth scale only (position is instant)
      currentScale1 += (targetScale - currentScale1) * SCALE_SMOOTHING;
      currentScale2 += (targetScale * PARALLAX_FACTOR - currentScale2) * SCALE_SMOOTHING;

      const finalOpacity = clamp(opacity * intensity, 0, 1);

      if (containerRef.current) {
        containerRef.current.style.opacity = finalOpacity;
        containerRef.current.style.display = finalOpacity <= 0.01 ? 'none' : 'block';
      }

      if (layer1Ref.current) {
        // Move the entire layer (including circles) with translate
        // Background position stays at 0,0 relative to the layer
        layer1Ref.current.style.transform = `translate(${bgX}px, ${bgY}px) scale(${currentScale1})`;
        layer1Ref.current.style.backgroundPosition = '0px 0px';
      }
      if (layer2Ref.current) {
        // Apply parallax to translation for depth effect
        const parallaxBgX = bgX * PARALLAX_FACTOR;
        const parallaxBgY = bgY * PARALLAX_FACTOR;
        layer2Ref.current.style.transform = `translate(${parallaxBgX}px, ${parallaxBgY}px) scale(${currentScale2})`;
        layer2Ref.current.style.backgroundPosition = '0px 0px';
      }

      // Update map marker DOM elements directly
      const mapMarkerElements = containerRef.current?.querySelectorAll('.map-locked-marker');
      mapMarkerElements?.forEach((el, i) => {
        if (markerPositions[i]) {
          el.style.left = `${markerPositions[i].x}px`;
          el.style.top = `${markerPositions[i].y}px`;
        }
      });

      reqId.current = requestAnimationFrame(loop);
    };

    reqId.current = requestAnimationFrame(loop);

    return () => {
      if (reqId.current) cancelAnimationFrame(reqId.current);
    };
  }, [map, enabled, intensity]);

  if (!enabled) return null;

  const sharedStyle = {
    position: 'absolute',
    inset: 0,  // Changed from -50% / 200% to normal size
    backgroundRepeat: 'repeat',
    backgroundSize: '1000px auto',
    mixBlendMode: 'screen',
    pointerEvents: 'none',
    transition: 'none',
    transformOrigin: 'center center',
    willChange: 'transform',
    imageRendering: 'auto',
    backfaceVisibility: 'hidden',
  };

  return (
    <div
      ref={containerRef}
      style={{
        zIndex: 50,
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        overflow: 'hidden',
        transition: 'none',
        willChange: 'opacity',
        opacity: 0,
      }}
    >
      <div
        ref={layer1Ref}
        style={{
          ...sharedStyle,
          backgroundImage: `url(${urlPrimary})`,
        }}
      >
        {/* === CIRCLES = Move WITH CLOUDS === */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: '30px', height: '30px', background: '#FF0000', borderRadius: '50%', transform: 'translate(-50%, -50%)', zIndex: 9999, mixBlendMode: 'normal', opacity: 0.9, border: '3px solid #FFFFFF', boxShadow: '0 0 15px #FF0000' }} />
        <div style={{ position: 'absolute', top: '25%', left: '25%', width: '22px', height: '22px', background: '#00FF00', borderRadius: '50%', zIndex: 9999, mixBlendMode: 'normal', opacity: 0.9, border: '2px solid #000000', boxShadow: '0 0 10px #00FF00' }} />
        <div style={{ position: 'absolute', top: '25%', left: '75%', width: '22px', height: '22px', background: '#00FFFF', borderRadius: '50%', zIndex: 9999, mixBlendMode: 'normal', opacity: 0.9, border: '2px solid #000000', boxShadow: '0 0 10px #00FFFF' }} />
        <div style={{ position: 'absolute', top: '75%', left: '25%', width: '22px', height: '22px', background: '#FFFF00', borderRadius: '50%', zIndex: 9999, mixBlendMode: 'normal', opacity: 0.9, border: '2px solid #000000', boxShadow: '0 0 10px #FFFF00' }} />
        <div style={{ position: 'absolute', top: '75%', left: '75%', width: '22px', height: '22px', background: '#FF00FF', borderRadius: '50%', zIndex: 9999, mixBlendMode: 'normal', opacity: 0.9, border: '2px solid #000000', boxShadow: '0 0 10px #FF00FF' }} />
      </div>
      <div
        ref={layer2Ref}
        style={{
          ...sharedStyle,
          backgroundImage: `url(${urlSecondary})`,
          backgroundSize: '800px auto',
        }}
      />

      {/* === SQUARES = TRUE MAP-LOCKED (convert lat/lng to screen coords) === */}
      <div className="map-locked-marker" style={{ position: 'absolute', width: '28px', height: '28px', background: '#FF00AA', transform: 'translate(-50%, -50%)', zIndex: 10000, mixBlendMode: 'normal', opacity: 1, border: '4px solid #FFFFFF', boxShadow: '0 0 20px #FF00AA', borderRadius: '4px' }} />
      <div className="map-locked-marker" style={{ position: 'absolute', width: '20px', height: '20px', background: '#00FF88', transform: 'translate(-50%, -50%)', zIndex: 10000, mixBlendMode: 'normal', opacity: 1, border: '3px solid #000000', boxShadow: '0 0 15px #00FF88', borderRadius: '4px' }} />
      <div className="map-locked-marker" style={{ position: 'absolute', width: '20px', height: '20px', background: '#0088FF', transform: 'translate(-50%, -50%)', zIndex: 10000, mixBlendMode: 'normal', opacity: 1, border: '3px solid #000000', boxShadow: '0 0 15px #0088FF', borderRadius: '4px' }} />
      <div className="map-locked-marker" style={{ position: 'absolute', width: '20px', height: '20px', background: '#FFAA00', transform: 'translate(-50%, -50%)', zIndex: 10000, mixBlendMode: 'normal', opacity: 1, border: '3px solid #000000', boxShadow: '0 0 15px #FFAA00', borderRadius: '4px' }} />
      <div className="map-locked-marker" style={{ position: 'absolute', width: '20px', height: '20px', background: '#AA00FF', transform: 'translate(-50%, -50%)', zIndex: 10000, mixBlendMode: 'normal', opacity: 1, border: '3px solid #000000', boxShadow: '0 0 15px #AA00FF', borderRadius: '4px' }} />
    </div>
  );
}

export default CloudLayer;