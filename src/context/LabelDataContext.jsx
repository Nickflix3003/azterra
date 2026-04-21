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
import { toOptionalYear } from '../utils/eraUtils';
import { useToast } from './ToastContext';

const LabelDataContext = createContext(null);
const AUTOSAVE_DELAY_MS = 500;

function normalizeMapLabel(label = {}) {
  return {
    id: label.id,
    text: label.text || 'New Label',
    color: label.color || '#fef3c7',
    font: label.font || "'Cinzel','Cormorant Garamond',serif",
    size: Number.isFinite(Number(label.size)) ? Number(label.size) : 1,
    zoomScale: Number.isFinite(Number(label.zoomScale)) ? Number(label.zoomScale) : 1,
    scaleWithZoom: label.scaleWithZoom !== false,
    fadeInStart: Number.isFinite(Number(label.fadeInStart)) ? Number(label.fadeInStart) : 3,
    fadeInEnd: Number.isFinite(Number(label.fadeInEnd)) ? Number(label.fadeInEnd) : 5,
    lat: Number.isFinite(Number(label.lat)) ? Number(label.lat) : 0,
    lng: Number.isFinite(Number(label.lng)) ? Number(label.lng) : 0,
    ...(toOptionalYear(label.timeStart) != null && { timeStart: toOptionalYear(label.timeStart) }),
    ...(toOptionalYear(label.timeEnd) != null && { timeEnd: toOptionalYear(label.timeEnd) }),
  };
}

function sanitizeLabelUpdates(updates = {}) {
  return Object.fromEntries(
    Object.entries(updates).map(([key, value]) => [key, value === undefined ? null : value])
  );
}

export function LabelDataProvider({ children }) {
  const { toast } = useToast();
  const [labelsState, setLabelsState] = useState([]);
  const [loadingLabels, setLoadingLabels] = useState(true);
  const [labelsError, setLabelsError] = useState('');

  const labelsRef = useRef([]);
  const timersRef = useRef({});
  const pendingPatchesRef = useRef({});
  const savePromisesRef = useRef({});

  const setLabels = useCallback((updater) => {
    setLabelsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      labelsRef.current = Array.isArray(next) ? next : [];
      return Array.isArray(next) ? next : [];
    });
  }, []);

  const refreshLabels = useCallback(async () => {
    setLoadingLabels(true);
    setLabelsError('');
    try {
      const response = await fetch(`${API_BASE_URL}/map-labels`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Failed to load map labels.');
      const nextLabels = Array.isArray(data.labels) ? data.labels.map(normalizeMapLabel) : [];
      setLabels(nextLabels);
    } catch (error) {
      setLabelsError(error.message || 'Failed to load map labels.');
      throw error;
    } finally {
      setLoadingLabels(false);
    }
  }, [setLabels]);

  useEffect(() => {
    refreshLabels().catch((error) => {
      console.error('Unable to load map labels', error);
    });
  }, [refreshLabels]);

  useEffect(() => {
    labelsRef.current = labelsState;
  }, [labelsState]);

  const replaceLabelLocal = useCallback((label) => {
    const normalized = normalizeMapLabel(label);
    setLabels((prev) => {
      const index = prev.findIndex((entry) => String(entry.id) === String(normalized.id));
      if (index === -1) return [...prev, normalized];
      const next = prev.slice();
      next[index] = normalized;
      return next;
    });
    return normalized;
  }, [setLabels]);

  const updateLabelLocal = useCallback((id, updates) => {
    const sanitizedUpdates = sanitizeLabelUpdates(updates);
    setLabels((prev) =>
      prev.map((label) =>
        String(label.id) === String(id)
          ? normalizeMapLabel({ ...label, ...sanitizedUpdates })
          : label
      )
    );
  }, [setLabels]);

  const persistLabel = useCallback((id) => {
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
          const response = await fetch(`${API_BASE_URL}/map-labels/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) throw new Error(data.error || 'Unable to save label.');
          replaceLabelLocal(data.label);
        } catch (error) {
          pendingPatchesRef.current[key] = {
            ...patch,
            ...(pendingPatchesRef.current[key] || {}),
          };
          toast.error(error.message || 'Unable to save label.');
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
  }, [replaceLabelLocal, toast]);

  const updateLabel = useCallback((id, updates, options = {}) => {
    const { mode = 'debounced' } = options;
    const key = String(id);
    const sanitizedUpdates = sanitizeLabelUpdates(updates);

    updateLabelLocal(id, sanitizedUpdates);
    pendingPatchesRef.current[key] = {
      ...(pendingPatchesRef.current[key] || {}),
      ...sanitizedUpdates,
    };

    if (mode === 'immediate') {
      return persistLabel(id).catch(() => null);
    }

    if (timersRef.current[key]) clearTimeout(timersRef.current[key]);
    timersRef.current[key] = setTimeout(() => {
      delete timersRef.current[key];
      persistLabel(id).catch(() => null);
    }, AUTOSAVE_DELAY_MS);
    return Promise.resolve();
  }, [persistLabel, updateLabelLocal]);

  const flushPendingLabelSaves = useCallback(async (targetIds) => {
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

    await Promise.all(uniqueIds.map((key) => persistLabel(key).catch(() => null)));
  }, [persistLabel]);

  const createLabel = useCallback(async (label) => {
    try {
      const response = await fetch(`${API_BASE_URL}/map-labels`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(label),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to create map label.');
      return replaceLabelLocal(data.label);
    } catch (error) {
      toast.error(error.message || 'Unable to create map label.');
      throw error;
    }
  }, [replaceLabelLocal, toast]);

  const deleteLabel = useCallback(async (id) => {
    const key = String(id);
    if (timersRef.current[key]) {
      clearTimeout(timersRef.current[key]);
      delete timersRef.current[key];
    }
    delete pendingPatchesRef.current[key];
    await (savePromisesRef.current[key] || Promise.resolve()).catch(() => null);

    try {
      const response = await fetch(`${API_BASE_URL}/map-labels/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || 'Unable to delete map label.');
      setLabels((prev) => prev.filter((label) => String(label.id) !== String(id)));
      return data;
    } catch (error) {
      toast.error(error.message || 'Unable to delete map label.');
      throw error;
    }
  }, [setLabels, toast]);

  useEffect(() => () => {
    Object.values(timersRef.current).forEach((timerId) => clearTimeout(timerId));
  }, []);

  const value = useMemo(
    () => ({
      labels: labelsState,
      setLabels,
      loadingLabels,
      labelsError,
      refreshLabels,
      createLabel,
      updateLabel,
      deleteLabel,
      flushPendingLabelSaves,
    }),
    [
      labelsState,
      setLabels,
      loadingLabels,
      labelsError,
      refreshLabels,
      createLabel,
      updateLabel,
      deleteLabel,
      flushPendingLabelSaves,
    ]
  );

  return <LabelDataContext.Provider value={value}>{children}</LabelDataContext.Provider>;
}

export function useLabels() {
  const context = useContext(LabelDataContext);
  if (!context) {
    throw new Error('useLabels must be used within a LabelDataProvider');
  }
  return context;
}
