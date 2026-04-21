import express from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  adminRequired,
  authRequired,
  readCharacterVisibility,
  readLocationVisibility,
  readNpcVisibility,
  readUsers,
  resolveRequestUser,
  updateUsers,
  writeLocationVisibility,
  writeNpcVisibility,
} from './utils.js';
import { db, throwIfError } from './db.js';
import { sanitizeSecretItems } from './secretAccess.js';

const router = express.Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');

async function readJsonFile(filePath, fallback = []) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function readDataList(filename) {
  const parsed = await readJsonFile(path.join(DATA_DIR, filename), []);
  return Array.isArray(parsed) ? parsed : [];
}

async function readSecretMap(filename, key = 'secrets') {
  const parsed = await readJsonFile(path.join(DATA_DIR, filename), {});
  return parsed?.[key] && typeof parsed[key] === 'object' ? parsed[key] : {};
}

async function readRegionEraMap() {
  return readSecretMap('region-era.json', 'eras');
}

async function ensureListFile(filename) {
  const target = path.join(DATA_DIR, filename);
  if (!existsSync(target)) {
    await fs.writeFile(target, JSON.stringify([], null, 2));
  }
  return target;
}

async function readList(filename) {
  const target = await ensureListFile(filename);
  const parsed = await readJsonFile(target, []);
  return Array.isArray(parsed) ? parsed : [];
}

async function writeList(filename, list) {
  const target = await ensureListFile(filename);
  await fs.writeFile(target, JSON.stringify(list, null, 2));
}

function normalizeSecretId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function rowToNpc(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description || '',
    type: row.type || 'Unknown',
    campaign: row.campaign || 'Main',
    regionId: row.region_id || null,
    markerId: row.marker_id || null,
    locationId: row.location_id || null,
    secretId: row.secret_id || null,
    image: row.image || '',
    visible: row.visible ?? true,
    role: row.role || 'NPC',
    blurb: row.blurb || '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null,
  };
}

function rowToLocation(row, secrets = {}) {
  const numericId =
    typeof row.id === 'string' && /^-?\d+$/.test(row.id)
      ? Number(row.id)
      : row.id;
  const secret = secrets[String(row.id)] || secrets[String(numericId)] || {};
  return {
    id: numericId,
    name: row.name,
    type: row.type || '',
    category: row.category || '',
    lat: row.lat ?? 0,
    lng: row.lng ?? 0,
    x: row.lat ?? 0,
    y: row.lng ?? 0,
    iconKey: row.icon_key || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    regionId: row.region_id || null,
    markerId: row.marker_id || null,
    description: row.description || '',
    glowColor: row.glow_color || '#ffd700',
    campaign: row.campaign || 'Main',
    lore: row.lore || '',
    ...(normalizeSecretId(secret.secretId) && { secretId: normalizeSecretId(secret.secretId) }),
  };
}

function rowToRegion(row, eras = {}, secrets = {}) {
  const era = eras[String(row.id)] || {};
  const secret = secrets[String(row.id)] || {};
  return {
    id: row.id,
    name: row.name,
    color: row.color || '#304ddf',
    borderColor: row.border_color || '#ea580c',
    opacity: row.opacity ?? 0.35,
    points: Array.isArray(row.points) ? row.points : [],
    category: row.category || '',
    labelEnabled: row.label_enabled ?? true,
    labelSize: row.label_size ?? 0.75,
    labelOffsetX: row.label_offset_x ?? '0',
    labelOffsetY: row.label_offset_y ?? '0',
    labelWidth: row.label_width ?? 0.9,
    description: row.description || '',
    lore: row.lore || '',
    emblem: row.emblem || '',
    bannerImage: row.banner_image || '',
    ...(era.timeStart != null && { timeStart: Number(era.timeStart) }),
    ...(era.timeEnd != null && { timeEnd: Number(era.timeEnd) }),
    ...(normalizeSecretId(secret.secretId) && { secretId: normalizeSecretId(secret.secretId) }),
  };
}

async function getNpcs() {
  try {
    const { data, error } = await db().from('npcs').select('*').order('created_at');
    throwIfError(error, 'view npcs');
    return (data || []).map(rowToNpc);
  } catch {
    return readDataList('npcs.json');
  }
}

async function getLocations() {
  try {
    const [secretMap, result] = await Promise.all([
      readSecretMap('location-secrets.json'),
      db().from('locations').select('*').order('id'),
    ]);
    throwIfError(result.error, 'view locations');
    return (result.data || []).map((row) => rowToLocation(row, secretMap));
  } catch {
    const parsed = await readJsonFile(path.join(DATA_DIR, 'locations.json'), { locations: [] });
    const list = Array.isArray(parsed) ? parsed : parsed?.locations;
    return Array.isArray(list) ? list : [];
  }
}

