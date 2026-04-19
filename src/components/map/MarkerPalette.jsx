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
    const fallback = { id: 'other', label: 'Other', options: [] };
    const map = baseGroups.reduce((acc, entry) => {
      acc[entry.id] = entry;
      return acc;
    }, {});
    options.forEach((option) => {
      const group = map[option.type] || fallback;
      group.options.push(option);
    });
    const result = [...baseGroups];
    if (fallback.options.length) result.push(fallback);
    return result.filter((group) => group.options.length);
  }, [categoryOptions, groupByCategory, options]);

  if (!isEditorMode) return null;

  const buildSrc = (iconKey) => `${ICON_BASE_URL}${iconKey}.svg`;

  const handleDragStart = (e, option) => {
    e.dataTransfer.effectAllowed = 'copy';
    e.dataTransfer.setData('application/x-marker', JSON.stringify(option));
    // Use the icon as the drag ghost image
    const img = e.currentTarget.querySelector('img');
    if (img) e.dataTransfer.setDragImage(img, 18, 18);
  };

  const renderOption = (option) => {
    const isActive = selectedOption && selectedOption.iconKey === option.iconKey;
    return (
      <button
        key={option.iconKey}
        type="button"
        draggable
        className={`marker-palette__item ${isActive ? 'marker-palette__item--active' : ''}`}
        onClick={() => onSelect(option)}
        onDragStart={(e) => handleDragStart(e, option)}
        title={`${option.label} — click to select, drag to place`}
      >
        <img
          src={buildSrc(option.iconKey)}
          alt={option.label}
          width={36}
          height={36}
          loading="lazy"
          draggable={false}
        />
        <span>{option.label}</span>
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
              <div className="marker-palette__grid">
                {group.options.map(renderOption)}
              </div>
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
