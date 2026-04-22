import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCATION_MAP_FILE = path.join(__dirname, 'data', 'location-maps.json');

function clampUnit(value) {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.max(0, Math.min(1, num));
}

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeNumber(value, fallback = null) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function normalizeBoolean(value, fallback = true) {
  return typeof value === 'boolean' ? value : fallback;
}

function normalizeLocalPoi(poi = {}) {
  return {
    id: normalizeString(poi.id) || randomUUID(),
    name: normalizeString(poi.name, 'Point of Interest') || 'Point of Interest',
    x: clampUnit(poi.x),
    y: clampUnit(poi.y),
    icon: normalizeString(poi.icon, '*') || '*',
    description: normalizeString(poi.description),
    visible: normalizeBoolean(poi.visible, true),
  };
}

function normalizeLinkedLocationMarker(marker = {}) {
  return {
    id: normalizeString(marker.id) || randomUUID(),
    locationId: normalizeString(marker.locationId) || null,
    x: clampUnit(marker.x),
    y: clampUnit(marker.y),
    icon: normalizeString(marker.icon, '@') || '@',
    visible: normalizeBoolean(marker.visible, true),
  };
}

export function normalizeLocationMap(locationMap = {}) {
  const minZoom = Math.max(1, normalizeNumber(locationMap.minZoom, 1) || 1);
  const maxZoom = Math.max(minZoom, normalizeNumber(locationMap.maxZoom, 2.2) || 2.2);
  return {
    imageUrl: normalizeString(locationMap.imageUrl),
    assetPath: normalizeString(locationMap.assetPath),
    width: normalizeNumber(locationMap.width, null),
    height: normalizeNumber(locationMap.height, null),
    minZoom,
    maxZoom,
    localPois: Array.isArray(locationMap.localPois) ? locationMap.localPois.map(normalizeLocalPoi) : [],
    linkedLocations: Array.isArray(locationMap.linkedLocations)
      ? locationMap.linkedLocations
          .map(normalizeLinkedLocationMarker)
          .filter((marker) => marker.locationId)
      : [],
  };
}

export function hasLocationMapImage(locationMap) {
  return Boolean(normalizeString(locationMap?.imageUrl));
}

async function ensureLocationMapFile() {
  const dir = path.dirname(LOCATION_MAP_FILE);
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
  if (!existsSync(LOCATION_MAP_FILE)) {
    await fs.writeFile(LOCATION_MAP_FILE, JSON.stringify({ maps: {} }, null, 2));
  }
}

export async function readLocationMapMap() {
  await ensureLocationMapFile();
  try {
    const raw = await fs.readFile(LOCATION_MAP_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const maps = parsed?.maps && typeof parsed.maps === 'object' ? parsed.maps : {};
    return Object.fromEntries(
      Object.entries(maps).map(([locationId, locationMap]) => [String(locationId), normalizeLocationMap(locationMap)])
    );
  } catch {
    return {};
  }
}

export async function writeLocationMapMap(mapIndex) {
  await ensureLocationMapFile();
  const safeMaps = Object.fromEntries(
    Object.entries(mapIndex || {}).map(([locationId, locationMap]) => [String(locationId), normalizeLocationMap(locationMap)])
  );
  await fs.writeFile(LOCATION_MAP_FILE, JSON.stringify({ maps: safeMaps }, null, 2));
}

export async function readLocationMap(locationId) {
  const mapIndex = await readLocationMapMap();
  return mapIndex[String(locationId)] || normalizeLocationMap();
}

export async function saveLocationMap(locationId, locationMap) {
  const mapIndex = await readLocationMapMap();
  mapIndex[String(locationId)] = normalizeLocationMap(locationMap);
  await writeLocationMapMap(mapIndex);
  return mapIndex[String(locationId)];
}
