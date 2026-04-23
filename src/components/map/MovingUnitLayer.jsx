import React from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';

function getKindLabel(kind) {
  switch (kind) {
    case 'fleet':
      return 'Fleet';
    case 'caravan':
      return 'Caravan';
    case 'patrol':
      return 'Patrol';
    case 'other':
      return 'Unit';
    case 'troop':
    default:
      return 'Troop';
  }
}

function buildArrowIcon({ color, heading = 0, zoomLevel = 4, isSelected = false, isFollower = false }) {
  const size = isFollower
    ? Math.max(10, Math.min(18, 11 + (zoomLevel - 4) * 0.8))
    : Math.max(22, Math.min(36, 24 + (zoomLevel - 4) * 2.2));
  const glow = isSelected && !isFollower ? 2 : 0;
  const opacity = isFollower ? 0.84 : 1;
  const strokeOpacity = isFollower ? 0.68 : 0.92;

  return L.divIcon({
    className: [
      'moving-unit-marker',
      isFollower ? 'moving-unit-marker--follower' : 'moving-unit-marker--leader',
      isSelected ? 'moving-unit-marker--selected' : '',
    ].join(' '),
    html: `
      <div
        class="moving-unit-marker__body"
        style="--unit-color:${color};--unit-size:${size}px;--unit-glow:${glow}px;--unit-opacity:${opacity};--unit-stroke-opacity:${strokeOpacity};transform: rotate(${heading}deg);"
      >
        <svg class="moving-unit-marker__arrow" viewBox="0 0 36 36" aria-hidden="true">
          <path d="M18 2 L31 30 L20.5 25.7 L18 34 L15.5 25.7 L5 30 Z" />
        </svg>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

export default function MovingUnitLayer({
  units = [],
  zoomLevel = 4,
  selectedUnitId = null,
  isEditorMode = false,
  onSelectUnit,
  onDragUnitEnd,
}) {
  return (
    <>
      {units.map((unit) => {
        const isSelected = String(unit.id) === String(selectedUnitId);
        const leaderColor = unit.color || '#f8d86a';
        const heading = unit.heading ?? 0;

        return (
          <React.Fragment key={unit.id}>
            {(unit.followers || []).map((follower) => (
              <Marker
                key={follower.id}
                position={[follower.lat, follower.lng]}
                icon={buildArrowIcon({
                  color: leaderColor,
                  heading: follower.heading ?? heading,
                  zoomLevel,
                  isFollower: true,
                })}
                interactive={false}
                keyboard={false}
                zIndexOffset={200}
              />
            ))}

            <Marker
              position={[unit.lat, unit.lng]}
              icon={buildArrowIcon({
                color: leaderColor,
                heading,
                zoomLevel,
                isSelected,
              })}
              draggable={isEditorMode}
              zIndexOffset={isSelected ? 1200 : 900}
              eventHandlers={{
                click: () => onSelectUnit?.(unit.id),
                dragstart: () => onSelectUnit?.(unit.id),
                dragend: (event) => {
                  const latlng = event.target?.getLatLng?.();
                  if (!latlng) return;
                  onDragUnitEnd?.(unit.id, latlng);
                },
              }}
            >
              <Tooltip direction="top" offset={[0, -10]}>
                <strong>{unit.name}</strong>
                <div>{getKindLabel(unit.kind)}</div>
              </Tooltip>
            </Marker>
          </React.Fragment>
        );
      })}
    </>
  );
}
