import { Router } from 'express';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  adminRequired,
  authRequired,
  profileToUser,
  readUsers,
  sanitizeUser,
  updateUsers,
} from './utils.js';
import { db, throwIfError } from './db.js';

const router = Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const CONTENT_FILE = path.join(DATA_DIR, 'content.json');
const LOCATION_SECRET_FILE = path.join(DATA_DIR, 'location-secrets.json');
const REGION_SECRET_FILE = path.join(DATA_DIR, 'region-secrets.json');

function isUUID(value) {
  return /^[0-9a-f-]{36}$/i.test(String(value || ''));
}

function normalizePhrase(phrase = '') {
  return phrase.trim().toLowerCase();
}

function normalizeSecret(secret = {}) {
  return {
    id: String(secret.id || '').trim(),
    title: typeof secret.title === 'string' ? secret.title.trim() : '',
    description: typeof secret.description === 'string' ? secret.description.trim() : '',
    keyword: typeof secret.keyword === 'string' ? secret.keyword.trim() : '',
  };
}

function buildPhraseMap(secrets = []) {
  return secrets.reduce((acc, secret) => {
    if (secret.keyword) acc[normalizePhrase(secret.keyword)] = secret.id;
    return acc;
  }, {});
}

function buildSecretId(title = '') {
  const base = String(title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `secret-${Date.now()}`;
}

async function readJsonFile(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

async function writeJsonFile(filePath, value) {
  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
  await fs.writeFile(filePath, JSON.stringify(value, null, 2));
}

async function clearSecretAssignmentsInMap(filePath, secretId) {
  const parsed = await readJsonFile(filePath, { secrets: {} });
  const secrets = parsed?.secrets && typeof parsed.secrets === 'object' ? parsed.secrets : {};
  const nextSecrets = Object.fromEntries(
    Object.entries(secrets).filter(([, value]) => value?.secretId !== secretId)
  );
  await writeJsonFile(filePath, { secrets: nextSecrets });
}

async function clearSecretAssignmentsInContent(secretId) {
  const parsed = await readJsonFile(CONTENT_FILE, { entries: [] });
  const entries = Array.isArray(parsed?.entries) ? parsed.entries : [];
  const nextEntries = entries.map((entry) =>
    entry?.secretId === secretId ? { ...entry, secretId: null } : entry
  );
  await writeJsonFile(CONTENT_FILE, { entries: nextEntries });
}

async function clearSecretAssignmentsInProfiles(secretId) {
  const { data: profiles, error } = await db().from('profiles').select('id, unlocked_secrets');
  throwIfError(error, 'secrets delete profiles fetch');
  await Promise.all(
    (profiles || []).map(async (profile) => {
      const unlocked = Array.isArray(profile.unlocked_secrets) ? profile.unlocked_secrets : [];
      const nextUnlocked = unlocked.filter((id) => id !== secretId);
      if (nextUnlocked.length === unlocked.length) return;
      const { error: updateError } = await db()
        .from('profiles')
        .update({ unlocked_secrets: nextUnlocked })
        .eq('id', profile.id);
      throwIfError(updateError, 'secrets delete profile cleanup');
    })
  );
}

async function clearSecretAssignmentsInLegacyUsers(secretId) {
  await updateUsers((users) =>
    users.map((user) => ({
      ...user,
      unlockedSecrets: Array.isArray(user.unlockedSecrets)
        ? user.unlockedSecrets.filter((id) => id !== secretId)
        : [],
    }))
  );
}

async function readSecrets() {
  const { data, error } = await db().from('secrets').select('*').order('title');
  throwIfError(error, 'secrets read');
  return (data || []).map(normalizeSecret);
}

async function readSecretIds() {
  const secrets = await readSecrets();
  return new Set(secrets.map((secret) => secret.id));
}

async function getProfileUnlockedIds(userId) {
  const { data, error } = await db()
    .from('profiles')
    .select('unlocked_secrets')
    .eq('id', String(userId))
    .single();
  if (error || !data) return [];
  return Array.isArray(data.unlocked_secrets) ? data.unlocked_secrets : [];
}

async function getLegacyUnlockedIds(userId) {
  const parsedId = Number(userId);
  if (!Number.isFinite(parsedId)) return [];
  const users = await readUsers();
  const current = users.find((user) => user.id === parsedId);
  return Array.isArray(current?.unlockedSecrets) ? current.unlockedSecrets : [];
}

async function getUnlockedIds(userId) {
  return isUUID(userId)
    ? getProfileUnlockedIds(userId)
    : getLegacyUnlockedIds(userId);
}

async function setProfileUnlockedIds(userId, unlockedSecrets) {
  const { error } = await db()
    .from('profiles')
    .update({ unlocked_secrets: unlockedSecrets })
    .eq('id', String(userId));
  throwIfError(error, 'secrets update profile unlocks');
}

async function setLegacyUnlockedIds(userId, unlockedSecrets) {
  const parsedId = Number(userId);
  if (!Number.isFinite(parsedId)) {
    throw new Error('Invalid legacy user id.');
  }
  let found = false;
  await updateUsers((users) => {
    const next = users.map((user) => {
      if (user.id !== parsedId) return user;
      found = true;
      return { ...user, unlockedSecrets };
    });
    return next;
  });
  if (!found) {
    throw new Error('User not found.');
  }
}

async function setUnlockedIds(userId, unlockedSecrets) {
  if (isUUID(userId)) {
    await setProfileUnlockedIds(userId, unlockedSecrets);
    return;
  }
  await setLegacyUnlockedIds(userId, unlockedSecrets);
}

function mergeUnlockedSecrets(list = [], secretId, mode = 'grant') {
  const set = new Set(Array.isArray(list) ? list : []);
  if (mode === 'grant') set.add(secretId);
  if (mode === 'revoke') set.delete(secretId);
  return Array.from(set);
}

async function readAdminUsers() {
  const { data: profiles, error } = await db().from('profiles').select('*').order('created_at');
  throwIfError(error, 'secrets list users');
  const supabaseUsers = (profiles || []).map(profileToUser);
  const localUsers = await readUsers();
  const supabaseEmails = new Set(supabaseUsers.map((user) => user.email));
  const jsonOnlyUsers = localUsers
    .filter((user) => !supabaseEmails.has(user.email))
    .map(sanitizeUser)
    .map((user) => ({
      ...user,
      unlockedSecrets: Array.isArray(user.unlockedSecrets) ? user.unlockedSecrets : [],
      provider: user.provider || 'local',
    }));
  return [...supabaseUsers, ...jsonOnlyUsers];
}

async function ensureSecretExists(secretId) {
  const secretIds = await readSecretIds();
  return secretIds.has(secretId);
}

router.get('/', authRequired, adminRequired, async (_req, res) => {
  try {
    const secrets = await readSecrets();
    return res.json({ secrets });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load secrets.' });
  }
});

router.get('/users', authRequired, adminRequired, async (_req, res) => {
  try {
    const users = await readAdminUsers();
    return res.json({
      users: users.map((user) => ({
        id: user.id,
        email: user.email || '',
        name: user.name || user.username || 'Unnamed',
        username: user.username || '',
        role: user.role || 'guest',
        provider: user.provider || 'supabase',
        unlockedSecrets: Array.isArray(user.unlockedSecrets) ? user.unlockedSecrets : [],
        createdAt: user.createdAt || null,
      })),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load users.' });
  }
});

router.get('/progress', authRequired, async (req, res) => {
  try {
    const secrets = await readSecrets();
    const isAdmin = req.user?.role === 'admin';
    const unlocked = await getUnlockedIds(req.user.id);
    const unlockedList = isAdmin ? secrets.map((secret) => secret.id) : unlocked;
    const details = isAdmin ? secrets : secrets.filter((secret) => unlocked.includes(secret.id));
    return res.json({ unlocked: unlockedList, details, user: req.user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load secrets.' });
  }
});

router.post('/', authRequired, adminRequired, async (req, res) => {
  const payload = normalizeSecret(req.body || {});
  const id = payload.id || buildSecretId(payload.title);
  if (!payload.title) {
    return res.status(400).json({ error: 'A title is required.' });
  }

  try {
    const secretIds = await readSecretIds();
    if (secretIds.has(id)) {
      return res.status(409).json({ error: 'A secret with that id already exists.' });
    }
    const { data, error } = await db()
      .from('secrets')
      .insert({
        id,
        title: payload.title,
        description: payload.description,
        keyword: payload.keyword,
      })
      .select()
      .single();
    throwIfError(error, 'secrets create');
    return res.status(201).json({ secret: normalizeSecret(data) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create secret.' });
  }
});

router.post('/unlock', authRequired, async (req, res) => {
  try {
    const secrets = await readSecrets();
    const phraseMap = buildPhraseMap(secrets);
    const { phrase = '' } = req.body || {};
    const normalized = normalizePhrase(phrase);

    if (!normalized) {
      return res.status(400).json({ error: 'A secret phrase is required.' });
    }

    const secretId = phraseMap[normalized];
    if (!secretId) {
      return res.status(404).json({ error: 'No secret matched that phrase.' });
    }

    const currentUnlocked = await getUnlockedIds(req.user.id);
    const newlyUnlocked = !currentUnlocked.includes(secretId);
    const nextUnlocked = mergeUnlockedSecrets(currentUnlocked, secretId, 'grant');

    await setUnlockedIds(req.user.id, nextUnlocked);

    const details = secrets.filter((secret) => nextUnlocked.includes(secret.id));
    return res.json({
      success: true,
      newlyUnlocked,
      unlocked: nextUnlocked,
      details,
      user: { ...req.user, unlockedSecrets: nextUnlocked },
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to unlock secret.' });
  }
});

async function updateSecret(req, res) {
  const { id } = req.params;
  const payload = normalizeSecret({ id, ...(req.body || {}) });
  const body = req.body || {};

  try {
    const { data: existing, error: fetchErr } = await db()
      .from('secrets')
      .select('*')
      .eq('id', id)
      .single();
    if (fetchErr?.code === 'PGRST116') {
      return res.status(404).json({ error: 'Secret not found.' });
    }
    throwIfError(fetchErr, 'secrets update fetch');

    const patchRow = {
      title: Object.prototype.hasOwnProperty.call(body, 'title') ? payload.title || existing.title : existing.title,
      description: Object.prototype.hasOwnProperty.call(body, 'description')
        ? payload.description
        : existing.description,
      keyword: Object.prototype.hasOwnProperty.call(body, 'keyword')
        ? payload.keyword
        : existing.keyword,
    };

    const { data, error } = await db()
      .from('secrets')
      .update(patchRow)
      .eq('id', id)
      .select()
      .single();
    throwIfError(error, 'secrets update');
    return res.json({ secret: normalizeSecret(data) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update secret.' });
  }
}

router.put('/:id', authRequired, adminRequired, updateSecret);
router.patch('/:id', authRequired, adminRequired, updateSecret);

router.post('/users/:id/grant', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params;
  const secretId = String(req.body?.secretId || '').trim();
  if (!secretId) {
    return res.status(400).json({ error: 'A secretId is required.' });
  }

  try {
    if (!(await ensureSecretExists(secretId))) {
      return res.status(404).json({ error: 'Secret not found.' });
    }
    const currentUnlocked = await getUnlockedIds(id);
    const nextUnlocked = mergeUnlockedSecrets(currentUnlocked, secretId, 'grant');
    await setUnlockedIds(id, nextUnlocked);
    return res.json({ success: true, unlockedSecrets: nextUnlocked });
  } catch (err) {
    console.error(err);
    const message = err.message === 'User not found.' ? err.message : 'Unable to grant secret.';
    const status = err.message === 'User not found.' ? 404 : 500;
    return res.status(status).json({ error: message });
  }
});

router.post('/users/:id/revoke', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params;
  const secretId = String(req.body?.secretId || '').trim();
  if (!secretId) {
    return res.status(400).json({ error: 'A secretId is required.' });
  }

  try {
    const currentUnlocked = await getUnlockedIds(id);
    const nextUnlocked = mergeUnlockedSecrets(currentUnlocked, secretId, 'revoke');
    await setUnlockedIds(id, nextUnlocked);
    return res.json({ success: true, unlockedSecrets: nextUnlocked });
  } catch (err) {
    console.error(err);
    const message = err.message === 'User not found.' ? err.message : 'Unable to revoke secret.';
    const status = err.message === 'User not found.' ? 404 : 500;
    return res.status(status).json({ error: message });
  }
});

router.delete('/:id', authRequired, adminRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const { data: existing, error: fetchErr } = await db()
      .from('secrets')
      .select('id')
      .eq('id', id)
      .single();
    if (fetchErr?.code === 'PGRST116' || !existing) {
      return res.status(404).json({ error: 'Secret not found.' });
    }
    throwIfError(fetchErr, 'secrets delete fetch');

    await Promise.all([
      clearSecretAssignmentsInMap(LOCATION_SECRET_FILE, id),
      clearSecretAssignmentsInMap(REGION_SECRET_FILE, id),
      clearSecretAssignmentsInContent(id),
      clearSecretAssignmentsInProfiles(id),
      clearSecretAssignmentsInLegacyUsers(id),
      db().from('npcs').update({ secret_id: null }).eq('secret_id', id).then(({ error }) => {
        throwIfError(error, 'secrets delete npc cleanup');
      }),
    ]);

    const { error } = await db().from('secrets').delete().eq('id', id);
    throwIfError(error, 'secrets delete');
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete secret.' });
  }
});

export default router;
