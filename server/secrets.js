import { Router } from 'express';
import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  authRequired,
  editorRequired,
  profileToUser,
  readUsers,
  sanitizeUser,
  updateUsers,
} from './utils.js';
import { db, throwIfError } from './db.js';
import {
  buildSecretSettingsPatch,
  canManageSecret,
  getOwnedSecretIdsForUser,
  getSecretSettings,
  readSecretSettingsMap,
  writeSecretSettingsMap,
} from './secretStore.js';

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

function normalizeOwnerId(value) {
  if (value === null || value === undefined) return null;
  const next = String(value).trim();
  return next || null;
}

function normalizeSecret(secret = {}) {
  return {
    id: String(secret.id || '').trim(),
    title: typeof secret.title === 'string' ? secret.title.trim() : '',
    description: typeof secret.description === 'string' ? secret.description.trim() : '',
    keyword: typeof secret.keyword === 'string' ? secret.keyword.trim() : '',
  };
}

function buildSecretId(title = '') {
  const base = String(title)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return base || `secret-${Date.now()}`;
}

function normalizeBoolean(value, fallback = true) {
  if (value === undefined) return fallback;
  return value !== false;
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

async function readLocationSecretMap() {
  const parsed = await readJsonFile(LOCATION_SECRET_FILE, { secrets: {} });
  return parsed?.secrets && typeof parsed.secrets === 'object' ? parsed.secrets : {};
}

async function readRegionSecretMap() {
  const parsed = await readJsonFile(REGION_SECRET_FILE, { secrets: {} });
  return parsed?.secrets && typeof parsed.secrets === 'object' ? parsed.secrets : {};
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
  await updateUsers((users) =>
    users.map((user) => {
      if (user.id !== parsedId) return user;
      found = true;
      return { ...user, unlockedSecrets };
    })
  );
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

async function readAllUsers() {
  const { data: profiles, error } = await db().from('profiles').select('*').order('created_at');
  throwIfError(error, 'secrets list users');
  const secretSettings = await readSecretSettingsMap();
  const supabaseUsers = (profiles || []).map((profile) => ({
    ...profileToUser(profile),
    ownedSecretIds: getOwnedSecretIdsForUser(profile.id, secretSettings),
  }));
  const localUsers = await readUsers();
  const supabaseEmails = new Set(supabaseUsers.map((user) => user.email));
  const jsonOnlyUsers = localUsers
    .filter((user) => !supabaseEmails.has(user.email))
    .map(sanitizeUser)
    .map((user) => ({
      ...user,
      unlockedSecrets: Array.isArray(user.unlockedSecrets) ? user.unlockedSecrets : [],
      provider: user.provider || 'local',
      ownedSecretIds: getOwnedSecretIdsForUser(user.id, secretSettings),
    }));
  return [...supabaseUsers, ...jsonOnlyUsers];
}

function buildUserSummary(user = {}, manageableSecretIds = null) {
  const unlockedSecrets = Array.isArray(user.unlockedSecrets) ? user.unlockedSecrets : [];
  return {
    id: user.id,
    email: user.email || '',
    name: user.name || user.username || 'Unnamed',
    username: user.username || '',
    role: user.role || 'guest',
    provider: user.provider || 'supabase',
    unlockedSecrets: manageableSecretIds
      ? unlockedSecrets.filter((secretId) => manageableSecretIds.has(secretId))
      : unlockedSecrets,
    ownedSecretIds: Array.isArray(user.ownedSecretIds) ? user.ownedSecretIds : [],
    createdAt: user.createdAt || null,
  };
}

async function ensureSecretExists(secretId) {
  const secretIds = await readSecretIds();
  return secretIds.has(secretId);
}

function canAccessSecret(user, secretId) {
  if (!secretId) return true;
  if (user?.role === 'admin') return true;
  const unlocked = Array.isArray(user?.unlockedSecrets) ? user.unlockedSecrets : [];
  const owned = Array.isArray(user?.ownedSecretIds) ? user.ownedSecretIds : [];
  return unlocked.includes(secretId) || owned.includes(secretId);
}

async function buildSecretLinks() {
  const [locationsSecretMap, regionSecretMap, contentData, npcResult, locationResult, regionResult] =
    await Promise.all([
      readLocationSecretMap(),
      readRegionSecretMap(),
      readJsonFile(CONTENT_FILE, { entries: [] }),
      db().from('npcs').select('id, name, type, location_id, region_id, secret_id').order('name'),
      db().from('locations').select('id, name, type, region_id').order('name'),
      db().from('regions').select('id, name, category').order('name'),
    ]);

  throwIfError(npcResult.error, 'secrets links npcs');
  throwIfError(locationResult.error, 'secrets links locations');
  throwIfError(regionResult.error, 'secrets links regions');

  const buckets = {};
  const ensureBucket = (secretId) => {
    if (!secretId) return null;
    if (!buckets[secretId]) {
      buckets[secretId] = { locations: [], regions: [], npcs: [], content: [] };
    }
    return buckets[secretId];
  };

  (locationResult.data || []).forEach((row) => {
    const secretId = locationsSecretMap?.[String(row.id)]?.secretId || null;
    const bucket = ensureBucket(secretId);
    if (!bucket) return;
    bucket.locations.push({
      id: row.id,
      name: row.name || 'Unnamed location',
      type: row.type || '',
      regionId: row.region_id || null,
    });
  });

  (regionResult.data || []).forEach((row) => {
    const secretId = regionSecretMap?.[String(row.id)]?.secretId || null;
    const bucket = ensureBucket(secretId);
    if (!bucket) return;
    bucket.regions.push({
      id: row.id,
      name: row.name || 'Unnamed region',
      category: row.category || '',
    });
  });

  (npcResult.data || []).forEach((row) => {
    const bucket = ensureBucket(row.secret_id || null);
    if (!bucket) return;
    bucket.npcs.push({
      id: row.id,
      name: row.name || 'Unnamed character',
      type: row.type || '',
      locationId: row.location_id || null,
      regionId: row.region_id || null,
    });
  });

  const entries = Array.isArray(contentData?.entries) ? contentData.entries : [];
  entries.forEach((entry) => {
    const bucket = ensureBucket(
      typeof entry?.secretId === 'string' && entry.secretId.trim() ? entry.secretId.trim() : null
    );
    if (!bucket) return;
    bucket.content.push({
      id: entry.id,
      title: entry.title || 'Untitled entry',
      type: entry.type || '',
      status: entry.status || 'draft',
    });
  });

  return buckets;
}

function buildSecretResponse(secret, settings, viewer, usersById, viewersBySecretId, linksBySecretId) {
  const secretId = secret.id;
  const canManage = canManageSecret(viewer, secretId, settings);
  const isUnlocked = Array.isArray(viewer?.unlockedSecrets)
    ? viewer.unlockedSecrets.includes(secretId)
    : false;
  const isOwned = Array.isArray(viewer?.ownedSecretIds)
    ? viewer.ownedSecretIds.includes(secretId)
    : false;
  const setting = getSecretSettings(secretId, settings);
  const owner = setting.ownerId ? usersById.get(String(setting.ownerId)) : null;
  const linkedItems = linksBySecretId?.[secretId] || {
    locations: [],
    regions: [],
    npcs: [],
    content: [],
  };
  const viewers = viewersBySecretId?.[secretId] || [];

  return {
    id: secretId,
    title: secret.title,
    description: secret.description,
    keyword: canManage ? secret.keyword : '',
    hasKeyword: Boolean(secret.keyword),
    allowPhraseUnlock: setting.allowPhraseUnlock,
    ownerId: setting.ownerId,
    ownerName: owner?.name || owner?.username || owner?.email || '',
    canManage,
    isOwned,
    isUnlocked,
    viewerCount: viewers.length,
    linkedCounts: {
      locations: linkedItems.locations.length,
      regions: linkedItems.regions.length,
      npcs: linkedItems.npcs.length,
      content: linkedItems.content.length,
    },
    linkedItems,
  };
}

async function buildSecretPayload(viewer) {
  const [secrets, settings, users, linksBySecretId] = await Promise.all([
    readSecrets(),
    readSecretSettingsMap(),
    readAllUsers(),
    buildSecretLinks(),
  ]);

  const usersById = new Map(users.map((user) => [String(user.id), user]));
  const viewersBySecretId = {};
  users.forEach((user) => {
    const unlocked = Array.isArray(user.unlockedSecrets) ? user.unlockedSecrets : [];
    unlocked.forEach((secretId) => {
      if (!viewersBySecretId[secretId]) viewersBySecretId[secretId] = [];
      viewersBySecretId[secretId].push({
        id: user.id,
        name: user.name || user.username || user.email || 'Unnamed',
        role: user.role || 'guest',
      });
    });
  });

  const visibleSecrets = secrets.filter((secret) => canAccessSecret(viewer, secret.id));
  const responseSecrets = visibleSecrets.map((secret) =>
    buildSecretResponse(secret, settings, viewer, usersById, viewersBySecretId, linksBySecretId)
  );

  return {
    secrets: responseSecrets,
    users,
    settings,
  };
}

router.get('/', authRequired, async (req, res) => {
  try {
    const payload = await buildSecretPayload(req.user);
    return res.json({ secrets: payload.secrets });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load secrets.' });
  }
});

router.get('/users', authRequired, async (req, res) => {
  try {
    const payload = await buildSecretPayload(req.user);
    const manageableSecretIds = new Set(
      payload.secrets.filter((secret) => secret.canManage).map((secret) => secret.id)
    );
    if (req.user?.role !== 'admin' && manageableSecretIds.size === 0) {
      return res.status(403).json({ error: 'You do not manage any secrets yet.' });
    }
    return res.json({
      users: payload.users.map((user) =>
        buildUserSummary(user, req.user?.role === 'admin' ? null : manageableSecretIds)
      ),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load users.' });
  }
});

router.get('/progress', authRequired, async (req, res) => {
  try {
    const payload = await buildSecretPayload(req.user);
    const visibleSecrets = payload.secrets;
    const unlocked = req.user?.role === 'admin'
      ? visibleSecrets.map((secret) => secret.id)
      : Array.from(
          new Set([
            ...(Array.isArray(req.user?.unlockedSecrets) ? req.user.unlockedSecrets : []),
            ...(Array.isArray(req.user?.ownedSecretIds) ? req.user.ownedSecretIds : []),
          ])
        );
    return res.json({ unlocked, details: visibleSecrets, user: req.user });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to load secrets.' });
  }
});

router.post('/', authRequired, editorRequired, async (req, res) => {
  const payload = normalizeSecret(req.body || {});
  const id = payload.id || buildSecretId(payload.title);
  if (!payload.title) {
    return res.status(400).json({ error: 'A title is required.' });
  }

  try {
    const ownerId = req.user?.role === 'admin'
      ? normalizeOwnerId(req.body?.ownerId) || normalizeOwnerId(req.user?.id)
      : normalizeOwnerId(req.user?.id);
    const allowPhraseUnlock = normalizeBoolean(
      req.body?.allowPhraseUnlock,
      Boolean(payload.keyword)
    );
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

    const settings = await readSecretSettingsMap();
    settings[id] = buildSecretSettingsPatch(settings[id], { ownerId, allowPhraseUnlock });
    await writeSecretSettingsMap(settings);

    const fullPayload = await buildSecretPayload({
      ...req.user,
      ownedSecretIds: Array.from(
        new Set([...(req.user?.ownedSecretIds || []), ...(ownerId === String(req.user?.id) ? [id] : [])])
      ),
    });
    const created = fullPayload.secrets.find((secret) => secret.id === id);
    return res.status(201).json({ secret: created || normalizeSecret(data) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to create secret.' });
  }
});

router.post('/unlock', authRequired, async (req, res) => {
  try {
    const settings = await readSecretSettingsMap();
    const secrets = await readSecrets();
    const { phrase = '' } = req.body || {};
    const normalized = normalizePhrase(phrase);

    if (!normalized) {
      return res.status(400).json({ error: 'A secret phrase is required.' });
    }

    const matched = secrets.find((secret) => {
      if (!secret.keyword) return false;
      if (normalizePhrase(secret.keyword) !== normalized) return false;
      return getSecretSettings(secret.id, settings).allowPhraseUnlock;
    });

    if (!matched) {
      return res.status(404).json({ error: 'No secret matched that phrase.' });
    }

    const secretId = matched.id;
    const currentUnlocked = await getUnlockedIds(req.user.id);
    const newlyUnlocked = !currentUnlocked.includes(secretId);
    const nextUnlocked = mergeUnlockedSecrets(currentUnlocked, secretId, 'grant');

    await setUnlockedIds(req.user.id, nextUnlocked);

    const refreshedUser = {
      ...req.user,
      unlockedSecrets: nextUnlocked,
    };
    const payload = await buildSecretPayload(refreshedUser);
    return res.json({
      success: true,
      newlyUnlocked,
      unlocked: nextUnlocked,
      details: payload.secrets,
      user: refreshedUser,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to unlock secret.' });
  }
});

async function updateSecret(req, res) {
  const { id } = req.params;
  const body = req.body || {};
  const payload = normalizeSecret({ id, ...(req.body || {}) });

  try {
    const settings = await readSecretSettingsMap();
    if (!canManageSecret(req.user, id, settings)) {
      return res.status(403).json({ error: 'Only the secret owner or admin can change this secret.' });
    }

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

    const nextSettings = { ...settings };
    nextSettings[id] = buildSecretSettingsPatch(nextSettings[id], {
      ownerId:
        req.user?.role === 'admin' && Object.prototype.hasOwnProperty.call(body, 'ownerId')
          ? normalizeOwnerId(body.ownerId)
          : nextSettings[id]?.ownerId || normalizeOwnerId(req.user?.id),
      allowPhraseUnlock: Object.prototype.hasOwnProperty.call(body, 'allowPhraseUnlock')
        ? normalizeBoolean(body.allowPhraseUnlock, true)
        : getSecretSettings(id, nextSettings).allowPhraseUnlock,
    });
    await writeSecretSettingsMap(nextSettings);

    const refreshed = await buildSecretPayload(req.user);
    const updated = refreshed.secrets.find((secret) => secret.id === id);
    return res.json({ secret: updated || normalizeSecret(data) });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to update secret.' });
  }
}

router.put('/:id', authRequired, updateSecret);
router.patch('/:id', authRequired, updateSecret);

router.post('/users/:id/grant', authRequired, async (req, res) => {
  const { id } = req.params;
  const secretId = String(req.body?.secretId || '').trim();
  if (!secretId) {
    return res.status(400).json({ error: 'A secretId is required.' });
  }

  try {
    const settings = await readSecretSettingsMap();
    if (!canManageSecret(req.user, secretId, settings)) {
      return res.status(403).json({ error: 'Only the secret owner or admin can grant this secret.' });
    }
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

router.post('/users/:id/revoke', authRequired, async (req, res) => {
  const { id } = req.params;
  const secretId = String(req.body?.secretId || '').trim();
  if (!secretId) {
    return res.status(400).json({ error: 'A secretId is required.' });
  }

  try {
    const settings = await readSecretSettingsMap();
    if (!canManageSecret(req.user, secretId, settings)) {
      return res.status(403).json({ error: 'Only the secret owner or admin can revoke this secret.' });
    }
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

router.delete('/:id', authRequired, async (req, res) => {
  const { id } = req.params;
  try {
    const settings = await readSecretSettingsMap();
    if (!canManageSecret(req.user, id, settings)) {
      return res.status(403).json({ error: 'Only the secret owner or admin can delete this secret.' });
    }
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

    const nextSettings = { ...settings };
    delete nextSettings[id];
    await writeSecretSettingsMap(nextSettings);

    const { error } = await db().from('secrets').delete().eq('id', id);
    throwIfError(error, 'secrets delete');
    return res.json({ success: true });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Unable to delete secret.' });
  }
});

export default router;
