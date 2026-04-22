import React, { useEffect, useMemo, useRef, useState } from 'react';
import './SceneCanvas.css';

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

export default function SceneCanvas({
  imageUrl,
  pois = [],
  hiddenPoiIds = [],
  selectedPoiId = null,
  editable = false,
  showLabels = true,
  emptyTitle = 'No scene image yet',
  emptyText = 'Add a scene image to start placing points of interest.',
  onSelectPoi,
  onAddPoi,
  onMovePoi,
  onImageLoad,
}) {
  const frameRef = useRef(null);
  const dragRef = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const hiddenPoiSet = useMemo(
    () => new Set((hiddenPoiIds || []).map((entry) => String(entry))),
    [hiddenPoiIds]
  );

  useEffect(() => {
    if (!dragRef.current) return undefined;

    const handleMove = (event) => {
      if (!dragRef.current || !frameRef.current) return;
      const rect = frameRef.current.getBoundingClientRect();
      if (!rect.width || !rect.height) return;

      const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
      const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
      setIsDragging(true);
      onMovePoi?.(dragRef.current.poiId, { x, y });
    };

    const handleUp = () => {
      dragRef.current = null;
      window.setTimeout(() => setIsDragging(false), 0);
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [onMovePoi]);

  const handleCanvasClick = (event) => {
    if (!editable || !onAddPoi || !frameRef.current || isDragging) return;
    const rect = frameRef.current.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const y = clamp((event.clientY - rect.top) / rect.height, 0, 1);
    onAddPoi({ x, y });
  };

  const startDrag = (event, poiId) => {
    if (!editable) return;
    event.preventDefault();
    event.stopPropagation();
    dragRef.current = { poiId: String(poiId) };
    onSelectPoi?.(String(poiId));
  };

  if (!imageUrl) {
    return (
      <div className="scene-canvas scene-canvas--empty">
        <h4>{emptyTitle}</h4>
        <p>{emptyText}</p>
      </div>
    );
  }

  return (
    <div
      ref={frameRef}
      className={`scene-canvas ${editable ? 'scene-canvas--editable' : ''}`}
      onClick={handleCanvasClick}
    >
      <img
        src={imageUrl}
        alt=""
        className="scene-canvas__image"
        onLoad={(event) =>
          onImageLoad?.({
            width: event.currentTarget.naturalWidth || null,
            height: event.currentTarget.naturalHeight || null,
          })
        }
      />

      <div className="scene-canvas__overlay">
        {pois.map((poi) => {
          const hidden = hiddenPoiSet.has(String(poi.id));
          return (
            <button
              key={poi.id}
              type="button"
              className={`scene-canvas__poi ${String(selectedPoiId) === String(poi.id) ? 'scene-canvas__poi--selected' : ''} ${hidden ? 'scene-canvas__poi--hidden' : ''}`}
              style={{
                left: `${(Number(poi.x) || 0) * 100}%`,
                top: `${(Number(poi.y) || 0) * 100}%`,
              }}
              onClick={(event) => {
                event.stopPropagation();
                onSelectPoi?.(String(poi.id));
              }}
              onMouseDown={(event) => startDrag(event, poi.id)}
              title={poi.name || 'Point of Interest'}
            >
              <span className="scene-canvas__poi-icon" aria-hidden="true">
                {poi.icon || '✦'}
              </span>
              {showLabels && <span className="scene-canvas__poi-label">{poi.name || 'POI'}</span>}
            </button>
          );
        })}
      </div>
    </div>
  );
}
