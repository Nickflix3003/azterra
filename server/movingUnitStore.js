import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const MOVING_UNITS_FILE = path.join(__dirname, 'data', 'moving-units.json');

const DEFAULT_KIND = 'troop';
const VALID_KINDS = new Set(['troop', 'fleet', 'caravan', 'patrol', 'other']);

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

function normalizeMovementTimeline(stops = []) {
  if (!Array.isArray(stops)) return [];
  return stops
    .map((stop, index) => normalizeWaypoint(stop, index))
    .sort((left, right) => left.startYear - right.startYear);
}

function normalizePlatoonStyle(style = {}) {
  const followers = normalizeNumber(style.followers, 5);
  const spread = normalizeNumber(style.spread, 0.34);
  return {
    followers: Math.max(1, Math.min(8, Math.round(followers || 5))),
    spread: Math.max(0.16, Math.min(0.72, spread || 0.34)),
  };
}

export function normalizeMovingUnit(unit = {}) {
  const requestedKind = normalizeString(unit.kind, DEFAULT_KIND).toLowerCase();
  const kind = VALID_KINDS.has(requestedKind) ? requestedKind : DEFAULT_KIND;
  return {
    id: normalizeString(unit.id) || randomUUID(),
    name: normalizeString(unit.name, 'Unnamed Unit') || 'Unnamed Unit',
    kind,
    icon: normalizeString(unit.icon, kind === 'fleet' ? 'ship' : kind === 'caravan' ? 'cart' : 'banner') || 'banner',
    color: normalizeString(unit.color, '#f8d86a') || '#f8d86a',
    lat: normalizeNumber(unit.lat, 0) ?? 0,
    lng: normalizeNumber(unit.lng, 0) ?? 0,
    movementTimeline: normalizeMovementTimeline(unit.movementTimeline),
    platoonStyle: normalizePlatoonStyle(unit.platoonStyle),
    createdBy: normalizeString(unit.createdBy) || null,
    updatedBy: normalizeString(unit.updatedBy) || null,
    createdAt: normalizeString(unit.createdAt) || null,
    updatedAt: normalizeString(unit.updatedAt) || null,
  };
}

async function ensureMovingUnitsFile() {
  const dir = path.dirname(MOVING_UNITS_FILE);
  if (!existsSync(dir)) {
    await fs.mkdir(dir, { recursive: true });
  }
  if (!existsSync(MOVING_UNITS_FILE)) {
    await fs.writeFile(MOVING_UNITS_FILE, JSON.stringify({ units: [] }, null, 2));
  }
}

export async function readMovingUnits() {
  await ensureMovingUnitsFile();
  try {
    const raw = await fs.readFile(MOVING_UNITS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const units = Array.isArray(parsed?.units) ? parsed.units : [];
    return units.map(normalizeMovingUnit);
  } catch {
    return [];
  }
}

export async function writeMovingUnits(units) {
  await ensureMovingUnitsFile();
  const safeUnits = Array.isArray(units) ? units.map(normalizeMovingUnit) : [];
  await fs.writeFile(MOVING_UNITS_FILE, JSON.stringify({ units: safeUnits }, null, 2));
  return safeUnits;
}

