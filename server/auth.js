import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  COOKIE_NAME,
  comparePassword,
  generateToken,
  profileToUser,
  readUsers,
  sanitizeUser,
  verifyToken,
} from './utils.js';
import { db, throwIfError } from './db.js';

const router = Router();

// ─── Lazy Supabase anon client ────────────────────────────────────────────────
// Do NOT read process.env at module level — auth.js is imported before loadEnv().

let _supabaseAnon = null;

function getSupabaseAnon() {
  if (_supabaseAnon) return _supabaseAnon;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  _supabaseAnon = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  return _supabaseAnon;
}

function requireSupabase(res) {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!url || !anonKey || !serviceKey) {
    res.status(500).json({ error: 'Supabase Auth is not configured on the server.' });
    return false;
  }
  return true;
}

function getCookieOptions() {
  // isProd is true when NODE_ENV=production OR when deployed on Render (RENDER=true).
  // Both conditions mean we're cross-origin (Vercel frontend → Render API), so we
  // MUST use SameSite=None;Secure or browsers will block the cookie entirely.
  const isProd =
    process.env.NODE_ENV === 'production' ||
    process.env.RENDER === 'true' ||
    Boolean(process.env.ALLOWED_ORIGINS);
  const opts = {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? 'none' : 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  };
  if (process.env.COOKIE_DOMAIN) opts.domain = process.env.COOKIE_DOMAIN;
  return opts;
}

function getSiteUrl() {
  return (process.env.SITE_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '') || '/';
}

/** Supabase `redirect_to` after OAuth — must match a URL allowed in Supabase Auth → Redirect URLs. */
function getFrontendCallbackUrl() {
  if (process.env.FRONTEND_CALLBACK_URL) return process.env.FRONTEND_CALLBACK_URL;
  const site = getSiteUrl();
  return site && site !== '/' ? `${site}/auth/callback` : 'http://localhost:5173/p15/auth/callback';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normalizeDisplayName(user, fallbackEmail) {
  const meta = user?.user_metadata || {};
  return (
    meta.full_name || meta.name || meta.preferred_username ||
    meta.user_name || user?.email?.split('@')[0] ||
    fallbackEmail?.split('@')[0] || 'Adventurer'
  );
}

/**
 * Upsert a Supabase-authenticated user into the `profiles` table.
 * Returns a sanitized user object with the Supabase UUID as `id`.
 */
async function upsertSupabaseUser(supabaseUser) {
  const email = (supabaseUser?.email || '').toLowerCase();
  const supabaseId = supabaseUser?.id;
  const username = supabaseUser?.user_metadata?.username?.trim() || '';

  if (!supabaseId || !email) {
    throw new Error('Supabase user is missing required claims.');
  }

  const displayName = normalizeDisplayName(supabaseUser, email);
  const avatarUrl = supabaseUser?.user_metadata?.avatar_url || '';

  // Check if profile already exists
  const { data: existing, error: fetchErr } = await db()
    .from('profiles')
    .select('*')
    .eq('id', supabaseId)
    .maybeSingle();

  if (fetchErr && fetchErr.code !== 'PGRST116') {
    throw new Error(`Failed to fetch profile: ${fetchErr.message}`);
  }

  if (!existing) {
    // Create new profile — default role is 'pending'
    const { data: newProfile, error: insertErr } = await db()
      .from('profiles')
      .insert({
        id: supabaseId,
        email,
        name: displayName,
        username: username || email.split('@')[0],
        avatar_url: avatarUrl,
        role: 'pending',
        provider: 'supabase',
      })
      .select()
      .single();
    throwIfError(insertErr, 'upsert profile insert');
    return profileToUser(newProfile);
  }

  // Update mutable fields on existing profile
  const updates = {
    email,
    avatar_url: avatarUrl || existing.avatar_url || '',
  };
  if (!existing.name) updates.name = displayName;
  if (!existing.username && username) updates.username = username;

  const { data: updatedProfile, error: updateErr } = await db()
    .from('profiles')
    .update(updates)
    .eq('id', supabaseId)
    .select()
    .single();
  throwIfError(updateErr, 'upsert profile update');

  return profileToUser(updatedProfile);
}

// ─── Routes ───────────────────────────────────────────────────────────────────

// GET /api/auth/login — redirect to Supabase OAuth
router.get('/login', (req, res) => {
  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) return res.status(500).json({ error: 'Supabase is not configured.' });
  const provider = String(req.query.provider || process.env.OAUTH_PROVIDER || 'google');
  const redirectTo = getFrontendCallbackUrl();
  const params = new URLSearchParams({ provider, redirect_to: redirectTo });
  return res.redirect(`${supabaseUrl}/auth/v1/authorize?${params.toString()}`);
});

