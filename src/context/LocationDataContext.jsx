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
import { normalizeLocationEntry, normalizeLocations } from '../utils/markerUtils';
import { useToast } from './ToastContext';

const LocationDataContext = createContext(null);

const AUTOSAVE_DELAY_MS = 700;
const EMPTY_SAVE_STATE = Object.freeze({
  dirty: false,
  saving: false,
  error: '',
  lastSavedAt: null,
});

function sanitizeLocationUpdates(updates = {}) {
  return Object.fromEntries(
    Object.entries(updates).map(([key, value]) => [key, value === undefined ? null : value])
  );
}

function getSaveStateValue(current = {}, patch = {}) {
  return {
    dirty: patch.dirty ?? current.dirty ?? false,
    saving: patch.saving ?? current.saving ?? false,
    error: patch.error ?? current.error ?? '',
    lastSavedAt: patch.lastSavedAt ?? current.lastSavedAt ?? null,
  };
}

export function LocationDataProvider({ children }) {
  const { toast } = useToast();
  const [locationsState, setLocationsState] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(null);
  const [locationSaveStates, setLocationSaveStates] = useState({});
  const [loadingLocations, setLoadingLocations] = useState(true);
  const [locationsError, setLocationsError] = useState('');

  const locationsRef = useRef([]);
  const saveStatesRef = useRef({});
  const saveTimersRef = useRef({});
  const savePromisesRef = useRef({});
  const pendingPatchesRef = useRef({});
  const autosaveToastRef = useRef({ timer: null, count: 0 });

  const setLocations = useCallback((updater) => {
    setLocationsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      locationsRef.current = Array.isArray(next) ? next : [];
      return Array.isArray(next) ? next : [];
    });
  }, []);

  const selectLocation = useCallback((id) => {
    setSelectedLocationId(id);
  }, []);

  const setLocationSaveState = useCallback((id, patch) => {
    const key = String(id);
    setLocationSaveStates((prev) => {
      const nextValue = getSaveStateValue(prev[key], patch);
      if (
        prev[key]?.dirty === nextValue.dirty &&
        prev[key]?.saving === nextValue.saving &&
        prev[key]?.error === nextValue.error &&
        prev[key]?.lastSavedAt === nextValue.lastSavedAt
      ) {
        return prev;
      }
      const next = { ...prev, [key]: nextValue };
      saveStatesRef.current = next;
      return next;
    });
  }, []);

  const clearLocationSaveState = useCallback((id) => {
    const key = String(id);
    setLocationSaveStates((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      saveStatesRef.current = next;
      return next;
    });
  }, []);

  const replaceLocationLocal = useCallback((location) => {
    const normalized = normalizeLocationEntry(location);
    setLocations((prev) => {
      const index = prev.findIndex((entry) => String(entry.id) === String(normalized.id));
      if (index === -1) return [...prev, normalized];
      const next = prev.slice();
      next[index] = normalized;
      return next;
    });
    return normalized;
  }, [setLocations]);

  const updateLocationLocal = useCallback((id, updates) => {
    let normalizedTarget = null;
    setLocations((prev) =>
      prev.map((location) => {
        if (String(location.id) !== String(id)) return location;
        normalizedTarget = normalizeLocationEntry({ ...location, ...updates });
        return normalizedTarget;
      })
    );
    return normalizedTarget;
  }, [setLocations]);

  const removeLocationLocal = useCallback((id) => {
    setLocations((prev) => prev.filter((location) => String(location.id) !== String(id)));
    setSelectedLocationId((prev) => (String(prev) === String(id) ? null : prev));
  }, [setLocations]);

  const queueAutosaveToast = useCallback(() => {
    autosaveToastRef.current.count += 1;
    if (autosaveToastRef.current.timer) {
      clearTimeout(autosaveToastRef.current.timer);
    }
    autosaveToastRef.current.timer = setTimeout(() => {
      const count = autosaveToastRef.current.count;
      autosaveToastRef.current.count = 0;
      autosaveToastRef.current.timer = null;
      toast.success(count > 1 ? `${count} location changes saved.` : 'Location saved.');
    }, 260);
  }, [toast]);

  const persistQueuedLocation = useCallback((id, options = {}) => {
    const key = String(id);
    const {
      successMode = 'burst',
      successMessage = 'Location saved.',
      errorMessage = 'Unable to save location.',
    } = options;

    if (saveTimersRef.current[key]) {
      clearTimeout(saveTimersRef.current[key]);
      delete saveTimersRef.current[key];
    }

    const previous = savePromisesRef.current[key] || Promise.resolve();
    const next = previous.catch(() => {}).then(async () => {
      while (true) {
        const patch = pendingPatchesRef.current[key];
        if (!patch || !Object.keys(patch).length) {
          const currentState = saveStatesRef.current[key] || EMPTY_SAVE_STATE;
          if (currentState.saving) {
            setLocationSaveState(key, { saving: false, dirty: false, error: '' });
          }
          return;
        }

        delete pendingPatchesRef.current[key];
        setLocationSaveState(key, { saving: true, error: '' });

        try {
          const response = await fetch(`${API_BASE_URL}/locations/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || errorMessage);
          }

          replaceLocationLocal(data.location);
          const hasMoreQueued = Boolean(
            pendingPatchesRef.current[key] && Object.keys(pendingPatchesRef.current[key]).length
          );
          setLocationSaveState(key, {
            dirty: hasMoreQueued,
            saving: hasMoreQueued,
            error: '',
            lastSavedAt: Date.now(),
          });

          if (!hasMoreQueued) {
            if (successMode === 'immediate') toast.success(successMessage);
            if (successMode === 'burst') queueAutosaveToast();
          }
        } catch (error) {
          pendingPatchesRef.current[key] = {
            ...patch,
            ...(pendingPatchesRef.current[key] || {}),
          };
          setLocationSaveState(key, {
            dirty: true,
            saving: false,
            error: error.message || errorMessage,
          });
          toast.error(error.message || errorMessage);
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
  }, [queueAutosaveToast, replaceLocationLocal, setLocationSaveState, toast]);

  const flushPendingLocationSaves = useCallback(async (targetIds, options = {}) => {
    const ids = (targetIds?.length ? targetIds : [
      ...Object.keys(pendingPatchesRef.current),
      ...Object.keys(saveTimersRef.current),
      ...Object.keys(savePromisesRef.current),
    ]).map((id) => String(id));

    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));
    uniqueIds.forEach((key) => {
      if (saveTimersRef.current[key]) {
        clearTimeout(saveTimersRef.current[key]);
        delete saveTimersRef.current[key];
      }
    });

    await Promise.all(uniqueIds.map((key) => persistQueuedLocation(key, options).catch(() => null)));
  }, [persistQueuedLocation]);

  const updateLocation = useCallback((id, updates, options = {}) => {
    const key = String(id);
    const {
      mode = 'debounced',
      successMode = mode === 'debounced' ? 'burst' : 'none',
      successMessage = 'Location saved.',
      errorMessage = 'Unable to save location.',
    } = options;
    const sanitizedUpdates = sanitizeLocationUpdates(updates);

    updateLocationLocal(id, sanitizedUpdates);
    pendingPatchesRef.current[key] = {
      ...(pendingPatchesRef.current[key] || {}),
      ...sanitizedUpdates,
    };
    setLocationSaveState(key, { dirty: true, error: '' });

    if (mode === 'immediate') {
      return persistQueuedLocation(id, { successMode, successMessage, errorMessage });
    }

    if (saveTimersRef.current[key]) {
      clearTimeout(saveTimersRef.current[key]);
    }
    saveTimersRef.current[key] = setTimeout(() => {
      delete saveTimersRef.current[key];
      persistQueuedLocation(id, { successMode, successMessage, errorMessage }).catch(() => null);
    }, AUTOSAVE_DELAY_MS);
    return Promise.resolve();
  }, [persistQueuedLocation, setLocationSaveState, updateLocationLocal]);

  const createLocation = useCallback(async (location, options = {}) => {
    const {
      successMessage,
      errorMessage = 'Unable to create location.',
    } = options;
    try {
      const response = await fetch(`${API_BASE_URL}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(location),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || errorMessage);
      }
      const saved = replaceLocationLocal(data.location);
      setLocationSaveState(saved.id, {
        dirty: false,
        saving: false,
        error: '',
        lastSavedAt: Date.now(),
      });
      toast.success(successMessage || `Placed "${saved.name}" on the map.`);
      return saved;
    } catch (error) {
      toast.error(error.message || errorMessage);
      throw error;
    }
  }, [replaceLocationLocal, setLocationSaveState, toast]);

  const deleteLocation = useCallback(async (id, options = {}) => {
    const key = String(id);
    const {
      successMessage = 'Location deleted.',
      errorMessage = 'Unable to delete location.',
    } = options;
    if (saveTimersRef.current[key]) {
      clearTimeout(saveTimersRef.current[key]);
      delete saveTimersRef.current[key];
    }
    delete pendingPatchesRef.current[key];
    await (savePromisesRef.current[key] || Promise.resolve()).catch(() => null);
    setLocationSaveState(key, { saving: true, error: '' });
    try {
      const response = await fetch(`${API_BASE_URL}/locations/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || errorMessage);
      }
      removeLocationLocal(id);
      clearLocationSaveState(key);
      toast.success(successMessage);
      return data;
    } catch (error) {
      setLocationSaveState(key, { dirty: false, saving: false, error: error.message || errorMessage });
      toast.error(error.message || errorMessage);
      throw error;
    }
  }, [clearLocationSaveState, removeLocationLocal, setLocationSaveState, toast]);

  const refreshLocations = useCallback(async () => {
    setLoadingLocations(true);
    setLocationsError('');
    try {
      const response = await fetch(`${API_BASE_URL}/locations`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load locations.');
      }
      const serverLocations = normalizeLocations(Array.isArray(data.locations) ? data.locations : []);
      const localById = new Map(locationsRef.current.map((location) => [String(location.id), location]));
      const nextLocations = serverLocations.map((location) => {
        const key = String(location.id);
        const saveState = saveStatesRef.current[key];
        const hasPending =
          Boolean(saveTimersRef.current[key]) ||
          Boolean(savePromisesRef.current[key]) ||
          Boolean(pendingPatchesRef.current[key] && Object.keys(pendingPatchesRef.current[key]).length);
        if ((saveState?.dirty || saveState?.saving || hasPending) && localById.has(key)) {
          return localById.get(key);
        }
        return location;
      });
      setLocations(nextLocations);
    } catch (error) {
      setLocationsError(error.message || 'Failed to load locations.');
      throw error;
    } finally {
      setLoadingLocations(false);
    }
  }, [setLocations]);

  const getLocationSaveState = useCallback(
    (id) => locationSaveStates[String(id)] || EMPTY_SAVE_STATE,
    [locationSaveStates]
  );

  useEffect(() => {
    refreshLocations().catch((error) => {
      console.error('Unable to load locations', error);
    });
  }, [refreshLocations]);

  useEffect(() => {
    locationsRef.current = locationsState;
  }, [locationsState]);

  useEffect(() => {
    saveStatesRef.current = locationSaveStates;
  }, [locationSaveStates]);

  useEffect(() => () => {
    Object.values(saveTimersRef.current).forEach((timerId) => clearTimeout(timerId));
    if (autosaveToastRef.current.timer) {
      clearTimeout(autosaveToastRef.current.timer);
    }
  }, []);

  const value = useMemo(
    () => ({
      locations: locationsState,
      setLocations,
      selectedLocationId,
      selectLocation,
      locationSaveStates,
      loadingLocations,
      locationsError,
      refreshLocations,
      createLocation,
      updateLocation,
      deleteLocation,
      flushPendingLocationSaves,
      replaceLocationLocal,
      updateLocationLocal,
      getLocationSaveState,
    }),
    [
      locationsState,
      setLocations,
      selectedLocationId,
      selectLocation,
      locationSaveStates,
      loadingLocations,
      locationsError,
      refreshLocations,
      createLocation,
      updateLocation,
      deleteLocation,
      flushPendingLocationSaves,
      replaceLocationLocal,
      updateLocationLocal,
      getLocationSaveState,
    ]
  );

  return <LocationDataContext.Provider value={value}>{children}</LocationDataContext.Provider>;
}

export function useLocationData() {
  const context = useContext(LocationDataContext);
  if (!context) {
    throw new Error('useLocationData must be used within a LocationDataProvider');
  }
  return context;
}
