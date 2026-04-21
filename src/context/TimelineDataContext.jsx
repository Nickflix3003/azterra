/* eslint-disable react-refresh/only-export-components */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { API_BASE_URL } from '../constants/mapConstants';
import { useToast } from './ToastContext';

const TimelineDataContext = createContext(null);
const AUTOSAVE_DELAY_MS = 500;

const DEFAULT_TIMELINE_ERAS = [
  { id: 'before-records', label: 'Before Records', startYear: 0, endYear: 99, color: '#4f46e5' },
  { id: 'founding-age', label: 'Founding Age', startYear: 100, endYear: 299, color: '#0f766e' },
  { id: 'age-of-strife', label: 'Age of Strife', startYear: 300, endYear: 499, color: '#b45309' },
  { id: 'great-conquest', label: 'Great Conquest', startYear: 500, endYear: 699, color: '#be123c' },
  { id: 'current-era', label: 'Current Era', startYear: 700, endYear: 899, color: '#1d4ed8' },
  { id: 'end-of-days', label: 'End of Days', startYear: 900, endYear: 1000, color: '#7c3aed' },
];

function toOptionalYear(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeColor(value) {
  if (typeof value !== 'string') return '#c084fc';
  const trimmed = value.trim();
  if (/^#[\da-f]{6}$/i.test(trimmed) || /^#[\da-f]{3}$/i.test(trimmed)) {
    return trimmed;
  }
  return '#c084fc';
}

function normalizeTimelineEra(era = {}) {
  const startYear = toOptionalYear(era.startYear);
  const endYear = toOptionalYear(era.endYear);

  return {
    id: era.id,
    label: String(era.label || 'New Era').trim() || 'New Era',
    ...(startYear != null && { startYear }),
    ...(endYear != null && { endYear }),
    color: normalizeColor(era.color),
    ...(era.description ? { description: String(era.description).trim() } : {}),
  };
}

function sortTimelineEras(eras = []) {
  return [...eras].sort((left, right) => {
    const leftStart = toOptionalYear(left.startYear);
    const rightStart = toOptionalYear(right.startYear);
    if (leftStart == null && rightStart != null) return 1;
    if (leftStart != null && rightStart == null) return -1;
    if (leftStart !== rightStart) return (leftStart ?? 0) - (rightStart ?? 0);

    const leftEnd = toOptionalYear(left.endYear);
    const rightEnd = toOptionalYear(right.endYear);
    if (leftEnd == null && rightEnd != null) return 1;
    if (leftEnd != null && rightEnd == null) return -1;
    if (leftEnd !== rightEnd) return (leftEnd ?? 0) - (rightEnd ?? 0);

    return String(left.label || '').localeCompare(String(right.label || ''));
  });
}

function sanitizeEraUpdates(updates = {}) {
  return Object.fromEntries(
    Object.entries(updates).map(([key, value]) => [key, value === undefined ? null : value])
  );
}

export function TimelineDataProvider({ children }) {
  const { toast } = useToast();
  const [erasState, setErasState] = useState(DEFAULT_TIMELINE_ERAS);
  const [loadingEras, setLoadingEras] = useState(true);
  const [erasError, setErasError] = useState('');

  const erasRef = useRef(DEFAULT_TIMELINE_ERAS);
  const timersRef = useRef({});
  const pendingPatchesRef = useRef({});
  const savePromisesRef = useRef({});

  const setEras = useCallback((updater) => {
    setErasState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const normalized = Array.isArray(next)
        ? sortTimelineEras(next.map(normalizeTimelineEra))
        : [];
      erasRef.current = normalized;
      return normalized;
    });
  }, []);

  const replaceEraLocal = useCallback((era) => {
    const normalized = normalizeTimelineEra(era);
    setEras((prev) => {
      const index = prev.findIndex((entry) => String(entry.id) === String(normalized.id));
      if (index === -1) return [...prev, normalized];
      const next = prev.slice();
      next[index] = normalized;
      return next;
    });
    return normalized;
  }, [setEras]);

  const updateEraLocal = useCallback((id, updates) => {
    const sanitized = sanitizeEraUpdates(updates);
    setEras((prev) =>
      prev.map((era) =>
        String(era.id) === String(id)
          ? normalizeTimelineEra({ ...era, ...sanitized })
          : era
      )
    );
  }, [setEras]);

  const refreshEras = useCallback(async () => {
    setLoadingEras(true);
    setErasError('');
    try {
      const response = await fetch(`${API_BASE_URL}/timeline/eras`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load timeline eras.');
      }
      const nextEras = Array.isArray(data.eras) ? data.eras.map(normalizeTimelineEra) : [];
      setEras(nextEras.length ? nextEras : DEFAULT_TIMELINE_ERAS);
    } catch (error) {
      setErasError(error.message || 'Failed to load timeline eras.');
      setEras(DEFAULT_TIMELINE_ERAS);
    } finally {
      setLoadingEras(false);
    }
  }, [setEras]);

  useEffect(() => {
    refreshEras().catch((error) => {
      console.error('Unable to load timeline eras', error);
    });
  }, [refreshEras]);

  const persistEra = useCallback((id) => {
    const key = String(id);
    if (timersRef.current[key]) {
      clearTimeout(timersRef.current[key]);
      delete timersRef.current[key];
    }

    const previous = savePromisesRef.current[key] || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      while (true) {
        const patch = pendingPatchesRef.current[key];
        if (!patch || !Object.keys(patch).length) return;

        delete pendingPatchesRef.current[key];
        try {
          const response = await fetch(`${API_BASE_URL}/timeline/eras/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || 'Unable to save timeline era.');
          }
          replaceEraLocal(data.era);
        } catch (error) {
          pendingPatchesRef.current[key] = {
            ...patch,
            ...(pendingPatchesRef.current[key] || {}),
          };
          toast.error(error.message || 'Unable to save timeline era.');
          throw error;
        }
      }
    });

    savePromisesRef.current[key] = next.finally(() => {
      if (savePromisesRef.current[key] === next) {
        delete savePromisesRef.current[key];
      }
    });

    return savePromisesRef.current[key];
  }, [replaceEraLocal, toast]);

  const updateEra = useCallback((id, updates, options = {}) => {
    const { mode = 'debounced' } = options;
    const key = String(id);
    const sanitized = sanitizeEraUpdates(updates);

    updateEraLocal(id, sanitized);
    pendingPatchesRef.current[key] = {
      ...(pendingPatchesRef.current[key] || {}),
      ...sanitized,
    };

    if (mode === 'immediate') {
      return persistEra(id).catch(() => null);
    }

    if (timersRef.current[key]) {
      clearTimeout(timersRef.current[key]);
    }
    timersRef.current[key] = setTimeout(() => {
      delete timersRef.current[key];
      persistEra(id).catch(() => null);
    }, AUTOSAVE_DELAY_MS);

    return Promise.resolve();
  }, [persistEra, updateEraLocal]);

  const flushPendingEraSaves = useCallback(async (targetIds) => {
    const ids = (targetIds?.length ? targetIds : [
      ...Object.keys(pendingPatchesRef.current),
      ...Object.keys(timersRef.current),
      ...Object.keys(savePromisesRef.current),
    ]).map((id) => String(id));
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

    uniqueIds.forEach((key) => {
      if (timersRef.current[key]) {
        clearTimeout(timersRef.current[key]);
        delete timersRef.current[key];
      }
    });

    await Promise.all(uniqueIds.map((key) => persistEra(key).catch(() => null)));
  }, [persistEra]);

  const createEra = useCallback(async (era) => {
    try {
      const response = await fetch(`${API_BASE_URL}/timeline/eras`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(era),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Unable to create timeline era.');
      }
      const saved = replaceEraLocal(data.era);
      toast.success(`Added "${saved.label}" to the timeline.`);
      return saved;
    } catch (error) {
      toast.error(error.message || 'Unable to create timeline era.');
      throw error;
    }
  }, [replaceEraLocal, toast]);

  const deleteEra = useCallback(async (id) => {
    const key = String(id);
    if (timersRef.current[key]) {
      clearTimeout(timersRef.current[key]);
      delete timersRef.current[key];
    }
    delete pendingPatchesRef.current[key];
    await (savePromisesRef.current[key] || Promise.resolve()).catch(() => null);

    try {
      const response = await fetch(`${API_BASE_URL}/timeline/eras/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Unable to delete timeline era.');
      }
      const removed = erasRef.current.find((era) => String(era.id) === String(id));
      setEras((prev) => prev.filter((era) => String(era.id) !== String(id)));
      toast.success(`Removed "${removed?.label || 'timeline era'}".`);
      return data;
    } catch (error) {
      toast.error(error.message || 'Unable to delete timeline era.');
      throw error;
    }
  }, [setEras, toast]);

  useEffect(() => {
    erasRef.current = erasState;
  }, [erasState]);

  useEffect(() => () => {
    Object.values(timersRef.current).forEach((timerId) => clearTimeout(timerId));
  }, []);

  const value = useMemo(
    () => ({
      eras: erasState,
      loadingEras,
      erasError,
      refreshEras,
      createEra,
      updateEra,
      deleteEra,
      flushPendingEraSaves,
    }),
    [
      erasState,
      loadingEras,
      erasError,
      refreshEras,
      createEra,
      updateEra,
      deleteEra,
      flushPendingEraSaves,
    ]
  );

  return <TimelineDataContext.Provider value={value}>{children}</TimelineDataContext.Provider>;
}

export function useTimelineData() {
  const context = useContext(TimelineDataContext);
  if (!context) {
    throw new Error('useTimelineData must be used within a TimelineDataProvider');
  }
  return context;
}
