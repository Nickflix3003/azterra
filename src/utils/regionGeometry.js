function normalizePolygon(pointList) {
  if (!Array.isArray(pointList) || pointList.length < 3) return [];
  return pointList
    .map((point) => (
      Array.isArray(point) && point.length >= 2
        ? [Number(point[0]), Number(point[1])]
        : null
    ))
    .filter((point) => point && Number.isFinite(point[0]) && Number.isFinite(point[1]));
}

function polygonSignedArea(points) {
  if (points.length < 3) return 0;
  let area = 0;
  for (let index = 0; index < points.length; index += 1) {
    const [x1, y1] = points[index];
    const [x2, y2] = points[(index + 1) % points.length];
    area += x1 * y2 - x2 * y1;
  }
  return area / 2;
}

function pointOnSegment(point, start, end) {
  const epsilon = 1e-9;
  const [px, py] = point;
  const [x1, y1] = start;
  const [x2, y2] = end;
  const cross = (px - x1) * (y2 - y1) - (py - y1) * (x2 - x1);
  if (Math.abs(cross) > epsilon) return false;
  const dot = (px - x1) * (x2 - x1) + (py - y1) * (y2 - y1);
  if (dot < -epsilon) return false;
  const squaredLength = (x2 - x1) ** 2 + (y2 - y1) ** 2;
  if (dot - squaredLength > epsilon) return false;
  return true;
}

export function pointInPolygon(point, polygon) {
  const points = normalizePolygon(polygon);
  if (points.length < 3) return false;

  let isInside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const current = points[index];
    const prior = points[previous];

    if (pointOnSegment(point, current, prior)) {
      return true;
    }

    const intersects = (
      (current[1] > point[1]) !== (prior[1] > point[1]) &&
      point[0] < ((prior[0] - current[0]) * (point[1] - current[1])) / ((prior[1] - current[1]) || Number.EPSILON) + current[0]
    );

    if (intersects) {
      isInside = !isInside;
    }
  }

  return isInside;
}

export function getRegionPolygons(region) {
  if (!region) return [];
  const polygons = [];
  if (Array.isArray(region.points) && region.points.length >= 3) {
    polygons.push(region.points);
  }
  if (Array.isArray(region.parts)) {
    region.parts.forEach((part) => {
      if (Array.isArray(part) && part.length >= 3) {
        polygons.push(part);
      }
    });
  }
  return polygons;
}

export function findContainingRegionId(regions, lat, lng) {
  if (!Array.isArray(regions) || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const point = [lng, lat];
  let bestMatch = null;

  regions.forEach((region) => {
    const polygons = getRegionPolygons(region);
    polygons.forEach((polygon) => {
      if (!pointInPolygon(point, polygon)) return;
      const area = Math.abs(polygonSignedArea(normalizePolygon(polygon)));
      if (!bestMatch || area < bestMatch.area) {
        bestMatch = { id: region.id, area };
      }
    });
  });

  return bestMatch?.id ?? null;
}
