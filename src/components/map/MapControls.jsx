/**
 * MapControls.jsx
 *
 * Small, focused Leaflet-aware components that live inside <MapContainer>.
 * Extracted from InteractiveMap.jsx to keep that file manageable.
 *
 * Exports:
 *   InvertedYTileLayer    - custom tile layer with inverted Y coords
 *   KeyboardControls      - WASD + arrow-key panning
 *   ZoomControls          - +/- zoom buttons
 *   BoundsEnforcer        - keeps the view inside the world boundary
 *   MapInstanceProvider   - surfaces the Leaflet map instance to React state
 *   ZoomWatcher           - fires a callback whenever zoom changes
 *   EditorPlacementHandler - handles map clicks for marker placement
 *   RegionDrawingHandler   - handles clicks/dblclick for polygon drawing
 *   LabelPlacementHandler  - handles clicks for text label placement
 */

import { useEffect, useRef } from 'react';
import { useMap, useMapEvent } from 'react-leaflet';
import L from 'leaflet';
import {
  ASSET_BASE_URL,
  TILE_MAX_ZOOM_LEVEL,
  BASE_TILE_COLS,
  BASE_TILE_ROWS,
  PAN_STEP,
} from '../../constants/mapConstants';

// ─── Tile helpers ─────────────────────────────────────────────────────────────

const getTileCountForZoom = (z) => {
  const factor = Math.pow(2, TILE_MAX_ZOOM_LEVEL - z);
  return {
    x: Math.ceil(BASE_TILE_COLS / factor),
    y: Math.ceil(BASE_TILE_ROWS / factor),
  };
};

const EMPTY_TILE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

// ─── Components ───────────────────────────────────────────────────────────────

export function InvertedYTileLayer({
  minZoom,
  maxZoom,
  maxNativeZoom,
  minNativeZoom,
  tileSize,
  keepBuffer,
}) {
  const map = useMap();

  useEffect(() => {
    const LayerClass = L.TileLayer.extend({
      getTileUrl(coords) {
        const counts = getTileCountForZoom(coords.z);
        if (
          coords.x < 0 || coords.y < 0 ||
          coords.x >= counts.x || coords.y >= counts.y
        ) {
          return EMPTY_TILE;
        }
        const invertedY = counts.y - 1 - coords.y;
        return `${ASSET_BASE_URL}tiles/${coords.z}/${coords.x}/${invertedY}.jpg`;
      },
    });

    const layer = new LayerClass('', {
      minZoom,
      maxZoom,
      maxNativeZoom,
      minNativeZoom,
      tileSize,
      noWrap: true,
      keepBuffer,
      reuseTiles: true,
      updateWhenIdle: false,
      updateWhenZooming: true,
    });
    layer.addTo(map);
    return () => { layer.removeFrom(map); };
  }, [map, minZoom, maxZoom, maxNativeZoom, minNativeZoom, tileSize, keepBuffer]);

  return null;
}

export function KeyboardControls() {
  const map = useMap();

  useEffect(() => {
    const handleKeyDown = (e) => {
      const center = map.getCenter();
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          map.panTo([center.lat - PAN_STEP, center.lng]);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          map.panTo([center.lat + PAN_STEP, center.lng]);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          map.panTo([center.lat, center.lng - PAN_STEP]);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          map.panTo([center.lat, center.lng + PAN_STEP]);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [map]);

  return null;
}

export function ZoomControls() {
  const map = useMap();
  return (
    <div className="zoom-controls">
      <button
        className="zoom-button"
        type="button"
        aria-label="Zoom in"
        onClick={() => map.zoomIn()}
      >
        +
      </button>
      <button
        className="zoom-button"
        type="button"
        aria-label="Zoom out"
        onClick={() => map.zoomOut()}
      >
        -
      </button>
    </div>
  );
}

export function BoundsEnforcer({ bounds, enabled = true, debug = false }) {
  const map = useMap();
  const isCorrectingRef = useRef(false);

  useEffect(() => {
    if (debug) {
      console.log('[BoundsEnforcer] Mounted, enabled:', enabled);
    }
  }, [bounds, enabled, debug]);

  useMapEvent('move', () => {
    if (!enabled || isCorrectingRef.current) return;
    const center = map.getCenter();
    let needsCorrection = false;
    let newLat = center.lat;
    let newLng = center.lng;

    if (center.lat < bounds.getSouth())      { newLat = bounds.getSouth(); needsCorrection = true; }
    else if (center.lat > bounds.getNorth()) { newLat = bounds.getNorth(); needsCorrection = true; }
    if (center.lng < bounds.getWest())       { newLng = bounds.getWest(); needsCorrection = true; }
    else if (center.lng > bounds.getEast())  { newLng = bounds.getEast(); needsCorrection = true; }

    if (needsCorrection) {
      if (debug) console.log('[BoundsEnforcer] Correcting move');
      isCorrectingRef.current = true;
      map.panTo([newLat, newLng], { animate: false });
      requestAnimationFrame(() => { isCorrectingRef.current = false; });
    }
  });

  useMapEvent('moveend', () => {
    if (!enabled || isCorrectingRef.current) return;
    const center = map.getCenter();
    let needsCorrection = false;
    let newLat = center.lat;
    let newLng = center.lng;

    if (center.lat < bounds.getSouth())      { newLat = bounds.getSouth(); needsCorrection = true; }
    else if (center.lat > bounds.getNorth()) { newLat = bounds.getNorth(); needsCorrection = true; }
    if (center.lng < bounds.getWest())       { newLng = bounds.getWest(); needsCorrection = true; }
    else if (center.lng > bounds.getEast())  { newLng = bounds.getEast(); needsCorrection = true; }

    if (needsCorrection) {
      if (debug) console.log('[BoundsEnforcer] Correcting moveend');
      isCorrectingRef.current = true;
      map.panTo([newLat, newLng], { animate: true, duration: 0.2 });
      setTimeout(() => { isCorrectingRef.current = false; }, 250);
    }
  });

  return null;
}

export function MapInstanceProvider({ onMapReady }) {
  const map = useMap();
  useEffect(() => {
    if (map && onMapReady) {
      console.log('[MapInstanceProvider] Map instance ready');
      onMapReady(map);
    }
  }, [map, onMapReady]);
  return null;
}

export function ZoomWatcher({ onZoomChange }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !onZoomChange) return;
    const sync = () => onZoomChange(map.getZoom());
    sync();
    map.on('zoom', sync);
    map.on('zoomend', sync);
    map.on('zoomlevelschange', sync);
    return () => {
      map.off('zoom', sync);
      map.off('zoomend', sync);
      map.off('zoomlevelschange', sync);
    };
  }, [map, onZoomChange]);
  return null;
}

export function EditorPlacementHandler({ isEnabled, onPlaceMarker }) {
  useMapEvent('click', (event) => {
    if (!isEnabled) return;
    onPlaceMarker(event.latlng);
  });
  return null;
}

export function RegionDrawingHandler({ isActive, onAddPoint, onFinish }) {
  useMapEvent('click', (event) => {
    if (!isActive) return;
    onAddPoint(event.latlng);
  });
  useMapEvent('dblclick', (event) => {
    if (!isActive) return;
    event.originalEvent?.preventDefault();
    onFinish();
  });
  return null;
}

export function LabelPlacementHandler({ isActive, onPlace }) {
  useMapEvent('click', (event) => {
    if (!isActive) return;
    onPlace(event.latlng);
  });
  return null;
}
