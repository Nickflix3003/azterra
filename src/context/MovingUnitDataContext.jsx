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

const MovingUnitDataContext = createContext(null);

const AUTOSAVE_DELAY_MS = 700;
const EMPTY_SAVE_STATE = Object.freeze({
  dirty: false,
  saving: false,
  error: '',
  lastSavedAt: null,
});

function normalizeString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function normalizeNumber(value, fallback = null) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : fallback;
}

function normalizeMovementWaypoint(stop = {}, index = 0) {
  const fallbackYear = index * 100;
  const startYear = normalizeNumber(stop.startYear, fallbackYear) ?? fallbackYear;
  const endYearRaw = normalizeNumber(stop.endYear, null);
  return {
    id: normalizeString(stop.id) || `waypoint-${index + 1}`,
    startYear,
    endYear: endYearRaw != null && endYearRaw >= startYear ? endYearRaw : null,
    targetLocationId: normalizeString(stop.targetLocationId) || null,
    lat: normalizeNumber(stop.lat, null),
    lng: normalizeNumber(stop.lng, null),
  };
}

function normalizeMovingUnitEntry(unit = {}) {
  const movementTimeline = Array.isArray(unit.movementTimeline)
    ? unit.movementTimeline.map((stop, index) => normalizeMovementWaypoint(stop, index)).sort((left, right) => left.startYear - right.startYear)
    : [];
  const followers = normalizeNumber(unit?.platoonStyle?.followers, 5);
  const spread = normalizeNumber(unit?.platoonStyle?.spread, 0.34);
  return {
    id: normalizeString(unit.id) || `unit-${Date.now()}`,
    name: normalizeString(unit.name, 'Unnamed Unit') || 'Unnamed Unit',
    kind: normalizeString(unit.kind, 'troop') || 'troop',
    icon: normalizeString(unit.icon, 'banner') || 'banner',
    color: normalizeString(unit.color, '#f8d86a') || '#f8d86a',
    lat: normalizeNumber(unit.lat, 0) ?? 0,
    lng: normalizeNumber(unit.lng, 0) ?? 0,
    movementTimeline,
    platoonStyle: {
      followers: Math.max(1, Math.min(8, Math.round(followers || 5))),
      spread: Math.max(0.16, Math.min(0.72, spread || 0.34)),
    },
    createdBy: unit.createdBy ?? null,
    createdAt: unit.createdAt ?? null,
    updatedBy: unit.updatedBy ?? null,
    updatedAt: unit.updatedAt ?? null,
  };
}

function getSaveStateValue(current = {}, patch = {}) {
  return {
    dirty: patch.dirty ?? current.dirty ?? false,
    saving: patch.saving ?? current.saving ?? false,
    error: patch.error ?? current.error ?? '',
    lastSavedAt: patch.lastSavedAt ?? current.lastSavedAt ?? null,
  };
}

