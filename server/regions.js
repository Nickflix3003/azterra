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
const REGION_IMAGES_DIR = path.join(__dirname, 'uploads', 'regions');

// ── Image upload setup ────────────────────────────────────────────────────────

async function ensureImagesDir() {
  if (!existsSync(REGION_IMAGES_DIR)) {
    await fs.mkdir(REGION_IMAGES_DIR, { recursive: true });
  }
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
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

// GET /api/regions — all regions (public)
router.get('/', async (_req, res) => {
  try {
    const { data, error } = await db().from('regions').select('*').order('name');
    throwIfError(error, 'regions GET /');
    return res.json({ regions: (data || []).map(rowToRegion) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load regions.' });
  }
});

// POST /api/regions/save — bulk-replace all regions (editor+)
router.post('/save', authRequired, editorRequired, async (req, res) => {
  const payload = Array.isArray(req.body) ? req.body : req.body?.regions;
  if (!Array.isArray(payload)) {
    return res.status(400).json({ error: 'Regions payload must be an array.' });
  }

  try {
    const { error: delErr } = await db().from('regions').delete().neq('id', '__none__');
    throwIfError(delErr, 'regions save delete');

    if (payload.length > 0) {
      const rows = payload.map(regionToRow);
      const { error: insErr } = await db().from('regions').insert(rows);
      throwIfError(insErr, 'regions save insert');
    }

    const { data, error } = await db().from('regions').select('*').order('name');
    throwIfError(error, 'regions save fetch');
    return res.json({ regions: (data || []).map(rowToRegion) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to save regions.' });
  }
});

// PATCH /api/regions/:id — update a single region's fields (editor+)
router.patch('/:id', authRequired, editorRequired, async (req, res) => {
  const { id } = req.params;
  const allowed = ['name', 'description', 'lore', 'emblem', 'bannerImage', 'color', 'borderColor'];
  const updates = {};
  allowed.forEach((key) => {
    if (key in req.body) updates[key] = req.body[key];
  });

  try {
    const patchRow = {
      ...(updates.name !== undefined && { name: updates.name }),
      ...(updates.description !== undefined && { description: updates.description }),
      ...(updates.lore !== undefined && { lore: updates.lore }),
      ...(updates.emblem !== undefined && { emblem: updates.emblem }),
      ...(updates.bannerImage !== undefined && { banner_image: updates.bannerImage }),
      ...(updates.color !== undefined && { color: updates.color }),
      ...(updates.borderColor !== undefined && { border_color: updates.borderColor }),
    };

    const { data, error } = await db()
      .from('regions')
      .update(patchRow)
      .eq('id', String(id))
      .select()
      .single();

    if (error?.code === 'PGRST116') return res.status(404).json({ error: 'Region not found.' });
    throwIfError(error, 'regions PATCH');
    return res.json({ region: rowToRegion(data) });
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
