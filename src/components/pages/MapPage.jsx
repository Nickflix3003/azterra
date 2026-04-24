import React, { useState, useEffect } from 'react';
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

  // Mobile FAB open/closed state (FAB itself is hidden on desktop via CSS)
  const [mobileToolbarOpen, setMobileToolbarOpen] = useState(false);

  const { role } = useAuth();
  const canEdit = ['player', 'editor', 'admin'].includes(role);

  const toggleEditorMode = () => setIsEditorMode((prev) => !prev);
  const toggleFilters    = () => setFiltersOpen((prev) => !prev);
  const toggleTimeline   = () => setTimelineActive((prev) => !prev);
  const toggleMobileToolbar = () => setMobileToolbarOpen((prev) => !prev);

  // Close mobile toolbar when clicking outside of it
  useEffect(() => {
    if (!mobileToolbarOpen) return;
    const handler = (e) => {
      if (!e.target.closest('.map-mobile-fab') && !e.target.closest('.map-mobile-fab-menu')) {
        setMobileToolbarOpen(false);
      }
    };
    document.addEventListener('pointerdown', handler, { passive: true });
    return () => document.removeEventListener('pointerdown', handler);
  }, [mobileToolbarOpen]);

  return (
    <div className="map-page map-page--full">

      {/* ── Desktop toolbar ──────────────────────────────────── */}
      <div className="map-toolbar map-toolbar--desktop">
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

      {/* ── Mobile slim header ───────────────────────────────── */}
      <div className="map-toolbar map-toolbar--mobile">
        <div className="map-toolbar__brand">
          <div className="map-ribbon__sigil map-ribbon__sigil--sm">A</div>
          <h1 className="map-title map-title--mobile">Azterra</h1>
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
            hoveredEntity={hoveredTimelineEntity}
            onLocationHoverChange={setHoveredTimelineEntity}
            onRegionHoverChange={setHoveredTimelineEntity}
          />
        </div>

        {/* Timeline (always rendered, starts collapsed) */}
        <Timeline
          currentYear={currentYear}
          onYearChange={setCurrentYear}
          timelineActive={timelineActive}
          onToggle={toggleTimeline}
          isEditorMode={isEditorMode}
          canManageEras={canEdit}
          hoveredEntity={hoveredTimelineEntity}
          onHoverEntityChange={setHoveredTimelineEntity}
          minYear={TIMELINE_MIN}
          maxYear={TIMELINE_MAX}
        />
      </div>

      {/* ── Mobile FAB (Floating Action Button) ─────────────── */}
      {/* Only rendered on mobile via CSS; gives access to filters / editor toggle */}
      <div className="map-mobile-fab-group">
        {/* Expanded actions (shown when FAB is open) */}
        {mobileToolbarOpen && (
          <div className="map-mobile-fab-menu" role="menu" aria-label="Map actions">
            <button
              type="button"
              className={`map-mobile-fab-item ${filtersOpen ? 'map-mobile-fab-item--active' : ''}`}
              onClick={() => { toggleFilters(); setMobileToolbarOpen(false); }}
              role="menuitem"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
              </svg>
              <span>Filters</span>
            </button>

            <button
              type="button"
              className={`map-mobile-fab-item ${timelineActive ? 'map-mobile-fab-item--active' : ''}`}
              onClick={() => { toggleTimeline(); setMobileToolbarOpen(false); }}
              role="menuitem"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="10" />
                <polyline points="12 6 12 12 16 14" />
              </svg>
              <span>{timelineActive ? 'Hide Era' : 'Era Timeline'}</span>
            </button>

            {canEdit && (
              <button
                type="button"
                className={`map-mobile-fab-item ${isEditorMode ? 'map-mobile-fab-item--active' : ''}`}
                onClick={() => { toggleEditorMode(); setMobileToolbarOpen(false); }}
                role="menuitem"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
                <span>{isEditorMode ? 'Exit Editor' : 'Edit Map'}</span>
              </button>
            )}
          </div>
        )}

        {/* FAB toggle button */}
        <button
          type="button"
          className={`map-mobile-fab ${mobileToolbarOpen ? 'map-mobile-fab--open' : ''}`}
          onClick={toggleMobileToolbar}
          aria-label={mobileToolbarOpen ? 'Close map actions' : 'Open map actions'}
          aria-expanded={mobileToolbarOpen}
        >
          {mobileToolbarOpen ? (
            /* X icon */
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" aria-hidden="true">
              <line x1="18" y1="6"  x2="6"  y2="18" />
              <line x1="6"  y1="6"  x2="18" y2="18" />
            </svg>
          ) : (
            /* Map layers / options icon */
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <polygon points="12 2 2 7 12 12 22 7 12 2" />
              <polyline points="2 17 12 22 22 17" />
              <polyline points="2 12 12 17 22 12" />
            </svg>
          )}
        </button>
      </div>

    </div>
  );
}
