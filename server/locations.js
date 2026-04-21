import express, { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { authRequired, editorRequired, resolveRequestUser } from './utils.js';
import { db, throwIfError } from './db.js';
import { canAccessSecretItem, sanitizeSecretItems } from './secretAccess.js';
import { canManageSecret, readSecretSettingsMap } from './secretStore.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCATION_IMAGES_DIR = path.join(__dirname, 'uploads', 'locations');
const DATA_DIR = path.join(__dirname, 'data');
const LOCATION_SECRET_FILE = path.join(DATA_DIR, 'location-secrets.json');

// ── Image upload setup ────────────────────────────────────────────────────────

async function ensureImagesDir() {
  if (!existsSync(LOCATION_IMAGES_DIR)) {
    await fs.mkdir(LOCATION_IMAGES_DIR, { recursive: true });
  }
}

async function ensureLocationSecretFile() {
  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
  if (!existsSync(LOCATION_SECRET_FILE)) {
    await fs.writeFile(LOCATION_SECRET_FILE, JSON.stringify({ secrets: {} }, null, 2));
  }
}

async function readLocationSecretMap() {
  await ensureLocationSecretFile();
  try {
    const raw = await fs.readFile(LOCATION_SECRET_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed?.secrets && typeof parsed.secrets === 'object' ? parsed.secrets : {};
  } catch {
    return {};
  }
}

async function writeLocationSecretMap(secrets) {
  await ensureLocationSecretFile();
  await fs.writeFile(LOCATION_SECRET_FILE, JSON.stringify({ secrets }, null, 2));
}

function normalizeSecretId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function setLocationSecret(secrets, id, secretId) {
  const next = { ...(secrets || {}) };
  const normalized = normalizeSecretId(secretId);
  if (normalized) next[String(id)] = { secretId: normalized };
  else delete next[String(id)];
  return next;
}

function canEditLocationSecret(user, existingSecretId, nextSecretId, settings) {
  if (user?.role === 'admin') return true;
  const current = normalizeSecretId(existingSecretId);
  const next = normalizeSecretId(nextSecretId);
  if (current && !canManageSecret(user, current, settings)) return false;
  if (next && !canManageSecret(user, next, settings)) return false;
  return true;
}

const imageStorage = multer.diskStorage({
  destination: async function(_req, _file, cb) {
    await ensureImagesDir();
    cb(null, LOCATION_IMAGES_DIR);
  },
  filename: function(_req, file, cb) {
    const ext = path.extname(file.originalname) || '.jpg';
    const base = path.basename(file.originalname, ext).replace(/[^\w.-]/g, '_').slice(0, 40);
    const unique = Date.now() + '-' + Math.random().toString(16).slice(2);
    cb(null, base + '-' + unique + ext);
  },
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: function(_req, file, cb) {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only image files are allowed.'));
  },
});

// Serve uploaded location images statically at /api/locations/images/<filename>
router.use('/images', express.static(LOCATION_IMAGES_DIR));

// ── DB helpers ────────────────────────────────────────────────────────────────

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
    iconKey: row.icon_key || '',
    lat: row.lat != null ? row.lat : 0,
    lng: row.lng != null ? row.lng : 0,
    x: row.lat != null ? row.lat : 0,
    y: row.lng != null ? row.lng : 0,
    lore: row.lore || '',
    description: row.description || '',
    category: row.category || '',
    tags: Array.isArray(row.tags) ? row.tags : [],
    regionId: row.region_id || null,
    glowColor: row.glow_color || '#F7B267',
    gallery: Array.isArray(row.gallery) ? row.gallery : [],
    pinned: row.pinned === true,
    timeStart: row.time_start != null ? row.time_start : null,
    timeEnd: row.time_end != null ? row.time_end : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by || null,
    updatedBy: row.updated_by || null,
    ...(normalizeSecretId(secret.secretId) && { secretId: normalizeSecretId(secret.secretId) }),
  };
}

async function getNextLocationId() {
  const { data, error } = await db().from('locations').select('id');
  throwIfError(error, 'locations next id fetch');
  const maxId = (data || []).reduce((max, row) => {
    const raw = row?.id;
    const next =
      typeof raw === 'number'
        ? raw
        : typeof raw === 'string' && /^-?\d+$/.test(raw)
          ? Number(raw)
          : null;
    return next != null ? Math.max(max, next) : max;
  }, 0);
  return maxId + 1;
}

