import React, { useEffect, useRef } from 'react';
import { useMap } from 'react-leaflet';

const TEXTURE_PRIMARY = 'new_cloud.png'; // Large distant clouds
const TEXTURE_SECONDARY = 'scatter_1.png'; // Mid layer
const TEXTURE_TERTIARY = 'scatter_2.png'; // Fine detail clouds

// Zoom Configuration
// ============================================================================
// TUNEABLE CONFIGURATION - Adjust these to fix zoom behavior
// ============================================================================
const SCALE_SMOOTHING = 1.0;         // Match map zoom easing (map handles smoothing)
const POSITION_SMOOTHING = 1.0;      // How smooth the pan/zoom alignment is (0.01 = laggy, 1.0 = instant)
const OPACITY_SMOOTHING = 0.12;
const CLOUD_ZOOM_FACTOR_PRIMARY = 0.6; // Distant layer: slowest zoom
const CLOUD_ZOOM_FACTOR_SECONDARY = 0.75;
const CLOUD_ZOOM_FACTOR_TERTIARY = 0.9; // Detail layer: closer to land zoom
const CLOUD_PAN_FACTOR_PRIMARY = 0.5;  // Distant layer: slowest pan
const CLOUD_PAN_FACTOR_SECONDARY = 0.7;
const CLOUD_PAN_FACTOR_TERTIARY = 0.9;
const SCALE_CURVE_POWER = 1.5;       // Exponential zoom curve (1.0 = linear, 2.0 = aggressive)
const SCALE_LINEAR_MULTIPLIER = 0.4; // Linear zoom speed
const SCALE_EXP_MULTIPLIER = 0.15;   // Exponential zoom speed

// Position offset correction (adjust if clouds shift during zoom)
const POSITION_ZOOM_OFFSET_X = 0;      // Add this many pixels per zoom level (X-axis)
const POSITION_ZOOM_OFFSET_Y = 0;      // Add this many pixels per zoom level (Y-axis)
// ============================================================================

const MAX_OPACITY = 0.5;
const ZOOM_FOG_START = 2;
const ZOOM_FOG_END = 6;
const BASE_SIZE_PRIMARY = 1600;
const BASE_SIZE_SECONDARY = 1100;
const BASE_SIZE_TERTIARY = 600;

const computeLayerOpacity = (zoom, start, end, maxOpacity) => {
  if (zoom <= start) return 0;
  if (zoom >= end) return maxOpacity;
  return ((zoom - start) / (end - start)) * maxOpacity;
};

const computeBandOpacity = (zoom, inStart, inEnd, outStart, outEnd, maxOpacity) => {
  if (zoom <= inStart) return 0;
  if (zoom >= outEnd) return 0;
  const fadeIn = computeLayerOpacity(zoom, inStart, inEnd, 1);
  const fadeOut = zoom <= outStart ? 1 : 1 - clamp((zoom - outStart) / (outEnd - outStart), 0, 1);
  return maxOpacity * Math.min(fadeIn, fadeOut);
};

const computeScale = (zoom = 0) => {
  if (zoom <= ZOOM_FOG_START) return 1;
  const zoomDelta = zoom - ZOOM_FOG_START;
  return 1 + (zoomDelta * SCALE_LINEAR_MULTIPLIER) + Math.pow(zoomDelta, SCALE_CURVE_POWER) * SCALE_EXP_MULTIPLIER;
};

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

