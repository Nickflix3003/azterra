/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useAuth } from './AuthContext';

const SecretDataContext = createContext(null);
const API_BASE_URL = '/api';

function normalizeSecret(secret = {}) {
  return {
    id: typeof secret.id === 'string' ? secret.id.trim() : String(secret.id || '').trim(),
    title: typeof secret.title === 'string' ? secret.title.trim() : '',
    description: typeof secret.description === 'string' ? secret.description.trim() : '',
    keyword: typeof secret.keyword === 'string' ? secret.keyword.trim() : '',
  };
}

function normalizeSecretUser(user = {}) {
  return {
    id: user.id,
    email: typeof user.email === 'string' ? user.email : '',
    name: typeof user.name === 'string' ? user.name : '',
    username: typeof user.username === 'string' ? user.username : '',
    role: typeof user.role === 'string' ? user.role : 'guest',
    provider: typeof user.provider === 'string' ? user.provider : 'supabase',
    unlockedSecrets: Array.isArray(user.unlockedSecrets) ? user.unlockedSecrets : [],
    createdAt: user.createdAt || null,
  };
}

export function SecretDataProvider({ children }) {
  const { role, user } = useAuth();
  const isAdmin = role === 'admin';
  const [secrets, setSecrets] = useState([]);
  const [users, setUsers] = useState([]);
  const [loadingSecrets, setLoadingSecrets] = useState(false);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [error, setError] = useState('');

  const refreshSecrets = useCallback(async () => {
    if (!isAdmin || !user) {
      setSecrets([]);
      return [];
    }
    setLoadingSecrets(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/secrets`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Unable to load secrets.');
      }
      const nextSecrets = Array.isArray(data.secrets) ? data.secrets.map(normalizeSecret) : [];
      setSecrets(nextSecrets);
      return nextSecrets;
    } catch (err) {
      setError(err.message || 'Unable to load secrets.');
      throw err;
    } finally {
      setLoadingSecrets(false);
    }
  }, [isAdmin, user]);

  const refreshSecretUsers = useCallback(async () => {
    if (!isAdmin || !user) {
      setUsers([]);
      return [];
    }
    setLoadingUsers(true);
    setError('');
    try {
      const response = await fetch(`${API_BASE_URL}/secrets/users`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Unable to load secret assignments.');
      }
      const nextUsers = Array.isArray(data.users) ? data.users.map(normalizeSecretUser) : [];
      setUsers(nextUsers);
      return nextUsers;
    } catch (err) {
      setError(err.message || 'Unable to load secret assignments.');
      throw err;
    } finally {
      setLoadingUsers(false);
    }
  }, [isAdmin, user]);

  useEffect(() => {
    if (!isAdmin || !user) {
      setSecrets([]);
      setUsers([]);
      setLoadingSecrets(false);
      setLoadingUsers(false);
      setError('');
      return;
    }
    refreshSecrets().catch(() => null);
    refreshSecretUsers().catch(() => null);
  }, [isAdmin, refreshSecretUsers, refreshSecrets, user]);

  const createSecret = useCallback(async (payload) => {
    const response = await fetch(`${API_BASE_URL}/secrets`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Unable to create secret.');
    }
    const nextSecret = normalizeSecret(data.secret);
    setSecrets((prev) => [...prev, nextSecret].sort((a, b) => a.title.localeCompare(b.title)));
    return nextSecret;
  }, []);

  const updateSecret = useCallback(async (id, payload) => {
    const response = await fetch(`${API_BASE_URL}/secrets/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Unable to update secret.');
    }
    const nextSecret = normalizeSecret(data.secret);
    setSecrets((prev) =>
      prev
        .map((secret) => (secret.id === nextSecret.id ? nextSecret : secret))
        .sort((a, b) => a.title.localeCompare(b.title))
    );
    return nextSecret;
  }, []);

  const deleteSecret = useCallback(async (id) => {
    const response = await fetch(`${API_BASE_URL}/secrets/${encodeURIComponent(id)}`, {
      method: 'DELETE',
      credentials: 'include',
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Unable to delete secret.');
    }
    setSecrets((prev) => prev.filter((secret) => secret.id !== id));
    setUsers((prev) =>
      prev.map((entry) => ({
        ...entry,
        unlockedSecrets: entry.unlockedSecrets.filter((secretId) => secretId !== id),
      }))
    );
    return data;
  }, []);

  const grantSecret = useCallback(async (userId, secretId) => {
    const response = await fetch(
      `${API_BASE_URL}/secrets/users/${encodeURIComponent(userId)}/grant`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ secretId }),
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Unable to grant secret.');
    }
    const nextUnlocked = Array.isArray(data.unlockedSecrets) ? data.unlockedSecrets : [];
    setUsers((prev) =>
      prev.map((entry) =>
        String(entry.id) === String(userId)
          ? { ...entry, unlockedSecrets: nextUnlocked }
          : entry
      )
    );
    return nextUnlocked;
  }, []);

  const revokeSecret = useCallback(async (userId, secretId) => {
    const response = await fetch(
      `${API_BASE_URL}/secrets/users/${encodeURIComponent(userId)}/revoke`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ secretId }),
      }
    );
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error || 'Unable to revoke secret.');
    }
    const nextUnlocked = Array.isArray(data.unlockedSecrets) ? data.unlockedSecrets : [];
    setUsers((prev) =>
      prev.map((entry) =>
        String(entry.id) === String(userId)
          ? { ...entry, unlockedSecrets: nextUnlocked }
          : entry
      )
    );
    return nextUnlocked;
  }, []);

  const getSecretById = useCallback(
    (id) => secrets.find((secret) => secret.id === id) || null,
    [secrets]
  );

  const value = useMemo(
    () => ({
      secrets,
      users,
      loadingSecrets,
      loadingUsers,
      error,
      refreshSecrets,
      refreshSecretUsers,
      createSecret,
      updateSecret,
      deleteSecret,
      grantSecret,
      revokeSecret,
      getSecretById,
    }),
    [
      secrets,
      users,
      loadingSecrets,
      loadingUsers,
      error,
      refreshSecrets,
      refreshSecretUsers,
      createSecret,
      updateSecret,
      deleteSecret,
      grantSecret,
      revokeSecret,
      getSecretById,
    ]
  );

  return <SecretDataContext.Provider value={value}>{children}</SecretDataContext.Provider>;
}

export function useSecrets() {
  const context = useContext(SecretDataContext);
  if (!context) {
    throw new Error('useSecrets must be used within a SecretDataProvider');
  }
  return context;
}
