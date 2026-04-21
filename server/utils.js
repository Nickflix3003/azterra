/**
 * utils.js — Auth middleware, JWT helpers, and legacy JSON fallback.
 *
 * Primary user store: Supabase `profiles` table (UUID-keyed).
 * Fallback: users.json — used for the local admin account and legacy accounts.
 *
 * Token payload: { id: string, role: string }
 *   - Supabase users: id is the Supabase UUID
 *   - Local accounts: id is a numeric string (legacy)
 */

import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from './db.js';
import { getOwnedSecretIdsForUser, readSecretSettingsMap } from './secretStore.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const USERS_FILE_PATH = path.join(__dirname, 'users.json');
const BACKUP_DIR = path.join(__dirname, 'backups');
const JWT_SECRET = process.env.JWT_SECRET || 'azterra_dev_secret_change_me';
const COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'token';
const DEFAULT_ADMIN_EMAIL = process.env.DEFAULT_ADMIN_EMAIL || 'admin@azterra.com';
const DEFAULT_ADMIN_PASSWORD = process.env.DEFAULT_ADMIN_PASSWORD || 'admin12345';
const DEFAULT_ADMIN_NAME = process.env.DEFAULT_ADMIN_NAME || 'Azterra Admin';
export const ALLOWED_ROLES = ['pending', 'player', 'editor', 'admin'];

// ── JWT helpers ───────────────────────────────────────────────────────────────