// POST /api/auth/session — called by frontend after Supabase resolves OAuth in browser
router.post('/session', async (req, res) => {
  if (!requireSupabase(res)) return;
  const { access_token } = req.body || {};
  if (!access_token) return res.status(400).json({ error: 'access_token is required.' });

  try {
    const supabaseAnon = getSupabaseAnon();
    const { data, error } = await supabaseAnon.auth.getUser(access_token);
    if (error || !data?.user) return res.status(401).json({ error: 'Invalid or expired token.' });

    const user = await upsertSupabaseUser(data.user);
    const token = generateToken(user);
    res.cookie(COOKIE_NAME, token, getCookieOptions());
    return res.json({ user });
  } catch (err) {
    console.error('POST /session error:', err);
    return res.status(500).json({ error: 'Unable to create session.' });
  }
});

// POST /api/auth/login/email — magic-link login via Supabase
router.post('/login/email', async (req, res) => {
  if (!requireSupabase(res)) return;
  const email = (req.body?.email || '').toLowerCase().trim();
  const desiredUsername = (req.body?.username || '').trim();
  if (!email) return res.status(400).json({ error: 'Email is required.' });

  const supabaseAnon = getSupabaseAnon();
  const { data, error } = await supabaseAnon.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: getFrontendCallbackUrl(),
      data: desiredUsername ? { username: desiredUsername } : undefined,
    },
  });

  if (error || !data) {
    console.error('Failed to send Supabase email login:', error);
    return res.status(500).json({ error: 'Unable to start email login.' });
  }
  return res.json({ message: 'Check your email for a sign-in link.' });
});

