import { Router } from 'express';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { normalizeContentEntry, normalizeContentList } from './contentSchema.js';
import { authRequired, editorRequired, resolveRequestUser } from './utils.js';
import { sanitizeSecretItems } from './secretAccess.js';
import { canManageSecret, readSecretSettingsMap } from './secretStore.js';

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

function normalizeSecretId(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function canEditContentEntry(user, existingEntry, nextEntry, settings) {
  if (user?.role === 'admin') return true;
  const existingSecretId = normalizeSecretId(existingEntry?.secretId);
  const nextSecretId = normalizeSecretId(nextEntry?.secretId);
  if (existingSecretId && !canManageSecret(user, existingSecretId, settings)) return false;
  if (nextSecretId && !canManageSecret(user, nextSecretId, settings)) return false;
  return true;
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

router.post('/', authRequired, editorRequired, async (req, res) => {
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
  const settings = await readSecretSettingsMap();
  if (!canEditContentEntry(req.user, null, nextEntry, settings)) {
    return res.status(403).json({ error: 'Only the secret owner or admin can save secret lore for this secret.' });
  }

  const entries = [...data.entries, nextEntry];
  await writeContentFile(entries);
  return res.status(201).json({ entry: nextEntry });
});

router.patch('/:id', authRequired, editorRequired, async (req, res) => {
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
  const settings = await readSecretSettingsMap();
  if (!canEditContentEntry(req.user, existing, updated, settings)) {
    return res.status(403).json({ error: 'Only the secret owner or admin can edit this lore entry.' });
  }

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

router.delete('/:id', authRequired, editorRequired, async (req, res) => {
  const { id } = req.params;
  const data = await readContentFile();
  const existing = data.entries.find((entry) => String(entry.id) === String(id));
  if (!existing) {
    return res.status(404).json({ error: 'Content not found.' });
  }
  const settings = await readSecretSettingsMap();
  if (!canEditContentEntry(req.user, existing, existing, settings)) {
    return res.status(403).json({ error: 'Only the secret owner or admin can delete this lore entry.' });
  }
  const nextEntries = data.entries.filter((entry) => String(entry.id) !== String(id));
  await writeContentFile(nextEntries);
  return res.json({ success: true });
});

export default router;
