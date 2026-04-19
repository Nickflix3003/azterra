import express, { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { authRequired, editorRequired } from './utils.js';
import { db, throwIfError } from './db.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const LOCATION_IMAGES_DIR = path.join(__dirname, 'uploads', 'locations');

// ── Image upload setup ────────────────────────────────────────────────────────

async function ensureImagesDir() {
  if (!existsSync(LOCATION_IMAGES_DIR)) {
    await fs.mkdir(LOCATION_IMAGES_DIR, { recursive: true });
  }
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

function rowToLocation(row) {
  return {
    id: row.id,
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
  };
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
router.get('/', async function(_req, res) {
  try {
    const { data, error } = await db().from('locations').select('*').order('id');
    throwIfError(error, 'locations GET /');
    return res.json({ locations: (data || []).map(rowToLocation) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load locations.' });
  }
});

// POST /api/locations/save — bulk-replace all locations (editor+)
router.post('/save', authRequired, editorRequired, async function(req, res) {
  const payload = Array.isArray(req.body) ? req.body : req.body && req.body.locations;
  if (!Array.isArray(payload)) {
    return res.status(400).json({ error: 'Locations payload must be an array.' });
  }
  try {
    const { error: delErr } = await db().from('locations').delete().neq('id', '__none__');
    throwIfError(delErr, 'locations save delete');
    if (payload.length > 0) {
      const rows = payload.map(locationToRow);
      const { error: insErr } = await db().from('locations').insert(rows);
      throwIfError(insErr, 'locations save insert');
    }
    const { data, error } = await db().from('locations').select('*').order('id');
    throwIfError(error, 'locations save fetch');
    return res.json({ locations: (data || []).map(rowToLocation) });
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
    return res.json({ location: rowToLocation(data) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update location.' });
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
