import React from 'react';
import { useMapEffects } from '../../context/MapEffectsContext';

const MARKER_FILTERS = [
  { key: 'city', label: 'Cities' },
  { key: 'dungeon', label: 'Dungeons' },
  { key: 'ruins', label: 'Ruins' },
  { key: 'town', label: 'Towns' },
  { key: 'landmark', label: 'Landmarks' },
  { key: 'npc', label: 'NPCs' },
  { key: 'custom', label: 'Custom' },
  { key: 'generic', label: 'Other' },
];

const PARTICLE_FILTERS = [
  { key: 'snow', label: 'Snow' },
  { key: 'leaves', label: 'Leaves' },
  { key: 'embers', label: 'Embers' },
  { key: 'magic', label: 'Magic Particles' },
  { key: 'weather', label: 'Weather Overlays' },
];

function FilterSection({ title, children }) {
  return (
    <section className="filter-hover-tab__section">
      <h4>{title}</h4>
      <div className="filter-hover-tab__grid">{children}</div>
    </section>
  );
}

function FilterToggle({ label, checked, onChange }) {
  return (
    <label className="filter-hover-tab__toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function FilterHoverPanel({
  isOpen = false,
  showMarkers,
  markerFilters = {},
  onToggleMarkers,
  onToggleMarkerCategory,
  showRegions,
  onToggleRegions,
  particleFilters = {},
  onToggleParticle,
}) {
  const {
    cloudsEnabled,
    fogEnabled,
    vignetteEnabled,
    heatmapMode,
    troopEffectsEnabled,
    setCloudsEnabled,
    setFogEnabled,
    setVignetteEnabled,
    setHeatmapMode,
    setTroopEffectsEnabled,
  } = useMapEffects();

  const heatmapEnabled = heatmapMode !== 'none';

  const handleHeatmapToggle = () => {
    setHeatmapMode(heatmapEnabled ? 'none' : 'population');
  };

  return (
    <div className={`filter-hover-tab ${isOpen ? 'filter-hover-tab--open' : ''}`} aria-label="Map filters">
      <div className="filter-hover-tab__panel" role="region" aria-hidden={!isOpen}>
        <FilterSection title="Markers">
          <FilterToggle label="Show all markers" checked={showMarkers} onChange={onToggleMarkers} />
          {MARKER_FILTERS.map((entry) => (
            <FilterToggle
              key={entry.key}
              label={entry.label}
              checked={markerFilters[entry.key] !== false}
              onChange={(value) => onToggleMarkerCategory(entry.key, value)}
            />
          ))}
        </FilterSection>

        <FilterSection title="Regions">
          <FilterToggle label="Show regions" checked={showRegions} onChange={onToggleRegions} />
        </FilterSection>

        <FilterSection title="Particles">
          {PARTICLE_FILTERS.map((entry) => (
            <FilterToggle
              key={entry.key}
              label={entry.label}
              checked={particleFilters[entry.key] !== false}
              onChange={(value) => onToggleParticle(entry.key, value)}
            />
          ))}
        </FilterSection>

        <FilterSection title="Map Effects">
          <FilterToggle label="Fog" checked={fogEnabled} onChange={(value) => setFogEnabled(value)} />
          <FilterToggle
            label="Clouds"
            checked={cloudsEnabled}
            onChange={(value) => setCloudsEnabled(value)}
          />
          <FilterToggle
            label="Vignette"
            checked={vignetteEnabled}
            onChange={(value) => setVignetteEnabled(value)}
          />
          <FilterToggle label="Heatmap" checked={heatmapEnabled} onChange={handleHeatmapToggle} />
          <FilterToggle
            label="Troops (High Cost)"
            checked={troopEffectsEnabled}
            onChange={(value) => setTroopEffectsEnabled(value)}
          />
        </FilterSection>
      </div>
    </div>
  );
}

export default FilterHoverPanel;
