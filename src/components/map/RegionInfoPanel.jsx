import React from 'react';
import { useRegions } from '../../context/RegionDataContext';
import {
  DEFAULT_REGION_CATEGORY,
  REGION_CATEGORIES,
} from '../../constants/regionConstants';

function RegionInfoPanel({
  region: regionOverride,
  isOpen,
  onFieldChange,
  onDelete,
  onClose,
  onMergeRegion,
}) {
  const { regions, selectedRegionId } = useRegions();
  const region = regionOverride || regions.find((entry) => entry.id === selectedRegionId);
  const [mergeTargetId, setMergeTargetId] = React.useState('');
  const [showMerge, setShowMerge] = React.useState(false);

  const shouldRender = isOpen !== undefined ? isOpen : Boolean(region);
  if (!shouldRender || !region) return null;

  const handleChange = (field) => (event) => {
    const raw = event.target.value;
    const numericFields = ['opacity', 'labelSize', 'labelWidth', 'labelOffsetX', 'labelOffsetY'];
    const yearFields = ['timeStart', 'timeEnd'];
    const value = yearFields.includes(field)
      ? (raw === '' ? null : parseFloat(raw))
      : numericFields.includes(field)
        ? parseFloat(raw)
        : raw;
    onFieldChange?.(region.id, field, value);
  };

  const handleCheckboxChange = (field) => (event) => {
    onFieldChange?.(region.id, field, event.target.checked);
  };

  const mergeOptions = regions.filter((entry) => entry.id !== region.id);

  return (
    <aside className="editor-info-panel region-info-panel" aria-label="Region info panel">
      <div className="editor-info-panel__header">
        <h2>Region Info</h2>
        <button
          type="button"
          className="editor-info-panel__close"
          onClick={() => onClose?.(region.id)}
          aria-label="Close region info panel"
        >
          ×
        </button>
      </div>
      <form className="editor-info-panel__form">
        <label className="editor-info-panel__field">
          <span>Name</span>
          <input type="text" value={region.name || ''} onChange={handleChange('name')} />
        </label>
        <label className="editor-info-panel__field">
          <span>Fill Color</span>
          <input type="color" value={region.color || '#f97316'} onChange={handleChange('color')} />
        </label>
        <label className="editor-info-panel__field">
          <span>Category</span>
          <select
            value={region.category || DEFAULT_REGION_CATEGORY}
            onChange={handleChange('category')}
          >
            {REGION_CATEGORIES.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>
        <label className="editor-info-panel__field editor-info-panel__field--inline">
          <span>Label</span>
          <input
            type="checkbox"
            checked={region.labelEnabled !== false}
            onChange={() => onFieldChange?.(region.id, 'labelEnabled', region.labelEnabled === false)}
          />
          <small>Show region title on map</small>
        </label>
        <div className="editor-info-panel__field editor-info-panel__field--era">
          <div className="era-header">
            <span>Era (Timeline)</span>
            {(region.timeStart != null || region.timeEnd != null) && (
              <button
                type="button"
                className="era-clear-btn"
                onClick={() => {
                  onFieldChange?.(region.id, 'timeStart', null);
                  onFieldChange?.(region.id, 'timeEnd', null);
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
                value={region.timeStart ?? ''}
                onChange={handleChange('timeStart')}
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
                value={region.timeEnd ?? ''}
                onChange={handleChange('timeEnd')}
                placeholder="1000"
              />
            </label>
          </div>
          <p className="era-hint">
            {region.timeStart != null || region.timeEnd != null
              ? `Visible from Year ${region.timeStart ?? 0} to Year ${region.timeEnd ?? 1000}`
              : 'No era set — this region is visible at all points in time'}
          </p>
        </div>
        <label className="editor-info-panel__field">
          <span>Opacity</span>
          <input
            type="number"
            min="0"
            max="1"
            step="0.05"
            value={region.opacity ?? 0.3}
            onChange={handleChange('opacity')}
          />
        </label>
        <label className="editor-info-panel__field editor-info-panel__field--inline">
          <span>Scale With Zoom</span>
          <input
            type="checkbox"
            checked={region.labelScaleWithZoom !== false}
            onChange={handleCheckboxChange('labelScaleWithZoom')}
          />
        </label>
        <label className="editor-info-panel__field">
          <span>Vertical Text Size</span>
          <input
            type="range"
            min="0.25"
            max="3"
            step="0.05"
            value={region.labelSize ?? 1}
            onChange={handleChange('labelSize')}
          />
        </label>
        <label className="editor-info-panel__field">
          <span>Label Width</span>
          <input
            type="range"
            min="0.4"
            max="2.4"
            step="0.05"
            value={region.labelWidth ?? 1}
            onChange={handleChange('labelWidth')}
          />
        </label>
        <label className="editor-info-panel__field">
          <span>Label Offset X</span>
          <input
            type="range"
            min="-400"
            max="400"
            step="5"
            value={region.labelOffsetX ?? 0}
            onChange={handleChange('labelOffsetX')}
          />
        </label>
        <label className="editor-info-panel__field">
          <span>Label Offset Y</span>
          <input
            type="range"
            min="-400"
            max="400"
            step="5"
            value={region.labelOffsetY ?? 0}
            onChange={handleChange('labelOffsetY')}
          />
        </label>
        <div className="editor-info-panel__field">
          <span>Merge Regions</span>
          {!showMerge ? (
            <button
              type="button"
              className="panel-button"
              onClick={() => setShowMerge(true)}
            >
              Merge Another Region
            </button>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <select
                  value={mergeTargetId}
                  onChange={(event) => setMergeTargetId(event.target.value)}
                  style={{
                    flex: 1,
                    borderRadius: '8px',
                    padding: '0.45rem 0.5rem',
                    border: '1px solid rgba(255,255,255,0.25)',
                    background: 'rgba(10,16,30,0.8)',
                    color: '#f8fafc',
                  }}
                >
                  <option value="">Select region</option>
                  {mergeOptions.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name || entry.id}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="panel-button panel-button--danger"
                  onClick={() => {
                    setMergeTargetId('');
                    setShowMerge(false);
                  }}
                >
                  Cancel
                </button>
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button
                  type="button"
                  className="panel-button"
                  disabled={!mergeTargetId}
                  onClick={() => {
                    if (mergeTargetId && onMergeRegion) {
                      onMergeRegion(region.id, mergeTargetId);
                      setMergeTargetId('');
                      setShowMerge(false);
                    }
                  }}
                >
                  Merge Selected
                </button>
                <button
                  type="button"
                  className="panel-button panel-button--ghost"
                  onClick={() => setShowMerge(false)}
                >
                  Back
                </button>
              </div>
              <small>
                Merging keeps this region&apos;s settings and removes the other. Use Back to exit without merging.
              </small>
            </div>
          )}
        </div>

        <div className="editor-info-panel__actions">
          <button type="button" className="panel-button" onClick={() => onClose?.(region.id)}>
            Close
          </button>
          <button
            type="button"
            className="panel-button panel-button--danger"
            onClick={() => onDelete?.(region.id)}
          >
            Delete Region
          </button>
        </div>
      </form>
    </aside>
  );
}

export default RegionInfoPanel;

