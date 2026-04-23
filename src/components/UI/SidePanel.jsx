import React from 'react';
import { Link } from 'react-router-dom';
import { useRegions } from '../../context/RegionDataContext';
import './UI.css';

function SidePanel({
  location,
  region,
  regionLocations = [],
  onClose,
  onSelectLocation,
  isClosing = false,
}) {
  const { regions } = useRegions();
  if (!location && !region) return null;
  const imageDisplayMode = location?.imageDisplayMode || 'cover';

  const formatLocationMeta = (entry) => {
    const typeLabel = entry?.type ? String(entry.type).trim() : '';
    const categoryLabel = entry?.category ? String(entry.category).trim() : '';
    const regionName = entry?.regionId != null
      ? regions.find((candidate) => String(candidate.id) === String(entry.regionId))?.name || ''
      : '';
    const meta = [];
    if (typeLabel) meta.push({ label: 'Type', value: typeLabel });
    if (categoryLabel && categoryLabel.toLowerCase() !== typeLabel.toLowerCase()) {
      meta.push({ label: 'Category', value: categoryLabel });
    }
    if (regionName) meta.push({ label: 'Region', value: regionName });
    return meta;
  };

  const formatEra = (entry) => {
    const hasStart = entry?.timeStart != null;
    const hasEnd = entry?.timeEnd != null;
    if (!hasStart && !hasEnd) return '';
    if (hasStart && hasEnd) return `${entry.timeStart}–${entry.timeEnd}`;
    if (hasStart) return `From ${entry.timeStart}`;
    return `Until ${entry.timeEnd}`;
  };

  if (region && !location) {
    return (
      <div className={`side-panel custom-scrollbar ${isClosing ? 'side-panel--closing' : ''}`}>
        <div className="side-panel-header">
          <div>
            {region.category && <p className="side-panel-type">{region.category}</p>}
            <h2>{region.name}</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close">
            x
          </button>
        </div>

        <div className="side-panel-content">
          {region.description && (
            <div className="side-panel-section">
              <h3>Description</h3>
              <p>{region.description}</p>
            </div>
          )}

          {region.lore && (
            <div className="side-panel-section">
              <h3>Lore</h3>
              <p>{region.lore}</p>
            </div>
          )}

          <div className="side-panel-section">
            <h3>Locations</h3>
            {regionLocations.length ? (
              <div className="side-panel-location-list">
                {regionLocations.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    className="side-panel-location-item"
                    onClick={() => onSelectLocation?.(entry)}
                  >
                    <span className="side-panel-location-item__name">{entry.name}</span>
                    <span className="side-panel-location-item__type">{entry.type || 'Location'}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="side-panel-empty">No linked locations yet.</p>
            )}
          </div>

          {!region.description && !region.lore && !regionLocations.length && (
            <p className="side-panel-empty">No lore or linked locations added yet.</p>
          )}

          <Link to="/atlas" className="side-panel-atlas-btn" onClick={onClose}>
            <span className="side-panel-atlas-btn__icon">A</span>
            <span className="side-panel-atlas-btn__text">
              <strong>View full atlas</strong>
              <small>Browse all kingdoms, lore, and locations</small>
            </span>
            <span className="side-panel-atlas-btn__arrow">{'>'}</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className={`side-panel custom-scrollbar ${isClosing ? 'side-panel--closing' : ''}`}>
      <div className="side-panel-header">
        <div>
          {location.type && <p className="side-panel-type">{location.type}</p>}
          <h2>{location.name}</h2>
        </div>
        <button className="close-button" onClick={onClose} aria-label="Close">
          x
        </button>
      </div>

      <div className="side-panel-content">
        {formatLocationMeta(location).length > 0 && (
          <div className="side-panel-meta">
            {formatLocationMeta(location).map((item) => (
              <div key={item.label} className="side-panel-meta__item">
                <span className="side-panel-meta__label">{item.label}</span>
                <strong className="side-panel-meta__value">{item.value}</strong>
              </div>
            ))}
          </div>
        )}

        {location.imageUrl ? (
          <div className={`side-panel-image-wrap side-panel-image-wrap--${imageDisplayMode}`}>
            <img
              className="side-panel-image"
              src={location.imageUrl}
              alt={location.name || 'Location'}
            />
          </div>
        ) : null}

        {location.lore && (
          <div className="side-panel-section">
            <h3>Lore</h3>
            <p>{location.lore}</p>
          </div>
        )}

        {location.description && (
          <div className="side-panel-section">
            <h3>Description</h3>
            <p>{location.description}</p>
          </div>
        )}

        {formatEra(location) ? (
          <div className="side-panel-section">
            <h3>Era</h3>
            <p>{formatEra(location)}</p>
          </div>
        ) : null}

        <div className="side-panel-action-stack">
          {location.hasLocalMap && (
            <Link
              to={`/location/${location.id}/map`}
              className="side-panel-atlas-btn side-panel-atlas-btn--map"
              onClick={onClose}
            >
            <span className="side-panel-atlas-btn__icon">M</span>
              <span className="side-panel-atlas-btn__text">
                <strong>Open local map</strong>
                <small>Explore this major location in detail</small>
              </span>
              <span className="side-panel-atlas-btn__arrow">{'>'}</span>
            </Link>
          )}

          <Link to={`/atlas?loc=${location.id}`} className="side-panel-atlas-btn" onClick={onClose}>
            <span className="side-panel-atlas-btn__icon">A</span>
            <span className="side-panel-atlas-btn__text">
              <strong>View full entry in Atlas</strong>
              <small>Gallery, lore, characters &amp; more</small>
            </span>
            <span className="side-panel-atlas-btn__arrow">{'>'}</span>
          </Link>
        </div>
      </div>
    </div>
  );
}

export default SidePanel;
