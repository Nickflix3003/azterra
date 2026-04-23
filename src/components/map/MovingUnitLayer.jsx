import React, { useEffect, useMemo, useRef, useState } from 'react';
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

function limitVector(x, y, maxMagnitude) {
  const magnitude = Math.hypot(x, y);
  if (magnitude <= maxMagnitude || magnitude <= 0.000001) {
    return { x, y };
  }
  const scale = maxMagnitude / magnitude;
  return { x: x * scale, y: y * scale };
}

function buildInitialTroopState(unit) {
  return (unit.followers || []).map((follower, index) => ({
    id: follower.id || `${unit.id}-follower-${index + 1}`,
    lat: follower.lat,
    lng: follower.lng,
    heading: follower.heading ?? unit.heading ?? 0,
    vx: 0,
    vy: 0,
  }));
}

function flockTroopFollowers(unit, previousFollowers, deltaScale) {
  const desiredFollowers = unit.followers || [];
  if (!desiredFollowers.length) return [];

  const maxSpeed = 0.048 * deltaScale;
  const maxForce = 0.022 * deltaScale;
  const separationDistance = 0.24;
  const slotPull = 0.48 * deltaScale;
  const leaderPull = 0.16 * deltaScale;
  const cohesionPull = 0.085 * deltaScale;
  const alignmentPull = 0.11 * deltaScale;
  const separationPush = 0.44 * deltaScale;

  return desiredFollowers.map((desired, index) => {
    const current = previousFollowers[index] || {
      id: desired.id,
      lat: desired.lat,
      lng: desired.lng,
      heading: desired.heading ?? unit.heading ?? 0,
      vx: 0,
      vy: 0,
    };

    let alignX = 0;
    let alignY = 0;
    let cohesionX = 0;
    let cohesionY = 0;
    let separationX = 0;
    let separationY = 0;
    let neighborCount = 0;

    previousFollowers.forEach((neighbor, neighborIndex) => {
      if (neighborIndex === index) return;
      const dx = current.lng - neighbor.lng;
      const dy = current.lat - neighbor.lat;
      const distance = Math.hypot(dx, dy);
      if (distance <= 0.00001) return;

      if (distance < separationDistance) {
        separationX += dx / distance;
        separationY += dy / distance;
      }

      if (distance < 0.62) {
        alignX += neighbor.vx || 0;
        alignY += neighbor.vy || 0;
        cohesionX += neighbor.lng;
        cohesionY += neighbor.lat;
        neighborCount += 1;
      }
    });

    let steerX = 0;
    let steerY = 0;

    steerX += (desired.lng - current.lng) * slotPull;
    steerY += (desired.lat - current.lat) * slotPull;

    steerX += (unit.lng - current.lng) * leaderPull;
    steerY += (unit.lat - current.lat) * leaderPull;

    if (neighborCount > 0) {
      alignX /= neighborCount;
      alignY /= neighborCount;
      cohesionX = cohesionX / neighborCount - current.lng;
      cohesionY = cohesionY / neighborCount - current.lat;

      steerX += alignX * alignmentPull + cohesionX * cohesionPull;
      steerY += alignY * alignmentPull + cohesionY * cohesionPull;
    }

    steerX += separationX * separationPush;
    steerY += separationY * separationPush;

    const limitedForce = limitVector(steerX, steerY, maxForce);
    const nextVelocity = limitVector(
      (current.vx || 0) * 0.78 + limitedForce.x,
      (current.vy || 0) * 0.78 + limitedForce.y,
      maxSpeed
    );

    const nextLat = current.lat + nextVelocity.y;
    const nextLng = current.lng + nextVelocity.x;
    const movementHeading = Math.hypot(nextVelocity.x, nextVelocity.y) > 0.0005
      ? (Math.atan2(nextVelocity.y, nextVelocity.x) * 180) / Math.PI + 90
      : desired.heading ?? current.heading ?? unit.heading ?? 0;

    return {
      id: current.id,
      lat: nextLat,
      lng: nextLng,
      heading: movementHeading,
      vx: nextVelocity.x,
      vy: nextVelocity.y,
    };
  });
}

export default function MovingUnitLayer({
  units = [],
  zoomLevel = 4,
  selectedUnitId = null,
  isEditorMode = false,
  troopEffectsEnabled = false,
  onSelectUnit,
  onDragUnitEnd,
}) {
  const [troopFollowerState, setTroopFollowerState] = useState({});
  const troopFollowerStateRef = useRef({});
  const troopUnitsRef = useRef([]);

  const troopUnits = useMemo(
    () => units.filter((unit) => unit.kind === 'troop' && (unit.followers || []).length),
    [units]
  );
  const troopUnitsSignature = useMemo(
    () => troopUnits.map((unit) => `${unit.id}:${unit.followers?.length || 0}`).join('|'),
    [troopUnits]
  );

  useEffect(() => {
    troopUnitsRef.current = troopUnits;
  }, [troopUnits]);

  useEffect(() => {
    if (!troopEffectsEnabled) {
      troopFollowerStateRef.current = {};
      setTroopFollowerState({});
      return;
    }

    const nextState = Object.fromEntries(
      troopUnits.map((unit) => {
        const previous = troopFollowerStateRef.current[String(unit.id)];
        if (previous?.length === unit.followers.length) {
          return [String(unit.id), previous];
        }
        return [String(unit.id), buildInitialTroopState(unit)];
      })
    );
    troopFollowerStateRef.current = nextState;
    setTroopFollowerState(nextState);
  }, [troopEffectsEnabled, troopUnits, troopUnitsSignature]);

  useEffect(() => {
    if (!troopEffectsEnabled || !troopUnitsRef.current.length) return undefined;

    let frameId = 0;
    let lastFrame = performance.now();

    const step = (timestamp) => {
      const deltaMs = Math.min(42, timestamp - lastFrame || 16);
      lastFrame = timestamp;
      const deltaScale = deltaMs / 16;

      setTroopFollowerState((previousState) => {
        const nextState = Object.fromEntries(
          troopUnitsRef.current.map((unit) => {
            const previousFollowers = previousState[String(unit.id)] || buildInitialTroopState(unit);
            return [String(unit.id), flockTroopFollowers(unit, previousFollowers, deltaScale)];
          })
        );
        troopFollowerStateRef.current = nextState;
        return nextState;
      });

      frameId = window.requestAnimationFrame(step);
    };

    frameId = window.requestAnimationFrame(step);
    return () => {
      if (frameId) {
        window.cancelAnimationFrame(frameId);
      }
    };
  }, [troopEffectsEnabled, troopUnitsSignature]);

  return (
    <>
      {units.map((unit) => {
        const isSelected = String(unit.id) === String(selectedUnitId);
        const leaderColor = unit.color || '#f8d86a';
        const heading = unit.heading ?? 0;
        const renderedFollowers =
          troopEffectsEnabled && unit.kind === 'troop'
            ? troopFollowerState[String(unit.id)] || buildInitialTroopState(unit)
            : unit.followers || [];

        return (
          <React.Fragment key={unit.id}>
            {renderedFollowers.map((follower) => (
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
