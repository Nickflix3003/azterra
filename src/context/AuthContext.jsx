/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useEffect, useMemo, useState, useCallback } from 'react';
import { canView as baseCanView } from '../utils/permissions';
import { getSupabaseRedirectUrl, supabase } from '../lib/supabaseClient';
import { fetchWithRetry } from '../utils/fetchWithRetry';
import { API_BASE_URL } from '../utils/apiBase';
import { clearWarmupPending, markWarmupPending } from '../utils/serverStatus';

const AuthContext = createContext({
  user: null,
  role: 'guest',
  token: null,
  loading: false,
  login: async () => { },
  loginWithGoogle: async () => { },
  loginWithEmail: async () => { },
  loginWithPassword: async () => { },
  signupWithGoogle: async () => { },
  signupWithEmail: async () => { },
  setPendingUsername: () => { },
  loginGuest: () => { },
  updateAccount: async () => { },
  googleLogin: async () => { },
  signup: async () => { },
  logout: () => { },
  refreshUser: async () => { },
  isSecretUnlocked: () => false,
  canView: () => false,
});

const PENDING_USERNAME_KEY = 'azterra:pending-username';

const GUEST_USER = {
  id: 'guest',
  username: 'Guest',
  role: 'guest',
  unlockedSecrets: [],
  ownedSecretIds: [],
  favorites: [],
  friends: [],
  friendRequests: { incoming: [], outgoing: [] },
  profile: { bio: '', labelOne: '', labelTwo: '', documents: [], viewFavorites: [] }
};

function rememberPendingUsername(username) {
  if (typeof window === 'undefined') return;
  if (username && username.trim()) {
    window.sessionStorage.setItem(PENDING_USERNAME_KEY, username.trim());
  } else {
    window.sessionStorage.removeItem(PENDING_USERNAME_KEY);
  }
}

function readPendingUsername() {
  if (typeof window === 'undefined') return '';
  return window.sessionStorage.getItem(PENDING_USERNAME_KEY) || '';
}

const normalizeUser = (incoming) => {
  if (!incoming) return null;
  const unlocked = Array.isArray(incoming.unlockedSecrets) ? incoming.unlockedSecrets : [];
  const ownedSecretIds = Array.isArray(incoming.ownedSecretIds) ? incoming.ownedSecretIds : [];
  const favorites = Array.isArray(incoming.favorites) ? incoming.favorites : [];
  const featuredCharacter = incoming.featuredCharacter ?? null;
  const friends = Array.isArray(incoming.friends) ? incoming.friends : [];
  const friendRequests = {
    incoming: Array.isArray(incoming.friendRequests?.incoming) ? incoming.friendRequests.incoming : [],
    outgoing: Array.isArray(incoming.friendRequests?.outgoing) ? incoming.friendRequests.outgoing : [],
  };
  const profile = {
    bio: incoming.profile?.bio || '',
    labelOne: incoming.profile?.labelOne || '',
    labelTwo: incoming.profile?.labelTwo || '',
    documents: Array.isArray(incoming.profile?.documents) ? incoming.profile.documents : [],
    viewFavorites: Array.isArray(incoming.profile?.viewFavorites) ? incoming.profile.viewFavorites : [],
  };
  return {
    ...incoming,
    unlockedSecrets: unlocked,
    ownedSecretIds,
    favorites,
    featuredCharacter,
    profile,
    friends,
    friendRequests,
  };
};

async function request({ path, method = 'GET', body, headers = {} }) {
  const init = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
    credentials: 'include',
  };
  if (body !== undefined) {
    init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  const response = await fetchWithRetry(`${API_BASE_URL}${path}`, init);
  const contentType = response.headers.get('content-type') || '';
  const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
  if (!response.ok) {
    throw new Error(data.error || 'Request failed.');
  }
  return data;
}

