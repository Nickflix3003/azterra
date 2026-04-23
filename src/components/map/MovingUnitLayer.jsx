import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';

const DEFAULT_BOID_CONFIG = Object.freeze({
  separationWeight: 1.4,
  alignmentWeight: 0.72,
  cohesionWeight: 0.38,
  anchorPullWeight: 0.82,
  arrivalWeight: 0.66,
  maxSpeed: 0.055,
  maxForce: 0.018,
  neighborRadius: 0.74,
  separationRadius: 0.24,
  idleOrbitRadius: 0.48,
});

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

function hashIndex(seed, index) {
  const source = `${seed}:${index}`;
  let hash = 2166136261;
  for (let cursor = 0; cursor < source.length; cursor += 1) {
    hash ^= source.charCodeAt(cursor);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash >>> 0);
}

function headingFromVelocity(vx, vy, fallback = 0) {
  return Math.hypot(vx, vy) > 0.000001
    ? (Math.atan2(vy, vx) * 180) / Math.PI + 90
    : fallback;
}

function buildInitialTroopBoids(unit) {
  const renderCount = Math.max(0, Math.round(Number(unit.renderCount) || 0));
  const config = { ...DEFAULT_BOID_CONFIG, ...(unit.boidConfig || {}) };
  const orbitRadius = Math.max(0.18, config.idleOrbitRadius * 0.82);

  return Array.from({ length: renderCount }, (_, index) => {
    const hash = hashIndex(unit.id, index);
    const angle = ((index / Math.max(renderCount, 1)) * Math.PI * 2) + ((hash % 360) * Math.PI) / 180;
    const radius = orbitRadius * (0.5 + ((hash % 100) / 100) * 0.55);
    const tangentialSpeed = 0.006 + ((hash % 25) / 25) * 0.008;
    const lat = unit.lat + Math.sin(angle) * radius;
    const lng = unit.lng + Math.cos(angle) * radius;
    const vx = -Math.sin(angle) * tangentialSpeed;
    const vy = Math.cos(angle) * tangentialSpeed;

    return {
      id: `${unit.id}-boid-${index + 1}`,
      lat,
      lng,
      vx,
      vy,
      heading: headingFromVelocity(vx, vy, unit.heading ?? 0),
      orbitDirection: hash % 2 === 0 ? 1 : -1,
      orbitSeed: (hash % 1000) / 1000,
    };
  });
}

