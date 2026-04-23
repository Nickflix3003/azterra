/**
 * MarkerPalette.jsx
 *
 * Displays all available marker icon options in grouped category rows.
 * Supports both click-to-select and drag-to-place interactions.
 *
 * Drag behaviour:
 *   - Each item is draggable.
 *   - onDragStart stores the option as 'application/x-marker' in dataTransfer.
 *   - Drop is handled by the map container in InteractiveMap.
 */

import React, { useMemo } from 'react';
import { ICON_BASE_URL } from '../../constants/mapConstants';

function MarkerPalette({
  isEditorMode,
  options,
  selectedOption,
  onSelect,
  categoryOptions = [],
  groupByCategory = false,
}) {
  const groupedOptions = useMemo(() => {
    if (!groupByCategory) return [];
    const baseGroups = categoryOptions.map((entry) => ({
      id: entry.id,
      label: entry.label,
      options: [],
    }));
    const groupMap = baseGroups.reduce((acc, entry) => {
      acc[entry.id] = entry;
      return acc;
    }, {});
    options.forEach((option) => {
      const group = groupMap[option.group || option.type] || groupMap.other;
      if (group) {
        group.options.push(option);
      }
    });
    return baseGroups;
  }, [categoryOptions, groupByCategory, options]);

  if (!isEditorMode) return null;

  const buildSrc = (iconKey) => `${ICON_BASE_URL}${iconKey}.svg`;

  const handleDragStart = (event, option) => {
    event.dataTransfer.effectAllowed = 'copy';
    event.dataTransfer.setData('application/x-marker', JSON.stringify(option));
    const img = event.currentTarget.querySelector('img');
    if (img) event.dataTransfer.setDragImage(img, 18, 18);
  };

  const renderOption = (option) => {
    const isActive = selectedOption && selectedOption.iconKey === option.iconKey;
    const buttonLabel = option.type ? `${option.type} marker` : 'Marker';
    return (
      <button
        key={option.iconKey}
        type="button"
        draggable
        className={`marker-palette__item ${isActive ? 'marker-palette__item--active' : ''}`}
        onClick={() => onSelect(option)}
        onDragStart={(event) => handleDragStart(event, option)}
        title="Click to select, drag to place"
        aria-label={buttonLabel}
      >
        <img
          src={buildSrc(option.iconKey)}
          alt=""
          width={36}
          height={36}
          loading="lazy"
          draggable={false}
        />
      </button>
    );
  };

  return (
    <div className="marker-palette">
      <p className="marker-palette__hint">
        Click to select · Drag onto map to place
      </p>
      {groupByCategory ? (
        <div className="marker-palette__groups">
          {groupedOptions.map((group) => (
            <div key={group.id} className="marker-palette__group">
              <div className="marker-palette__group-header">
                <span>{group.label}</span>
                <small>{group.options.length}</small>
              </div>
              {group.options.length ? (
                <div className="marker-palette__grid">
                  {group.options.map(renderOption)}
                </div>
              ) : (
                <p className="marker-palette__empty">No icons yet</p>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="marker-palette__grid">{options.map(renderOption)}</div>
      )}
    </div>
  );
}

export default MarkerPalette;