export function generateToken(user) {
  return jwt.sign({ id: String(user.id), role: user.role }, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token) {
  return jwt.verify(token, JWT_SECRET);
}

export function verifySupabaseToken(token) {
  const secret = process.env.SUPABASE_JWT_SECRET || '';
  if (!secret) throw new Error('Supabase JWT secret is not configured.');
  return jwt.verify(token, secret);
}

// ── Profile row -> safe user object ──────────────────────────────────────────

export function profileToUser(profile) {
  return {
    id: profile.id,
    email: profile.email,
    name: profile.name || '',
    username: profile.username || '',
    role: profile.role || 'guest',
    avatarUrl: profile.avatar_url || '',
    profilePicture: profile.profile_picture || '',
    bio: profile.bio || '',
    labelOne: profile.label_one || '',
    labelTwo: profile.label_two || '',
    unlockedSecrets: Array.isArray(profile.unlocked_secrets) ? profile.unlocked_secrets : [],
    favorites: Array.isArray(profile.favorites) ? profile.favorites : [],
    featuredCharacter: profile.featured_character || null,
    provider: profile.provider || 'supabase',
    createdAt: profile.created_at,
    friends: [],
    friendRequests: { incoming: [], outgoing: [] },
    profile: {
      bio: profile.bio || '',
      labelOne: profile.label_one || '',
      labelTwo: profile.label_two || '',
      documents: [],
      viewFavorites: [],
    },
    ownedSecretIds: [],
  };
}

// ── Legacy JSON helpers (local admin + fallback) ──────────────────────────────

async function ensureUsersFile() {
  if (!existsSync(USERS_FILE_PATH)) {
    await fs.writeFile(USERS_FILE_PATH, JSON.stringify([], null, 2));
  }
}

async function createBackup() {
  if (!existsSync(USERS_FILE_PATH)) return;
  if (!existsSync(BACKUP_DIR)) await fs.mkdir(BACKUP_DIR, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = path.join(BACKUP_DIR, 'users-' + timestamp + '.json');
  const data = await fs.readFile(USERS_FILE_PATH, 'utf-8');
  await fs.writeFile(backupPath, data, 'utf-8');
  const backups = await fs.readdir(BACKUP_DIR);
  if (backups.length > 10) {
    const sorted = backups
      .filter(function(f) { return f.startsWith('users-'); })
      .sort(function(a, b) { return a > b ? 1 : -1; });
    const stale = sorted.slice(0, Math.max(0, sorted.length - 10));
    await Promise.all(stale.map(function(f) { return fs.rm(path.join(BACKUP_DIR, f)); }));
  }
}

export async function readUsers() {
  await ensureUsersFile();
  const raw = await fs.readFile(USERS_FILE_PATH, 'utf-8');
  try { return JSON.parse(raw) || []; } catch (e) { return []; }
}

export async function writeUsers(users) {
  await ensureUsersFile();
  await createBackup();
  await fs.writeFile(USERS_FILE_PATH, JSON.stringify(users, null, 2));
}

export async function updateUsers(updater) {
  const users = await readUsers();
  const updated = await updater(users);
  await writeUsers(updated);
  return updated;
}

function normalizeList(list) {
  return Array.from(new Set(
    (Array.isArray(list) ? list : [])
      .map(function(v) { return Number(v); })
      .filter(function(v) { return Number.isFinite(v) && v >= 0; })
  ));
}

function applyFriendState(user) {
  return Object.assign({}, user, {
    friends: normalizeList(user && user.friends),
    friendRequests: {
      incoming: normalizeList(user && user.friendRequests && user.friendRequests.incoming),
      outgoing: normalizeList(user && user.friendRequests && user.friendRequests.outgoing),
    },
  });
}
export { applyFriendState };

export function sanitizeUser(user) {
  if (!user) return null;
  const u = applyFriendState(user);
  delete u.passwordHash;
  return u;
}

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password, hash) {
  return bcrypt.compare(password, hash);
}

function getNextUserId(users) {
  if (!users.length) return 1;
  return users.reduce(function(max, u) { return Math.max(max, u.id || 0); }, 0) + 1;
}

export async function addUser(userData) {
  const users = await readUsers();
  const nextId = getNextUserId(users);
  const newUser = applyFriendState(Object.assign({ id: nextId }, userData));
  await writeUsers([...users, newUser]);
  return newUser;
}

// ── Ensure default admin ──────────────────────────────────────────────────────

export async function ensureDefaultAdmin() {
  const users = await readUsers();
  const hasAdmin = users.some(function(u) { return u.role === 'admin'; });
  if (hasAdmin) return;

  const passwordHash = await hashPassword(DEFAULT_ADMIN_PASSWORD);
  const adminUser = applyFriendState({
    id: 1,
    email: DEFAULT_ADMIN_EMAIL.toLowerCase(),
    passwordHash: passwordHash,
    name: DEFAULT_ADMIN_NAME,
    username: 'admin',
    favorites: [],
    featuredCharacter: null,
    profilePicture: '',
    profile: { bio: '', labelOne: '', labelTwo: '', documents: [], viewFavorites: [] },
    unlockedSecrets: [],
    role: 'admin',
    createdAt: new Date().toISOString(),
  });
  await writeUsers([adminUser, ...users]);
}

export { COOKIE_NAME };

// ── Token extraction ──────────────────────────────────────────────────────────

function extractToken(req) {
  if (req && req.cookies && req.cookies[COOKIE_NAME]) return req.cookies[COOKIE_NAME];
  const header = (req && req.headers && req.headers.authorization) || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
}

export async function resolveRequestUser(req) {
  const token = extractToken(req);
  if (!token) return null;

  try {
    const payload = verifyToken(token);
    const userId = String(payload.id);
    const secretSettings = await readSecretSettingsMap();

    const looksLikeUUID = /^[0-9a-f-]{36}$/.test(userId);
    if (looksLikeUUID) {
      try {
        const result = await db().from('profiles').select('*').eq('id', userId).single();
        if (!result.error && result.data) {
          return {
            ...profileToUser(result.data),
            ownedSecretIds: getOwnedSecretIdsForUser(userId, secretSettings),
          };
        }
      } catch (e) {
        // fall through to JSON lookup
      }
    }

    const users = await readUsers();
    const numericId = Number(userId);
    const currentUser = users.find(function(u) {
      return Number.isFinite(numericId) ? u.id === numericId : u.email === userId;
    });
    if (!currentUser) return null;

    const friendState = applyFriendState(currentUser);
    return Object.assign({}, sanitizeUser(currentUser), {
      favorites: Array.isArray(currentUser.favorites) ? currentUser.favorites : [],
      featuredCharacter: currentUser.featuredCharacter != null ? currentUser.featuredCharacter : null,
      profile: {
        bio: (currentUser.profile && currentUser.profile.bio) || '',
        labelOne: (currentUser.profile && currentUser.profile.labelOne) || '',
        labelTwo: (currentUser.profile && currentUser.profile.labelTwo) || '',
        documents: Array.isArray(currentUser.profile && currentUser.profile.documents) ? currentUser.profile.documents : [],
        viewFavorites: Array.isArray(currentUser.profile && currentUser.profile.viewFavorites) ? currentUser.profile.viewFavorites : [],
      },
      unlockedSecrets: Array.isArray(currentUser.unlockedSecrets) ? currentUser.unlockedSecrets : [],
      ownedSecretIds: getOwnedSecretIdsForUser(userId, secretSettings),
      friends: friendState.friends,
      friendRequests: friendState.friendRequests,
    });
  } catch (e) {
    return null;
  }
}

// ── Auth middleware ───────────────────────────────────────────────────────────

export const authRequired = async function(req, res, next) {
  try {
    const user = await resolveRequestUser(req);
    if (!user) return res.status(401).json({ error: 'Authentication required.' });
    req.user = user;
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
};

export const adminRequired = function(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin privileges required.' });
  }
  return next();
};

export const editorRequired = function(req, res, next) {
  const role = req.user && req.user.role;
  if (!role || !['player', 'editor', 'admin'].includes(role)) {
    return res.status(403).json({ error: 'Player, editor, or admin access required.' });
  }
  return next();
};

// ── Uploads directory ─────────────────────────────────────────────────────────

const UPLOADS_DIR = path.join(__dirname, 'uploads');

export async function getUploadsDir() {
  if (!existsSync(UPLOADS_DIR)) {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }
  return UPLOADS_DIR;
}

// ── Character visibility (which character IDs are visible to players) ─────────

const CHARACTER_VISIBILITY_FILE = path.join(__dirname, 'data', 'character-visibility.json');

export async function readCharacterVisibility() {
  try {
    if (!existsSync(CHARACTER_VISIBILITY_FILE)) return [];
    const raw = await fs.readFile(CHARACTER_VISIBILITY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export async function writeCharacterVisibility(visibleIds) {
  const dir = path.dirname(CHARACTER_VISIBILITY_FILE);
  if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(CHARACTER_VISIBILITY_FILE, JSON.stringify(visibleIds, null, 2));
}

// ── Location visibility ───────────────────────────────────────────────────────

const LOCATION_VISIBILITY_FILE = path.join(__dirname, 'data', 'location-truesight.json');

export async function readLocationVisibility() {
  try {
    if (!existsSync(LOCATION_VISIBILITY_FILE)) return [];
    const raw = await fs.readFile(LOCATION_VISIBILITY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export async function writeLocationVisibility(visibleIds) {
  const dir = path.dirname(LOCATION_VISIBILITY_FILE);
  if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(LOCATION_VISIBILITY_FILE, JSON.stringify(visibleIds, null, 2));
}

// ── NPC visibility ────────────────────────────────────────────────────────────

const NPC_VISIBILITY_FILE = path.join(__dirname, 'data', 'npc-truesight.json');

export async function readNpcVisibility() {
  try {
    if (!existsSync(NPC_VISIBILITY_FILE)) return [];
    const raw = await fs.readFile(NPC_VISIBILITY_FILE, 'utf-8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export async function writeNpcVisibility(visibleIds) {
  const dir = path.dirname(NPC_VISIBILITY_FILE);
  if (!existsSync(dir)) await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(NPC_VISIBILITY_FILE, JSON.stringify(visibleIds, null, 2));
}