async function getRegions() {
  try {
    const [eras, secretMap, result] = await Promise.all([
      readRegionEraMap(),
      readSecretMap('region-secrets.json'),
      db().from('regions').select('*').order('name'),
    ]);
    throwIfError(result.error, 'view regions');
    return (result.data || []).map((row) => rowToRegion(row, eras, secretMap));
  } catch {
    const candidates = [
      path.join(DATA_DIR, 'regions.json'),
      path.join(__dirname, 'regions.json'),
    ];
    for (const candidate of candidates) {
      const parsed = await readJsonFile(candidate, []);
      if (Array.isArray(parsed)) return parsed;
    }
    return [];
  }
}

async function readEntities(filename) {
  return readDataList(filename);
}

function filterVisibility(items, visibilitySet, truesightSet, viewer, isAdmin) {
  const list = Array.isArray(items) ? items : [];
  const gated = isAdmin
    ? list
    : list.filter((item) => visibilitySet.has(item.id) || truesightSet.has(item.id));
  return sanitizeSecretItems(gated, viewer);
}

router.get('/characters', async (req, res) => {
  const viewer = await resolveRequestUser(req);
  const isAdmin = viewer?.role === 'admin';
  const visibleIds = await readCharacterVisibility();
  return res.json({ visibleIds, admin: isAdmin });
});

router.post('/locations/visible', authRequired, adminRequired, async (req, res) => {
  const { visibleIds = [] } = req.body || {};
  await writeLocationVisibility(visibleIds);
  return res.json({ success: true, visibleIds });
});

router.post('/locations/truesight', authRequired, adminRequired, async (req, res) => {
  const { truesightIds = [] } = req.body || {};
  await writeList('location-truesight.json', truesightIds);
  return res.json({ success: true, truesightIds });
});

router.get('/locations', async (req, res) => {
  const viewer = await resolveRequestUser(req);
  const isAdmin = viewer?.role === 'admin';
  const visibility = new Set(await readLocationVisibility());
  const truesight = new Set(await readList('location-truesight.json'));
  const locations = await getLocations();
  const payload = filterVisibility(locations, visibility, truesight, viewer, isAdmin).map((loc) => ({
    ...loc,
    visible: visibility.has(loc.id),
    truesight: truesight.has(loc.id),
  }));
  return res.json({ items: payload, admin: isAdmin, truesightIds: Array.from(truesight) });
});

router.post('/npcs/visible', authRequired, adminRequired, async (req, res) => {
  const { visibleIds = [] } = req.body || {};
  await writeNpcVisibility(visibleIds);
  return res.json({ success: true, visibleIds });
});

router.post('/npcs/truesight', authRequired, adminRequired, async (req, res) => {
  const { truesightIds = [] } = req.body || {};
  await writeList('npc-truesight.json', truesightIds);
  return res.json({ success: true, truesightIds });
});

router.get('/npcs', async (req, res) => {
  const viewer = await resolveRequestUser(req);
  const isAdmin = viewer?.role === 'admin';
  const visibility = new Set(await readNpcVisibility());
  const truesight = new Set(await readList('npc-truesight.json'));
  const npcs = await getNpcs();
  const payload = filterVisibility(npcs, visibility, truesight, viewer, isAdmin).map((npc) => ({
    ...npc,
    visible: visibility.has(npc.id),
    truesight: truesight.has(npc.id),
  }));
  return res.json({ items: payload, admin: isAdmin, truesightIds: Array.from(truesight) });
});

router.get('/players', authRequired, async (req, res) => {
  const users = await readUsers();
  const visibility = new Set(await readCharacterVisibility());
  const payload = users.map((user) => {
    const favorites = Array.isArray(user.favorites) ? user.favorites : [];
    return {
      id: user.id,
      name: user.name || user.username || 'Player',
      username: user.username || '',
      profilePicture: user.profilePicture || '',
      favorites: favorites.filter((id) => visibility.has(id)),
      featuredCharacter: visibility.has(user.featuredCharacter) ? user.featuredCharacter : null,
      role: user.role,
    };
  });
  return res.json({ users: payload });
});

router.get('/favorites', authRequired, async (req, res) => {
  const current = req.user;
  const viewFavorites = Array.isArray(current.profile?.viewFavorites) ? current.profile.viewFavorites : [];
  return res.json({ viewFavorites });
});

