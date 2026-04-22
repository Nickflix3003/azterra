import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const LOCATION_SCENES_FILE = path.join(DATA_DIR, 'location-scenes.json');

function normalizeString(value, fallback = '') {
  if (value === null || value === undefined) return fallback;
  return String(value).trim();
}

function normalizeNumber(value, fallback = null) {
  if (value === '' || value === null || value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizePoi(poi = {}) {
  return {
    id: normalizeString(poi.id) || randomUUID(),
    name: normalizeString(poi.name, 'Point of Interest') || 'Point of Interest',
    x: Math.min(1, Math.max(0, normalizeNumber(poi.x, 0.5) ?? 0.5)),
    y: Math.min(1, Math.max(0, normalizeNumber(poi.y, 0.5) ?? 0.5)),
    icon: normalizeString(poi.icon, '✦') || '✦',
    dmNotes: normalizeString(poi.dmNotes),
  };
}

export function normalizeLocationScene(scene = {}) {
  return {
    imageUrl: normalizeString(scene.imageUrl) || '',
    assetPath: normalizeString(scene.assetPath) || '',
    width: normalizeNumber(scene.width, null),
    height: normalizeNumber(scene.height, null),
    pois: Array.isArray(scene.pois) ? scene.pois.map(normalizePoi) : [],
  };
}

async function ensureLocationScenesFile() {
  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
  if (!existsSync(LOCATION_SCENES_FILE)) {
    await fs.writeFile(LOCATION_SCENES_FILE, JSON.stringify({ scenes: {} }, null, 2));
  }
}

export async function readLocationSceneMap() {
  await ensureLocationScenesFile();
  try {
    const raw = await fs.readFile(LOCATION_SCENES_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const scenes = parsed?.scenes && typeof parsed.scenes === 'object' ? parsed.scenes : {};
    return Object.fromEntries(
      Object.entries(scenes).map(([locationId, scene]) => [String(locationId), normalizeLocationScene(scene)])
    );
  } catch {
    return {};
  }
}

export async function writeLocationSceneMap(sceneMap = {}) {
  await ensureLocationScenesFile();
  const scenes = Object.fromEntries(
    Object.entries(sceneMap || {}).map(([locationId, scene]) => [
      String(locationId),
      normalizeLocationScene(scene),
    ])
  );
  await fs.writeFile(LOCATION_SCENES_FILE, JSON.stringify({ scenes }, null, 2));
}

export async function readLocationScene(locationId) {
  const sceneMap = await readLocationSceneMap();
  return sceneMap[String(locationId)] || normalizeLocationScene({});
}

export async function saveLocationScene(locationId, scene) {
  const sceneMap = await readLocationSceneMap();
  sceneMap[String(locationId)] = normalizeLocationScene(scene);
  await writeLocationSceneMap(sceneMap);
  return sceneMap[String(locationId)];
}
