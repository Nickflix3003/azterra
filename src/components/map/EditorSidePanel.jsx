import React, { useEffect, useMemo, useState } from 'react';
import RegionInfoPanel from './RegionInfoPanel';

const PANEL_VIEWS = {
  HOME: 'home',
  MARKERS: 'markers',
  REGIONS: 'regions',
  LABELS: 'labels',
};

const LABEL_COLORS = ['#fef3c7', '#fde68a', '#facc15', '#f97316', '#c084fc', '#93c5fd', '#e5e7eb', '#fca5a5'];
const LABEL_FONTS = [
  { id: 'cinzel', label: 'Cinzel', value: "'Cinzel','Cormorant Garamond',serif" },
  { id: 'playfair', label: 'Playfair Display', value: "'Playfair Display','Times New Roman',serif" },
  { id: 'inter', label: 'Inter', value: "'Inter','Segoe UI',sans-serif" },
  { id: 'uncial', label: 'Uncial', value: "'Uncial Antiqua','Georgia',serif" },
];

function EditorSidePanel({
  isEditorMode,
  markerPalette,
  markerToolbox,
  locationEditor,
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
  labels = [],
  showMapLabels = true,
  onToggleLabels,
  onStartPlaceLabel,
  isPlacingLabel = false,
  onLabelFieldChange,
  onDeleteLabel,
  mapZoom = 0,
}) {
  const [view, setView] = useState(PANEL_VIEWS.HOME);
  const [markerView, setMarkerView] = useState('palette');
  const [panelWidth, setPanelWidth] = useState(360);
  const [expandedRegions, setExpandedRegions] = useState(() => new Set());
  const isResizingRef = React.useRef(false);

  const handleResizeStart = (event) => {
    event.preventDefault();
    isResizingRef.current = true;
    const startX = event.clientX;
    const startWidth = panelWidth;

    const handleMouseMove = (moveEvent) => {
      if (!isResizingRef.current) return;
      const delta = moveEvent.clientX - startX;
      const nextWidth = Math.min(Math.max(startWidth + delta, 280), 520);
      setPanelWidth(nextWidth);
    };

    const handleMouseUp = () => {
      isResizingRef.current = false;
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  useEffect(() => {
    if (!isEditorMode) {
      setView(PANEL_VIEWS.HOME);
    }
  }, [isEditorMode]);

  const regionCountLabel = useMemo(() => {
    if (!regions.length) return 'No regions yet';
    return `${regions.length} region${regions.length === 1 ? '' : 's'}`;
  }, [regions]);

  if (!isEditorMode) return null;
  const renderHome = () => (
    <div className="editor-side-panel__home-grid">
      <button
        type="button"
        className="editor-side-panel__home-card"
        onClick={() => setView(PANEL_VIEWS.MARKERS)}
      >
        <span className="editor-side-panel__home-eyebrow">Tools</span>
        <strong>Markers</strong>
        <p>Drop, edit, and manage icons on the map.</p>
      </button>
      <button
        type="button"
        className="editor-side-panel__home-card"
        onClick={() => setView(PANEL_VIEWS.REGIONS)}
      >
        <span className="editor-side-panel__home-eyebrow">Tools</span>
        <strong>Regions</strong>
        <p>Create areas, adjust colors, and assign markers.</p>
      </button>
      <button
        type="button"
        className="editor-side-panel__home-card"
        onClick={() => setView(PANEL_VIEWS.LABELS)}
      >
        <span className="editor-side-panel__home-eyebrow">Tools</span>
        <strong>Labels</strong>
        <p>Place names and titles anywhere on the map.</p>
      </button>
      <div className="editor-side-panel__home-card editor-side-panel__home-card--disabled">
        <span className="editor-side-panel__home-eyebrow">Coming Soon</span>
        <strong>World Settings</strong>
        <p>Shared editor presets and automation will live here.</p>
      </div>
    </div>
  );

  const renderMarkers = () => (
    <div className="editor-side-panel__section">
      <div className="editor-side-panel__tabs editor-side-panel__tabs--sub">
        <button
          type="button"
          className={markerView === 'palette' ? 'active' : ''}
          onClick={() => setMarkerView('palette')}
        >
          Palette
        </button>
        <button
          type="button"
          className={markerView === 'data' ? 'active' : ''}
          onClick={() => setMarkerView('data')}
        >
          Data
        </button>
        <button
          type="button"
          className={markerView === 'edit' ? 'active' : ''}
          onClick={() => setMarkerView('edit')}
        >
          Edit
        </button>
      </div>
      <div className="editor-side-panel__section-body">
        {markerView === 'palette' && (
          <>
            <div className="editor-side-panel__section-header">
              <h3>Marker Palette</h3>
              <p>Select a category and drag icons into place.</p>
            </div>
            {markerPalette}
          </>
        )}
        {markerView === 'data' && markerToolbox && (
          <>
            <div className="editor-side-panel__section-header">
              <h3>Data</h3>
              <p>Import or export marker data.</p>
            </div>
            {markerToolbox}
          </>
        )}
        {markerView === 'edit' && locationEditor && (
          <>
            <div className="editor-side-panel__section-header">
              <h3>Edit Marker</h3>
              <p>Update the highlighted marker&apos;s details.</p>
            </div>
            {locationEditor}
          </>
        )}
      </div>
    </div>
  );

  const renderRegions = () => (
    <>
      <div className="editor-side-panel__section">
        <div className="editor-side-panel__section-body">
          <div className="editor-side-panel__actions-grid">
            <article className="editor-side-panel__action-card">
              <header>
                <h4>Create / Edit Regions</h4>
                <p>Enable region mode to plot new areas or detached parts.</p>
              </header>
              <button
                type="button"
                className="toolbox-button"
                onClick={onToggleRegionMode}
              >
                {isRegionMode ? 'Exit Region Mode' : 'Start Region Mode'}
              </button>
              {isRegionMode && (
                <div className="editor-side-panel__region-draft">
                  <span>Draft points: {regionDraftPoints.length}</span>
                  <div>
                    <button
                      type="button"
                      className="toolbox-button"
                      onClick={onFinishRegion}
                      disabled={regionDraftPoints.length < 3}
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
                  </div>
                </div>
              )}
            </article>
          </div>

          <div className="editor-side-panel__section-header">
            <h3>Regions</h3>
            <p>{regionCountLabel}</p>
          </div>
          <div className="region-list custom-scrollbar">
            {regions.length === 0 && (
              <p className="region-list__empty">No regions yet. Start region mode to add one.</p>
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
                      if (next.has(region.id)) {
                        next.delete(region.id);
                      } else {
                        next.add(region.id);
                      }
                      return next;
                    });
                  }}
                >
                  <span
                    className="region-item__color"
                    style={{ backgroundColor: region.color || '#f97316' }}
                  />
                  {region.name}
                </button>
                <div className="region-item__actions">
                  <button type="button" onClick={() => onFocusRegion(region.id)}>
                    Focus
                  </button>
                  <button type="button" onClick={() => onDeleteRegion(region.id)}>
                    Delete
                  </button>
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
            Assign {selectedLocationName || 'marker'} to {selectedRegionName || 'region'}
          </button>
        </div>
      )}
    </>
  );

  const renderLabels = () => {
    const defaultFont = LABEL_FONTS[0].value;
    return (
      <div className="editor-side-panel__section">
        <div className="editor-side-panel__section-header">
          <h3>Labels</h3>
          <p>Place names on the map. Zoom {mapZoom.toFixed(1)}</p>
        </div>
        <div className="editor-side-panel__actions-grid">
          <article className="editor-side-panel__action-card">
            <header>
              <h4>Visibility &amp; placement</h4>
              <p>Toggle labels or drop a new one anywhere.</p>
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
            <button
              type="button"
              className={`tool-drawer__action ${isPlacingLabel ? 'is-active' : ''}`}
              onClick={onStartPlaceLabel}
            >
              {isPlacingLabel ? 'Click the map to place' : 'Place label on map'}
            </button>
            <p className="editor-side-panel__hint">Drag labels after placing to fine tune their position.</p>
          </article>
        </div>

        <div className="tool-drawer__labels-list custom-scrollbar">
          {labels.length === 0 && <p className="tool-drawer__empty">No labels yet. Add one from the map.</p>}
          {labels.map((label) => {
            const safeSize = Number.isFinite(label.size) ? label.size : 1;
            const safeZoomScale = Number.isFinite(label.zoomScale) ? label.zoomScale : 1;
            const safeFadeStart = Number.isFinite(label.fadeInStart) ? label.fadeInStart : 3;
            const safeFadeEnd = Number.isFinite(label.fadeInEnd) ? label.fadeInEnd : 5;
            const colorValue = label.color || '#fef3c7';
            const fontValue = label.font || defaultFont;
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
                        <option key={font.id} value={font.value}>
                          {font.label}
                        </option>
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
                          aria-label={`Use ${color} for label`}
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
                      type="range"
                      min="0.5"
                      max="3"
                      step="0.05"
                      value={safeSize}
                      onChange={(e) => onLabelFieldChange?.(label.id, 'size', e.target.value)}
                    />
                  </div>
                  <div className="tool-drawer__slider">
                    <label>
                      <span>Zoom scale</span>
                      <span className="label-editor__value">{safeZoomScale.toFixed(2)}x</span>
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="2.5"
                      step="0.05"
                      value={safeZoomScale}
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
                      type="range"
                      min="0"
                      max="8"
                      step="0.1"
                      value={safeFadeStart}
                      onChange={(e) => onLabelFieldChange?.(label.id, 'fadeInStart', e.target.value)}
                    />
                  </div>
                  <div className="tool-drawer__slider">
                    <label>
                      <span>Fade end</span>
                      <span className="label-editor__value">z{safeFadeEnd.toFixed(1)}</span>
                    </label>
                    <input
                      type="range"
                      min="0.5"
                      max="10"
                      step="0.1"
                      value={safeFadeEnd}
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
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderContent = () => {
    if (view === PANEL_VIEWS.MARKERS) return renderMarkers();
    if (view === PANEL_VIEWS.REGIONS) return renderRegions();
    if (view === PANEL_VIEWS.LABELS) return renderLabels();
    return renderHome();
  };

  return (
    <aside
      className="editor-side-panel"
      aria-label="Map editor panel"
      style={{ width: `${panelWidth}px` }}
    >
      <div className="editor-side-panel__resizer" onMouseDown={handleResizeStart} />
      <header className="editor-side-panel__header">
        <div>
          <p className="editor-side-panel__label">Editor Mode</p>
          <h2>World Builder</h2>
        </div>
        <div className="editor-side-panel__tabs">
          <button
            type="button"
            className={view === PANEL_VIEWS.HOME ? 'active' : ''}
            onClick={() => setView(PANEL_VIEWS.HOME)}
          >
            Home
          </button>
          <button
            type="button"
            className={view === PANEL_VIEWS.MARKERS ? 'active' : ''}
            onClick={() => setView(PANEL_VIEWS.MARKERS)}
          >
            Markers
          </button>
          <button
            type="button"
            className={view === PANEL_VIEWS.REGIONS ? 'active' : ''}
            onClick={() => setView(PANEL_VIEWS.REGIONS)}
          >
            Regions
          </button>
          <button
            type="button"
            className={view === PANEL_VIEWS.LABELS ? 'active' : ''}
            onClick={() => setView(PANEL_VIEWS.LABELS)}
          >
            Labels
          </button>
        </div>
      </header>
      <div className="editor-side-panel__body custom-scrollbar">{renderContent()}</div>
    </aside>
  );
}

export default EditorSidePanel;













