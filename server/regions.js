import express, { Router } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import { authRequired, editorRequired, resolveRequestUser } from './utils.js';
import { db, throwIfError } from './db.js';
import { canAccessSecretItem, sanitizeSecretItems } from './secretAccess.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REGION_IMAGES_DIR = path.join(__dirname, 'uploads', 'regions');
const DATA_DIR = path.join(__dirname, 'data');
const REGION_ERA_FILE = path.join(DATA_DIR, 'region-era.json');
const REGION_SECRET_FILE = path.join(DATA_DIR, 'region-secrets.json');

// ── Image upload setup ────────────────────────────────────────────────────────

async function ensureImagesDir() {
  if (!existsSync(REGION_IMAGES_DIR)) {
    await fs.mkdir(REGION_IMAGES_DIR, { recursive: true });
  }
}

function toOptionalYear(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

async function ensureRegionEraFile() {
  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
  if (!existsSync(REGION_ERA_FILE)) {
    await fs.writeFile(REGION_ERA_FILE, JSON.stringify({ eras: {} }, null, 2));
  }
}

async function ensureRegionSecretFile() {
  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
  if (!existsSync(REGION_SECRET_FILE)) {
    await fs.writeFile(REGION_SECRET_FILE, JSON.stringify({ secrets: {} }, null, 2));
  }
}

async function readRegionEraMap() {
  await ensureRegionEraFile();
  try {
    const raw = await fs.readFile(REGION_ERA_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed?.eras && typeof parsed.eras === 'object' ? parsed.eras : {};
  } catch {
    return {};
  }
}

async function writeRegionEraMap(eras) {
  await ensureRegionEraFile();
  await fs.writeFile(REGION_ERA_FILE, JSON.stringify({ eras }, null, 2));
}

async function readRegionSecretMap() {
  await ensureRegionSecretFile();
  try {
    const raw = await fs.readFile(REGION_SECRET_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return parsed?.secrets && typeof parsed.secrets === 'object' ? parsed.secrets : {};
  } catch {
    return {};
  }
}

async function writeRegionSecretMap(secrets) {
  await ensureRegionSecretFile();
  await fs.writeFile(REGION_SECRET_FILE, JSON.stringify({ secrets }, null, 2));
}

function normalizeSecretId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function setRegionSecret(secrets, id, secretId) {
  const next = { ...(secrets || {}) };
  const normalized = normalizeSecretId(secretId);
  if (normalized) next[String(id)] = { secretId: normalized };
  else delete next[String(id)];
  return next;
}

function mergeRegionMetadata(row, eras, secrets = {}) {
  const region = {
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
  const era = eras?.[String(row.id)] || {};
  const secret = secrets?.[String(row.id)] || {};
  return {
    ...region,
    ...(toOptionalYear(era.timeStart) != null && { timeStart: toOptionalYear(era.timeStart) }),
    ...(toOptionalYear(era.timeEnd) != null && { timeEnd: toOptionalYear(era.timeEnd) }),
    ...(normalizeSecretId(secret.secretId) && { secretId: normalizeSecretId(secret.secretId) }),
  };
}

const imageStorage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await ensureImagesDir();
    cb(null, REGION_IMAGES_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const base = path.basename(file.originalname, ext).replace(/[^\w.-]/g, '_').slice(0, 40);
    const unique = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    cb(null, `${base}-${unique}${ext}`);
  },
});

const uploadImage = multer({
  storage: imageStorage,
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
    if (allowed.includes(file.mimetype)) return cb(null, true);
    cb(new Error('Only image files are allowed (jpg, png, webp, gif, svg).'));
  },
});

// Serve uploaded region images at /api/regions/images/<filename>
router.use('/images', async (_req, _res, next) => {
  await ensureImagesDir();
  next();
}, express.static(REGION_IMAGES_DIR));

// ── DB helpers ────────────────────────────────────────────────────────────────

function rowToRegion(row) {
  return mergeRegionMetadata(row, {}, {});
}

function regionToRow(r) {
  return {
    id: r.id,
    name: r.name || 'Unnamed Region',
    color: r.color || '#304ddf',
    border_color: r.borderColor || r.border_color || '#ea580c',
    opacity: r.opacity ?? 0.35,
    points: Array.isArray(r.points) ? r.points : [],
    category: r.category || '',
    label_enabled: r.labelEnabled ?? r.label_enabled ?? true,
    label_size: r.labelSize ?? r.label_size ?? 0.75,
    label_offset_x: String(r.labelOffsetX ?? r.label_offset_x ?? '0'),
    label_offset_y: String(r.labelOffsetY ?? r.label_offset_y ?? '0'),
    label_width: r.labelWidth ?? r.label_width ?? 0.9,
    description: r.description || '',
    lore: r.lore || '',
    emblem: r.emblem || '',
    banner_image: r.bannerImage || r.banner_image || '',
  };
}

// ── Routes ────────────────────────────────────────────────────────────────────

// GET /api/regions
router.get('/', async (req, res) => {
  try {
    const viewer = await resolveRequestUser(req);
    const eras = await readRegionEraMap();
    const secretMap = await readRegionSecretMap();
    const { data, error } = await db().from('regions').select('*').order('name');
    throwIfError(error, 'regions GET /');
    const regions = (data || []).map((row) => mergeRegionMetadata(row, eras, secretMap));
    return res.json({ regions: sanitizeSecretItems(regions, viewer) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load regions.' });
  }
});

// POST /api/regions/save
router.post('/save', authRequired, editorRequired, async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : req.body?.regions;
  if (!Array.isArray(payload)) {
    return res.status(400).json({ error: 'Regions payload must be an array.' });
  }

  try {
    if (
      req.user?.role !== 'admin' &&
      payload.some((region) => region && Object.prototype.hasOwnProperty.call(region, 'secretId'))
    ) {
      return res.status(403).json({ error: 'Only admins can assign secrets.' });
    }

    const currentEraMap = await readRegionEraMap();
    const currentSecretMap = await readRegionSecretMap();
    const { data: existingRows, error: existingError } = await db().from('regions').select('*').order('name');
    throwIfError(existingError, 'regions save existing fetch');

    const existingRegions = (existingRows || []).map((row) =>
      mergeRegionMetadata(row, currentEraMap, currentSecretMap)
    );
    const hiddenExisting =
      req.user?.role === 'admin'
        ? []
        : existingRegions.filter((region) => !canAccessSecretItem(req.user, region));
    const combinedPayload = req.user?.role === 'admin' ? payload : [...payload, ...hiddenExisting];

    const nextEraMap = combinedPayload.reduce((acc, region) => {
      const timeStart = toOptionalYear(region.timeStart);
      const timeEnd = toOptionalYear(region.timeEnd);
      if (timeStart != null || timeEnd != null) {
        acc[String(region.id)] = {
          ...(timeStart != null && { timeStart }),
          ...(timeEnd != null && { timeEnd }),
        };
      }
      return acc;
    }, {});
    const { error: delErr } = await db().from('regions').delete().neq('id', '__none__');
    throwIfError(delErr, 'regions save delete');

    if (combinedPayload.length > 0) {
      const rows = combinedPayload.map(regionToRow);
      const { error: insErr } = await db().from('regions').insert(rows);
      throwIfError(insErr, 'regions save insert');
    }

    const { data, error } = await db().from('regions').select('*').order('name');
    throwIfError(error, 'regions save fetch');
    await writeRegionEraMap(nextEraMap);
    const nextSecretMap =
      req.user?.role === 'admin'
        ? combinedPayload.reduce((acc, region) => {
            const secretId = normalizeSecretId(region.secretId);
            if (secretId) acc[String(region.id)] = { secretId };
            return acc;
          }, {})
        : currentSecretMap;
    await writeRegionSecretMap(nextSecretMap);
    return res.json({
      regions: (data || []).map((row) => mergeRegionMetadata(row, nextEraMap, nextSecretMap)),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to save regions.' });
  }
});

// PATCH /api/regions/:id
router.patch('/:id', authRequired, editorRequired, async (req, res) => {
  const { id } = req.params;
  const allowed = ['name', 'description', 'lore', 'emblem', 'bannerImage', 'color', 'borderColor', 'timeStart', 'timeEnd'];
  const updates = {};
  allowed.forEach((key) => {
    if (key in req.body) updates[key] = req.body[key];
  });

  try {
    if (req.body?.secretId !== undefined && req.user?.role !== 'admin') {
      return res.status(403).json({ error: 'Only admins can assign secrets.' });
    }
    const eras = await readRegionEraMap();
    let secretMap = await readRegionSecretMap();
    const patchRow = {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.lore !== undefined && { lore: updates.lore }),
      ...(updates.emblem !== undefined && { emblem: updates.emblem }),
      ...(updates.bannerImage !== undefined && { banner_image: updates.bannerImage }),
      ...(updates.color !== undefined && { color: updates.color }),
      ...(updates.borderColor !== undefined && { border_color: updates.borderColor }),
    };

    const currentEra = eras[String(id)] || {};
    const nextTimeStart = updates.timeStart !== undefined ? toOptionalYear(updates.timeStart) : toOptionalYear(currentEra.timeStart);
    const nextTimeEnd = updates.timeEnd !== undefined ? toOptionalYear(updates.timeEnd) : toOptionalYear(currentEra.timeEnd);
    if (nextTimeStart == null && nextTimeEnd == null) {
      delete eras[String(id)];
    } else {
      eras[String(id)] = {
        ...(nextTimeStart != null && { timeStart: nextTimeStart }),
        ...(nextTimeEnd != null && { timeEnd: nextTimeEnd }),
      };
    }

    const { data, error } = await db()
      .from('regions')
      .update(patchRow)
      .eq('id', String(id))
      .select()
      .single();

    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Region not found.' });
    throwIfError(error, 'regions PATCH');
    await writeRegionEraMap(eras);
    if (req.user?.role === 'admin' && req.body?.secretId !== undefined) {
      secretMap = setRegionSecret(secretMap, id, req.body.secretId);
      await writeRegionSecretMap(secretMap);
    }
    return res.json({ region: mergeRegionMetadata(data, eras, secretMap) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update region.' });
  }
});

// POST /api/regions/upload-image — upload a banner/emblem image
router.post(
  '/upload-image',
  authRequired,
  editorRequired,
  uploadImage.single('image'),
  (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No image provided.' });
    const url = `/api/regions/images/${req.file.filename}`;
    return res.json({ url, filename: req.file.filename });
  },
);

export default router;
