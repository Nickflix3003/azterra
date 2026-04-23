const DEFAULT_PLATOON_FOLLOWERS = 5;
const MAX_PLATOON_FOLLOWERS = 8;
const DEFAULT_PLATOON_SPREAD = 0.34;
const DEFAULT_PLATOON_COLUMNS = 3;

function toFiniteNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function hasCoordinate(stop) {
  return Number.isFinite(stop?.lat) && Number.isFinite(stop?.lng);
}

function normalizeTimelineWaypoint(stop = {}, index = 0) {
  const fallbackYear = index * 100;
  const startYear = toFiniteNumber(stop.startYear, fallbackYear) ?? fallbackYear;
  const endYearRaw = toFiniteNumber(stop.endYear, null);
  const endYear =
    endYearRaw != null && endYearRaw >= startYear
      ? endYearRaw
      : null;

  return {
    id: normalizeString(stop.id) || `waypoint-${index + 1}`,
    startYear,
    endYear,
    targetLocationId: normalizeString(stop.targetLocationId) || null,
    lat: toFiniteNumber(stop.lat, null),
    lng: toFiniteNumber(stop.lng, null),
  };
}

export function normalizeTimelineWaypoints(stops = []) {
  if (!Array.isArray(stops)) return [];
  return stops
    .map((stop, index) => normalizeTimelineWaypoint(stop, index))
    .sort((left, right) => left.startYear - right.startYear);
}

export function normalizePositionTimeline(stops = []) {
  return normalizeTimelineWaypoints(stops);
}

export function normalizePlatoonStyle(style = {}) {
  const requestedFollowers = toFiniteNumber(style.followers, DEFAULT_PLATOON_FOLLOWERS);
  const requestedSpread = toFiniteNumber(style.spread, DEFAULT_PLATOON_SPREAD);
  return {
    followers: clamp(Math.round(requestedFollowers || DEFAULT_PLATOON_FOLLOWERS), 1, MAX_PLATOON_FOLLOWERS),
    spread: clamp(requestedSpread || DEFAULT_PLATOON_SPREAD, 0.16, 0.72),
  };
}

