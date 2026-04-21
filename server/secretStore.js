import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const DATA_DIR = path.join(__dirname, 'data');
const SECRET_SETTINGS_FILE = path.join(DATA_DIR, 'secret-settings.json');

function normalizeOwnerId(value) {
  if (value === null || value === undefined) return null;
  const next = String(value).trim();
  return next || null;
}

function normalizeSettingsEntry(entry = {}) {
  return {
    ownerId: normalizeOwnerId(entry.ownerId),
    allowPhraseUnlock: entry.allowPhraseUnlock !== false,
    createdAt: entry.createdAt || null,
    updatedAt: entry.updatedAt || null,
  };
}

export async function ensureSecretSettingsFile() {
  if (!existsSync(DATA_DIR)) {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
  if (!existsSync(SECRET_SETTINGS_FILE)) {
    await fs.writeFile(SECRET_SETTINGS_FILE, JSON.stringify({ secrets: {} }, null, 2));
  }
}

export async function readSecretSettingsMap() {
  await ensureSecretSettingsFile();
  try {
    const raw = await fs.readFile(SECRET_SETTINGS_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    const secrets = parsed?.secrets && typeof parsed.secrets === 'object' ? parsed.secrets : {};
    return Object.fromEntries(
      Object.entries(secrets).map(([secretId, entry]) => [String(secretId), normalizeSettingsEntry(entry)])
    );
  } catch {
    return {};
  }
}

export async function writeSecretSettingsMap(settings = {}) {
  await ensureSecretSettingsFile();
  const normalized = Object.fromEntries(
    Object.entries(settings || {}).map(([secretId, entry]) => [String(secretId), normalizeSettingsEntry(entry)])
  );
  await fs.writeFile(SECRET_SETTINGS_FILE, JSON.stringify({ secrets: normalized }, null, 2));
}

export function buildSecretSettingsPatch(current = {}, patch = {}) {
  const now = new Date().toISOString();
  return normalizeSettingsEntry({
    ...current,
    ...patch,
    createdAt: current.createdAt || now,
    updatedAt: now,
  });
}

export function getOwnedSecretIdsForUser(userId, settings = {}) {
  const normalizedUserId = normalizeOwnerId(userId);
  if (!normalizedUserId) return [];
  return Object.entries(settings || {})
    .filter(([, entry]) => normalizeOwnerId(entry?.ownerId) === normalizedUserId)
    .map(([secretId]) => secretId);
}

export function getSecretSettings(secretId, settings = {}) {
  return normalizeSettingsEntry(settings?.[String(secretId)] || {});
}

export function isSecretOwner(user, secretOrId, settings = {}) {
  const secretId =
    typeof secretOrId === 'string' || typeof secretOrId === 'number'
      ? String(secretOrId)
      : String(secretOrId?.id || '');
  if (!secretId) return false;
  const ownedSecretIds = Array.isArray(user?.ownedSecretIds) ? user.ownedSecretIds : [];
  if (ownedSecretIds.includes(secretId)) return true;
  const ownerId = getSecretSettings(secretId, settings).ownerId;
  return Boolean(ownerId && String(user?.id || '') === ownerId);
}

export function canManageSecret(user, secretOrId, settings = {}) {
  if (user?.role === 'admin') return true;
  return isSecretOwner(user, secretOrId, settings);
}