function locationToRow(loc) {
  return {
    id: String(loc.id),
    name: loc.name || 'Unnamed',
    type: loc.type || '',
    icon_key: loc.iconKey || loc.icon_key || '',
    lat: loc.lat != null ? loc.lat : (loc.x != null ? loc.x : 0),
    lng: loc.lng != null ? loc.lng : (loc.y != null ? loc.y : 0),
    lore: loc.lore || '',
    description: loc.description || '',
    category: loc.category || '',
    tags: Array.isArray(loc.tags) ? loc.tags : [],
    region_id: loc.regionId != null ? loc.regionId : (loc.region_id != null ? loc.region_id : null),
    glow_color: loc.glowColor || loc.glow_color || '#F7B267',
    gallery: Array.isArray(loc.gallery) ? loc.gallery : [],
    pinned: loc.pinned === true,
    time_start: loc.timeStart != null ? loc.timeStart : null,
    time_end: loc.timeEnd != null ? loc.timeEnd : null,
    created_by: loc.createdBy || loc.created_by || null,
    updated_by: loc.updatedBy || loc.updated_by || null,
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/locations
router.get('/', async function(req, res) {
  try {
    const viewer = await resolveRequestUser(req);
    const secretMap = await readLocationSecretMap();
    const { data, error } = await db().from('locations').select('*').order('id');
    throwIfError(error, 'locations GET /');
    const locations = (data || []).map((row) => rowToLocation(row, secretMap));
    return res.json({ locations: sanitizeSecretItems(locations, viewer) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load locations.' });
  }
});

// POST /api/locations
router.post('/', authRequired, editorRequired, async function(req, res) {
  try {
    const secretSettings = await readSecretSettingsMap();
    if (!canEditLocationSecret(req.user, null, req.body?.secretId, secretSettings)) {
      return res.status(403).json({ error: 'Only the secret owner or admin can assign this location to that secret.' });
    }
    const actor = (req.user && (req.user.username || req.user.name)) || 'unknown';
    const nextId = await getNextLocationId();
    const row = locationToRow({
      ...req.body,
      id: nextId,
      createdBy: actor,
      updatedBy: actor,
    });
    const { data, error } = await db().from('locations').insert(row).select().single();
    throwIfError(error, 'locations POST insert');
    let secretMap = await readLocationSecretMap();
    if (req.body?.secretId !== undefined) {
      secretMap = setLocationSecret(secretMap, data.id, req.body?.secretId);
      await writeLocationSecretMap(secretMap);
    }
    return res.status(201).json({ location: rowToLocation(data, secretMap) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create location.' });
  }
});

// POST /api/locations/save — bulk-replace all locations (editor+)
router.post('/save', authRequired, editorRequired, async function(req, res) {
  const payload = Array.isArray(req.body) ? req.body : req.body && req.body.locations;
  if (!Array.isArray(payload)) {
    return res.status(400).json({ error: 'Locations payload must be an array.' });
  }
  try {
    const currentSecretMap = await readLocationSecretMap();
    const secretSettings = await readSecretSettingsMap();
    const { data: existingRows, error: existingErr } = await db().from('locations').select('*').order('id');
    throwIfError(existingErr, 'locations save existing fetch');
    const existingLocations = (existingRows || []).map((row) => rowToLocation(row, currentSecretMap));
    const preservedExisting = req.user?.role === 'admin'
      ? []
      : existingLocations.filter(
          (location) =>
            !canAccessSecretItem(req.user, location) ||
            !canEditLocationSecret(req.user, location.secretId, location.secretId, secretSettings)
        );
    const preservedIds = new Set(preservedExisting.map((location) => String(location.id)));
    const combinedPayload = req.user?.role === 'admin'
      ? payload
      : [...payload.filter((location) => !preservedIds.has(String(location?.id))), ...preservedExisting];
    if (
      !combinedPayload.every((location) =>
        canEditLocationSecret(
          req.user,
          existingLocations.find((entry) => String(entry.id) === String(location.id))?.secretId,
          location?.secretId,
          secretSettings
        )
      )
    ) {
      return res.status(403).json({ error: 'Only the secret owner or admin can save secret-scoped locations.' });
    }

    const { error: delErr } = await db().from('locations').delete().neq('id', '__none__');
    throwIfError(delErr, 'locations save delete');
    if (combinedPayload.length > 0) {
      const rows = combinedPayload.map(locationToRow);
      const { error: insErr } = await db().from('locations').insert(rows);
      throwIfError(insErr, 'locations save insert');
    }
    const { data, error } = await db().from('locations').select('*').order('id');
    throwIfError(error, 'locations save fetch');
    const nextSecretMap = combinedPayload.reduce((acc, location) => {
      const secretId = normalizeSecretId(location.secretId);
      if (secretId) acc[String(location.id)] = { secretId };
      return acc;
    }, {});
    await writeLocationSecretMap(nextSecretMap);
    return res.json({ locations: (data || []).map((row) => rowToLocation(row, nextSecretMap)) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to save locations.' });
  }
});

// PATCH /api/locations/:id
router.patch('/:id', authRequired, editorRequired, async function(req, res) {
  const { id } = req.params;
  const allowed = ['name', 'description', 'lore', 'type', 'regionId', 'tags', 'gallery', 'glowColor', 'iconKey', 'pinned', 'timeStart', 'timeEnd', 'lat', 'lng'];
  const updates = {};
  allowed.forEach(function(key) { if (key in req.body) updates[key] = req.body[key]; });

  try {
    const fetchResult = await db().from('locations').select('*').eq('id', String(id)).single();
    throwIfError(fetchResult.error, 'locations PATCH fetch');
    if (!fetchResult.data) return res.status(404).json({ error: 'Location not found.' });
    const currentSecretMap = await readLocationSecretMap();
    const secretSettings = await readSecretSettingsMap();
    const currentSecretId =
      currentSecretMap[String(id)]?.secretId ||
      currentSecretMap[String(fetchResult.data.id)]?.secretId ||
      null;
    if (!canEditLocationSecret(req.user, currentSecretId, req.body?.secretId ?? currentSecretId, secretSettings)) {
      return res.status(403).json({ error: 'Only the secret owner or admin can edit this location secret scope.' });
    }

    const actor = (req.user && (req.user.username || req.user.name)) || 'unknown';
    const patchRow = {};
    if (updates.name !== undefined) patchRow.name = updates.name;
    if (updates.description !== undefined) patchRow.description = updates.description;
    if (updates.lore !== undefined) patchRow.lore = updates.lore;
    if (updates.type !== undefined) patchRow.type = updates.type;
    if (updates.regionId !== undefined) patchRow.region_id = updates.regionId;
    if (updates.tags !== undefined) patchRow.tags = updates.tags;
    if (updates.gallery !== undefined) patchRow.gallery = updates.gallery;
    if (updates.glowColor !== undefined) patchRow.glow_color = updates.glowColor;
    if (updates.iconKey !== undefined) patchRow.icon_key = updates.iconKey;
    if (updates.pinned !== undefined) patchRow.pinned = updates.pinned === true;
    if (updates.timeStart !== undefined) patchRow.time_start = updates.timeStart;
    if (updates.timeEnd !== undefined) patchRow.time_end = updates.timeEnd;
    if (updates.lat !== undefined) patchRow.lat = updates.lat;
    if (updates.lng !== undefined) patchRow.lng = updates.lng;
    patchRow.updated_by = actor;
    if (!fetchResult.data.created_by) patchRow.created_by = actor;

    const { data, error } = await db().from('locations').update(patchRow).eq('id', String(id)).select().single();
    throwIfError(error, 'locations PATCH update');
    let secretMap = currentSecretMap;
    if (req.body?.secretId !== undefined) {
      secretMap = setLocationSecret(secretMap, id, req.body.secretId);
      await writeLocationSecretMap(secretMap);
    }
    return res.json({ location: rowToLocation(data, secretMap) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update location.' });
  }
});

// DELETE /api/locations/:id
router.delete('/:id', authRequired, editorRequired, async function(req, res) {
  const { id } = req.params;
  try {
    const { data: existing, error: fetchErr } = await db().from('locations').select('id').eq('id', String(id)).single();
    throwIfError(fetchErr, 'locations DELETE fetch');
    if (!existing) return res.status(404).json({ error: 'Location not found.' });
    const { error } = await db().from('locations').delete().eq('id', String(id));
    throwIfError(error, 'locations DELETE');
    const secretMap = setLocationSecret(await readLocationSecretMap(), id, null);
    await writeLocationSecretMap(secretMap);
    return res.json({ success: true, id: typeof existing.id === 'string' && /^-?\d+$/.test(existing.id) ? Number(existing.id) : existing.id });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete location.' });
  }
});

// POST /api/locations/:id/gallery
router.post('/:id/gallery', authRequired, editorRequired, uploadImage.single('image'), async function(req, res) {
  if (!req.file) return res.status(400).json({ error: 'No image provided.' });
  const { id } = req.params;
  const url = '/api/locations/images/' + req.file.filename;
  try {
    const { data: existing, error: fetchErr } = await db().from('locations').select('gallery').eq('id', String(id)).single();
    throwIfError(fetchErr, 'gallery fetch');
    if (!existing) return res.status(404).json({ error: 'Location not found.' });
    const gallery = Array.isArray(existing.gallery) ? [...existing.gallery, url] : [url];
    const { error } = await db().from('locations').update({ gallery: gallery }).eq('id', String(id));
    throwIfError(error, 'gallery update');
    return res.json({ url: url, gallery: gallery });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to upload image.' });
  }
});

// DELETE /api/locations/:id/gallery/:index
router.delete('/:id/gallery/:index', authRequired, editorRequired, async function(req, res) {
  const { id, index } = req.params;
  const imgIdx = parseInt(index, 10);
  try {
    const { data: existing, error: fetchErr } = await db().from('locations').select('gallery').eq('id', String(id)).single();
    throwIfError(fetchErr, 'gallery delete fetch');
    if (!existing) return res.status(404).json({ error: 'Location not found.' });
    const gallery = Array.isArray(existing.gallery) ? existing.gallery.slice() : [];
    if (imgIdx < 0 || imgIdx >= gallery.length) {
      return res.status(400).json({ error: 'Invalid gallery index.' });
    }
    try {
      const filename = path.basename(gallery[imgIdx]);
      await fs.rm(path.join(LOCATION_IMAGES_DIR, filename));
    } catch (e) { /* ignore */ }
    gallery.splice(imgIdx, 1);
    const { error } = await db().from('locations').update({ gallery: gallery }).eq('id', String(id));
    throwIfError(error, 'gallery delete update');
    return res.json({ gallery: gallery });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete image.' });
  }
});

export default router;
