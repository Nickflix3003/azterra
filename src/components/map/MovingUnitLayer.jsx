import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Marker, Tooltip } from 'react-leaflet';
import L from 'leaflet';

const TROOP_DEFAULTS = Object.freeze({
  maxSpeed: 3,
  maxForce: 0.05,
  separationDistance: 25,
  neighborDistance: 50,
  separationWeight: 1.5,
  alignmentWeight: 1.0,
  cohesionWeight: 1.0,
  arrivalRadius: 120,
  idleOrbitRadius: 42,
  travelSeekWeight: 0.52,
  settleSeekWeight: 0.28,
  orbitWeight: 0.76,
  wanderWeight: 0.34,
  anchorMaxSpeed: 4.25,
  anchorMaxForce: 0.08,
  anchorSlowRadius: 250,
});
const TROOP_RENDER_INTERVAL_MS = 1000 / 24;

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

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function magnitude(x, y) {
  return Math.hypot(x, y);
}

function normalizeVector(x, y) {
  const mag = magnitude(x, y);
  if (mag <= 0.000001) return { x: 0, y: 0 };
  return { x: x / mag, y: y / mag };
}

function limitVector(x, y, maxMagnitude) {
  const mag = magnitude(x, y);
  if (mag <= maxMagnitude || mag <= 0.000001) {
    return { x, y };
  }
  const scale = maxMagnitude / mag;
  return { x: x * scale, y: y * scale };
}

function headingFromVelocity(vx, vy, fallback = 0) {
  return magnitude(vx, vy) > 0.000001
    ? (Math.atan2(vy, vx) * 180) / Math.PI + 90
    : fallback;
}

