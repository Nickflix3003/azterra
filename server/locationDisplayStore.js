import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCATION_DISPLAY_FILE = path.join(__dirname, 'data', 'location-display.json');

const IMAGE_DISPLAY_MODES = new Set(['cover', 'contain', 'natural']);

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

export function normalizeLocationDisplay(display = {}) {
  const requestedMode = normalizeString(display.imageMode, 'cover').toLowerCase();
  return {
    imageMode: IMAGE_DISPLAY_MODES.has(requestedMode) ? requestedMode : 'cover',
  };
}

async function ensureLocationDisplayFile() {
  const dir = path.dirname(LOCATION_DISPLAY_FILE);
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
  if (!existsSync(LOCATION_DISPLAY_FILE)) {
    await fs.writeFile(LOCATION_DISPLAY_FILE, JSON.stringify({ display: {} }, null, 2));
  }
}

export async function readLocationDisplayMap() {
  await ensureLocationDisplayFile();
  try {
    const raw = await fs.readFile(LOCATION_DISPLAY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const display = parsed?.display && typeof parsed.display === 'object' ? parsed.display : {};
    return Object.fromEntries(
      Object.entries(display).map(([locationId, entry]) => [String(locationId), normalizeLocationDisplay(entry)])
    );
  } catch {
    return {};
  }
}

export async function writeLocationDisplayMap(displayMap) {
  await ensureLocationDisplayFile();
  const safeDisplay = Object.fromEntries(
    Object.entries(displayMap || {}).map(([locationId, entry]) => [String(locationId), normalizeLocationDisplay(entry)])
  );
  await fs.writeFile(LOCATION_DISPLAY_FILE, JSON.stringify({ display: safeDisplay }, null, 2));
}

export async function readLocationDisplay(locationId) {
  const displayMap = await readLocationDisplayMap();
  return displayMap[String(locationId)] || normalizeLocationDisplay();
}

export async function saveLocationDisplay(locationId, display) {
  const displayMap = await readLocationDisplayMap();
  displayMap[String(locationId)] = normalizeLocationDisplay(display);
  await writeLocationDisplayMap(displayMap);
  return displayMap[String(locationId)];
}
