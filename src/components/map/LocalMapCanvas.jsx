import React, { useEffect, useMemo, useRef, useState } from 'react';
import './LocalMapCanvas.css';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function getDistance(pointA, pointB) {
  const dx = pointA.x - pointB.x;
  const dy = pointA.y - pointB.y;
  return Math.sqrt(dx * dx + dy * dy);
}

export default function LocalMapCanvas({
  imageUrl,
  markers = [],
  selectedMarkerKey = null,
  editable = false,
  placementMode = 'inspect',
  minZoom = 1,
  maxZoom = 2.2,
  emptyTitle = 'No local map yet',
  emptyText = 'Upload a local map image to start placing points of interest.',
  onSelectMarker,
  onAddMarker,
  onMoveMarker,
  onImageLoad,
}) {
  const frameRef = useRef(null);
  const gestureRef = useRef(null);
  const [viewport, setViewport] = useState({ zoom: minZoom, x: 0, y: 0 });

  useEffect(() => {
    setViewport({ zoom: minZoom, x: 0, y: 0 });
  }, [imageUrl, minZoom]);

  const cursorClass = useMemo(() => {
    if (!editable) return '';
    if (placementMode === 'add-local') return 'local-map-canvas--placing-poi';
    if (placementMode === 'add-linked') return 'local-map-canvas--placing-link';
    return '';
  }, [editable, placementMode]);

  useEffect(() => {
    const handlePointerMove = (event) => {
      const gesture = gestureRef.current;
      if (!gesture || !frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      if (gesture.type === 'marker') {
        const nextX = clamp((event.clientX - rect.left - viewport.x) / (rect.width * viewport.zoom), 0, 1);
        const nextY = clamp((event.clientY - rect.top - viewport.y) / (rect.height * viewport.zoom), 0, 1);
        onMoveMarker?.(gesture.markerKey, { x: nextX, y: nextY });
        return;
      }

      if (gesture.type === 'pan') {
        const dx = event.clientX - gesture.startPoint.x;
        const dy = event.clientY - gesture.startPoint.y;
        if (getDistance({ x: 0, y: 0 }, { x: dx, y: dy }) > 4) {
          gesture.moved = true;
        }
        setViewport((prev) => ({
          ...prev,
          x: gesture.origin.x + dx,
          y: gesture.origin.y + dy,
        }));
      }
    };

    const handlePointerUp = (event) => {
      const gesture = gestureRef.current;
      if (!gesture || !frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      const activePlacement = editable && placementMode !== 'inspect';

      if (gesture.type === 'pan' && activePlacement && !gesture.moved && rect.width && rect.height) {
        const x = clamp((event.clientX - rect.left - viewport.x) / (rect.width * viewport.zoom), 0, 1);
        const y = clamp((event.clientY - rect.top - viewport.y) / (rect.height * viewport.zoom), 0, 1);
        onAddMarker?.({ x, y });
      }

      gestureRef.current = null;
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, [editable, onAddMarker, onMoveMarker, placementMode, viewport.x, viewport.y, viewport.zoom]);

  const handleWheel = (event) => {
    if (!frameRef.current || !imageUrl) return;
    event.preventDefault();

    const rect = frameRef.current.getBoundingClientRect();
    const pointerX = event.clientX - rect.left;
    const pointerY = event.clientY - rect.top;

    setViewport((prev) => {
      const nextZoom = clamp(prev.zoom + (event.deltaY < 0 ? 0.12 : -0.12), minZoom, maxZoom);
      if (nextZoom === prev.zoom) return prev;

      const scaleRatio = nextZoom / prev.zoom;
      return {
        zoom: nextZoom,
        x: pointerX - (pointerX - prev.x) * scaleRatio,
        y: pointerY - (pointerY - prev.y) * scaleRatio,
      };
    });
  };

  const startPan = (event) => {
    if (!frameRef.current) return;
    gestureRef.current = {
      type: 'pan',
      startPoint: { x: event.clientX, y: event.clientY },
      origin: { x: viewport.x, y: viewport.y },
      moved: false,
    };
  };

  const startMarkerDrag = (event, markerKey) => {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    gestureRef.current = { type: 'marker', markerKey };
    onSelectMarker?.(markerKey);
  };

  if (!imageUrl) {
    return (
      <div className="local-map-canvas local-map-canvas--empty">
        <h4>{emptyTitle}</h4>
        <p>{emptyText}</p>
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      className={`local-map-canvas ${cursorClass}`}
      onPointerDown={startPan}
      onWheel={handleWheel}
    >
      <div
        className="local-map-canvas__stage"
        style={{
          transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})`,
          transformOrigin: 'top left',
        }}
      >
        <img
          src={imageUrl}
          alt=""
          className="local-map-canvas__image"
          onLoad={(event) =>
            onImageLoad?.({
              width: event.currentTarget.naturalWidth || null,
              height: event.currentTarget.naturalHeight || null,
            })
          }
        />
        <div className="local-map-canvas__overlay">
          {markers.map((marker) => (
            <button
              key={marker.key}
              type="button"
              className={`local-map-canvas__marker ${
                String(selectedMarkerKey) === String(marker.key) ? 'local-map-canvas__marker--selected' : ''
              } ${marker.kind === 'linked' ? 'local-map-canvas__marker--linked' : ''}`}
              style={{
                left: `${(Number(marker.x) || 0) * 100}%`,
                top: `${(Number(marker.y) || 0) * 100}%`,
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectMarker?.(marker.key);
              }}
              onPointerDown={(event) => startMarkerDrag(event, marker.key)}
              title={marker.label}
            >
              <span className="local-map-canvas__marker-icon" aria-hidden="true">
                {marker.icon || (marker.kind === 'linked' ? '@' : '*')}
              </span>
              <span className="local-map-canvas__marker-label">{marker.label}</span>
            </button>
          ))}
        </div>
      </div>
      <div className="local-map-canvas__zoom-readout">Zoom {viewport.zoom.toFixed(1)}x</div>
    </div>
  );
}
