/**
 * LocationMarker.jsx
 *
 * A single map marker. Handles hover, click-to-select, and drag-to-reposition
 * in editor mode.
 *
 * CLICK vs DRAG:
 * We call e.preventDefault() in onPointerDown so the marker doesn't hand the
 * event off to Leaflet (which would start a map pan). That also suppresses the
 * synthetic "click" event. So we fire onLocationClick ourselves in onPointerUp
 * whenever the pointer never moved far enough to count as a drag.
 *
 * WHY CUSTOM DRAG + DRAG THRESHOLD:
 * Leaflet's built-in `draggable` snaps back on fast moves (mouse leaves the
 * element → mouseout → drag cancelled). Document-level pointer tracking fixes
 * that. The 6-px threshold lets a press-and-release register as a click even
 * when the finger/mouse shifts slightly.
 *
 * PINNED MARKERS:
 * When location.pinned is true, pointer tracking still fires (so clicks work)
 * but the drag branch is never entered, keeping the marker anchored.
 */

import React, { useEffect, useRef, useState } from 'react';
import { Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import { clamp } from '../../constants/mapConstants';
import {
  resolveIconKey,
  buildIconSrc,
  getPlaceholderMarkerSrc,
} from '../../utils/markerUtils';

const DRAG_THRESHOLD = 6; // pixels before a press becomes a drag

export default function LocationMarker({
  location,
  onLocationClick,
  onHoverChange,
  isSelected,
  isEditorMode,
  onDragEnd,
  onDragStart,
  zoomLevel,
  resolveIcon,
}) {
  const [isHovered, setIsHovered] = useState(false);
  const markerRef = useRef(null);
  const dragState = useRef(null); // { dragging, startX, startY, lastLatLng }
  const map       = useMap();

  const iconSize = (() => {
    const base  = 36;
    const scale = 1 + (zoomLevel - 4) * 0.08;
    return clamp(base * scale, 20, 64);
  })();

  const resolvedIcon   = resolveIcon ? resolveIcon(location) : { src: buildIconSrc(resolveIconKey(location)) };
  const placeholderSrc = resolvedIcon?.placeholder || getPlaceholderMarkerSrc(location?.type);
  const iconSrc        = resolvedIcon?.src || placeholderSrc;
  const safeName       = (location.name || '').replace(/"/g, '&quot;');
  const isPinned       = Boolean(location.pinned);

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) return;

    const getEl = () => marker.getElement?.();

    if (!isEditorMode) {
      map.dragging.enable();
      return;
    }

    // ── pointer handlers ─────────────────────────────────────────────────────

    const onPointerDown = (e) => {
      if (e.button !== undefined && e.button !== 0) return;
      if (e.target.closest('input, textarea, select, button')) return;

      // Prevent default so the map doesn't start panning and so that Leaflet's
      // synthetic click event (which we replace ourselves) is suppressed.
      e.preventDefault();
      e.stopPropagation();

      dragState.current = {
        dragging: false,
        startX:   e.clientX,
        startY:   e.clientY,
        lastLatLng: null,
      };

      document.addEventListener('pointermove',   onPointerMove, { passive: false });
      document.addEventListener('pointerup',     onPointerUp);
      document.addEventListener('pointercancel', onPointerUp);
    };

    const onPointerMove = (e) => {
      const ds = dragState.current;
      if (!ds) return;

      const dx   = e.clientX - ds.startX;
      const dy   = e.clientY - ds.startY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Pinned markers: track pointer but never drag.
      if (isPinned) return;

      if (!ds.dragging) {
        if (dist < DRAG_THRESHOLD) return; // not yet a drag
        // Threshold crossed — commit to drag
        ds.dragging = true;
        map.dragging.disable();
        onDragStart?.(location.id);
      }

      // Move the marker to follow the pointer
      const rect        = map.getContainer().getBoundingClientRect();
      const containerPt = L.point(e.clientX - rect.left, e.clientY - rect.top);
      const latLng      = map.containerPointToLatLng(containerPt);
      ds.lastLatLng = { lat: latLng.lat, lng: latLng.lng };
      marker.setLatLng(latLng);
    };

    const onPointerUp = (e) => {
      const ds = dragState.current;
      dragState.current = null;

      document.removeEventListener('pointermove',   onPointerMove);
      document.removeEventListener('pointerup',     onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);

      if (!ds) return;

      if (!ds.dragging) {
        // ── CLICK: pointer never crossed the drag threshold ──────────────────
        // map.dragging was never disabled, nothing to re-enable.
        onLocationClick(location);
        return;
      }

      // ── DRAG END ─────────────────────────────────────────────────────────────
      map.dragging.enable();
      onDragEnd?.(location.id, ds.lastLatLng, e);
    };

    // ── attach ───────────────────────────────────────────────────────────────
    const attachListeners = () => {
      const el = getEl();
      if (!el) return;
      el.style.cursor = isPinned ? 'pointer' : 'grab';
      el.addEventListener('pointerdown', onPointerDown);
    };

    const timer = setTimeout(attachListeners, 0);

    return () => {
      clearTimeout(timer);
      const el = getEl();
      if (el) {
        el.removeEventListener('pointerdown', onPointerDown);
        el.style.cursor = '';
      }
      document.removeEventListener('pointermove',   onPointerMove);
      document.removeEventListener('pointerup',     onPointerUp);
      document.removeEventListener('pointercancel', onPointerUp);
      map.dragging.enable();
    };
  }, [isEditorMode, location.id, isPinned, map]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Marker
      ref={markerRef}
      position={[location.lat, location.lng]}
      draggable={false}
      icon={L.divIcon({
        className: [
          'custom-marker',
          `custom-marker--${location.type}`,
          isSelected  ? 'custom-marker--selected' : '',
          isPinned    ? 'custom-marker--pinned'   : '',
        ].join(' '),
        html: `
          <div class="custom-marker__wrapper ${isHovered ? 'is-hovered' : ''}">
            <img
              src="${iconSrc}"
              alt="${safeName}"
              class="custom-marker__image"
              loading="lazy"
              style="width:${iconSize}px;height:${iconSize}px;pointer-events:none;"
              onerror="this.onerror=null;this.dataset.missing='1';this.src='${placeholderSrc}'"
            />
            ${isPinned ? '<span class="custom-marker__lock" title="Position locked">🔒</span>' : ''}
          </div>
        `,
        iconSize:   [iconSize, iconSize],
        iconAnchor: [iconSize / 2, iconSize],
      })}
      eventHandlers={{
        mouseover: () => {
          setIsHovered(true);
          onHoverChange?.({ type: 'location', id: location.id, name: location.name || 'Location' });
        },
        mouseout:  () => {
          setIsHovered(false);
          onHoverChange?.(null);
        },
        // In editor mode clicks are handled in onPointerUp above.
        // In view mode (no pointerdown listener) Leaflet's native click fires.
        click: () => {
          if (isEditorMode) return;
          onLocationClick(location);
        },
      }}
    >
      {isHovered && (
        <Popup>
          <div className="location-popup">
            <h3>{location.name}</h3>
            {isPinned && <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '0.25rem 0 0' }}>🔒 Position locked</p>}
          </div>
        </Popup>
      )}
    </Marker>
  );
}
