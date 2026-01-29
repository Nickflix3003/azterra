/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';

const RegionDataContext = createContext(null);

export function RegionDataProvider({ children }) {
  const [regions, setRegions] = useState([]);
  const [selectedRegionId, setSelectedRegionId] = useState(null);

  const selectRegion = useCallback((id) => {
    setSelectedRegionId(id);
  }, []);

  const value = useMemo(
    () => ({
      regions,
      setRegions,
      selectedRegionId,
      selectRegion,
    }),
    [regions, selectedRegionId, selectRegion]
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
