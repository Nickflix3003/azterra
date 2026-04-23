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
import { normalizeRegionEntry } from '../constants/regionConstants';
import { useToast } from './ToastContext';

const RegionDataContext = createContext(null);
const API_BASE_URL = '/api';
const REGION_AUTOSAVE_DELAY_MS = 500;
const PATCHABLE_REGION_FIELDS = new Set([
  'name',
  'description',
  'lore',
  'emblem',
  'bannerImage',
  'color',
  'borderColor',
  'opacity',
  'category',
  'labelEnabled',
  'labelSize',
  'labelOffsetX',
  'labelOffsetY',
  'labelWidth',
  'timeStart',
  'timeEnd',
  'secretId',
]);
const EMPTY_REGION_SAVE_STATE = Object.freeze({
  dirty: false,
  saving: false,
  error: '',
  lastSavedAt: null,
});

function getRegionSaveStateValue(current = {}, patch = {}) {
  return {
    dirty: patch.dirty ?? current.dirty ?? false,
    saving: patch.saving ?? current.saving ?? false,
    error: patch.error ?? current.error ?? '',
    lastSavedAt: patch.lastSavedAt ?? current.lastSavedAt ?? null,
  };
}

export function RegionDataProvider({ children }) {
  const { toast } = useToast();
  const [regionsState, setRegionsState] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [loadingRegions, setLoadingRegions] = useState(true);
  const [regionsError, setRegionsError] = useState('');
  const [regionSaveState, setRegionSaveStateRaw] = useState(EMPTY_REGION_SAVE_STATE);
  const hasLoadedRef = useRef(false);
  const regionsRef = useRef([]);
  const saveTimerRef = useRef(null);
  const savePromiseRef = useRef(null);
  const patchTimersRef = useRef({});
  const patchPromisesRef = useRef({});
  const pendingPatchesRef = useRef({});
  const bulkDirtyRef = useRef(false);

  const setRegions = useCallback((updater) => {
    setRegionsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      const normalized = Array.isArray(next) ? next.map(normalizeRegionEntry) : [];
      regionsRef.current = normalized;
      return normalized;
    });
  }, []);

  const setRegionSaveState = useCallback((patch) => {
    setRegionSaveStateRaw((prev) => {
      const next = getRegionSaveStateValue(prev, patch);
      if (
        prev.dirty === next.dirty &&
        prev.saving === next.saving &&
        prev.error === next.error &&
        prev.lastSavedAt === next.lastSavedAt
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  const replaceRegionLocal = useCallback((region) => {
    const normalized = normalizeRegionEntry(region);
    setRegions((prev) => {
      const index = prev.findIndex((entry) => String(entry.id) === String(normalized.id));
      if (index === -1) return [...prev, normalized];
      const next = prev.slice();
      next[index] = normalized;
      return next;
    });
    return normalized;
  }, [setRegions]);

  const selectRegion = useCallback((id) => {
    setSelectedRegionId(id);
  }, []);

  const refreshRegions = useCallback(async () => {
    setLoadingRegions(true);
    setRegionsError('');
    try {
      const response = await fetch(`${API_BASE_URL}/regions`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load regions.');
      }
      const normalized = Array.isArray(data.regions)
        ? data.regions.map(normalizeRegionEntry)
        : [];
      hasLoadedRef.current = true;
      setRegions(normalized);
      return normalized;
    } catch (error) {
      setRegionsError(error.message || 'Failed to load regions.');
      throw error;
    } finally {
      setLoadingRegions(false);
    }
  }, [setRegions]);

  const persistRegions = useCallback(async (nextRegions = regionsRef.current, options = {}) => {
    const {
      successMode = 'none',
      successMessage = 'Regions saved.',
      errorMessage = 'Unable to save regions.',
    } = options;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    const previous = savePromiseRef.current || Promise.resolve();
    const nextPromise = previous.catch(() => null).then(async () => {
      const payload = Array.isArray(nextRegions) ? nextRegions.map(normalizeRegionEntry) : [];
      setRegionSaveState({ saving: true, dirty: true, error: '' });
      try {
        const response = await fetch(`${API_BASE_URL}/regions/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ regions: payload }),
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || errorMessage);
        }
        const normalized = Array.isArray(data.regions)
          ? data.regions.map(normalizeRegionEntry)
          : [];
        setRegions(normalized);
        bulkDirtyRef.current = false;
        setRegionSaveState({
          dirty: false,
          saving: false,
          error: '',
          lastSavedAt: Date.now(),
        });
        if (successMode === 'immediate') {
          toast.success(successMessage);
        }
        return normalized;
      } catch (error) {
        setRegionSaveState({
          dirty: true,
          saving: false,
          error: error.message || errorMessage,
        });
        toast.error(error.message || errorMessage);
        throw error;
      }
    });

    savePromiseRef.current = nextPromise.finally(() => {
      if (savePromiseRef.current === nextPromise) {
        savePromiseRef.current = null;
      }
    });

    return savePromiseRef.current;
  }, [setRegionSaveState, setRegions, toast]);

  const scheduleRegionSave = useCallback((options = {}) => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      persistRegions(regionsRef.current, options).catch(() => null);
    }, REGION_AUTOSAVE_DELAY_MS);
  }, [persistRegions]);

  const persistQueuedRegionPatch = useCallback((id, options = {}) => {
    const key = String(id);
    const {
      successMode = 'none',
      successMessage = 'Region saved.',
      errorMessage = 'Unable to save region.',
    } = options;

    if (patchTimersRef.current[key]) {
      clearTimeout(patchTimersRef.current[key]);
      delete patchTimersRef.current[key];
    }

    const previous = patchPromisesRef.current[key] || Promise.resolve();
    const next = previous.catch(() => null).then(async () => {
      while (true) {
        const patch = pendingPatchesRef.current[key];
        if (!patch || !Object.keys(patch).length) {
          return regionsRef.current.find((region) => String(region.id) === key) || null;
        }

        delete pendingPatchesRef.current[key];
        setRegionSaveState({ saving: true, error: '' });

        try {
          const response = await fetch(`${API_BASE_URL}/regions/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || errorMessage);
          }

          const hasMoreQueued = Boolean(
            pendingPatchesRef.current[key] && Object.keys(pendingPatchesRef.current[key]).length
          );
          if (!hasMoreQueued && data.region) {
            replaceRegionLocal(data.region);
          }

          setRegionSaveState({
            dirty: hasMoreQueued || bulkDirtyRef.current,
            saving: hasMoreQueued,
            error: '',
            lastSavedAt: Date.now(),
          });

          if (!hasMoreQueued && successMode === 'immediate') {
            toast.success(successMessage);
          }
        } catch (error) {
          pendingPatchesRef.current[key] = {
            ...patch,
            ...(pendingPatchesRef.current[key] || {}),
          };
          setRegionSaveState({
            dirty: true,
            saving: false,
            error: error.message || errorMessage,
          });
          toast.error(error.message || errorMessage);
          throw error;
        }
      }
    });

    patchPromisesRef.current[key] = next.finally(() => {
      if (patchPromisesRef.current[key] === next) {
        delete patchPromisesRef.current[key];
      }
    });

    return patchPromisesRef.current[key];
  }, [replaceRegionLocal, setRegionSaveState, toast]);

  const updateRegion = useCallback((id, updates, options = {}) => {
    const { mode = 'debounced' } = options;
    const sanitizedUpdates = Object.fromEntries(
      Object.entries(updates || {}).map(([key, value]) => [key, value === undefined ? null : value])
    );
    const patchable = Object.keys(sanitizedUpdates).every((key) => PATCHABLE_REGION_FIELDS.has(key));
    let nextRegions = regionsRef.current;
    setRegions((prev) => {
      nextRegions = prev.map((region) => (
        String(region.id) === String(id)
          ? normalizeRegionEntry({ ...region, ...sanitizedUpdates })
          : region
      ));
      return nextRegions;
    });
    setRegionSaveState({ dirty: true, error: '' });

    if (!patchable) {
      bulkDirtyRef.current = true;
      if (mode === 'immediate') {
        return persistRegions(nextRegions, options);
      }
      scheduleRegionSave(options);
      return Promise.resolve(nextRegions);
    }

    const key = String(id);
    pendingPatchesRef.current[key] = {
      ...(pendingPatchesRef.current[key] || {}),
      ...sanitizedUpdates,
    };

    if (mode === 'immediate') {
      return persistQueuedRegionPatch(id, options);
    }

    if (patchTimersRef.current[key]) {
      clearTimeout(patchTimersRef.current[key]);
    }
    patchTimersRef.current[key] = setTimeout(() => {
      delete patchTimersRef.current[key];
      persistQueuedRegionPatch(id, options).catch(() => null);
    }, REGION_AUTOSAVE_DELAY_MS);
    return Promise.resolve(nextRegions);
  }, [persistQueuedRegionPatch, persistRegions, scheduleRegionSave, setRegionSaveState, setRegions]);

  const createRegion = useCallback((region, options = {}) => {
    const { mode = 'immediate' } = options;
    const createdRegion = normalizeRegionEntry(region);
    let nextRegions = regionsRef.current;
    setRegions((prev) => {
      nextRegions = [...prev, createdRegion];
      return nextRegions;
    });
    bulkDirtyRef.current = true;
    setRegionSaveState({ dirty: true, error: '' });
    if (mode === 'immediate') {
      return persistRegions(nextRegions, options).then(() => createdRegion);
    }
    scheduleRegionSave(options);
    return Promise.resolve(createdRegion);
  }, [persistRegions, scheduleRegionSave, setRegionSaveState, setRegions]);

  const deleteRegion = useCallback((id, options = {}) => {
    const { mode = 'immediate' } = options;
    let nextRegions = regionsRef.current;
    setRegions((prev) => {
      nextRegions = prev.filter((region) => String(region.id) !== String(id));
      return nextRegions;
    });
    bulkDirtyRef.current = true;
    setSelectedRegionId((prev) => (String(prev) === String(id) ? null : prev));
    setRegionSaveState({ dirty: true, error: '' });
    if (mode === 'immediate') {
      return persistRegions(nextRegions, options);
    }
    scheduleRegionSave(options);
    return Promise.resolve(nextRegions);
  }, [persistRegions, scheduleRegionSave, setRegionSaveState, setRegions]);

  const flushPendingRegionSaves = useCallback((options = {}) => {
    const patchIds = Array.from(
      new Set([
        ...Object.keys(pendingPatchesRef.current),
        ...Object.keys(patchTimersRef.current),
        ...Object.keys(patchPromisesRef.current),
      ].filter(Boolean))
    );

    patchIds.forEach((key) => {
      if (patchTimersRef.current[key]) {
        clearTimeout(patchTimersRef.current[key]);
        delete patchTimersRef.current[key];
      }
    });

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    return Promise.all(patchIds.map((key) => persistQueuedRegionPatch(key, options).catch(() => null)))
      .then(() => {
        if (!bulkDirtyRef.current && !savePromiseRef.current) {
          return regionsRef.current;
        }
        return persistRegions(regionsRef.current, options).catch(() => null);
      });
  }, [persistQueuedRegionPatch, persistRegions]);

  useEffect(() => {
    if (hasLoadedRef.current) return undefined;
    refreshRegions().catch((error) => {
      console.error('Unable to load regions', error);
    });
    return undefined;
  }, [refreshRegions]);

  useEffect(() => {
    regionsRef.current = regionsState;
  }, [regionsState]);

  useEffect(() => () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }
    Object.values(patchTimersRef.current).forEach((timer) => {
      clearTimeout(timer);
    });
  }, []);

  const value = useMemo(
    () => ({
      regions: regionsState,
      setRegions,
      selectedRegionId,
      selectRegion,
      loadingRegions,
      regionsError,
      regionSaveState,
      refreshRegions,
      updateRegion,
      createRegion,
      deleteRegion,
      flushPendingRegionSaves,
    }),
    [
      regionsState,
      setRegions,
      selectedRegionId,
      selectRegion,
      loadingRegions,
      regionsError,
      regionSaveState,
      refreshRegions,
      updateRegion,
      createRegion,
      deleteRegion,
      flushPendingRegionSaves,
    ]
  );

  return <RegionDataContext.Provider value={value}>{children}</RegionDataContext.Provider>;
}

export function useRegions() {
  const context = useContext(RegionDataContext);
  if (!context) {
    throw new Error('useRegions must be used within a RegionDataProvider');
  }
  return context;
}
