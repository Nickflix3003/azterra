import { Router } from 'express';
import { createClient } from '@supabase/supabase-js';
import {
  addUser,
  applyFriendState,
  COOKIE_NAME,
  generateToken,
  readUsers,
  sanitizeUser,
  updateUsers,
  verifyToken,
} from './utils.js';
import { AuthRedirectError, resolveFrontendCallbackUrl } from './authRedirect.js';

const router = Router();

const SUPABASE_URL = process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE || '';
const SITE_URL =
  (process.env.SITE_URL || process.env.FRONTEND_URL || '').replace(/\/$/, '') || '/';
const OAUTH_PROVIDER = process.env.OAUTH_PROVIDER || 'github';
const isProd = process.env.NODE_ENV === 'production';

const cookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: isProd ? 'none' : 'lax',
  maxAge: 30 * 24 * 60 * 60 * 1000,
  path: '/',
};

if (process.env.COOKIE_DOMAIN) {
  cookieOptions.domain = process.env.COOKIE_DOMAIN;
}

const supabaseAnon =
  SUPABASE_URL && SUPABASE_ANON_KEY
    ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

const supabaseService =
  SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
    ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
        auth: { autoRefreshToken: false, persistSession: false },
      })
    : null;

function requireSupabase(res) {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    res.status(500).json({ error: 'Supabase Auth is not configured on the server.' });
    return false;
  }
  return true;
}

function normalizeDisplayName(user, fallbackEmail) {
  const meta = user?.user_metadata || {};
  return (
    meta.full_name ||
    meta.name ||
    meta.preferred_username ||
    meta.user_name ||
    user?.email?.split('@')[0] ||
    fallbackEmail?.split('@')[0] ||
    'Adventurer'
  );
}

function normalizeUsername(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function readRedirectOverride(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function getFrontendCallbackUrl(requestRedirectTo) {
  return resolveFrontendCallbackUrl({ requestRedirectTo }).url;
}

function handleInvalidRedirect(res, err, context) {
  if (err instanceof AuthRedirectError) {
    console.error(`[auth] rejected callback URL during ${context}:`, err.details?.value || '(missing)', err.message);
    return res.status(400).json({ error: err.message });
  }

  console.error(`[auth] callback resolution failed during ${context}:`, err);
  return res.status(500).json({ error: 'Unable to resolve auth redirect URL.' });
}

async function upsertSupabaseUser(supabaseUser) {
  const email = (supabaseUser?.email || '').toLowerCase();
  const supabaseId = supabaseUser?.id;
  const incomingUsername = normalizeUsername(supabaseUser?.user_metadata?.username);

  if (!supabaseId || !email) {
    throw new Error('Supabase user is missing required claims.');
  }

  const displayName = normalizeDisplayName(supabaseUser, email);
  const users = await readUsers();
  let existing = users.find((entry) => entry.supabaseId === supabaseId || entry.email === email);

  if (!existing) {
    existing = await addUser({
      email,
      name: displayName,
      username: incomingUsername,
      favorites: [],
      featuredCharacter: null,
      profilePicture: '',
      profile: { bio: '', labelOne: '', labelTwo: '', documents: [], viewFavorites: [] },
      unlockedSecrets: [],
      role: 'pending',
      provider: 'supabase',
      supabaseId,
      createdAt: new Date().toISOString(),
    });
  } else {
    await updateUsers((list) => {
      const index = list.findIndex((entry) => entry.id === existing.id);
      if (index === -1) {
        return list;
      }
      const current = applyFriendState(list[index]);
      const nextUser = { ...current };
      nextUser.supabaseId = supabaseId;
      nextUser.email = email;
      if (!nextUser.name) {
        nextUser.name = displayName;
      }
      if (!nextUser.username && incomingUsername) {
        nextUser.username = incomingUsername;
      }
      list[index] = nextUser;
      existing = nextUser;
      return list;
    });
  }

  return sanitizeUser(existing);
}

router.get('/login', async (req, res) => {
  if (!requireSupabase(res)) return;
  const provider = String(req.query.provider || OAUTH_PROVIDER || 'github');
  let redirectTo;
  try {
    redirectTo = getFrontendCallbackUrl(readRedirectOverride(req.query.redirect_to));
  } catch (err) {
    return handleInvalidRedirect(res, err, 'GET /api/auth/login');
  }
  const { data, error } = await supabaseAnon.auth.signInWithOAuth({
    provider,
    options: { redirectTo },
  });

  if (error || !data?.url) {
    console.error('Failed to start Supabase OAuth:', error);
    return res.status(500).json({ error: 'Unable to start Supabase login.' });
  }

  return res.redirect(data.url);
});

router.post('/login/email', async (req, res) => {
  if (!requireSupabase(res)) return;
  const email = normalizeUsername(req.body?.email).toLowerCase();
  const desiredUsername = normalizeUsername(req.body?.username);
  if (!email) {
    return res.status(400).json({ error: 'Email is required.' });
  }
  let redirectTo;
  try {
    redirectTo = getFrontendCallbackUrl(readRedirectOverride(req.body?.redirectTo));
  } catch (err) {
    return handleInvalidRedirect(res, err, 'POST /api/auth/login/email');
  }

  const { data, error } = await supabaseAnon.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: redirectTo,
      data: desiredUsername ? { username: desiredUsername } : undefined,
    },
  });

  if (error || !data) {
    console.error('Failed to send Supabase email login:', error);
    return res.status(500).json({ error: 'Unable to start email login.' });
  }

  return res.json({ message: 'Check your email for a sign-in link.' });
});