export function MovingUnitDataProvider({ children }) {
  const { toast } = useToast();
  const [unitsState, setUnitsState] = useState([]);
  const [selectedMovingUnitId, setSelectedMovingUnitId] = useState(null);
  const [saveStates, setSaveStates] = useState({});
  const [loadingUnits, setLoadingUnits] = useState(true);
  const [unitsError, setUnitsError] = useState('');

  const unitsRef = useRef([]);
  const saveStatesRef = useRef({});
  const saveTimersRef = useRef({});
  const savePromisesRef = useRef({});
  const pendingPatchesRef = useRef({});
  const autosaveToastRef = useRef({ timer: null, count: 0 });

  const setUnits = useCallback((updater) => {
    setUnitsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      unitsRef.current = Array.isArray(next) ? next : [];
      return Array.isArray(next) ? next : [];
    });
  }, []);

  const selectMovingUnit = useCallback((id) => {
    setSelectedMovingUnitId(id);
  }, []);

  const setSaveState = useCallback((id, patch) => {
    const key = String(id);
    setSaveStates((prev) => {
      const nextValue = getSaveStateValue(prev[key], patch);
      const next = { ...prev, [key]: nextValue };
      saveStatesRef.current = next;
      return next;
    });
  }, []);

  const clearSaveState = useCallback((id) => {
    const key = String(id);
    setSaveStates((prev) => {
      if (!(key in prev)) return prev;
      const next = { ...prev };
      delete next[key];
      saveStatesRef.current = next;
      return next;
    });
  }, []);

  const replaceMovingUnitLocal = useCallback((unit) => {
    const normalized = normalizeMovingUnitEntry(unit);
    setUnits((prev) => {
      const index = prev.findIndex((entry) => String(entry.id) === String(normalized.id));
      if (index === -1) return [...prev, normalized];
      const next = prev.slice();
      next[index] = normalized;
      return next;
    });
    return normalized;
  }, [setUnits]);

  const updateMovingUnitLocal = useCallback((id, updates) => {
    let normalizedTarget = null;
    setUnits((prev) => prev.map((unit) => {
      if (String(unit.id) !== String(id)) return unit;
      normalizedTarget = normalizeMovingUnitEntry({ ...unit, ...updates });
      return normalizedTarget;
    }));
    return normalizedTarget;
  }, [setUnits]);

  const removeMovingUnitLocal = useCallback((id) => {
    setUnits((prev) => prev.filter((unit) => String(unit.id) !== String(id)));
    setSelectedMovingUnitId((prev) => (String(prev) === String(id) ? null : prev));
  }, [setUnits]);

  const queueAutosaveToast = useCallback(() => {
    autosaveToastRef.current.count += 1;
    if (autosaveToastRef.current.timer) {
      clearTimeout(autosaveToastRef.current.timer);
    }
    autosaveToastRef.current.timer = setTimeout(() => {
      const count = autosaveToastRef.current.count;
      autosaveToastRef.current.count = 0;
      autosaveToastRef.current.timer = null;
      toast.success(count > 1 ? `${count} moving unit changes saved.` : 'Moving unit saved.');
    }, 260);
  }, [toast]);

  const persistQueuedMovingUnit = useCallback((id, options = {}) => {
    const key = String(id);
    const {
      successMode = 'burst',
      successMessage = 'Moving unit saved.',
      errorMessage = 'Unable to save moving unit.',
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
            setSaveState(key, { saving: false, dirty: false, error: '' });
          }
          return;
        }

        delete pendingPatchesRef.current[key];
        setSaveState(key, { saving: true, error: '' });

        try {
          const response = await fetch(`${API_BASE_URL}/moving-units/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(patch),
          });
          const data = await response.json().catch(() => ({}));
          if (!response.ok) {
            throw new Error(data.error || errorMessage);
          }

          replaceMovingUnitLocal(data.unit);
          const hasMoreQueued = Boolean(
            pendingPatchesRef.current[key] && Object.keys(pendingPatchesRef.current[key]).length
          );
          setSaveState(key, {
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
          setSaveState(key, {
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
  }, [queueAutosaveToast, replaceMovingUnitLocal, setSaveState, toast]);

  const flushPendingMovingUnitSaves = useCallback(async (targetIds, options = {}) => {
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

    await Promise.all(uniqueIds.map((key) => persistQueuedMovingUnit(key, options).catch(() => null)));
  }, [persistQueuedMovingUnit]);

  const updateMovingUnit = useCallback((id, updates, options = {}) => {
    const key = String(id);
    const {
      mode = 'debounced',
      successMode = mode === 'debounced' ? 'burst' : 'none',
      successMessage = 'Moving unit saved.',
      errorMessage = 'Unable to save moving unit.',
    } = options;

    updateMovingUnitLocal(id, updates);
    pendingPatchesRef.current[key] = {
      ...(pendingPatchesRef.current[key] || {}),
      ...updates,
    };
    setSaveState(key, { dirty: true, error: '' });

    if (mode === 'immediate') {
      return persistQueuedMovingUnit(id, { successMode, successMessage, errorMessage });
    }

    if (saveTimersRef.current[key]) {
      clearTimeout(saveTimersRef.current[key]);
    }
    saveTimersRef.current[key] = setTimeout(() => {
      delete saveTimersRef.current[key];
      persistQueuedMovingUnit(id, { successMode, successMessage, errorMessage }).catch(() => null);
    }, AUTOSAVE_DELAY_MS);
    return Promise.resolve();
  }, [persistQueuedMovingUnit, setSaveState, updateMovingUnitLocal]);

  const createMovingUnit = useCallback(async (unit, options = {}) => {
    const {
      successMessage,
      errorMessage = 'Unable to create moving unit.',
    } = options;
    try {
      const response = await fetch(`${API_BASE_URL}/moving-units`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(unit),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || errorMessage);
      }
      const saved = replaceMovingUnitLocal(data.unit);
      setSaveState(saved.id, {
        dirty: false,
        saving: false,
        error: '',
        lastSavedAt: Date.now(),
      });
      toast.success(successMessage || `Created "${saved.name}".`);
      return saved;
    } catch (error) {
      toast.error(error.message || errorMessage);
      throw error;
    }
  }, [replaceMovingUnitLocal, setSaveState, toast]);

  const deleteMovingUnit = useCallback(async (id, options = {}) => {
    const key = String(id);
    const {
      successMessage = 'Moving unit deleted.',
      errorMessage = 'Unable to delete moving unit.',
    } = options;
    if (saveTimersRef.current[key]) {
      clearTimeout(saveTimersRef.current[key]);
      delete saveTimersRef.current[key];
    }
    delete pendingPatchesRef.current[key];
    await (savePromisesRef.current[key] || Promise.resolve()).catch(() => null);
    setSaveState(key, { saving: true, error: '' });

    try {
      const response = await fetch(`${API_BASE_URL}/moving-units/${id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || errorMessage);
      }
      removeMovingUnitLocal(id);
      clearSaveState(key);
      toast.success(successMessage);
      return data;
    } catch (error) {
      setSaveState(key, { dirty: false, saving: false, error: error.message || errorMessage });
      toast.error(error.message || errorMessage);
      throw error;
    }
  }, [clearSaveState, removeMovingUnitLocal, setSaveState, toast]);

  const refreshMovingUnits = useCallback(async () => {
    setLoadingUnits(true);
    setUnitsError('');
    try {
      const response = await fetch(`${API_BASE_URL}/moving-units`, { credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Failed to load moving units.');
      }
      setUnits(Array.isArray(data.units) ? data.units.map(normalizeMovingUnitEntry) : []);
    } catch (error) {
      setUnitsError(error.message || 'Failed to load moving units.');
      throw error;
    } finally {
      setLoadingUnits(false);
    }
  }, [setUnits]);

  const getMovingUnitSaveState = useCallback(
    (id) => saveStates[String(id)] || EMPTY_SAVE_STATE,
    [saveStates]
  );

  useEffect(() => {
    refreshMovingUnits().catch((error) => {
      console.error('Unable to load moving units', error);
    });
  }, [refreshMovingUnits]);

  useEffect(() => {
    unitsRef.current = unitsState;
  }, [unitsState]);

  useEffect(() => {
    saveStatesRef.current = saveStates;
  }, [saveStates]);

  useEffect(() => () => {
    Object.values(saveTimersRef.current).forEach((timerId) => clearTimeout(timerId));
    if (autosaveToastRef.current.timer) {
      clearTimeout(autosaveToastRef.current.timer);
    }
  }, []);

  const value = useMemo(() => ({
    movingUnits: unitsState,
    setMovingUnits: setUnits,
    selectedMovingUnitId,
    selectMovingUnit,
    loadingMovingUnits: loadingUnits,
    movingUnitsError: unitsError,
    refreshMovingUnits,
    createMovingUnit,
    updateMovingUnit,
    deleteMovingUnit,
    flushPendingMovingUnitSaves,
    replaceMovingUnitLocal,
    updateMovingUnitLocal,
    getMovingUnitSaveState,
  }), [
    unitsState,
    setUnits,
    selectedMovingUnitId,
    selectMovingUnit,
    loadingUnits,
    unitsError,
    refreshMovingUnits,
    createMovingUnit,
    updateMovingUnit,
    deleteMovingUnit,
    flushPendingMovingUnitSaves,
    replaceMovingUnitLocal,
    updateMovingUnitLocal,
    getMovingUnitSaveState,
  ]);

  return <MovingUnitDataContext.Provider value={value}>{children}</MovingUnitDataContext.Provider>;
}

export function useMovingUnits() {
  const context = useContext(MovingUnitDataContext);
  if (!context) {
    throw new Error('useMovingUnits must be used within a MovingUnitDataProvider');
  }
  return context;
}

