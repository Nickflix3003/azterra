/**
 * EditorSidePanel.jsx
 *
 * The right-hand editor drawer.  Four views: Home, Markers, Regions, Labels.
 *
 * UX rules:
 *  - Auto-navigates to Markers > Edit when a location becomes selected.
 *  - Disables placement / region-mode controls for non-editor roles.
 *  - Sub-region workflow exposed when a target region is active.
 *  - Resizable via drag handle on the left edge.
 */

import React, { useEffect, useMemo, useState } from 'react';
import RegionInfoPanel from './RegionInfoPanel';

// ─── Constants ────────────────────────────────────────────────────────────────

const PANEL_VIEWS = {
  HOME:    'home',
  MARKERS: 'markers',
  REGIONS: 'regions',
  LABELS:  'labels',
  ADMIN:   'admin',
};

const LABEL_COLORS = [
  '#fef3c7', '#fde68a', '#facc15', '#f97316',
  '#c084fc', '#93c5fd', '#e5e7eb', '#fca5a5',
];

const LABEL_FONTS = [
  { id: 'cinzel',   label: 'Cinzel',          value: "'Cinzel','Cormorant Garamond',serif" },
  { id: 'playfair', label: 'Playfair Display', value: "'Playfair Display','Times New Roman',serif" },
  { id: 'inter',    label: 'Inter',            value: "'Inter','Segoe UI',sans-serif" },
  { id: 'uncial',   label: 'Uncial',           value: "'Uncial Antiqua','Georgia',serif" },
];

// ─── SVG icon helpers (inline, no external dep) ───────────────────────────────

const IconPin = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/>
    <circle cx="12" cy="10" r="3"/>
  </svg>
);

const IconRegion = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/>
  </svg>
);

const IconLabel = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z"/>
    <line x1="7" y1="7" x2="7.01" y2="7"/>
  </svg>
);

const IconSettings = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="3"/>
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
  </svg>
);

// ─── Component ────────────────────────────────────────────────────────────────

