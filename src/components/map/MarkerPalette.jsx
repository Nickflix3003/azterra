import React, { useMemo } from 'react';

function MarkerPalette({
  isEditorMode,
  options,
  selectedOption,
  onSelect,
  categoryOptions = [],
  groupByCategory = false,
}) {
  const categoryLookup = useMemo(
    () =>
      categoryOptions.reduce((acc, entry) => {
        acc[entry.id] = entry.label;
        return acc;
      }, {}),
    [categoryOptions]
  );

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
    if (fallback.options.length) {
      result.push(fallback);
    }
    return result.filter((group) => group.options.length);
  }, [categoryOptions, groupByCategory, options]);

  if (!isEditorMode) return null;

  const renderOption = (option) => (
    <button
      key={option.iconKey}
      type="button"
      className={`marker-palette__item ${
        selectedOption && selectedOption.iconKey === option.iconKey
          ? 'marker-palette__item--active'
          : ''
      }`}
      onClick={() => onSelect(option)}
    >
      <img
        src={`/icons/cities/${option.iconKey}.png`}
        alt={option.label}
        width={32}
        height={32}
        loading="lazy"
      />
      <span>{option.label}</span>
      {groupByCategory && (
        <small>{categoryLookup[option.type] || 'Other'}</small>
      )}
    </button>
  );

  return (
    <div className="marker-palette">
      <div className="marker-palette__header">
        <h3>Marker Palette</h3>
        <p>Select an icon, then click the map to place it.</p>
      </div>
      {groupByCategory ? (
        <div className="marker-palette__groups">
          {groupedOptions.map((group) => (
            <div key={group.id} className="marker-palette__group">
              <div className="marker-palette__group-header">
                <span>{group.label}</span>
                <small>{group.options.length} icons</small>
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
