import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import InteractiveMap from '../map/InteractiveMap';
import Timeline from '../map/Timeline';
import './MapPage.css';

const TIMELINE_MIN = -50;
const TIMELINE_MAX = 1000;

export default function MapPage() {
  const [isEditorMode,   setIsEditorMode]   = useState(false);
  const [filtersOpen,    setFiltersOpen]    = useState(false);
  const [currentYear,    setCurrentYear]    = useState(500);
  const [timelineActive, setTimelineActive] = useState(false);
  const [hoveredTimelineEntity, setHoveredTimelineEntity] = useState(null);

  const { role } = useAuth();
  const canEdit = ['player', 'editor', 'admin'].includes(role);

  const toggleEditorMode = () => setIsEditorMode((prev) => !prev);
  const toggleFilters    = () => setFiltersOpen((prev) => !prev);
  const toggleTimeline   = () => setTimelineActive((prev) => !prev);

  return (
    <div className="map-page map-page--full">
      <div className="map-toolbar">
        <div className="map-toolbar__brand">
          <div className="map-ribbon__sigil">A</div>
          <div>
            <p className="map-eyebrow">World Map</p>
            <h1 className="map-title">Azterra</h1>
          </div>
        </div>
        <div className="map-toolbar__actions">
          <Link to="/about#map" className="map-link">
            About this map
          </Link>
          {canEdit && (
            <button
              type="button"
              className={`editor-toggle ${isEditorMode ? 'editor-toggle--active' : ''}`}
              onClick={toggleEditorMode}
              aria-pressed={isEditorMode}
            >
              {isEditorMode ? 'Editing mode' : 'View mode'}
            </button>
          )}
          <button
            type="button"
            className="map-filter-toggle"
            onClick={toggleFilters}
            aria-expanded={filtersOpen}
          >
            Filters
          </button>
        </div>
      </div>

      <div className="map-page__frame">
        <div className="map-page__canvas">
          <InteractiveMap
            isEditorMode={isEditorMode}
            filtersOpen={filtersOpen}
            onToggleFilters={toggleFilters}
            currentYear={currentYear}
            timelineActive={timelineActive}
            onLocationHoverChange={setHoveredTimelineEntity}
            onRegionHoverChange={setHoveredTimelineEntity}
          />
        </div>
        <Timeline
          currentYear={currentYear}
          onYearChange={setCurrentYear}
          timelineActive={timelineActive}
          onToggle={toggleTimeline}
          isEditorMode={isEditorMode}
          canManageEras={canEdit}
          hoveredEntity={hoveredTimelineEntity}
          minYear={TIMELINE_MIN}
          maxYear={TIMELINE_MAX}
        />
      </div>
    </div>
  );
}