function quantizeHeading(angle, step = 8) {
  return Math.round(angle / step) * step;
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

function isLegacyBoidConfig(config = {}) {
  return (
    Number(config.maxSpeed) > 0 &&
    Number(config.maxSpeed) < 1 &&
    Number(config.neighborRadius ?? config.neighborDistance ?? 0) > 0 &&
    Number(config.neighborRadius ?? config.neighborDistance ?? 0) < 5
  );
}

function getTroopConfig(unit) {
  const raw = unit.boidConfig || {};
  const legacy = isLegacyBoidConfig(raw);

  return {
    maxSpeed: legacy ? TROOP_DEFAULTS.maxSpeed : clamp(Number(raw.maxSpeed) || TROOP_DEFAULTS.maxSpeed, 1, 12),
    maxForce: legacy ? TROOP_DEFAULTS.maxForce : clamp(Number(raw.maxForce) || TROOP_DEFAULTS.maxForce, 0.01, 0.4),
    separationDistance: legacy
      ? TROOP_DEFAULTS.separationDistance
      : clamp(Number(raw.separationRadius ?? raw.separationDistance) || TROOP_DEFAULTS.separationDistance, 8, 120),
    neighborDistance: legacy
      ? TROOP_DEFAULTS.neighborDistance
      : clamp(Number(raw.neighborRadius ?? raw.neighborDistance) || TROOP_DEFAULTS.neighborDistance, 16, 200),
    separationWeight: clamp(Number(raw.separationWeight) || TROOP_DEFAULTS.separationWeight, 0, 4),
    alignmentWeight: clamp(Number(raw.alignmentWeight) || TROOP_DEFAULTS.alignmentWeight, 0, 4),
    cohesionWeight: clamp(Number(raw.cohesionWeight) || TROOP_DEFAULTS.cohesionWeight, 0, 4),
    arrivalRadius: clamp(Number(raw.arrivalRadius) || TROOP_DEFAULTS.arrivalRadius, 30, 220),
    idleOrbitRadius: legacy
      ? TROOP_DEFAULTS.idleOrbitRadius
      : clamp(Number(raw.idleOrbitRadius) || TROOP_DEFAULTS.idleOrbitRadius, 12, 96),
    travelSeekWeight: clamp(Number(raw.travelSeekWeight) || TROOP_DEFAULTS.travelSeekWeight, 0, 3),
    settleSeekWeight: clamp(Number(raw.settleSeekWeight) || TROOP_DEFAULTS.settleSeekWeight, 0, 2),
    orbitWeight: clamp(Number(raw.orbitWeight) || TROOP_DEFAULTS.orbitWeight, 0, 3),
    wanderWeight: clamp(Number(raw.wanderWeight) || TROOP_DEFAULTS.wanderWeight, 0, 2),
    anchorMaxSpeed: clamp(Number(raw.anchorMaxSpeed) || TROOP_DEFAULTS.anchorMaxSpeed, 2, 20),
    anchorMaxForce: clamp(Number(raw.anchorMaxForce) || TROOP_DEFAULTS.anchorMaxForce, 0.02, 0.8),
    anchorSlowRadius: clamp(Number(raw.anchorSlowRadius) || TROOP_DEFAULTS.anchorSlowRadius, 50, 420),
  };
}

function getTroopZoomScale(zoomLevel = 4) {
  return clamp(1.9 - ((zoomLevel - 2) * 0.2), 1, 1.9);
}

function buildArrowIcon({
  color,
  heading = 0,
  zoomLevel = 4,
  isSelected = false,
  variant = 'leader',
}) {
  const size = variant === 'follower'
    ? Math.max(10, Math.min(18, 11 + (zoomLevel - 4) * 0.8))
    : variant === 'troop'
      ? Math.max(16, Math.min(28, 18 + (4 - zoomLevel) * 2.4))
      : Math.max(22, Math.min(36, 24 + (zoomLevel - 4) * 2.2));
  const glow = isSelected && variant !== 'follower' ? 2 : 0;
  const opacity = variant === 'follower' ? 0.84 : variant === 'troop' ? 0.92 : 1;
  const strokeOpacity = variant === 'follower' ? 0.68 : variant === 'troop' ? 0.82 : 0.92;

  return L.divIcon({
    className: [
      'moving-unit-marker',
      variant === 'follower'
        ? 'moving-unit-marker--follower'
        : variant === 'troop'
          ? 'moving-unit-marker--troop'
          : 'moving-unit-marker--leader',
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

function buildAnchorIcon({ color, zoomLevel = 4, isSelected = false }) {
  const size = Math.max(14, Math.min(24, 16 + (4 - zoomLevel) * 1.8));
  return L.divIcon({
    className: [
      'moving-unit-marker',
      'moving-unit-marker--anchor',
      isSelected ? 'moving-unit-marker--selected' : '',
    ].join(' '),
    html: `
      <div class="moving-unit-marker__anchor" style="--unit-color:${color};--unit-size:${size}px;"></div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function buildInitialAnchorState(unit) {
  return {
    lat: unit.routeTargetLat ?? unit.lat,
    lng: unit.routeTargetLng ?? unit.lng,
    vx: 0,
    vy: 0,
  };
}

function seekForce(position, velocity, target, maxSpeed, maxForce) {
  const desiredX = target.lng - position.lng;
  const desiredY = target.lat - position.lat;
  const desiredNorm = normalizeVector(desiredX, desiredY);
  const desired = {
    x: desiredNorm.x * maxSpeed,
    y: desiredNorm.y * maxSpeed,
  };
  return limitVector(desired.x - velocity.vx, desired.y - velocity.vy, maxForce);
}

function arriveForce(position, velocity, target, maxSpeed, maxForce, slowRadius) {
  const dx = target.lng - position.lng;
  const dy = target.lat - position.lat;
  const dist = magnitude(dx, dy);
  if (dist <= 0.000001) {
    return { x: -velocity.vx * 0.08, y: -velocity.vy * 0.08 };
  }

  const desiredNorm = normalizeVector(dx, dy);
  const desiredSpeed = dist < slowRadius
    ? maxSpeed * (dist / slowRadius)
    : maxSpeed;
  const desired = {
    x: desiredNorm.x * desiredSpeed,
    y: desiredNorm.y * desiredSpeed,
  };
  return limitVector(desired.x - velocity.vx, desired.y - velocity.vy, maxForce);
}

function separateForce(boid, boids, desiredSeparation, maxSpeed, maxForce) {
  let steerX = 0;
  let steerY = 0;
  let count = 0;

  boids.forEach((neighbor) => {
    if (neighbor.id === boid.id) return;
    const dx = boid.lng - neighbor.lng;
    const dy = boid.lat - neighbor.lat;
    const distance = magnitude(dx, dy);
    if (distance <= 0 || distance >= desiredSeparation) return;

    const diff = normalizeVector(dx, dy);
    steerX += diff.x / distance;
    steerY += diff.y / distance;
    count += 1;
  });

  if (count <= 0) return { x: 0, y: 0 };

  steerX /= count;
  steerY /= count;

  if (magnitude(steerX, steerY) <= 0.000001) return { x: 0, y: 0 };

  const normalized = normalizeVector(steerX, steerY);
  const desired = {
    x: normalized.x * maxSpeed,
    y: normalized.y * maxSpeed,
  };
  return limitVector(desired.x - boid.vx, desired.y - boid.vy, maxForce);
}

function alignForce(boid, boids, neighborDistance, maxSpeed, maxForce) {
  let sumX = 0;
  let sumY = 0;
  let count = 0;

  boids.forEach((neighbor) => {
    if (neighbor.id === boid.id) return;
    const dx = boid.lng - neighbor.lng;
    const dy = boid.lat - neighbor.lat;
    const distance = magnitude(dx, dy);
    if (distance <= 0 || distance >= neighborDistance) return;

    sumX += neighbor.vx;
    sumY += neighbor.vy;
    count += 1;
  });

  if (count <= 0) return { x: 0, y: 0 };

  sumX /= count;
  sumY /= count;
  const desiredNorm = normalizeVector(sumX, sumY);
  const desired = {
    x: desiredNorm.x * maxSpeed,
    y: desiredNorm.y * maxSpeed,
  };
  return limitVector(desired.x - boid.vx, desired.y - boid.vy, maxForce);
}

function cohesionForce(boid, boids, neighborDistance, maxSpeed, maxForce) {
  let sumLat = 0;
  let sumLng = 0;
  let count = 0;

  boids.forEach((neighbor) => {
    if (neighbor.id === boid.id) return;
    const dx = boid.lng - neighbor.lng;
    const dy = boid.lat - neighbor.lat;
    const distance = magnitude(dx, dy);
    if (distance <= 0 || distance >= neighborDistance) return;

    sumLat += neighbor.lat;
    sumLng += neighbor.lng;
    count += 1;
  });

  if (count <= 0) return { x: 0, y: 0 };

  return seekForce(
    boid,
    boid,
    { lat: sumLat / count, lng: sumLng / count },
    maxSpeed,
    maxForce
  );
}

function orbitForce(boid, center, config) {
  const dx = boid.lng - center.lng;
  const dy = boid.lat - center.lat;
  const distance = Math.max(0.00001, magnitude(dx, dy));
  const radial = normalizeVector(dx, dy);
  const tangent = {
    x: -radial.y * boid.orbitDirection,
    y: radial.x * boid.orbitDirection,
  };
  const desiredRadius = config.idleOrbitRadius * (0.78 + boid.orbitSeed * 0.45);
  const radialError = desiredRadius - distance;
  const desired = {
    x: tangent.x * config.maxSpeed * 0.58 + radial.x * radialError * 0.08,
    y: tangent.y * config.maxSpeed * 0.58 + radial.y * radialError * 0.08,
  };
  return limitVector(desired.x - boid.vx, desired.y - boid.vy, config.maxForce);
}

function wanderForce(boid, elapsedMs, config) {
  const headingBase = headingFromVelocity(boid.vx, boid.vy, 0) * (Math.PI / 180);
  const driftAngle = elapsedMs / 780 + boid.orbitSeed * Math.PI * 2;
  const desired = {
    x: Math.cos(headingBase + Math.cos(driftAngle) * 0.9) * config.maxSpeed * 0.48,
    y: Math.sin(headingBase + Math.sin(driftAngle * 1.17) * 0.9) * config.maxSpeed * 0.48,
  };
  return limitVector(desired.x - boid.vx, desired.y - boid.vy, config.maxForce);
}

function buildInitialTroopBoids(unit, anchorState) {
  const renderCount = Math.max(0, Math.round(Number(unit.renderCount) || 0));
  const config = getTroopConfig(unit);

  return Array.from({ length: renderCount }, (_, index) => {
    const hash = hashIndex(unit.id, index);
    const angle = ((index / Math.max(renderCount, 1)) * Math.PI * 2) + ((hash % 360) * Math.PI) / 180;
    const radius = config.idleOrbitRadius * (0.55 + ((hash % 100) / 100) * 0.5);
    const speed = config.maxSpeed * (0.35 + ((hash % 30) / 30) * 0.18);
    const lat = anchorState.lat + Math.sin(angle) * radius;
    const lng = anchorState.lng + Math.cos(angle) * radius;
    const vx = -Math.sin(angle) * speed * (hash % 2 === 0 ? 1 : -1);
    const vy = Math.cos(angle) * speed * (hash % 2 === 0 ? 1 : -1);

    return {
      id: `${unit.id}-boid-${index + 1}`,
      lat,
      lng,
      vx,
      vy,
      ax: 0,
      ay: 0,
      heading: headingFromVelocity(vx, vy, unit.heading ?? 0),
      orbitDirection: hash % 2 === 0 ? 1 : -1,
      orbitSeed: (hash % 1000) / 1000,
    };
  });
}

function stepAnchor(anchorState, target, config, deltaScale) {
  const position = { lat: anchorState.lat, lng: anchorState.lng };
  const velocity = { vx: anchorState.vx, vy: anchorState.vy };
  const arrive = arriveForce(
    position,
    velocity,
    target,
    config.anchorMaxSpeed * deltaScale,
    config.anchorMaxForce * deltaScale,
    config.anchorSlowRadius
  );
  const nextVelocity = limitVector(
    anchorState.vx * 0.95 + arrive.x,
    anchorState.vy * 0.95 + arrive.y,
    config.anchorMaxSpeed * deltaScale
  );

  return {
    lat: anchorState.lat + nextVelocity.y,
    lng: anchorState.lng + nextVelocity.x,
    vx: nextVelocity.x,
    vy: nextVelocity.y,
  };
}

function stepTroopBoids(unit, boids, anchorState, deltaScale, elapsedMs) {
  const config = getTroopConfig(unit);
  const anchorTarget = { lat: anchorState.lat, lng: anchorState.lng };
  const distanceToRoute = magnitude(
    anchorTarget.lng - (unit.routeTargetLng ?? anchorTarget.lng),
    anchorTarget.lat - (unit.routeTargetLat ?? anchorTarget.lat)
  );
  const isSettled = distanceToRoute < config.arrivalRadius * 0.55;

  return boids.map((boid) => {
    const separation = separateForce(
      boid,
      boids,
      config.separationDistance,
      config.maxSpeed * deltaScale,
      config.maxForce * deltaScale
    );
    const alignment = alignForce(
      boid,
      boids,
      config.neighborDistance,
      config.maxSpeed * deltaScale,
      config.maxForce * deltaScale
    );
    const cohesion = cohesionForce(
      boid,
      boids,
      config.neighborDistance,
      config.maxSpeed * deltaScale,
      config.maxForce * deltaScale
    );
    const arrive = arriveForce(
      boid,
      boid,
      anchorTarget,
      config.maxSpeed * deltaScale,
      config.maxForce * deltaScale,
      config.arrivalRadius
    );
    const orbit = orbitForce(boid, anchorTarget, config);
    const wander = wanderForce(boid, elapsedMs, config);

    let ax = 0;
    let ay = 0;

    ax += separation.x * config.separationWeight;
    ay += separation.y * config.separationWeight;
    ax += alignment.x * config.alignmentWeight;
    ay += alignment.y * config.alignmentWeight;
    ax += cohesion.x * config.cohesionWeight;
    ay += cohesion.y * config.cohesionWeight;

    if (isSettled) {
      ax += arrive.x * config.settleSeekWeight;
      ay += arrive.y * config.settleSeekWeight;
      ax += orbit.x * config.orbitWeight;
      ay += orbit.y * config.orbitWeight;
      ax += wander.x * (config.wanderWeight * 0.58);
      ay += wander.y * (config.wanderWeight * 0.58);
    } else {
      ax += arrive.x * config.travelSeekWeight;
      ay += arrive.y * config.travelSeekWeight;
      ax += wander.x * config.wanderWeight;
      ay += wander.y * config.wanderWeight;
      ax += orbit.x * 0.12;
      ay += orbit.y * 0.12;
    }

    const nextVelocity = limitVector(
      boid.vx + ax,
      boid.vy + ay,
      config.maxSpeed * deltaScale
    );

    return {
      ...boid,
      ax: 0,
      ay: 0,
      vx: nextVelocity.x,
      vy: nextVelocity.y,
      lat: boid.lat + nextVelocity.y,
      lng: boid.lng + nextVelocity.x,
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
  const [troopState, setTroopState] = useState({});
  const troopStateRef = useRef({});
  const troopUnitsRef = useRef([]);
  const elapsedMsRef = useRef(0);
  const lastCommittedFrameRef = useRef(0);

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
    () => troopUnits.map((unit) => `${unit.id}:${unit.renderCount}`).join('|'),
    [troopUnits]
  );
  const simulationEnabled = troopEffectsEnabled || isEditorMode;

  useEffect(() => {
    troopUnitsRef.current = troopUnits;
  }, [troopUnits]);

  useEffect(() => {
    if (!simulationEnabled) {
      troopStateRef.current = {};
      setTroopState({});
      return;
    }

    const nextState = Object.fromEntries(
      troopUnits.map((unit) => {
        const previous = troopStateRef.current[String(unit.id)];
        const anchor = previous?.anchor || buildInitialAnchorState(unit);
        const boids = previous?.boids?.length === unit.renderCount
          ? previous.boids
          : buildInitialTroopBoids(unit, anchor);
        return [String(unit.id), { anchor, boids }];
      })
    );
    troopStateRef.current = nextState;
    lastCommittedFrameRef.current = performance.now();
    setTroopState(nextState);
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

      const baseState = troopStateRef.current;
      const nextState = Object.fromEntries(
        troopUnitsRef.current.map((unit) => {
          const existing = baseState[String(unit.id)] || {
            anchor: buildInitialAnchorState(unit),
            boids: buildInitialTroopBoids(unit, buildInitialAnchorState(unit)),
          };
          const config = getTroopConfig(unit);
          const routeTarget = {
            lat: unit.routeTargetLat ?? unit.lat,
            lng: unit.routeTargetLng ?? unit.lng,
          };
          const nextAnchor = stepAnchor(existing.anchor, routeTarget, config, deltaScale);
          const nextBoids = stepTroopBoids(unit, existing.boids, nextAnchor, deltaScale, elapsedMsRef.current);
          return [String(unit.id), { anchor: nextAnchor, boids: nextBoids }];
        })
      );
      troopStateRef.current = nextState;

      if (timestamp - lastCommittedFrameRef.current >= TROOP_RENDER_INTERVAL_MS) {
        lastCommittedFrameRef.current = timestamp;
        setTroopState(nextState);
      }

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
        const color = unit.color || '#f8d86a';
        const heading = unit.heading ?? 0;
        const isBoidTroop = unit.kind === 'troop' && (unit.simulationMode || 'boids') === 'boids';
        const troopRenderState = troopState[String(unit.id)];
        const rawFollowers = isBoidTroop
          ? troopRenderState?.boids || buildInitialTroopBoids(unit, buildInitialAnchorState(unit))
          : unit.followers || [];
        const troopTooltip = isBoidTroop
          ? unit.renderSampled
            ? `${unit.troopCount} troops · showing ${unit.renderCount}`
            : `${unit.troopCount} troops`
          : getKindLabel(unit.kind);
        const zoomScale = isBoidTroop ? getTroopZoomScale(zoomLevel) : 1;
        const renderCenter = troopRenderState?.anchor || buildInitialAnchorState(unit);
        const renderedFollowers = isBoidTroop
          ? rawFollowers.map((follower) => ({
              ...follower,
              lat: renderCenter.lat + (follower.lat - renderCenter.lat) * zoomScale,
              lng: renderCenter.lng + (follower.lng - renderCenter.lng) * zoomScale,
            }))
          : rawFollowers;
        const anchorPosition = [
          unit.routeTargetLat ?? unit.lat,
          unit.routeTargetLng ?? unit.lng,
        ];

        return (
          <React.Fragment key={unit.id}>
            {renderedFollowers.map((follower) => (
              <Marker
                key={follower.id}
                position={[follower.lat, follower.lng]}
                icon={buildArrowIcon({
                  color,
                  heading: isBoidTroop ? quantizeHeading(follower.heading ?? heading) : (follower.heading ?? heading),
                  zoomLevel,
                  variant: isBoidTroop ? 'troop' : 'follower',
                })}
                interactive={false}
                keyboard={false}
                zIndexOffset={isBoidTroop ? 650 : 200}
              />
            ))}

            {isBoidTroop ? (
              isEditorMode ? (
                <Marker
                  position={anchorPosition}
                  icon={buildAnchorIcon({ color, zoomLevel, isSelected })}
                  draggable
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
                  <Tooltip direction="top" offset={[0, -8]}>
                    <strong>{unit.name}</strong>
                    <div>{troopTooltip}</div>
                  </Tooltip>
                </Marker>
              ) : null
            ) : (
              <Marker
                position={[unit.lat, unit.lng]}
                icon={buildArrowIcon({
                  color,
                  heading,
                  zoomLevel,
                  isSelected,
                  variant: 'leader',
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
            )}
          </React.Fragment>
        );
      })}
    </>
  );
}
