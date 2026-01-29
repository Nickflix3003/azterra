/* eslint-disable react-refresh/only-export-components */
import React, { createContext, useContext, useMemo, useState } from 'react';

const MapEffectsContext = createContext({
  cloudsEnabled: true,
  fogEnabled: true,
  vignetteEnabled: true,
  heatmapMode: 'none',
  intensities: { clouds: 0.9, fog: 0.9, vignette: 1 },
  setCloudsEnabled: () => {},
  setFogEnabled: () => {},
  setVignetteEnabled: () => {},
  setHeatmapMode: () => {},
  setIntensity: () => {},
});

export function MapEffectsProvider({ children }) {
  const [cloudsEnabled, setCloudsEnabled] = useState(true);
  const [fogEnabled, setFogEnabled] = useState(true);
  const [vignetteEnabled, setVignetteEnabled] = useState(true);
  const [heatmapMode, setHeatmapMode] = useState('none');
  const [intensities, setIntensities] = useState({ clouds: 0.9, fog: 0.9, vignette: 1 });

  const setIntensity = (key, value) => {
    setIntensities((prev) => ({ ...prev, [key]: value }));
  };

  const value = useMemo(
    () => ({
      cloudsEnabled,
      fogEnabled,
      vignetteEnabled,
      heatmapMode,
      intensities,
      setCloudsEnabled,
      setFogEnabled,
      setVignetteEnabled,
      setHeatmapMode,
      setIntensity,
    }),
    [cloudsEnabled, fogEnabled, vignetteEnabled, heatmapMode, intensities]
  );

  return <MapEffectsContext.Provider value={value}>{children}</MapEffectsContext.Provider>;
}

export function useMapEffects() {
  return useContext(MapEffectsContext);
}
