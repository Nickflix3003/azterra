import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCATION_POSITION_FILE = path.join(__dirname, 'data', 'location-position-timelines.json');

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeWaypoint(stop = {}, index = 0) {
  const fallbackYear = index * 100;
  const startYear = normalizeNumber(stop.startYear, fallbackYear) ?? fallbackYear;
  const endYearRaw = normalizeNumber(stop.endYear, null);
  return {
    id: normalizeString(stop.id) || randomUUID(),
    startYear,
    endYear: endYearRaw != null && endYearRaw >= startYear ? endYearRaw : null,
    targetLocationId: normalizeString(stop.targetLocationId) || null,
    lat: normalizeNumber(stop.lat, null),
    lng: normalizeNumber(stop.lng, null),
  };
}

export function normalizeLocationPositionTimeline(stops = []) {
  if (!Array.isArray(stops)) return [];
  return stops
    .map((stop, index) => normalizeWaypoint(stop, index))
    .sort((left, right) => left.startYear - right.startYear);
}

async function ensureLocationPositionFile() {
  const dir = path.dirname(LOCATION_POSITION_FILE);
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
  if (!existsSync(LOCATION_POSITION_FILE)) {
    await fs.writeFile(LOCATION_POSITION_FILE, JSON.stringify({ timelines: {} }, null, 2));
  }
}

export async function readLocationPositionTimelineMap() {
  await ensureLocationPositionFile();
  try {
    const raw = await fs.readFile(LOCATION_POSITION_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const timelines = parsed?.timelines && typeof parsed.timelines === 'object' ? parsed.timelines : {};
    return Object.fromEntries(
      Object.entries(timelines).map(([locationId, timeline]) => [String(locationId), normalizeLocationPositionTimeline(timeline)])
    );
  } catch {
    return {};
  }
}

export async function writeLocationPositionTimelineMap(timelineMap) {
  await ensureLocationPositionFile();
  const safeTimelines = Object.fromEntries(
    Object.entries(timelineMap || {}).map(([locationId, timeline]) => [String(locationId), normalizeLocationPositionTimeline(timeline)])
  );
  await fs.writeFile(LOCATION_POSITION_FILE, JSON.stringify({ timelines: safeTimelines }, null, 2));
}

export async function readLocationPositionTimeline(locationId) {
  const timelineMap = await readLocationPositionTimelineMap();
  return timelineMap[String(locationId)] || [];
}

export async function saveLocationPositionTimeline(locationId, timeline) {
  const timelineMap = await readLocationPositionTimelineMap();
  timelineMap[String(locationId)] = normalizeLocationPositionTimeline(timeline);
  await writeLocationPositionTimelineMap(timelineMap);
  return timelineMap[String(locationId)];
}

