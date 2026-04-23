import React from 'react';
import { CircleMarker, Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';

function getUnitGlyph(icon) {
  switch (icon) {
    case 'ship':
      return '~';
    case 'cart':
      return '+';
    case 'horse':
      return '>';
    case 'camp':
      return '#';
    case 'banner':
    default:
      return '!';
  }
}

function buildLeaderIcon(unit, isSelected, zoomLevel) {
  const size = Math.max(20, Math.min(34, 24 + (zoomLevel - 4) * 2));
  const glyph = getUnitGlyph(unit.icon);
  const color = unit.color || '#f8d86a';
  return L.divIcon({
    className: [
      'moving-unit-marker',
      `moving-unit-marker--${unit.kind || 'troop'}`,
      isSelected ? 'moving-unit-marker--selected' : '',
    ].join(' '),
    html: `
      <div class="moving-unit-marker__body" style="--unit-color:${color};width:${size}px;height:${size}px;">
        <span class="moving-unit-marker__glyph">${glyph}</span>
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
  onSelectUnit,
}) {
  return (
    <>
      {units.map((unit) => {
        const isSelected = String(unit.id) === String(selectedUnitId);
        return (
          <React.Fragment key={unit.id}>
            {(unit.followers || []).map((follower) => (
              <CircleMarker
                key={follower.id}
                center={[follower.lat, follower.lng]}
                radius={Math.max(3, 5 * (follower.scale || 1))}
                pathOptions={{
                  color: unit.color || '#f8d86a',
                  weight: isSelected ? 2 : 1,
                  fillColor: unit.color || '#f8d86a',
                  fillOpacity: 0.62,
                  opacity: 0.75,
                }}
              />
            ))}

            <Marker
              position={[unit.lat, unit.lng]}
              icon={buildLeaderIcon(unit, isSelected, zoomLevel)}
              eventHandlers={{
                click: () => onSelectUnit?.(unit.id),
              }}
            >
              <Tooltip direction="top" offset={[0, -10]}>
                <strong>{unit.name}</strong>
              </Tooltip>
            </Marker>
          </React.Fragment>
        );
      })}
    </>
  );
}

