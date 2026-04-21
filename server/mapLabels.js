import { Router } from 'express';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { authRequired, editorRequired } from './utils.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const LABELS_FILE = path.join(DATA_DIR, 'map-labels.json');

function toOptionalYear(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLabel(label = {}) {
  return {
    id: label.id,
    text: label.text || 'New Label',
    color: label.color || '#fef3c7',
    font: label.font || "'Cinzel','Cormorant Garamond',serif",
    size: Number.isFinite(Number(label.size)) ? Number(label.size) : 1,
    zoomScale: Number.isFinite(Number(label.zoomScale)) ? Number(label.zoomScale) : 1,
    scaleWithZoom: label.scaleWithZoom !== false,
    fadeInStart: Number.isFinite(Number(label.fadeInStart)) ? Number(label.fadeInStart) : 3,
    fadeInEnd: Number.isFinite(Number(label.fadeInEnd)) ? Number(label.fadeInEnd) : 5,
    lat: Number.isFinite(Number(label.lat)) ? Number(label.lat) : 0,
    lng: Number.isFinite(Number(label.lng)) ? Number(label.lng) : 0,
    ...(toOptionalYear(label.timeStart) != null && { timeStart: toOptionalYear(label.timeStart) }),
    ...(toOptionalYear(label.timeEnd) != null && { timeEnd: toOptionalYear(label.timeEnd) }),
    ...(label.createdAt && { createdAt: label.createdAt }),
    ...(label.updatedAt && { updatedAt: label.updatedAt }),
  };
}

async function ensureLabelsFile() {
  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
  if (!existsSync(LABELS_FILE)) {
    await fs.writeFile(LABELS_FILE, JSON.stringify({ labels: [] }, null, 2));
  }
}

async function readLabels() {
  await ensureLabelsFile();
  try {
    const raw = await fs.readFile(LABELS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const labels = Array.isArray(parsed) ? parsed : parsed.labels || [];
    return labels.map(normalizeLabel);
  } catch {
    return [];
  }
}

async function writeLabels(labels) {
  await ensureLabelsFile();
  await fs.writeFile(LABELS_FILE, JSON.stringify({ labels }, null, 2));
}

router.get('/', async (_req, res) => {
  const labels = await readLabels();
  return res.json({ labels });
});

router.post('/', authRequired, editorRequired, async (req, res) => {
  try {
    const labels = await readLabels();
    const now = new Date().toISOString();
    const nextLabel = normalizeLabel({
      ...req.body,
      id: req.body?.id || randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    labels.push(nextLabel);
    await writeLabels(labels);
    return res.status(201).json({ label: nextLabel });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to create map label.' });
  }
});

router.patch('/:id', authRequired, editorRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const labels = await readLabels();
    const index = labels.findIndex((label) => String(label.id) === String(id));
    if (index === -1) {
      return res.status(404).json({ error: 'Map label not found.' });
    }
    const nextLabel = normalizeLabel({
      ...labels[index],
      ...req.body,
      updatedAt: new Date().toISOString(),
    });
    labels[index] = nextLabel;
    await writeLabels(labels);
    return res.json({ label: nextLabel });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update map label.' });
  }
});

router.delete('/:id', authRequired, editorRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const labels = await readLabels();
    const nextLabels = labels.filter((label) => String(label.id) !== String(id));
    if (nextLabels.length === labels.length) {
      return res.status(404).json({ error: 'Map label not found.' });
    }
    await writeLabels(nextLabels);
    return res.json({ success: true, id });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to delete map label.' });
  }
});

export default router;
