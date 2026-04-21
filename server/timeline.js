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
const TIMELINE_ERAS_FILE = path.join(DATA_DIR, 'timeline-eras.json');

const DEFAULT_TIMELINE_ERAS = [
  {
    id: 'before-records',
    label: 'Before Records',
    startYear: 0,
    endYear: 99,
    color: '#4f46e5',
  },
  {
    id: 'founding-age',
    label: 'Founding Age',
    startYear: 100,
    endYear: 299,
    color: '#0f766e',
  },
  {
    id: 'age-of-strife',
    label: 'Age of Strife',
    startYear: 300,
    endYear: 499,
    color: '#b45309',
  },
  {
    id: 'great-conquest',
    label: 'Great Conquest',
    startYear: 500,
    endYear: 699,
    color: '#be123c',
  },
  {
    id: 'current-era',
    label: 'Current Era',
    startYear: 700,
    endYear: 899,
    color: '#1d4ed8',
  },
  {
    id: 'end-of-days',
    label: 'End of Days',
    startYear: 900,
    endYear: 1000,
    color: '#7c3aed',
  },
];

function toOptionalYear(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeColor(value) {
  if (typeof value !== 'string') return '#c084fc';
  const trimmed = value.trim();
  if (/^#[\da-f]{6}$/i.test(trimmed) || /^#[\da-f]{3}$/i.test(trimmed)) {
    return trimmed;
  }
  return '#c084fc';
}

function normalizeEra(era = {}) {
  const startYear = toOptionalYear(era.startYear);
  const endYear = toOptionalYear(era.endYear);

  return {
    id: era.id || randomUUID(),
    label: String(era.label || 'New Era').trim() || 'New Era',
    ...(startYear != null && { startYear }),
    ...(endYear != null && { endYear }),
    color: normalizeColor(era.color),
    ...(era.description ? { description: String(era.description).trim() } : {}),
    ...(era.createdAt ? { createdAt: era.createdAt } : {}),
    ...(era.updatedAt ? { updatedAt: era.updatedAt } : {}),
  };
}

function sortEras(eras = []) {
  return [...eras].sort((left, right) => {
    const leftStart = toOptionalYear(left.startYear);
    const rightStart = toOptionalYear(right.startYear);
    if (leftStart == null && rightStart != null) return 1;
    if (leftStart != null && rightStart == null) return -1;
    if (leftStart !== rightStart) return (leftStart ?? 0) - (rightStart ?? 0);

    const leftEnd = toOptionalYear(left.endYear);
    const rightEnd = toOptionalYear(right.endYear);
    if (leftEnd == null && rightEnd != null) return 1;
    if (leftEnd != null && rightEnd == null) return -1;
    if (leftEnd !== rightEnd) return (leftEnd ?? 0) - (rightEnd ?? 0);

    return String(left.label || '').localeCompare(String(right.label || ''));
  });
}

async function ensureTimelineErasFile() {
  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
  if (!existsSync(TIMELINE_ERAS_FILE)) {
    await fs.writeFile(
      TIMELINE_ERAS_FILE,
      JSON.stringify({ eras: DEFAULT_TIMELINE_ERAS }, null, 2)
    );
  }
}

async function readTimelineEras() {
  await ensureTimelineErasFile();
  try {
    const raw = await fs.readFile(TIMELINE_ERAS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const eras = Array.isArray(parsed) ? parsed : parsed.eras || [];
    return sortEras(eras.map(normalizeEra));
  } catch {
    return sortEras(DEFAULT_TIMELINE_ERAS.map(normalizeEra));
  }
}

async function writeTimelineEras(eras) {
  await ensureTimelineErasFile();
  await fs.writeFile(
    TIMELINE_ERAS_FILE,
    JSON.stringify({ eras: sortEras(eras.map(normalizeEra)) }, null, 2)
  );
}

router.get('/eras', async (_req, res) => {
  const eras = await readTimelineEras();
  return res.json({ eras });
});

router.post('/eras', authRequired, editorRequired, async (req, res) => {
  try {
    const eras = await readTimelineEras();
    const now = new Date().toISOString();
    const nextEra = normalizeEra({
      ...req.body,
      id: req.body?.id || randomUUID(),
      createdAt: now,
      updatedAt: now,
    });
    const nextEras = sortEras([...eras, nextEra]);
    await writeTimelineEras(nextEras);
    return res.status(201).json({ era: nextEra, eras: nextEras });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to create timeline era.' });
  }
});

router.patch('/eras/:id', authRequired, editorRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const eras = await readTimelineEras();
    const index = eras.findIndex((era) => String(era.id) === String(id));
    if (index === -1) {
      return res.status(404).json({ error: 'Timeline era not found.' });
    }

    const nextEra = normalizeEra({
      ...eras[index],
      ...req.body,
      updatedAt: new Date().toISOString(),
    });
    const nextEras = eras.slice();
    nextEras[index] = nextEra;
    await writeTimelineEras(nextEras);
    return res.json({ era: nextEra, eras: sortEras(nextEras) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to update timeline era.' });
  }
});

router.delete('/eras/:id', authRequired, editorRequired, async (req, res) => {
  try {
    const { id } = req.params;
    const eras = await readTimelineEras();
    const nextEras = eras.filter((era) => String(era.id) !== String(id));
    if (nextEras.length === eras.length) {
      return res.status(404).json({ error: 'Timeline era not found.' });
    }
    await writeTimelineEras(nextEras);
    return res.json({ success: true, id, eras: sortEras(nextEras) });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: 'Unable to delete timeline era.' });
  }
});

export default router;