function EditorSidePanel({
  isEditorMode,
  markerPalette,
  diagnosticsPanel = null,
  regions = [],
  activeRegionId,
  onSelectRegion,
  onFocusRegion,
  onDeleteRegion,
  onRegionFieldChange,
  onMergeRegion,
  isRegionMode,
  onToggleRegionMode,
  regionDraftPoints = [],
  onFinishRegion,
  onResetRegionDraft,
  canAssignSelection = false,
  onAssignSelection,
  selectedRegionName = '',
  selectedLocationName = '',
  canAutoSave = false,
  hasActiveEdit = false,
  onStartSubregion,
  onCancelSubregion,
  regionDraftTargetId,
  labels = [],
  showMapLabels = true,
  onToggleLabels,
  onStartPlaceLabel,
  isPlacingLabel = false,
  onLabelFieldChange,
  onDeleteLabel,
  mapZoom = 0,
}) {
  const [view, setView]               = useState(PANEL_VIEWS.HOME);
  const [panelWidth, setPanelWidth]   = useState(420);
  const [expandedRegions, setExpandedRegions] = useState(() => new Set());
  const isResizingRef = React.useRef(false);

  // ── Reset to home when editor mode turns off ───────────────────────────────
  useEffect(() => {
    if (!isEditorMode) setView(PANEL_VIEWS.HOME);
  }, [isEditorMode]);

  // ── Panel resize ───────────────────────────────────────────────────────────
  const handleResizeStart = (event) => {
    event.preventDefault();
    isResizingRef.current = true;
    const startX     = event.clientX;
    const startWidth = panelWidth;

    const handleMouseMove = (moveEvent) => {
      if (!isResizingRef.current) return;
      const delta     = moveEvent.clientX - startX;
      const nextWidth = Math.min(Math.max(startWidth + delta, 300), 640);
      setPanelWidth(nextWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup',   handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup',   handleMouseUp);
  };

  const regionCountLabel = useMemo(() => {
    if (!regions.length) return 'No regions yet';
    return `${regions.length} region${regions.length === 1 ? '' : 's'}`;
  }, [regions]);

  if (!isEditorMode) return null;

  // ── Views ─────────────────────────────────────────────────────────────────

  const renderHome = () => (
    <div className="editor-side-panel__home-grid">
      <button
        type="button"
        className="editor-side-panel__home-card"
        onClick={() => { setView(PANEL_VIEWS.MARKERS); setMarkerView('palette'); }}
      >
        <span className="editor-side-panel__home-icon"><IconPin /></span>
        <span className="editor-side-panel__home-eyebrow">Tools</span>
        <strong>Markers</strong>
        <p>Drop, edit, and manage icons on the map.</p>
      </button>

      <button
        type="button"
        className="editor-side-panel__home-card"
        onClick={() => setView(PANEL_VIEWS.REGIONS)}
      >
        <span className="editor-side-panel__home-icon"><IconRegion /></span>
        <span className="editor-side-panel__home-eyebrow">Tools</span>
        <strong>Regions</strong>
        <p>Create areas, adjust colors, and assign markers.</p>
      </button>

      <button
        type="button"
        className="editor-side-panel__home-card"
        onClick={() => setView(PANEL_VIEWS.LABELS)}
      >
        <span className="editor-side-panel__home-icon"><IconLabel /></span>
        <span className="editor-side-panel__home-eyebrow">Tools</span>
        <strong>Labels</strong>
        <p>Place names and titles anywhere on the map.</p>
      </button>

      <div className="editor-side-panel__home-card editor-side-panel__home-card--disabled">
        <span className="editor-side-panel__home-icon editor-side-panel__home-icon--muted"><IconSettings /></span>
        <span className="editor-side-panel__home-eyebrow">Coming Soon</span>
        <strong>World Settings</strong>
        <p>Shared editor presets and automation.</p>
      </div>

      {!canAutoSave && (
        <div className="editor-side-panel__access-note">
          You have view-only access. Contact an admin to become an editor.
        </div>
      )}
    </div>
  );

  const renderMarkers = () => (
    <div className="editor-side-panel__section">
      <div className="editor-side-panel__section-body">
        <div className="editor-side-panel__section-header">
          <h3>Marker Palette</h3>
          <p>Select an icon, then click the map to place it. Click a marker to edit its details.</p>
        </div>
        {markerPalette}
      </div>
    </div>
  );

  const renderRegions = () => {
    const targetRegion = regionDraftTargetId
      ? regions.find((r) => r.id === regionDraftTargetId)
      : null;

    return (
      <>
        <div className="editor-side-panel__section">
          <div className="editor-side-panel__section-body">

            {/* Region drawing controls */}
            <div className="editor-side-panel__actions-grid">
              <article className="editor-side-panel__action-card">
                <header>
                  <h4>Draw Regions</h4>
                  <p>Click to place polygon points. Double-click to finish.</p>
                </header>
                <button
                  type="button"
                  className={`toolbox-button ${isRegionMode ? 'toolbox-button--active' : ''}`}
                  onClick={onToggleRegionMode}
                  disabled={!canAutoSave}
                  title={!canAutoSave ? 'Editor access required' : undefined}
                >
                  {isRegionMode ? 'Exit Region Mode' : 'Enter Region Mode'}
                </button>

                {isRegionMode && (
                  <div className="editor-side-panel__region-draft">
                    <span className="editor-side-panel__draft-count">
                      {regionDraftPoints.length} point{regionDraftPoints.length !== 1 ? 's' : ''}
                      {targetRegion ? ` — adding to "${targetRegion.name}"` : ''}
                    </span>
                    <div>
                      <button
                        type="button"
                        className="toolbox-button toolbox-button--primary"
                        onClick={onFinishRegion}
                        disabled={regionDraftPoints.length < 3}
                        title={regionDraftPoints.length < 3 ? 'Need at least 3 points' : undefined}
                      >
                        Finish
                      </button>
                      <button
                        type="button"
                        className="toolbox-button toolbox-button--ghost"
                        onClick={onResetRegionDraft}
                      >
                        Clear
                      </button>
                      {regionDraftTargetId && (
                        <button
                          type="button"
                          className="toolbox-button toolbox-button--ghost"
                          onClick={onCancelSubregion}
                        >
                          Cancel Sub
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </article>
            </div>

            {/* Region list */}
            <div className="editor-side-panel__section-header">
              <h3>Regions</h3>
              <p>{regionCountLabel}</p>
            </div>

            <div className="region-list custom-scrollbar">
              {regions.length === 0 && (
                <p className="region-list__empty">No regions yet. Use region mode to create one.</p>
              )}
              {regions.map((region) => (
                <div
                  key={region.id}
                  className={`region-item ${activeRegionId === region.id ? 'region-item--active' : ''}`}
                >
                  <button
                    type="button"
                    className="region-item__select"
                    onClick={() => {
                      onSelectRegion(region.id);
                      setExpandedRegions((prev) => {
                        const next = new Set(prev);
                        if (next.has(region.id)) next.delete(region.id);
                        else next.add(region.id);
                        return next;
                      });
                    }}
                  >
                    <span
                      className="region-item__color"
                      style={{ backgroundColor: region.color || '#f97316' }}
                    />
                    <span className="region-item__name">{region.name}</span>
                  </button>

                  <div className="region-item__actions">
                    <button type="button" onClick={() => onFocusRegion(region.id)}>
                      Focus
                    </button>
                    {canAutoSave && onStartSubregion && (
                      <button
                        type="button"
                        onClick={() => {
                          onStartSubregion(region.id);
                          setView(PANEL_VIEWS.REGIONS);
                        }}
                        title="Draw an additional polygon for this region"
                      >
                        + Part
                      </button>
                    )}
                    {canAutoSave && (
                      <button
                        type="button"
                        className="region-item__action--danger"
                        onClick={() => onDeleteRegion(region.id)}
                      >
                        Delete
                      </button>
                    )}
                  </div>

                  {expandedRegions.has(region.id) && (
                    <div className="region-item__details">
                      <RegionInfoPanel
                        region={region}
                        isOpen
                        onFieldChange={(id, field, value) => onRegionFieldChange?.(field, value, id)}
                        onDelete={(id) => onDeleteRegion(id)}
                        onClose={() =>
                          setExpandedRegions((prev) => {
                            const next = new Set(prev);
                            next.delete(region.id);
                            return next;
                          })
                        }
                        onMergeRegion={(targetId, sourceId) => onMergeRegion?.(targetId, sourceId)}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>

        {canAssignSelection && (
          <div className="editor-side-panel__section">
            <button type="button" className="assign-region-button" onClick={onAssignSelection}>
              Assign &ldquo;{selectedLocationName || 'marker'}&rdquo; to &ldquo;{selectedRegionName || 'region'}&rdquo;
            </button>
          </div>
        )}
      </>
    );
  };

  const renderLabels = () => {
    const defaultFont = LABEL_FONTS[0].value;
    return (
      <div className="editor-side-panel__section">
        <div className="editor-side-panel__section-header">
          <h3>Labels</h3>
          <p>Zoom {mapZoom.toFixed(1)} &mdash; labels fade in at their configured zoom.</p>
        </div>

        <div className="editor-side-panel__actions-grid">
          <article className="editor-side-panel__action-card">
            <header>
              <h4>Visibility &amp; placement</h4>
              <p>Toggle all labels or place a new one.</p>
            </header>
            <div className="label-editor__toggle">
              <label>
                <input
                  type="checkbox"
                  checked={showMapLabels}
                  onChange={(e) => onToggleLabels?.(e.target.checked)}
                />
                Show labels on map
              </label>
            </div>
            {canAutoSave && (
              <button
                type="button"
                className={`toolbox-button ${isPlacingLabel ? 'toolbox-button--active' : ''}`}
                onClick={onStartPlaceLabel}
              >
                {isPlacingLabel ? 'Click map to place...' : 'Place label on map'}
              </button>
            )}
            <p className="editor-side-panel__hint">
              Drag placed labels to fine-tune their position.
            </p>
          </article>
        </div>

        <div className="tool-drawer__labels-list custom-scrollbar">
          {labels.length === 0 && (
            <p className="tool-drawer__empty">
              No labels yet. Use &ldquo;Place label on map&rdquo; above.
            </p>
          )}
          {labels.map((label) => {
            const safeSize      = Number.isFinite(label.size)        ? label.size        : 1;
            const safeZoomScale = Number.isFinite(label.zoomScale)   ? label.zoomScale   : 1;
            const safeFadeStart = Number.isFinite(label.fadeInStart) ? label.fadeInStart : 3;
            const safeFadeEnd   = Number.isFinite(label.fadeInEnd)   ? label.fadeInEnd   : 5;
            const colorValue    = label.color || '#fef3c7';
            const fontValue     = label.font  || defaultFont;
            const scaleWithZoom = label.scaleWithZoom !== false;
            return (
              <div className="tool-drawer__label-card" key={label.id}>
                <div className="tool-drawer__label-row">
                  <label className="editor-side-panel__field">
                    <span>Text</span>
                    <input
                      type="text"
                      value={label.text || ''}
                      onChange={(e) => onLabelFieldChange?.(label.id, 'text', e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    className="tool-drawer__delete"
                    onClick={() => onDeleteLabel?.(label.id)}
                  >
                    Delete
                  </button>
                </div>

                <div className="label-editor__field-row">
                  <label className="editor-side-panel__field">
                    <span>Font</span>
                    <select
                      value={fontValue}
                      onChange={(e) => onLabelFieldChange?.(label.id, 'font', e.target.value)}
                    >
                      {LABEL_FONTS.map((font) => (
                        <option key={font.id} value={font.value}>{font.label}</option>
                      ))}
                    </select>
                  </label>
                  <label className="editor-side-panel__field">
                    <span>Color</span>
                    <div className="label-editor__swatches">
                      {LABEL_COLORS.map((color) => (
                        <button
                          key={color}
                          type="button"
                          className={`label-editor__swatch ${colorValue === color ? 'is-active' : ''}`}
                          style={{ backgroundColor: color }}
                          aria-label={`Use ${color}`}
                          onClick={() => onLabelFieldChange?.(label.id, 'color', color)}
                        />
                      ))}
                      <input
                        type="color"
                        aria-label="Custom label color"
                        value={colorValue}
                        onChange={(e) => onLabelFieldChange?.(label.id, 'color', e.target.value)}
                      />
                    </div>
                  </label>
                </div>

                <div className="label-editor__field-row">
                  <div className="tool-drawer__slider">
                    <label>
                      <span>Base size</span>
                      <span className="label-editor__value">{safeSize.toFixed(2)}x</span>
                    </label>
                    <input
                      type="range" min="0.5" max="3" step="0.05" value={safeSize}
                      onChange={(e) => onLabelFieldChange?.(label.id, 'size', e.target.value)}
                    />
                  </div>
                  <div className="tool-drawer__slider">
                    <label>
                      <span>Zoom scale</span>
                      <span className="label-editor__value">{safeZoomScale.toFixed(2)}x</span>
                    </label>
                    <input
                      type="range" min="0.5" max="2.5" step="0.05" value={safeZoomScale}
                      onChange={(e) => onLabelFieldChange?.(label.id, 'zoomScale', e.target.value)}
                    />
                  </div>
                </div>

                <div className="label-editor__field-row">
                  <div className="tool-drawer__slider">
                    <label>
                      <span>Fade start</span>
                      <span className="label-editor__value">z{safeFadeStart.toFixed(1)}</span>
                    </label>
                    <input
                      type="range" min="0" max="8" step="0.1" value={safeFadeStart}
                      onChange={(e) => onLabelFieldChange?.(label.id, 'fadeInStart', e.target.value)}
                    />
                  </div>
                  <div className="tool-drawer__slider">
                    <label>
                      <span>Fade end</span>
                      <span className="label-editor__value">z{safeFadeEnd.toFixed(1)}</span>
                    </label>
                    <input
                      type="range" min="0.5" max="10" step="0.1" value={safeFadeEnd}
                      onChange={(e) => onLabelFieldChange?.(label.id, 'fadeInEnd', e.target.value)}
                    />
                  </div>
                </div>

                <div className="label-editor__toggle">
                  <label>
                    <input
                      type="checkbox"
                      checked={scaleWithZoom}
                      onChange={(e) => onLabelFieldChange?.(label.id, 'scaleWithZoom', e.target.checked)}
                    />
                    Scale with map zoom
                  </label>
                </div>

                <div className="editor-info-panel__field editor-info-panel__field--era">
                  <div className="era-header">
                    <span>Era (Timeline)</span>
                    {(label.timeStart != null || label.timeEnd != null) && (
                      <button
                        type="button"
                        className="era-clear-btn"
                        onClick={() => {
                          onLabelFieldChange?.(label.id, 'timeStart', null);
                          onLabelFieldChange?.(label.id, 'timeEnd', null);
                        }}
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="era-year-row">
                    <label className="era-year-field">
                      <span>Start Year</span>
                      <input
                        type="number"
                        min="0"
                        max="1000"
                        value={label.timeStart ?? ''}
                        onChange={(e) => onLabelFieldChange?.(label.id, 'timeStart', e.target.value)}
                        placeholder="0"
                      />
                    </label>
                    <span className="era-arrow">→</span>
                    <label className="era-year-field">
                      <span>End Year</span>
                      <input
                        type="number"
                        min="0"
                        max="1000"
                        value={label.timeEnd ?? ''}
                        onChange={(e) => onLabelFieldChange?.(label.id, 'timeEnd', e.target.value)}
                        placeholder="1000"
                      />
                    </label>
                  </div>
                  <p className="era-hint">
                    {label.timeStart != null || label.timeEnd != null
                      ? `Visible from Year ${label.timeStart ?? 0} to Year ${label.timeEnd ?? 1000}`
                      : 'No era set — this label is visible at all points in time'}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderAdmin = () => (
    <div className="editor-side-panel__section">
      <div className="editor-side-panel__section-header">
        <h3>Admin Diagnostics</h3>
        <p>Map health, icon statuses, and layer intensities.</p>
      </div>
      <div className="editor-side-panel__section-body">
        {diagnosticsPanel ?? (
          <div className="editor-side-panel__empty-state">
            <p>No diagnostics available.</p>
          </div>
        )}
      </div>
    </div>
  );

  const renderContent = () => {
    if (view === PANEL_VIEWS.MARKERS) return renderMarkers();
    if (view === PANEL_VIEWS.REGIONS) return renderRegions();
    if (view === PANEL_VIEWS.LABELS)  return renderLabels();
    if (view === PANEL_VIEWS.ADMIN)   return renderAdmin();
    return renderHome();
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <aside
      className="editor-side-panel"
      aria-label="Map editor panel"
      style={{ width: `${panelWidth}px` }}
    >
      <div className="editor-side-panel__resizer" onMouseDown={handleResizeStart} />

      <header className="editor-side-panel__header">
        <div className="editor-side-panel__header-top">
          <div>
            <p className="editor-side-panel__label">Editor Mode</p>
            <h2>World Builder</h2>
          </div>
          {!canAutoSave && (
            <span className="editor-side-panel__role-badge">View only</span>
          )}
        </div>

        <nav className="editor-side-panel__tabs" aria-label="Editor sections">
          {[
            { key: PANEL_VIEWS.HOME,    label: 'Home' },
            { key: PANEL_VIEWS.MARKERS, label: 'Markers' },
            { key: PANEL_VIEWS.REGIONS, label: 'Regions' },
            { key: PANEL_VIEWS.LABELS,  label: 'Labels' },
            ...(diagnosticsPanel ? [{ key: PANEL_VIEWS.ADMIN, label: 'Admin' }] : []),
          ].map(({ key, label }) => (
            <button
              key={key}
              type="button"
              className={view === key ? 'active' : ''}
              onClick={() => setView(key)}
            >
              {label}
            </button>
          ))}
        </nav>
      </header>

      <div className="editor-side-panel__body custom-scrollbar">
        {renderContent()}
      </div>
    </aside>
  );
}

export default EditorSidePanel;
