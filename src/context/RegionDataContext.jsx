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

const RegionDataContext = createContext(null);
const API_BASE_URL = '/api';

export function RegionDataProvider({ children }) {
  const [regionsState, setRegionsState] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState(null);
  const [loadingRegions, setLoadingRegions] = useState(true);
  const [regionsError, setRegionsError] = useState('');
  const hasLoadedRef = useRef(false);

  const setRegions = useCallback((updater) => {
    setRegionsState((prev) => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      return Array.isArray(next) ? next : [];
    });
  }, []);

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

  useEffect(() => {
    if (hasLoadedRef.current) return undefined;
    refreshRegions().catch((error) => {
      console.error('Unable to load regions', error);
    });
    return undefined;
  }, [refreshRegions]);

  const value = useMemo(
    () => ({
      regions: regionsState,
      setRegions,
      selectedRegionId,
      selectRegion,
      loadingRegions,
      regionsError,
      refreshRegions,
    }),
    [regionsState, setRegions, selectedRegionId, selectRegion, loadingRegions, regionsError, refreshRegions]
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