// POST /api/auth/login/password — local email+password login (admin / legacy accounts)
router.post('/login/password', async (req, res) => {
  const email = (req.body?.email || '').toLowerCase().trim();
  const password = req.body?.password || '';
  if (!email || !password) return res.status(400).json({ error: 'Email and password are required.' });

  const users = await readUsers();
  const user = users.find((u) => u.email === email);
  if (!user || !user.passwordHash) {
    return res.status(401).json({ error: 'Invalid email or password.' });
  }

  const valid = await comparePassword(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid email or password.' });

  const token = generateToken(user);
  res.cookie(COOKIE_NAME, token, getCookieOptions());
  return res.json({ user: sanitizeUser(user) });
});

// GET /api/auth/callback — legacy OAuth code exchange (server sets cookie + redirects).
// Canonical production flow: Supabase redirects to the **frontend** `SITE_URL/auth/callback`,
// then the SPA calls POST /api/auth/session with the access_token.
router.get('/callback', async (req, res) => {
  if (!requireSupabase(res)) return;
  const code = req.query.code;
  if (!code || typeof code !== 'string') return res.status(400).json({ error: 'Missing OAuth code.' });

  try {
    const supabase = db();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (error || !data?.session?.user) {
      console.error('Failed to exchange code for session:', error);
      return res.status(401).json({ error: 'Unable to complete OAuth login.' });
    }

    const user = await upsertSupabaseUser(data.session.user);
    const token = generateToken(user);
    res.cookie(COOKIE_NAME, token, getCookieOptions());
    return res.redirect(getSiteUrl());
  } catch (err) {
    console.error('callback error:', err);
    return res.status(500).json({ error: 'Unable to finalize login.' });
  }
});

// GET /api/auth/me — return current user from session cookie
router.get('/me', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const token = req.cookies?.[COOKIE_NAME] || bearer;
    if (!token) return res.status(401).json({ error: 'Missing token.' });

    const payload = verifyToken(token);
    const userId = String(payload.id);

    // Try Supabase profiles first
    const looksLikeUUID = /^[0-9a-f-]{36}$/.test(userId);
    if (looksLikeUUID) {
      const { data: profile, error } = await db()
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      if (!error && profile) return res.json({ user: profileToUser(profile) });
    }

    // Fallback to users.json (local admin)
    const users = await readUsers();
    const user = users.find((u) => u.id === Number(userId) || u.email === userId);
    if (!user) return res.status(401).json({ error: 'User not found.' });
    return res.json({ user: sanitizeUser(user) });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

// PUT /api/auth/me — update own profile
router.put('/me', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const token = req.cookies?.[COOKIE_NAME] || bearer;
    if (!token) return res.status(401).json({ error: 'Missing token.' });

    const payload = verifyToken(token);
    const userId = String(payload.id);
    const { username, profilePicture, profile } = req.body || {};

    const looksLikeUUID = /^[0-9a-f-]{36}$/.test(userId);
    if (looksLikeUUID) {
      const patchRow = {};
      if (username !== undefined) patchRow.username = String(username).trim();
      if (profilePicture !== undefined) patchRow.profile_picture = String(profilePicture).trim();
      if (profile && typeof profile === 'object') {
        if (profile.bio !== undefined) patchRow.bio = String(profile.bio).slice(0, 1000);
        if (profile.labelOne !== undefined) patchRow.label_one = String(profile.labelOne).slice(0, 120);
        if (profile.labelTwo !== undefined) patchRow.label_two = String(profile.labelTwo).slice(0, 120);
      }
      const { data, error } = await db()
        .from('profiles')
        .update(patchRow)
        .eq('id', userId)
        .select()
        .single();
      throwIfError(error, 'PUT /me update');
      return res.json({ user: profileToUser(data) });
    }

    // Legacy JSON path
    const { updateUsers } = await import('./utils.js');
    const { applyFriendState } = await import('./utils.js');
    let updatedUser = null;
    await updateUsers((users) => {
      const index = users.findIndex((u) => u.id === Number(userId));
      if (index === -1) throw new Error('User not found.');
      const current = applyFriendState(users[index]);
      const nextUser = { ...current };
      if (username !== undefined) nextUser.username = String(username).trim();
      if (profilePicture !== undefined) nextUser.profilePicture = String(profilePicture).trim();
      if (profile && typeof profile === 'object') {
        nextUser.profile = {
          bio: typeof profile.bio === 'string' ? profile.bio.slice(0, 1000) : current.profile?.bio || '',
          labelOne: typeof profile.labelOne === 'string' ? profile.labelOne.slice(0, 120) : current.profile?.labelOne || '',
          labelTwo: typeof profile.labelTwo === 'string' ? profile.labelTwo.slice(0, 120) : current.profile?.labelTwo || '',
          documents: Array.isArray(current.profile?.documents) ? current.profile.documents : [],
          viewFavorites: Array.isArray(current.profile?.viewFavorites) ? current.profile.viewFavorites : [],
        };
      }
      users[index] = nextUser;
      updatedUser = nextUser;
      return users;
    });
    const { sanitizeUser: su } = await import('./utils.js');
    return res.json({ user: su(updatedUser) });
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

// POST /api/auth/logout
router.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, getCookieOptions());
  return res.status(204).send();
});

export default router;