function getFallbackPoint(entity) {
  const lat = toFiniteNumber(entity?.lat ?? entity?.x, null);
  const lng = toFiniteNumber(entity?.lng ?? entity?.y, null);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function lerpPoint(start, end, progress) {
  return {
    lat: start.lat + (end.lat - start.lat) * progress,
    lng: start.lng + (end.lng - start.lng) * progress,
  };
}

function buildWaypointId(year) {
  return `waypoint-${year}-${Date.now()}`;
}

function normalizeHeading(angle) {
  if (!Number.isFinite(angle)) return 0;
  const normalized = angle % 360;
  return normalized < 0 ? normalized + 360 : normalized;
}

function headingFromPoints(from, to) {
  if (!from || !to) return 0;
  const dx = to.lng - from.lng;
  const dy = to.lat - from.lat;
  if (Math.abs(dx) < 0.000001 && Math.abs(dy) < 0.000001) return 0;
  return normalizeHeading((Math.atan2(dy, dx) * 180) / Math.PI + 90);
}

function rotateOffset(forward, lateral, heading) {
  const radians = ((heading ?? 90) - 90) * (Math.PI / 180);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  return {
    lat: forward * sin + lateral * cos,
    lng: forward * cos - lateral * sin,
  };
}

function resolveWaypointPoint(stop, year, locationById, resolveLocationPosition, visited) {
  if (hasCoordinate(stop)) {
    return { lat: stop.lat, lng: stop.lng };
  }

  if (!stop?.targetLocationId) return null;
  const target = locationById.get(String(stop.targetLocationId));
  if (!target) return null;
  return resolveLocationPosition(target, year, locationById, visited);
}

function resolveTimelinePoint(stops, year, locationById, resolveLocationPosition, fallbackPoint, visited) {
  const normalized = normalizeTimelineWaypoints(stops);
  if (!normalized.length) return fallbackPoint;

  const resolvedStops = normalized
    .map((stop) => ({
      ...stop,
      point: resolveWaypointPoint(stop, year, locationById, resolveLocationPosition, visited),
    }))
    .filter((stop) => stop.point);

  if (!resolvedStops.length) return fallbackPoint;
  if (resolvedStops.length === 1) return resolvedStops[0].point;
  if (year <= resolvedStops[0].startYear) return resolvedStops[0].point;

  for (let index = 0; index < resolvedStops.length - 1; index += 1) {
    const current = resolvedStops[index];
    const next = resolvedStops[index + 1];

    if (current.endYear != null && year >= current.startYear && year <= current.endYear) {
      return current.point;
    }

    if (year >= current.startYear && year < next.startYear) {
      const span = next.startYear - current.startYear;
      if (span <= 0) return next.point;
      const progress = clamp((year - current.startYear) / span, 0, 1);
      return lerpPoint(current.point, next.point, progress);
    }

    if (year === next.startYear) {
      return next.point;
    }
  }

  const last = resolvedStops[resolvedStops.length - 1];
  return last.point;
}

function resolveTimelineHeading(stops, year, locationById, resolveLocationPosition, fallbackPoint, visited) {
  const normalized = normalizeTimelineWaypoints(stops);
  if (!normalized.length) return 0;

  const resolvedStops = normalized
    .map((stop) => ({
      ...stop,
      point: resolveWaypointPoint(stop, year, locationById, resolveLocationPosition, visited),
    }))
    .filter((stop) => stop.point);

  if (resolvedStops.length <= 1) {
    const fallback = resolvedStops[0]?.point || fallbackPoint;
    return headingFromPoints(fallback, fallback);
  }

  if (year <= resolvedStops[0].startYear) {
    return headingFromPoints(resolvedStops[0].point, resolvedStops[1].point);
  }

  for (let index = 0; index < resolvedStops.length - 1; index += 1) {
    const current = resolvedStops[index];
    const next = resolvedStops[index + 1];

    if (current.endYear != null && year >= current.startYear && year <= current.endYear) {
      const previous = resolvedStops[index - 1];
      return headingFromPoints(previous?.point || current.point, current.point);
    }

    if (year >= current.startYear && year < next.startYear) {
      return headingFromPoints(current.point, next.point);
    }
  }

  const last = resolvedStops[resolvedStops.length - 1];
  const previous = resolvedStops[resolvedStops.length - 2];
  return headingFromPoints(previous?.point || last.point, last.point);
}

export function getActiveTimelineWaypointIndex(stops, year) {
  const normalized = normalizeTimelineWaypoints(stops);
  if (!normalized.length) return -1;
  if (year <= normalized[0].startYear) return 0;

  for (let index = 0; index < normalized.length - 1; index += 1) {
    const current = normalized[index];
    const next = normalized[index + 1];
    if (current.endYear != null && year >= current.startYear && year <= current.endYear) {
      return index;
    }
    if (year >= current.startYear && year < next.startYear) {
      return index;
    }
  }

  return normalized.length - 1;
}

export function resolveLocationPosition(location, year, locationById, visited = new Set()) {
  if (!location) return null;
  const visitKey = `location:${location.id}`;
  if (visited.has(visitKey)) {
    return getFallbackPoint(location);
  }

  const nextVisited = new Set(visited);
  nextVisited.add(visitKey);

  return resolveTimelinePoint(
    location.positionTimeline,
    year,
    locationById,
    resolveLocationPosition,
    getFallbackPoint(location),
    nextVisited
  );
}

export function resolveMovingUnitLeaderPosition(unit, year, locationById) {
  if (!unit) return null;
  return resolveTimelinePoint(
    unit.movementTimeline,
    year,
    locationById,
    resolveLocationPosition,
    getFallbackPoint(unit),
    new Set([`unit:${unit.id}`])
  );
}

export function resolveMovingUnitHeading(unit, year, locationById) {
  if (!unit) return 0;
  return resolveTimelineHeading(
    unit.movementTimeline,
    year,
    locationById,
    resolveLocationPosition,
    getFallbackPoint(unit),
    new Set([`unit:${unit.id}`])
  );
}

export function isMovingUnitVisibleAtYear(unit, year) {
  const stops = normalizeTimelineWaypoints(unit?.movementTimeline);
  if (!stops.length) return false;
  const first = stops[0];
  const last = stops[stops.length - 1];
  const lastYear = last.endYear ?? last.startYear;
  return year >= first.startYear && year <= lastYear;
}

function stringSeed(value) {
  const input = normalizeString(value, 'unit');
  let hash = 0;
  for (let index = 0; index < input.length; index += 1) {
    hash = ((hash << 5) - hash + input.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

export function buildPlatoonOffsets(unit, overrideFollowers, options = {}) {
  const style = normalizePlatoonStyle(unit?.platoonStyle);
  const requestedFollowers = Math.max(
    0,
    Math.round(overrideFollowers ?? style.followers ?? DEFAULT_PLATOON_FOLLOWERS)
  );
  const followerCount = clamp(requestedFollowers, 0, MAX_PLATOON_FOLLOWERS);
  if (followerCount <= 0) return [];
  const spread = style.spread ?? DEFAULT_PLATOON_SPREAD;
  const seed = stringSeed(unit?.id);
  const heading = normalizeHeading(options.heading ?? 0);
  const phase = options.phase ?? 0;
  const columns = clamp(options.columns ?? DEFAULT_PLATOON_COLUMNS, 2, 4);
  const offsets = [];

  for (let index = 0; index < followerCount; index += 1) {
    const row = Math.floor(index / columns) + 1;
    const column = index % columns;
    const lateralIndex = column - (columns - 1) / 2;
    const rowSpacing = spread * (0.84 + row * 0.08);
    const lateralSpacing = spread * 0.9;
    const baseForward = row * rowSpacing;
    const baseLateral = lateralIndex * lateralSpacing;
    const animationSeed = (seed % 360) * (Math.PI / 180);
    const pulse = Math.sin(phase * 0.8 + animationSeed + index * 0.9);
    const sway = Math.cos(phase * 1.12 + animationSeed * 0.5 + row * 0.55 + column * 0.4);
    const forward = baseForward + pulse * spread * 0.1;
    const lateral = baseLateral + sway * spread * 0.09;
    const rotated = rotateOffset(forward, lateral, heading);

    offsets.push({
      lat: rotated.lat,
      lng: rotated.lng,
      scale: clamp(1 - row * 0.08, 0.68, 1),
    });
  }

  return offsets;
}

export function applyWaypointCoordinateUpdate(stops, year, coords) {
  const normalized = normalizeTimelineWaypoints(stops);
  const exactIndex = normalized.findIndex((stop) => stop.startYear === year);
  if (exactIndex >= 0) {
    const next = normalized.slice();
    next[exactIndex] = {
      ...next[exactIndex],
      targetLocationId: null,
      lat: coords.lat,
      lng: coords.lng,
    };
    return next;
  }

  const next = normalized.map((stop) => ({ ...stop }));
  const previousIndex = next.reduce((match, stop, index) => (
    stop.startYear < year ? index : match
  ), -1);

  if (previousIndex >= 0) {
    const previous = next[previousIndex];
    if (previous.endYear != null && previous.endYear >= year) {
      next[previousIndex] = {
        ...previous,
        endYear: Math.max(previous.startYear, year - 1),
      };
    }
  }

  next.push({
    id: buildWaypointId(year),
    startYear: year,
    endYear: null,
    targetLocationId: null,
    lat: coords.lat,
    lng: coords.lng,
  });

  return next.sort((left, right) => left.startYear - right.startYear);
}
