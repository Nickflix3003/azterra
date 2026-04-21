import React from 'react';
import { Link } from 'react-router-dom';
import './UI.css';

function SidePanel({ location, region, regionLocations = [], onClose, onSelectLocation }) {
  if (!location && !region) return null;

  if (region && !location) {
    return (
      <div className="side-panel custom-scrollbar">
        <div className="side-panel-header">
          <div>
            {region.category && (
              <p className="side-panel-type">{region.category}</p>
            )}
            <h2>{region.name}</h2>
          </div>
          <button className="close-button" onClick={onClose} aria-label="Close">×</button>
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

          <Link
            to="/atlas"
            className="side-panel-atlas-btn"
            onClick={onClose}
          >
            <span className="side-panel-atlas-btn__icon">🗺️</span>
            <span className="side-panel-atlas-btn__text">
              <strong>View full atlas</strong>
              <small>Browse all kingdoms, lore, and locations</small>
            </span>
            <span className="side-panel-atlas-btn__arrow">›</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="side-panel custom-scrollbar">
      <div className="side-panel-header">
        <div>
          {location.type && (
            <p className="side-panel-type">{location.type}</p>
          )}
          <h2>{location.name}</h2>
        </div>
        <button className="close-button" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="side-panel-content">
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

        {!location.lore && !location.description && (
          <p className="side-panel-empty">No lore or description added yet.</p>
        )}

        <Link
          to={`/atlas?loc=${location.id}`}
          className="side-panel-atlas-btn"
          onClick={onClose}
        >
          <span className="side-panel-atlas-btn__icon">🗺️</span>
          <span className="side-panel-atlas-btn__text">
            <strong>View full entry in Atlas</strong>
            <small>Gallery, lore, characters &amp; more</small>
          </span>
          <span className="side-panel-atlas-btn__arrow">›</span>
        </Link>
      </div>
    </div>
  );
}

export default SidePanel;
