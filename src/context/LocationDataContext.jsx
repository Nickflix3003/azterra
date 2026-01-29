/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo, useState, useCallback } from 'react';

const LocationDataContext = createContext(null);

export function LocationDataProvider({ children }) {
  const [locations, setLocations] = useState([]);
  const [selectedLocationId, setSelectedLocationId] = useState(null);

  const selectLocation = useCallback((id) => {
    setSelectedLocationId(id);
  }, []);

  const value = useMemo(
    () => ({
      locations,
      setLocations,
      selectedLocationId,
      selectLocation,
    }),
    [locations, selectedLocationId, selectLocation]
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
