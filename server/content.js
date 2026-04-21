import { Router } from 'express';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeContentEntry, normalizeContentList } from './contentSchema.js';
import { adminRequired, authRequired, resolveRequestUser } from './utils.js';
import { sanitizeSecretItems } from './secretAccess.js';

const router = Router();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');

function buildEntryId(entry = {}) {
  const preferred = entry.id || entry.slug || entry.title || `${entry.type || 'entry'}-${Date.now()}`;
  return String(preferred)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || `entry_${Date.now()}`;
}

async function ensureContentFile() {
  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
  if (!existsSync(CONTENT_FILE)) {
    await fs.writeFile(CONTENT_FILE, JSON.stringify({ entries: [] }, null, 2));
  }
}

async function readDiagnosticsFile() {
  try {
    const raw = await fs.readFile(path.join(DATA_DIR, 'content-diagnostics.json'), 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function readContentFile() {
  await ensureContentFile();
  try {
    const raw = await fs.readFile(CONTENT_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const entries = Array.isArray(parsed.entries) ? parsed.entries : [];
    const diagnostics = await readDiagnosticsFile();
    return { entries: normalizeContentList(entries), diagnostics };
  } catch {
    return { entries: [], diagnostics: null };
  }
}

async function writeContentFile(entries = []) {
  await ensureContentFile();
  await fs.writeFile(
    CONTENT_FILE,
    JSON.stringify({ entries: normalizeContentList(entries) }, null, 2)
  );
}

router.get('/', async (req, res) => {
  const viewer = await resolveRequestUser(req);
  const data = await readContentFile();
  return res.json({
    entries: sanitizeSecretItems(data.entries, viewer),
    diagnostics: data.diagnostics,
  });
});

router.get('/:id', async (req, res) => {
  const viewer = await resolveRequestUser(req);
  const { id } = req.params;
  const data = await readContentFile();
  const visibleEntries = sanitizeSecretItems(data.entries, viewer);
  const entry = visibleEntries.find((item) => String(item.id) === String(id));
  if (!entry) {
    return res.status(404).json({ error: 'Content not found.' });
  }
  return res.json({ entry });
});

router.post('/', authRequired, adminRequired, async (req, res) => {
  const data = await readContentFile();
  const nextEntry = normalizeContentEntry({
    ...req.body,
    id: req.body?.id || buildEntryId(req.body),
  });

  if (!nextEntry.title) {
    return res.status(400).json({ error: 'A title is required.' });
  }
  if (!nextEntry.type) {
    return res.status(400).json({ error: 'A content type is required.' });
  }
  if (nextEntry.secretId && !String(nextEntry.secretId).trim()) {
    return res.status(400).json({ error: 'Invalid secretId.' });
  }
  if (data.entries.some((entry) => String(entry.id) === String(nextEntry.id))) {
    return res.status(409).json({ error: 'A content entry with that id already exists.' });
  }

  const entries = [...data.entries, nextEntry];
  await writeContentFile(entries);
  return res.status(201).json({ entry: nextEntry });
});

router.patch('/:id', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params;
  const data = await readContentFile();
  const index = data.entries.findIndex((entry) => String(entry.id) === String(id));
  if (index === -1) {
    return res.status(404).json({ error: 'Content not found.' });
  }

  const existing = data.entries[index];
  const updated = normalizeContentEntry({
    ...existing,
    ...req.body,
    id: existing.id,
  });

  if (!updated.title) {
    return res.status(400).json({ error: 'A title is required.' });
  }
  if (!updated.type) {
    return res.status(400).json({ error: 'A content type is required.' });
  }

  const entries = data.entries.slice();
  entries[index] = updated;
  await writeContentFile(entries);
  return res.json({ entry: updated });
});

router.delete('/:id', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params;
  const data = await readContentFile();
  const nextEntries = data.entries.filter((entry) => String(entry.id) !== String(id));
  if (nextEntries.length === data.entries.length) {
    return res.status(404).json({ error: 'Content not found.' });
  }
  await writeContentFile(nextEntries);
  return res.json({ success: true });
});

export default router;