async function ensureBackendReady() {
  let pendingTimer = null;
  let pendingMarked = false;
  let outcome = 'success';
  let failureMessage = '';

  try {
    if (typeof window !== 'undefined') {
      pendingTimer = window.setTimeout(() => {
        markWarmupPending();
        pendingMarked = true;
      }, 700);
    }

    const response = await fetchWithRetry(`${API_BASE_URL}/health`, {
      credentials: 'include',
      cache: 'no-store',
    });
    const contentType = response.headers.get('content-type') || '';
    const data = contentType.includes('application/json') ? await response.json().catch(() => ({})) : {};
    if (!response.ok) {
      outcome = 'failed';
      failureMessage = data.error || 'The world server is still unavailable. Please try again in a moment.';
      throw new Error(failureMessage);
    }
    return data;
  } catch (error) {
    outcome = 'failed';
    failureMessage = error?.message || 'The world server is still unavailable. Please try again in a moment.';
    throw error;
  } finally {
    if (pendingTimer) {
      window.clearTimeout(pendingTimer);
    }
    if (pendingMarked) {
      clearWarmupPending({ outcome, message: failureMessage });
    }
  }
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const normalizedUser = normalizeUser(user);
  const role = normalizedUser?.role || 'guest';

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    request({ path: '/auth/me' })
      .then((data) => {
        if (isMounted) {
          setUser(normalizeUser(data.user));
          setToken('session-cookie');
        }
      })
      .catch(() => {
        if (isMounted) {
          setUser(null);
          setToken(null);
        }
      })
      .finally(() => {
        if (isMounted) {
          setLoading(false);
        }
      });
    return () => {
      isMounted = false;
    };
  }, []);

  const startOAuth = useCallback(async ({ provider } = {}) => {
    setError(null);
    await ensureBackendReady();
    const params = new URLSearchParams();
    if (provider) params.set('provider', provider);
    const redirectTo = getSupabaseRedirectUrl();
    if (redirectTo) params.set('redirect_to', redirectTo);
    const query = params.toString();
    window.location.href = `${API_BASE_URL}/auth/login${query ? `?${query}` : ''}`;
  }, []);

  const updateAccount = useCallback(async ({ username, profilePicture, profile }) => {
    setError(null);
    try {
      const data = await request({
        path: '/auth/me',
        method: 'PUT',
        body: { username, profilePicture, profile },
      });
      setUser(normalizeUser(data.user));
      return data.user;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, []);

  const loginWithEmail = useCallback(
    async ({ email, username }) => {
      const trimmedEmail = (email || '').trim();
      if (!trimmedEmail) {
        throw new Error('Email is required.');
      }
      setError(null);
      await ensureBackendReady();
      return request({
        path: '/auth/login/email',
        method: 'POST',
        body: {
          email: trimmedEmail,
          username: username?.trim(),
          redirectTo: getSupabaseRedirectUrl(),
        },
      });
    },
    []
  );

  const loginWithPassword = useCallback(async ({ email, password }) => {
    setError(null);
    const data = await request({
      path: '/auth/login/password',
      method: 'POST',
      body: { email, password },
    });
    setUser(normalizeUser(data.user));
    setToken('session-cookie');
    return data.user;
  }, []);

  const loginWithGoogle = useCallback(() => startOAuth({ provider: 'google' }), [startOAuth]);
  const signupWithGoogle = loginWithGoogle;
  const signupWithEmail = loginWithEmail;

  const signup = async () => signupWithGoogle();
  const login = async () => loginWithGoogle();

  const logout = useCallback(async () => {
    try {
      await fetch(`${API_BASE_URL}/auth/logout`, { method: 'POST', credentials: 'include' });
    } catch {
      // ignore network errors on logout
    } finally {
      setUser(null);
      setToken(null);
    }
  }, []);

  const loginGuest = () => {
    supabase?.auth.signOut();
    setError(null);
    setToken(null);
    setUser(normalizeUser(GUEST_USER));
    setLoading(false);
  };

  const refreshUser = useCallback(async () => {
    const data = await request({ path: '/auth/me' });
    setUser(normalizeUser(data.user));
    setToken('session-cookie');
    return data.user;
  }, []);

  useEffect(() => {
    if (!normalizedUser || !normalizedUser.id) return;
    const pending = readPendingUsername();
    if (!pending) return;
    if (normalizedUser.username && normalizedUser.username.trim()) {
      if (normalizedUser.username.trim().toLowerCase() === pending.toLowerCase()) {
        rememberPendingUsername('');
      }
      return;
    }
    let cancelled = false;
    updateAccount({ username: pending })
      .then(() => {
        if (!cancelled) {
          rememberPendingUsername('');
        }
      })
      .catch((err) => {
        console.error('Failed to apply pending username', err);
      });
    return () => {
      cancelled = true;
    };
  }, [normalizedUser, updateAccount]);

  const value = useMemo(
    () => ({
      user: normalizedUser,
      role,
      token,
      loading,
      error,
      login,
      loginWithGoogle,
      loginWithEmail,
      loginWithPassword,
      signupWithGoogle,
      signupWithEmail,
      setPendingUsername: rememberPendingUsername,
      updateAccount,
      googleLogin: startOAuth,
      signup,
      logout,
      loginGuest,
      refreshUser,
      isSecretUnlocked: (secretId) =>
        Array.isArray(normalizedUser?.unlockedSecrets) && normalizedUser.unlockedSecrets.includes(secretId),
      canView: (config) => baseCanView(normalizedUser, config),
    }),
    [
      normalizedUser,
      role,
      token,
      loading,
      error,
      startOAuth,
      logout,
      loginGuest,
      updateAccount,
      loginWithEmail,
      loginWithPassword,
      loginWithGoogle,
      signupWithGoogle,
      signupWithEmail,
      refreshUser,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  return useContext(AuthContext);
}