router.get('/callback', async (req, res) => {
  if (!requireSupabase(res)) return;
  const code = req.query.code;

  if (!code || typeof code !== 'string') {
    return res.status(400).json({ error: 'Missing OAuth code.' });
  }

  const { data, error } = await supabaseService.auth.exchangeCodeForSession(code);
  if (error || !data?.session?.user) {
    console.error('Failed to exchange code for session:', error);
    return res.status(401).json({ error: 'Unable to complete OAuth login.' });
  }

  try {
    const user = await upsertSupabaseUser(data.session.user);
    const token = generateToken(user);
    res.cookie(COOKIE_NAME, token, cookieOptions);
    return res.redirect(SITE_URL);
  } catch (err) {
    console.error('Failed to upsert Supabase user:', err);
    return res.status(500).json({ error: 'Unable to finalize login.' });
  }
});

router.get('/me', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const token = req.cookies?.[COOKIE_NAME] || bearer;
    if (!token) {
      return res.status(401).json({ error: 'Missing token.' });
    }
    const payload = verifyToken(token);
    const users = await readUsers();
    const user = users.find((entry) => entry.id === payload.id);
    if (!user) {
      return res.status(401).json({ error: 'User not found.' });
    }
    return res.json({ user: sanitizeUser(user) });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

router.put('/me', async (req, res) => {
  try {
    const header = req.headers.authorization || '';
    const bearer = header.startsWith('Bearer ') ? header.slice(7) : '';
    const token = req.cookies?.[COOKIE_NAME] || bearer;
    if (!token) {
      return res.status(401).json({ error: 'Missing token.' });
    }
    const payload = verifyToken(token);
    const { username, profilePicture, profile } = req.body || {};

    let updatedUser = null;
    await updateUsers((users) => {
      const index = users.findIndex((entry) => entry.id === payload.id);
      if (index === -1) {
        throw new Error('User not found.');
      }
      const current = applyFriendState(users[index]);
      const nextUser = { ...current };
      if (username !== undefined) {
        nextUser.username = typeof username === 'string' ? username.trim() : current.username;
      }
      if (profilePicture !== undefined) {
        nextUser.profilePicture =
          typeof profilePicture === 'string' ? profilePicture.trim() : current.profilePicture;
      }
      if (profile && typeof profile === 'object') {
        nextUser.profile = {
          bio: typeof profile.bio === 'string' ? profile.bio.slice(0, 1000) : current.profile?.bio || '',
          labelOne:
            typeof profile.labelOne === 'string' ? profile.labelOne.slice(0, 120) : current.profile?.labelOne || '',
          labelTwo:
            typeof profile.labelTwo === 'string' ? profile.labelTwo.slice(0, 120) : current.profile?.labelTwo || '',
          documents: Array.isArray(current.profile?.documents) ? current.profile.documents : [],
          viewFavorites: Array.isArray(current.profile?.viewFavorites) ? current.profile.viewFavorites : [],
        };
      } else {
        nextUser.profile = {
          bio: current.profile?.bio || '',
          labelOne: current.profile?.labelOne || '',
          labelTwo: current.profile?.labelTwo || '',
          documents: Array.isArray(current.profile?.documents) ? current.profile.documents : [],
          viewFavorites: Array.isArray(current.profile?.viewFavorites) ? current.profile.viewFavorites : [],
        };
      }
      if (!Array.isArray(nextUser.unlockedSecrets)) {
        nextUser.unlockedSecrets = Array.isArray(current.unlockedSecrets) ? current.unlockedSecrets : [];
      }
      users[index] = nextUser;
      updatedUser = nextUser;
      return users;
    });

    return res.json({ user: sanitizeUser(updatedUser) });
  } catch (error) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
});

router.post('/logout', (_req, res) => {
  res.clearCookie(COOKIE_NAME, cookieOptions);
  return res.status(204).send();
});

export default router;