function CloudLayer({ enabled = true, intensity = 1, onDiagnostics, zoomFocusRef }) {
  const map = useMap();
  const containerRef = useRef(null);
  const layer1Ref = useRef(null);
  const layer2Ref = useRef(null);
  const layer3Ref = useRef(null);
  const guidesLayerRef = useRef(null);
  const reqId = useRef(null);
  const referenceLatLngRef = useRef(null);
  const currentOffsetsRef = useRef({
    primary: { x: 0, y: 0 },
    secondary: { x: 0, y: 0 },
    tertiary: { x: 0, y: 0 },
  });
  const currentOpacityRef = useRef({
    primary: 0,
    secondary: 0,
    tertiary: 0,
  });
  const currentScalesRef = useRef({
    primary: 1,
    secondary: 0.95,
    tertiary: 0.9,
  });

  const base = import.meta.env.BASE_URL || '/';
  const cleanBase = base.endsWith('/') ? base.slice(0, -1) : base;
  const urlPrimary = `${cleanBase}/clouds/${TEXTURE_PRIMARY}`;
  const urlSecondary = `${cleanBase}/clouds/${TEXTURE_SECONDARY}`;
  const urlTertiary = `${cleanBase}/clouds/${TEXTURE_TERTIARY}`;

  useEffect(() => {
    onDiagnostics?.('clouds', { status: 'ok', message: 'Active (Transform Sync)' });
  }, [onDiagnostics]);

  useEffect(() => {
    if (!map || !enabled) return;

    const mapBounds = map.getBounds();
    const center = mapBounds.getCenter();
    if (!referenceLatLngRef.current) {
      referenceLatLngRef.current = center;
    }

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

    let currentScale1 = currentScalesRef.current.primary;
    let currentScale2 = currentScalesRef.current.secondary;
    let currentScale3 = currentScalesRef.current.tertiary;

    // Store marker screen positions
    let markerPositions = mapMarkers.map(() => ({ x: 0, y: 0 }));

    const loop = () => {
      const zoom = map.getZoom();
      const targetScale = computeScale(zoom);
      const mapSize = map.getSize();
      const mapCenter = { x: mapSize.x / 2, y: mapSize.y / 2 };
      const centerLatLng = map.getCenter();
      const focusLatLng = zoomFocusRef?.current || centerLatLng;
      referenceLatLngRef.current = focusLatLng;
      const centerPoint = map.project(centerLatLng, zoom);
      const refPoint = map.project(referenceLatLngRef.current, zoom);
      const refScreen = refPoint.subtract(centerPoint).add(mapSize.divideBy(2));
      const panDelta = {
        x: refScreen.x - mapCenter.x,
        y: refScreen.y - mapCenter.y,
      };

      // Update map marker positions
      mapMarkers.forEach((marker, i) => {
        const screenPos = map.latLngToContainerPoint([marker.lat, marker.lng]);
        markerPositions[i] = { x: screenPos.x, y: screenPos.y };
      });

      // Smooth scale changes for more immersive zooming, but dampen vs land.
      const targetScale1 = 1 + (targetScale - 1) * CLOUD_ZOOM_FACTOR_PRIMARY;
      const targetScale2 = 1 + (targetScale - 1) * CLOUD_ZOOM_FACTOR_SECONDARY;
      const targetScale3 = 1 + (targetScale - 1) * CLOUD_ZOOM_FACTOR_TERTIARY;
      currentScale1 += (targetScale1 - currentScale1) * SCALE_SMOOTHING;
      currentScale2 += (targetScale2 - currentScale2) * SCALE_SMOOTHING;
      currentScale3 += (targetScale3 - currentScale3) * SCALE_SMOOTHING;
      currentScalesRef.current.primary = currentScale1;
      currentScalesRef.current.secondary = currentScale2;
      currentScalesRef.current.tertiary = currentScale3;
      const panRatioPrimary = currentScale1 / Math.max(targetScale1, 0.0001);
      const panRatioSecondary = currentScale2 / Math.max(targetScale2, 0.0001);
      const panRatioTertiary = currentScale3 / Math.max(targetScale3, 0.0001);

      const opacityPrimaryTarget = clamp(
        computeBandOpacity(zoom, 2, 3.6, 4.6, 5.8, 0.5) * intensity,
        0,
        1
      );
      const opacitySecondaryTarget = clamp(
        computeBandOpacity(zoom, 2.4, 4.2, 5.4, 6.6, 0.35) * intensity,
        0,
        1
      );
      const opacityTertiaryTarget = clamp(
        computeBandOpacity(zoom, 5.2, 6.8, 7.6, 8.6, 0.35) * intensity,
        0,
        1
      );
      const opacities = currentOpacityRef.current;
      opacities.primary += (opacityPrimaryTarget - opacities.primary) * OPACITY_SMOOTHING;
      opacities.secondary += (opacitySecondaryTarget - opacities.secondary) * OPACITY_SMOOTHING;
      opacities.tertiary += (opacityTertiaryTarget - opacities.tertiary) * OPACITY_SMOOTHING;

      if (containerRef.current) {
        const hasVisible =
          opacities.primary > 0.01 || opacities.secondary > 0.01 || opacities.tertiary > 0.01;
        containerRef.current.style.opacity = 1;
        containerRef.current.style.display = hasVisible ? 'block' : 'none';
      }

      if (layer1Ref.current) {
        const patternSize = Math.max(BASE_SIZE_PRIMARY * currentScale1, 1);
        const targetOffsetX =
          mapCenter.x +
          panDelta.x * panRatioPrimary * CLOUD_PAN_FACTOR_PRIMARY -
          patternSize / 2 +
          zoom * POSITION_ZOOM_OFFSET_X;
        const targetOffsetY =
          mapCenter.y +
          panDelta.y * panRatioPrimary * CLOUD_PAN_FACTOR_PRIMARY -
          patternSize / 2 +
          zoom * POSITION_ZOOM_OFFSET_Y;
        const primary = currentOffsetsRef.current.primary;
        primary.x += (targetOffsetX - primary.x) * POSITION_SMOOTHING;
        primary.y += (targetOffsetY - primary.y) * POSITION_SMOOTHING;
        const offsetX = primary.x;
        const offsetY = primary.y;
        layer1Ref.current.style.backgroundSize = `${patternSize}px ${patternSize}px`;
        layer1Ref.current.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
        layer1Ref.current.style.transform = 'translate(0px, 0px)';
        layer1Ref.current.style.opacity = opacities.primary;

        if (guidesLayerRef.current) {
          guidesLayerRef.current.style.width = `${patternSize}px`;
          guidesLayerRef.current.style.height = `${patternSize}px`;
          guidesLayerRef.current.style.transform = `translate(${offsetX}px, ${offsetY}px)`;
        }
      }
      if (layer2Ref.current) {
        const patternSize = Math.max(BASE_SIZE_SECONDARY * currentScale2, 1);
        const targetOffsetX =
          mapCenter.x +
          panDelta.x * panRatioSecondary * CLOUD_PAN_FACTOR_SECONDARY -
          patternSize / 2 +
          zoom * POSITION_ZOOM_OFFSET_X;
        const targetOffsetY =
          mapCenter.y +
          panDelta.y * panRatioSecondary * CLOUD_PAN_FACTOR_SECONDARY -
          patternSize / 2 +
          zoom * POSITION_ZOOM_OFFSET_Y;
        const secondary = currentOffsetsRef.current.secondary;
        secondary.x += (targetOffsetX - secondary.x) * POSITION_SMOOTHING;
        secondary.y += (targetOffsetY - secondary.y) * POSITION_SMOOTHING;
        const offsetX = secondary.x;
        const offsetY = secondary.y;
        layer2Ref.current.style.backgroundSize = `${patternSize}px ${patternSize}px`;
        layer2Ref.current.style.backgroundPosition = `${offsetX}px ${offsetY}px`;
        layer2Ref.current.style.transform = 'translate(0px, 0px)';
        layer2Ref.current.style.opacity = opacities.secondary;
      }
      if (layer3Ref.current) {
        const patternSize = Math.max(BASE_SIZE_TERTIARY * currentScale3, 1);
        const targetOffsetX =
          mapCenter.x +
          panDelta.x * panRatioTertiary * CLOUD_PAN_FACTOR_TERTIARY -
          patternSize / 2 +
          zoom * POSITION_ZOOM_OFFSET_X;
        const targetOffsetY =
          mapCenter.y +
          panDelta.y * panRatioTertiary * CLOUD_PAN_FACTOR_TERTIARY -
          patternSize / 2 +
          zoom * POSITION_ZOOM_OFFSET_Y;
        const tertiary = currentOffsetsRef.current.tertiary;
        tertiary.x += (targetOffsetX - tertiary.x) * POSITION_SMOOTHING;
        tertiary.y += (targetOffsetY - tertiary.y) * POSITION_SMOOTHING;
        layer3Ref.current.style.backgroundSize = `${patternSize}px ${patternSize}px`;
        layer3Ref.current.style.backgroundPosition = `${tertiary.x}px ${tertiary.y}px`;
        layer3Ref.current.style.transform = 'translate(0px, 0px)';
        layer3Ref.current.style.opacity = opacities.tertiary;
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
  }, [map, enabled, intensity, zoomFocusRef]);

  if (!enabled) return null;

  const sharedStyle = {
    position: 'absolute',
    inset: 0,  // Changed from -50% / 200% to normal size
    backgroundRepeat: 'repeat',
    backgroundSize: '1000px auto',
    mixBlendMode: 'screen',
    pointerEvents: 'none',
    transition: 'none',
    transformOrigin: 'top left',
    willChange: 'background-position, background-size, opacity',
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
        opacity: 1,
      }}
    >
      <div
        ref={layer1Ref}
        style={{
          ...sharedStyle,
          backgroundImage: `url(${urlPrimary})`,
        }}
      >
      </div>
      <div
        ref={layer2Ref}
        style={{
          ...sharedStyle,
          backgroundImage: `url(${urlSecondary})`,
          backgroundSize: '1100px auto',
        }}
      />
      <div
        ref={layer3Ref}
        style={{
          ...sharedStyle,
          backgroundImage: `url(${urlTertiary})`,
          backgroundSize: '600px auto',
          mixBlendMode: 'screen',
          opacity: 0,
        }}
      />
      <div
        ref={guidesLayerRef}
        style={{
          position: 'absolute',
          inset: 0,
          transformOrigin: 'top left',
          pointerEvents: 'none',
          zIndex: 9999,
          mixBlendMode: 'normal',
          opacity: 1,
        }}
      >
        {/* === CIRCLES = Move WITH CLOUDS === */}
        <div style={{ position: 'absolute', top: '50%', left: '50%', width: '30px', height: '30px', background: '#FF0000', borderRadius: '50%', transform: 'translate(-50%, -50%)', zIndex: 9999, mixBlendMode: 'normal', opacity: 1, border: '3px solid #FFFFFF', boxShadow: '0 0 15px #FF0000' }} />
        <div style={{ position: 'absolute', top: '25%', left: '25%', width: '22px', height: '22px', background: '#00FF00', borderRadius: '50%', zIndex: 9999, mixBlendMode: 'normal', opacity: 1, border: '2px solid #000000', boxShadow: '0 0 10px #00FF00' }} />
        <div style={{ position: 'absolute', top: '25%', left: '75%', width: '22px', height: '22px', background: '#00FFFF', borderRadius: '50%', zIndex: 9999, mixBlendMode: 'normal', opacity: 1, border: '2px solid #000000', boxShadow: '0 0 10px #00FFFF' }} />
        <div style={{ position: 'absolute', top: '75%', left: '25%', width: '22px', height: '22px', background: '#FFFF00', borderRadius: '50%', zIndex: 9999, mixBlendMode: 'normal', opacity: 1, border: '2px solid #000000', boxShadow: '0 0 10px #FFFF00' }} />
        <div style={{ position: 'absolute', top: '75%', left: '75%', width: '22px', height: '22px', background: '#FF00FF', borderRadius: '50%', zIndex: 9999, mixBlendMode: 'normal', opacity: 1, border: '2px solid #000000', boxShadow: '0 0 10px #FF00FF' }} />
      </div>

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