router.post('/favorite', authRequired, async (req, res) => {
  const { type, id, favorite } = req.body || {};
  const parsedId = Number(id);
  if (!['character', 'npc', 'location'].includes(type)) {
    return res.status(400).json({ error: 'Invalid type.' });
  }
  if (!Number.isFinite(parsedId)) {
    return res.status(400).json({ error: 'A valid id is required.' });
  }
  let updated = [];
  await updateUsers((users) => {
    const idx = users.findIndex((user) => user.id === req.user.id);
    if (idx === -1) throw new Error('User not found.');
    const currentUser = users[idx];
    const viewFavorites = Array.isArray(currentUser.profile?.viewFavorites)
      ? [...currentUser.profile.viewFavorites]
      : [];
    const key = `${type}:${parsedId}`;
    const set = new Set(viewFavorites);
    if (favorite) set.add(key);
    else set.delete(key);
    const profile = {
      bio: currentUser.profile?.bio || '',
      labelOne: currentUser.profile?.labelOne || '',
      labelTwo: currentUser.profile?.labelTwo || '',
      documents: Array.isArray(currentUser.profile?.documents) ? currentUser.profile.documents : [],
      viewFavorites: Array.from(set),
    };
    users[idx] = { ...currentUser, profile };
    updated = profile.viewFavorites;
    return users;
  });
  return res.json({ success: true, viewFavorites: updated });
});

router.get('/region/:id', async (req, res) => {
  const viewer = await resolveRequestUser(req);
  const isAdmin = viewer?.role === 'admin';
  const { id } = req.params;
  const [regions, locations, npcs, players, majors] = await Promise.all([
    getRegions(),
    getLocations(),
    getNpcs(),
    readEntities('playerCharacters.json'),
    readEntities('majorEntities.json'),
  ]);
  const region = sanitizeSecretItems(
    regions.filter((entry) => String(entry.id) === String(id)),
    viewer
  )[0];
  if (!region) return res.status(404).json({ error: 'Region not found.' });

  const locationVisibility = new Set(await readLocationVisibility());
  const locationTruesight = new Set(await readList('location-truesight.json'));
  const npcVisibility = new Set(await readNpcVisibility());
  const npcTruesight = new Set(await readList('npc-truesight.json'));

  const visibleLocations = filterVisibility(
    locations,
    locationVisibility,
    locationTruesight,
    viewer,
    isAdmin
  ).filter((loc) => loc.regionId && String(loc.regionId) === String(id));
  const linkedNpcs = filterVisibility(npcs, npcVisibility, npcTruesight, viewer, isAdmin).filter(
    (npc) => npc.regionId && String(npc.regionId) === String(id)
  );
  const visiblePlayers = filterVisibility(players, npcVisibility, npcTruesight, viewer, isAdmin).filter(
    (pc) => pc.regionId && String(pc.regionId) === String(id)
  );
  const visibleMajors = filterVisibility(majors, npcVisibility, npcTruesight, viewer, isAdmin).filter(
    (major) => major.regionId && String(major.regionId) === String(id)
  );

  return res.json({
    region,
    locations: visibleLocations,
    npcs: linkedNpcs,
    players: visiblePlayers,
    majors: visibleMajors,
  });
});

router.get('/location/:id', async (req, res) => {
  const viewer = await resolveRequestUser(req);
  const isAdmin = viewer?.role === 'admin';
  const { id } = req.params;
  const [locations, npcs, players, majors] = await Promise.all([
    getLocations(),
    getNpcs(),
    readEntities('playerCharacters.json'),
    readEntities('majorEntities.json'),
  ]);
  const locationVisibility = new Set(await readLocationVisibility());
  const locationTruesight = new Set(await readList('location-truesight.json'));
  const npcVisibility = new Set(await readNpcVisibility());
  const npcTruesight = new Set(await readList('npc-truesight.json'));

  const location = filterVisibility(
    locations.filter((entry) => String(entry.id) === String(id)),
    locationVisibility,
    locationTruesight,
    viewer,
    isAdmin
  )[0];
  if (!location) {
    return res.status(404).json({ error: 'Location not found.' });
  }

  const linkedNpcs = filterVisibility(npcs, npcVisibility, npcTruesight, viewer, isAdmin).filter(
    (npc) =>
      (npc.markerId && String(npc.markerId) === String(id)) ||
      (npc.regionId && npc.regionId === location.regionId)
  );
  const visiblePlayers = filterVisibility(players, npcVisibility, npcTruesight, viewer, isAdmin).filter(
    (pc) =>
      (pc.markerId && String(pc.markerId) === String(id)) ||
      (pc.regionId && pc.regionId === location.regionId)
  );
  const visibleMajors = filterVisibility(majors, npcVisibility, npcTruesight, viewer, isAdmin).filter(
    (major) =>
      (major.markerId && String(major.markerId) === String(id)) ||
      (major.regionId && major.regionId === location.regionId)
  );

  return res.json({
    location,
    npcs: linkedNpcs,
    players: visiblePlayers,
    majors: visibleMajors,
  });
});

export default router;
