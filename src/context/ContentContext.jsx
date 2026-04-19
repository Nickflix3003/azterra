/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { normalizeContentList } from '../constants/contentConstants';
import fallbackContent from '../data/content.json';
import { fetchWithRetry } from '../utils/fetchWithRetry';

const ContentContext = createContext(null);
const API_BASE_URL = '/api';

export function ContentProvider({ children }) {
  const [entries, setEntries] = useState([]);
  const [issues, setIssues] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lastLoadedAt, setLastLoadedAt] = useState(null);
  const [portraitConfig, setPortraitConfig] = useState({ enabled: false, checked: false });
  const [portraitStatus, setPortraitStatus] = useState({});

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetchWithRetry(`${API_BASE_URL}/content`, { credentials: 'include' });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load content.');
      }
      const normalized = normalizeContentList(data.entries || []);
      setEntries(normalized);
      setIssues(data.diagnostics || data.issues || null);
      setLastLoadedAt(new Date().toISOString());
    } catch (err) {
      const fallback = normalizeContentList(fallbackContent?.entries || []);
      setEntries(fallback);
      setIssues(null);
      setError(err.message || 'Unable to load content.');
      setLastLoadedAt(new Date().toISOString());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const fetchPortraitConfig = async () => {
      try {
        const res = await fetchWithRetry(`${API_BASE_URL}/portraits/config`, { credentials: 'include' });
        const data = await res.json();
        if (res.ok) {
          setPortraitConfig({ enabled: Boolean(data.enabled), checked: true });
        } else {
          setPortraitConfig((prev) => ({ ...prev, checked: true }));
        }
      } catch {
        setPortraitConfig((prev) => ({ ...prev, checked: true }));
      }
    };
    fetchPortraitConfig();
  }, []);

  const getByType = useCallback(
    (type) => {
      if (!type) return entries;
      const normalized = String(type).toLowerCase();
      return entries.filter((entry) => String(entry.type).toLowerCase() === normalized);
    },
    [entries]
  );

  const getByCategory = useCallback(
    (category) => {
      if (!category) return entries;
      const normalized = String(category).toLowerCase();
      return entries.filter(
        (entry) => String(entry.category || '').toLowerCase() === normalized,
      );
    },
    [entries],
  );

  const getById = useCallback(
    (id) => entries.find((entry) => String(entry.id) === String(id)) || null,
    [entries]
  );

  const refreshPortraitStatus = useCallback(async (id) => {
    if (!id) return null;
    try {
      const res = await fetch(`${API_BASE_URL}/portraits/${encodeURIComponent(id)}/status`, {
        credentials: 'include',
      });
      const data = await res.json();
      if (res.ok) {
        setPortraitStatus((prev) => ({ ...prev, [id]: data }));
        return data;
      }
      return null;
    } catch {
      return null;
    }
  }, []);

  const generatePortrait = useCallback(async (id) => {
    if (!id) return { error: 'Auth and id required' };
    try {
      const res = await fetch(`${API_BASE_URL}/portraits/${encodeURIComponent(id)}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
      });
      const data = await res.json();
      if (!res.ok) {
        return { error: data.error || 'Failed to generate portrait' };
      }
      setPortraitStatus((prev) => ({
        ...prev,
        [id]: { exists: true, url: data.url },
      }));
      return { url: data.url };
    } catch (err) {
      return { error: err.message || 'Failed to generate portrait' };
    }
  }, []);

  const availableTypes = useMemo(() => {
    const set = new Set();
    entries.forEach((entry) => {
      if (entry.type) {
        set.add(String(entry.type).toLowerCase());
      }
    });
    return Array.from(set);
  }, [entries]);

  const availableCategories = useMemo(() => {
    const set = new Set();
    entries.forEach((entry) => {
      if (entry.category) {
        set.add(String(entry.category).toLowerCase());
      }
    });
    return Array.from(set);
  }, [entries]);

  const value = useMemo(
    () => ({
      entries,
      issues,
      loading,
      error,
      lastLoadedAt,
      refresh,
      getByType,
      getByCategory,
      getById,
      availableTypes,
      availableCategories,
      portraitConfig,
      portraitStatus,
      refreshPortraitStatus,
      generatePortrait,
    }),
    [
      entries,
      issues,
      loading,
      error,
      lastLoadedAt,
      refresh,
      getByType,
      getByCategory,
      getById,
      availableTypes,
      availableCategories,
      portraitConfig,
      portraitStatus,
      refreshPortraitStatus,
      generatePortrait,
    ]
  );

  return <ContentContext.Provider value={value}>{children}</ContentContext.Provider>;
}

export function useContent() {
  const context = useContext(ContentContext);
  if (!context) {
    throw new Error('useContent must be used within a ContentProvider');
  }
  return context;
}

