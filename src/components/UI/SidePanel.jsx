import React from 'react';
import { Link } from 'react-router-dom';
import './UI.css';

function SidePanel({ location, onClose }) {
  if (!location) return null;

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
