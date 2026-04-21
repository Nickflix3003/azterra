import React from 'react';
import { useLocationData } from '../../context/LocationDataContext';
import { useRegions } from '../../context/RegionDataContext';
import SecretScopeField from '../UI/SecretScopeField';

// ── Dual-thumb range slider ───────────────────────────────────────────────────
function DualRangeSlider({ min = 0, max = 1000, startVal, endVal, onChangeStart, onChangeEnd }) {
  const safeStart = startVal ?? min;
  const safeEnd   = endVal   ?? max;
  const startPct  = ((safeStart - min) / (max - min)) * 100;
  const endPct    = ((safeEnd   - min) / (max - min)) * 100;

  return (
    <div
      className="dual-range"
      style={{
        '--range-start': `${startPct}%`,
        '--range-end':   `${endPct}%`,
      }}
    >
      <div className="dual-range__track">
        <div className="dual-range__fill" />
      </div>
      {/* Start thumb */}
      <input
        type="range"
        className="dual-range__input dual-range__input--start"
        min={min}
        max={max}
        step={1}
        value={safeStart}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v <= safeEnd) onChangeStart(v);
        }}
        aria-label="Era start year"
      />
      {/* End thumb */}
      <input
        type="range"
        className="dual-range__input dual-range__input--end"
        min={min}
        max={max}
        step={1}
        value={safeEnd}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (v >= safeStart) onChangeEnd(v);
        }}
        aria-label="Era end year"
      />
    </div>
  );
}