function simulateTroopBoids(unit, previousBoids, deltaScale, elapsedMs) {
  const config = { ...DEFAULT_BOID_CONFIG, ...(unit.boidConfig || {}) };
  const anchor = { lat: unit.lat, lng: unit.lng };
  const routeTarget = {
    lat: unit.routeTargetLat ?? unit.lat,
    lng: unit.routeTargetLng ?? unit.lng,
  };
  const anchorMoving = Boolean(unit.anchorMoving);
  const maxSpeed = Math.max(0.005, config.maxSpeed) * deltaScale;
  const maxForce = Math.max(0.002, config.maxForce) * deltaScale;
  const neighborRadius = Math.max(0.1, config.neighborRadius);
  const separationRadius = Math.max(0.05, config.separationRadius);
  const idleOrbitRadius = Math.max(0.14, config.idleOrbitRadius);
  const anchorPullWeight = config.anchorPullWeight * deltaScale;
  const separationWeight = config.separationWeight * deltaScale;
  const alignmentWeight = config.alignmentWeight * deltaScale;
  const cohesionWeight = config.cohesionWeight * deltaScale;
  const arrivalWeight = config.arrivalWeight * deltaScale;
  const orbitWave = Math.sin(elapsedMs / 1200);

  return previousBoids.map((boid, index) => {
    let separationX = 0;
    let separationY = 0;
    let alignmentX = 0;
    let alignmentY = 0;
    let cohesionX = 0;
    let cohesionY = 0;
    let neighborCount = 0;

    previousBoids.forEach((neighbor, neighborIndex) => {
      if (neighborIndex === index) return;
      const dx = boid.lng - neighbor.lng;
      const dy = boid.lat - neighbor.lat;
      const distance = Math.hypot(dx, dy);
      if (distance <= 0.000001) return;

      if (distance < separationRadius) {
        separationX += dx / distance;
        separationY += dy / distance;
      }

      if (distance < neighborRadius) {
        alignmentX += neighbor.vx || 0;
        alignmentY += neighbor.vy || 0;
        cohesionX += neighbor.lng;
        cohesionY += neighbor.lat;
        neighborCount += 1;
      }
    });

    let steerX = 0;
    let steerY = 0;

    steerX += (anchor.lng - boid.lng) * anchorPullWeight;
    steerY += (anchor.lat - boid.lat) * anchorPullWeight;

    if (neighborCount > 0) {
      alignmentX /= neighborCount;
      alignmentY /= neighborCount;
      cohesionX = cohesionX / neighborCount - boid.lng;
      cohesionY = cohesionY / neighborCount - boid.lat;

      steerX += alignmentX * alignmentWeight;
      steerY += alignmentY * alignmentWeight;
      steerX += cohesionX * cohesionWeight;
      steerY += cohesionY * cohesionWeight;
    }

    steerX += separationX * separationWeight;
    steerY += separationY * separationWeight;

    if (anchorMoving) {
      steerX += (routeTarget.lng - boid.lng) * arrivalWeight * 0.4;
      steerY += (routeTarget.lat - boid.lat) * arrivalWeight * 0.4;
    } else {
      const dx = boid.lng - anchor.lng;
      const dy = boid.lat - anchor.lat;
      const distance = Math.max(0.00001, Math.hypot(dx, dy));
      const tangentX = (-dy / distance) * boid.orbitDirection;
      const tangentY = (dx / distance) * boid.orbitDirection;
      const desiredRadius = idleOrbitRadius * (0.68 + boid.orbitSeed * 0.5 + orbitWave * 0.04);
      const radialError = desiredRadius - distance;

      steerX += tangentX * arrivalWeight * 0.32;
      steerY += tangentY * arrivalWeight * 0.32;
      steerX += (dx / distance) * radialError * 0.12;
      steerY += (dy / distance) * radialError * 0.12;
    }

    const limitedForce = limitVector(steerX, steerY, maxForce);
    const nextVelocity = limitVector(
      (boid.vx || 0) * 0.91 + limitedForce.x,
      (boid.vy || 0) * 0.91 + limitedForce.y,
      maxSpeed
    );
    const nextLat = boid.lat + nextVelocity.y;
    const nextLng = boid.lng + nextVelocity.x;

    return {
      ...boid,
      lat: nextLat,
      lng: nextLng,
      vx: nextVelocity.x,
      vy: nextVelocity.y,
      heading: headingFromVelocity(nextVelocity.x, nextVelocity.y, boid.heading ?? unit.heading ?? 0),
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
  const [troopBoidState, setTroopBoidState] = useState({});
  const troopBoidStateRef = useRef({});
  const troopUnitsRef = useRef([]);
  const elapsedMsRef = useRef(0);

  const troopUnits = useMemo(
    () => units.filter(
      (unit) =>
        unit.kind === 'troop' &&
        (unit.simulationMode || 'boids') === 'boids' &&
        (Number(unit.renderCount) || 0) > 0
    ),
    [units]
  );
  const troopUnitsSignature = useMemo(
    () =>
      troopUnits
        .map((unit) => [
          unit.id,
          unit.renderCount,
          unit.lat.toFixed(3),
          unit.lng.toFixed(3),
          (unit.routeTargetLat ?? unit.lat).toFixed(3),
          (unit.routeTargetLng ?? unit.lng).toFixed(3),
          unit.anchorMoving ? 1 : 0,
        ].join(':'))
        .join('|'),
    [troopUnits]
  );
  const simulationEnabled = troopEffectsEnabled || isEditorMode;

  useEffect(() => {
    troopUnitsRef.current = troopUnits;
  }, [troopUnits]);

  useEffect(() => {
    if (!simulationEnabled) {
      troopBoidStateRef.current = {};
      setTroopBoidState({});
      return;
    }

    const nextState = Object.fromEntries(
      troopUnits.map((unit) => {
        const previous = troopBoidStateRef.current[String(unit.id)];
        if (previous?.length === unit.renderCount) {
          return [String(unit.id), previous];
        }
        return [String(unit.id), buildInitialTroopBoids(unit)];
      })
    );
    troopBoidStateRef.current = nextState;
    setTroopBoidState(nextState);
  }, [simulationEnabled, troopUnits, troopUnitsSignature]);

  useEffect(() => {
    if (!simulationEnabled || !troopUnitsRef.current.length) return undefined;

    let frameId = 0;
    let lastFrame = performance.now();

    const step = (timestamp) => {
      const deltaMs = Math.min(42, timestamp - lastFrame || 16);
      const deltaScale = deltaMs / 16;
      lastFrame = timestamp;
      elapsedMsRef.current += deltaMs;

      setTroopBoidState((previousState) => {
        const nextState = Object.fromEntries(
          troopUnitsRef.current.map((unit) => {
            const previousBoids =
              previousState[String(unit.id)]?.length === unit.renderCount
                ? previousState[String(unit.id)]
                : buildInitialTroopBoids(unit);
            return [
              String(unit.id),
              simulateTroopBoids(unit, previousBoids, deltaScale, elapsedMsRef.current),
            ];
          })
        );
        troopBoidStateRef.current = nextState;
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
  }, [simulationEnabled, troopUnitsSignature]);

  return (
    <>
      {units.map((unit) => {
        const isSelected = String(unit.id) === String(selectedUnitId);
        const leaderColor = unit.color || '#f8d86a';
        const heading = unit.heading ?? 0;
        const isBoidTroop = unit.kind === 'troop' && (unit.simulationMode || 'boids') === 'boids';
        const renderedFollowers = isBoidTroop
          ? troopBoidState[String(unit.id)] || buildInitialTroopBoids(unit)
          : unit.followers || [];
        const troopTooltip = isBoidTroop
          ? unit.renderSampled
            ? `${unit.troopCount} troops · showing ${unit.renderCount}`
            : `${unit.troopCount} troops`
          : getKindLabel(unit.kind);

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
                <div>{troopTooltip}</div>
              </Tooltip>
            </Marker>
          </React.Fragment>
        );
      })}
    </>
  );
}