// ── EditorInfoPanel ────────────────────────────────────────────────────────────
function EditorInfoPanel({
  isOpen,
  draft,
  onFieldChange,
  onFieldBlur,
  onFieldCommit,
  onSave,
  onCancel,
  canAutoSave = false,
  saveWarning = '',
  saveState = null,
  canDelete = false,
  onDelete,
}) {
  const { locations, selectedLocationId } = useLocationData();
  const currentLocation = locations.find((location) => location.id === selectedLocationId);
  const { regions } = useRegions();

  if (!isOpen || !draft) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    onSave();
  };

  const handleInputChange = (field) => (event) => {
    onFieldChange(field, event.target.value);
  };
  const handleFieldBlur = () => {
    onFieldBlur?.();
  };
  const handleSingleLineKeyDown = (event) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      onFieldCommit?.();
    }
  };
  const handleTextareaKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      onFieldCommit?.();
    }
  };

  // Era values (stored as numbers or undefined)
  const timeStart = draft.timeStart != null ? Number(draft.timeStart) : undefined;
  const timeEnd   = draft.timeEnd   != null ? Number(draft.timeEnd)   : undefined;
  const hasEra    = timeStart != null || timeEnd != null;
  const saveStatusText = saveState?.error
    ? `Retry save: ${saveState.error}`
    : saveState?.saving
      ? 'Saving…'
      : saveState?.dirty
        ? 'Unsaved changes'
        : saveState?.lastSavedAt
          ? Date.now() - saveState.lastSavedAt < 15000
            ? 'Saved just now'
            : 'Saved'
          : '';

  return (
    <aside className="editor-info-panel" aria-label="Edit location">
      <div className="editor-info-panel__header">
        <div>
          <h2>Edit Location</h2>
        </div>
        <button
          type="button"
          className="editor-info-panel__close"
          onClick={onCancel}
          aria-label="Close"
        >
          ×
        </button>
      </div>

      <form className="editor-info-panel__form" onSubmit={handleSubmit}>
        <label className="editor-info-panel__field">
          <span>Name</span>
          <input
            type="text"
            value={draft.name ?? ''}
            onChange={handleInputChange('name')}
            onBlur={handleFieldBlur}
            onKeyDown={handleSingleLineKeyDown}
            placeholder="Location name…"
          />
        </label>

        <label className="editor-info-panel__field">
          <span>Type / Category</span>
          <input
            type="text"
            value={draft.type ?? ''}
            onChange={handleInputChange('type')}
            onBlur={handleFieldBlur}
            onKeyDown={handleSingleLineKeyDown}
            placeholder="e.g. City, Dungeon, Ruin…"
          />
        </label>

        <SecretScopeField
          secretId={draft.secretId ?? null}
          onChange={(nextSecretId) => onFieldChange('secretId', nextSecretId)}
        />

        <label className="editor-info-panel__field">
          <span>Region</span>
          <select
            className="editor-info-panel__select"
            value={draft.regionId != null ? String(draft.regionId) : ''}
            onChange={(e) => onFieldChange('regionId', e.target.value !== '' ? e.target.value : null)}
            onBlur={handleFieldBlur}
          >
            <option value="">— No region —</option>
            {[...regions]
              .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
              .map((region) => (
                <option key={region.id} value={region.id}>
                  {region.name}
                </option>
              ))}
          </select>
        </label>

        <div className="editor-info-panel__field editor-info-panel__field--pin">
          <span>Position</span>
          <button
            type="button"
            className={`pin-toggle-btn ${draft.pinned ? 'pin-toggle-btn--locked' : ''}`}
            onClick={() => onFieldChange('pinned', !draft.pinned)}
            title={draft.pinned ? 'Unlock position — marker can be dragged' : 'Lock position — marker cannot be accidentally moved'}
          >
            {draft.pinned ? '🔒 Position Locked' : '🔓 Unlocked — click to lock'}
          </button>
        </div>

        <label className="editor-info-panel__field">
          <span>Lore</span>
          <textarea
            rows={5}
            value={draft.lore ?? ''}
            onChange={handleInputChange('lore')}
            onBlur={handleFieldBlur}
            onKeyDown={handleTextareaKeyDown}
            placeholder="History, legends, world context…"
          />
        </label>

        <label className="editor-info-panel__field">
          <span>Description</span>
          <textarea
            rows={3}
            value={draft.description ?? ''}
            onChange={handleInputChange('description')}
            onBlur={handleFieldBlur}
            onKeyDown={handleTextareaKeyDown}
            placeholder="What does this place look like?"
          />
        </label>

        {/* ── Era / Timeline ── */}
        <div className="editor-info-panel__field editor-info-panel__field--era">
          <div className="era-header">
            <span>Era (Timeline)</span>
            {hasEra && (
              <button
                type="button"
                className="era-clear-btn"
                onClick={() => {
                  onFieldChange('timeStart', undefined);
                  onFieldChange('timeEnd',   undefined);
                }}
                title="Clear era — location exists at all times"
              >
                Clear
              </button>
            )}
          </div>

          <DualRangeSlider
            min={0}
            max={1000}
            startVal={timeStart}
            endVal={timeEnd}
            onChangeStart={(v) => onFieldChange('timeStart', v)}
            onChangeEnd={(v)   => onFieldChange('timeEnd',   v)}
          />

          <div className="era-year-row">
            <label className="era-year-field">
              <span>Start Year</span>
              <input
                type="number"
                min={0}
                max={1000}
                value={timeStart ?? ''}
                onChange={(e) => onFieldChange('timeStart', e.target.value === '' ? undefined : Number(e.target.value))}
                onBlur={handleFieldBlur}
                onKeyDown={handleSingleLineKeyDown}
                placeholder="0"
              />
            </label>
            <span className="era-arrow">→</span>
            <label className="era-year-field">
              <span>End Year</span>
              <input
                type="number"
                min={0}
                max={1000}
                value={timeEnd ?? ''}
                onChange={(e) => onFieldChange('timeEnd', e.target.value === '' ? undefined : Number(e.target.value))}
                onBlur={handleFieldBlur}
                onKeyDown={handleSingleLineKeyDown}
                placeholder="1000"
              />
            </label>
          </div>
          <p className="era-hint">
            {hasEra
              ? `Visible from Year ${timeStart ?? 0} to Year ${timeEnd ?? 1000}`
              : 'No era set — exists at all points in time'}
          </p>
        </div>

        <div className="editor-info-panel__actions">
          <button type="button" className="panel-button" onClick={onCancel}>
            Cancel
          </button>
          {canDelete && (
            <button
              type="button"
              className="panel-button panel-button--danger"
              onClick={onDelete}
            >
              Delete
            </button>
          )}
          <button
            type="submit"
            className="panel-button panel-button--primary"
            disabled={!canAutoSave}
            title={!canAutoSave ? 'Editor access required to save' : undefined}
          >
            Save Now
          </button>
        </div>

        {canAutoSave && saveStatusText && (
          <p className={`editor-save-status ${saveState?.error ? 'editor-save-status--error' : ''}`}>
            {saveStatusText}
          </p>
        )}

        {(!canAutoSave || saveWarning) && (
          <p className="editor-warning">
            {canAutoSave
              ? saveWarning
              : 'Only approved editors can save changes to the shared map.'}
          </p>
        )}

        {/* Attribution footer */}
        {(currentLocation?.createdBy || currentLocation?.updatedBy) && (
          <div className="editor-attribution">
            {currentLocation.createdBy && (
              <span>✍️ Added by <strong>{currentLocation.createdBy}</strong></span>
            )}
            {currentLocation.updatedBy && currentLocation.updatedBy !== currentLocation.createdBy && (
              <span>· Edited by <strong>{currentLocation.updatedBy}</strong></span>
            )}
            {currentLocation.updatedAt && (
              <span className="editor-attribution__date">
                {new Date(currentLocation.updatedAt).toLocaleDateString()}
              </span>
            )}
          </div>
        )}
      </form>
    </aside>
  );
}

export default EditorInfoPanel;
