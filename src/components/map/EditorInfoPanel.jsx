import React, { useMemo, useRef, useState } from 'react';
import { useLocationData } from '../../context/LocationDataContext';
import { useRegions } from '../../context/RegionDataContext';
import { useToast } from '../../context/ToastContext';
import { LOCATION_EDITOR_TYPE_OPTIONS } from '../../constants/mapConstants';
import SecretScopeField from '../UI/SecretScopeField';

const IMAGE_DISPLAY_MODE_OPTIONS = [
  { id: 'cover', label: 'Zoom to Fit' },
  { id: 'contain', label: 'Fit Entire Image' },
  { id: 'natural', label: 'Full Size' },
];

function DualRangeSlider({ min = 0, max = 1000, startVal, endVal, onChangeStart, onChangeEnd }) {
  const safeStart = startVal ?? min;
  const safeEnd = endVal ?? max;
  const startPct = ((safeStart - min) / (max - min)) * 100;
  const endPct = ((safeEnd - min) / (max - min)) * 100;

  return (
    <div
      className="dual-range"
      style={{
        '--range-start': `${startPct}%`,
        '--range-end': `${endPct}%`,
      }}
    >
      <div className="dual-range__track">
        <div className="dual-range__fill" />
      </div>
      <input
        type="range"
        className="dual-range__input dual-range__input--start"
        min={min}
        max={max}
        step={1}
        value={safeStart}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (value <= safeEnd) onChangeStart(value);
        }}
        aria-label="Era start year"
      />
      <input
        type="range"
        className="dual-range__input dual-range__input--end"
        min={min}
        max={max}
        step={1}
        value={safeEnd}
        onChange={(event) => {
          const value = Number(event.target.value);
          if (value >= safeStart) onChangeEnd(value);
        }}
        aria-label="Era end year"
      />
    </div>
  );
}

function EditorInfoPanel({
  isOpen,
  isClosing = false,
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
  const { locations, selectedLocationId, replaceLocationLocal } = useLocationData();
  const { regions } = useRegions();
  const { toast } = useToast();
  const currentLocation = locations.find((location) => String(location.id) === String(selectedLocationId)) || null;
  const fileInputRef = useRef(null);
  const [isUploadingImage, setIsUploadingImage] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const sortedRegions = useMemo(
    () => [...regions].sort((left, right) => (left.name || '').localeCompare(right.name || '')),
    [regions]
  );

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

  const handleTypeChange = (event) => {
    const nextType = event.target.value;
    const option = LOCATION_EDITOR_TYPE_OPTIONS.find((entry) => entry.id === nextType);
    onFieldChange('type', nextType);
    onFieldChange('category', option?.label || '');
  };

  const persistUploadedImage = async (file) => {
    if (!file || !currentLocation?.id) return;

    const formData = new FormData();
    formData.append('image', file);

    setIsUploadingImage(true);
    try {
      const response = await fetch(`/api/locations/${currentLocation.id}/image`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Unable to upload location image.');
      }
      if (data.location) {
        replaceLocationLocal(data.location);
      }
      toast.success('Location image saved.');
    } catch (error) {
      toast.error(error.message || 'Unable to upload location image.');
    } finally {
      setIsUploadingImage(false);
      setIsDragActive(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleFileInput = (event) => {
    const file = event.target.files?.[0];
    if (file) {
      persistUploadedImage(file);
    }
  };

  const handleDrop = (event) => {
    event.preventDefault();
    setIsDragActive(false);
    const file = event.dataTransfer?.files?.[0];
    if (file) {
      persistUploadedImage(file);
    }
  };

  const handleImageRemove = () => {
    onFieldChange('imageUrl', '');
    onFieldCommit?.();
  };

  const timeStart = draft.timeStart != null ? Number(draft.timeStart) : undefined;
  const timeEnd = draft.timeEnd != null ? Number(draft.timeEnd) : undefined;
  const saveStatusText = saveState?.error
    ? `Retry save: ${saveState.error}`
    : saveState?.saving
      ? 'Saving...'
      : saveState?.dirty
        ? 'Unsaved changes'
        : saveState?.lastSavedAt
          ? Date.now() - saveState.lastSavedAt < 15000
            ? 'Saved just now'
            : 'Saved'
          : '';
  const currentType = LOCATION_EDITOR_TYPE_OPTIONS.find((option) => option.id === draft.type) || LOCATION_EDITOR_TYPE_OPTIONS[0];

  return (
    <aside
      className={`editor-info-panel ${isClosing ? 'editor-info-panel--closing' : ''}`}
      aria-label="Edit location"
    >
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
            placeholder="Location name..."
          />
        </label>

        <label className="editor-info-panel__field">
          <span>Type / Category</span>
          <select
            className="editor-info-panel__select"
            value={draft.type ?? currentType.id}
            onChange={handleTypeChange}
            onBlur={handleFieldBlur}
          >
            {LOCATION_EDITOR_TYPE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </label>

        <label className="editor-info-panel__field">
          <span>Region</span>
          <select
            className="editor-info-panel__select"
            value={draft.regionId != null ? String(draft.regionId) : ''}
            onChange={(event) => onFieldChange('regionId', event.target.value !== '' ? event.target.value : null)}
            onBlur={handleFieldBlur}
          >
            <option value="">— No region —</option>
            {sortedRegions.map((region) => (
              <option key={region.id} value={region.id}>
                {region.name}
              </option>
            ))}
          </select>
        </label>

        <SecretScopeField
          secretId={draft.secretId ?? null}
          onChange={(nextSecretId) => onFieldChange('secretId', nextSecretId)}
        />

        <div className="editor-info-panel__field editor-info-panel__field--pin">
          <span>Position</span>
          <button
            type="button"
            className={`pin-toggle-btn ${draft.pinned ? 'pin-toggle-btn--locked' : ''}`}
            onClick={() => onFieldChange('pinned', !draft.pinned)}
            title={draft.pinned ? 'Unlock position — marker can be dragged' : 'Lock position — marker cannot be accidentally moved'}
          >
            {draft.pinned ? '🔒 Position Locked' : '📍 Unlocked — click to lock'}
          </button>
        </div>

        <div className="editor-info-panel__field editor-info-panel__field--image">
          <div className="editor-image__header">
            <span>Display Image</span>
            {draft.imageUrl ? (
              <button
                type="button"
                className="panel-button panel-button--ghost panel-button--sm"
                onClick={handleImageRemove}
              >
                Remove Image
              </button>
            ) : null}
          </div>
          <div
            className={`editor-image__dropzone ${draft.imageUrl ? 'editor-image__dropzone--has-image' : ''} ${isDragActive ? 'editor-image__dropzone--dragging' : ''}`}
            onDragOver={(event) => {
              event.preventDefault();
              setIsDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              setIsDragActive(false);
            }}
            onDrop={handleDrop}
          >
            {draft.imageUrl ? (
              <img
                className="editor-image__preview"
                src={draft.imageUrl}
                alt={draft.name || 'Location preview'}
              />
            ) : (
              <button
                type="button"
                className="editor-image__insert"
                onClick={() => fileInputRef.current?.click()}
              >
                <strong>Insert Image</strong>
                <span>Drop an image here or choose one to display.</span>
              </button>
            )}
            {draft.imageUrl ? (
              <div className="editor-image__overlay">
                <button
                  type="button"
                  className="panel-button panel-button--primary panel-button--sm"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploadingImage}
                >
                  {isUploadingImage ? 'Uploading...' : 'Replace Image'}
                </button>
              </div>
            ) : null}
          </div>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleFileInput}
            disabled={isUploadingImage}
          />
          <label className="editor-info-panel__field">
            <span>Image URL</span>
            <input
              type="text"
              value={draft.imageUrl ?? ''}
              onChange={handleInputChange('imageUrl')}
              onBlur={handleFieldBlur}
              onKeyDown={handleSingleLineKeyDown}
              placeholder="https://example.com/location-image.jpg"
            />
          </label>
          <div className="editor-image__mode-picker" role="group" aria-label="Display image mode">
            {IMAGE_DISPLAY_MODE_OPTIONS.map((option) => (
              <button
                key={option.id}
                type="button"
                className={`editor-image__mode-chip ${draft.imageDisplayMode === option.id ? 'editor-image__mode-chip--active' : ''}`}
                onClick={() => onFieldChange('imageDisplayMode', option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className="editor-info-panel__field">
          <span>Lore</span>
          <textarea
            rows={5}
            value={draft.lore ?? ''}
            onChange={handleInputChange('lore')}
            onBlur={handleFieldBlur}
            onKeyDown={handleTextareaKeyDown}
            placeholder="History, legends, world context..."
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

        <div className="editor-info-panel__field editor-info-panel__field--era">
          <div className="era-section__header">
            <div>
              <span>Era Range</span>
              <small>Show this location only between these years when timeline mode is active.</small>
            </div>
          </div>

          <DualRangeSlider
            min={0}
            max={1000}
            startVal={timeStart ?? 0}
            endVal={timeEnd ?? 1000}
            onChangeStart={(value) => onFieldChange('timeStart', value)}
            onChangeEnd={(value) => onFieldChange('timeEnd', value)}
          />

          <div className="era-fields-row">
            <label className="era-year-field">
              <span>Start</span>
              <input
                type="number"
                value={timeStart ?? 0}
                min={0}
                max={timeEnd ?? 1000}
                onChange={(event) => onFieldChange('timeStart', Number(event.target.value))}
                onBlur={handleFieldBlur}
                onKeyDown={handleSingleLineKeyDown}
              />
            </label>
            <div className="era-arrow">→</div>
            <label className="era-year-field">
              <span>End</span>
              <input
                type="number"
                value={timeEnd ?? 1000}
                min={timeStart ?? 0}
                max={1000}
                onChange={(event) => onFieldChange('timeEnd', Number(event.target.value))}
                onBlur={handleFieldBlur}
                onKeyDown={handleSingleLineKeyDown}
              />
            </label>
          </div>
        </div>

        <div className="editor-info-panel__actions">
          <button type="submit" className="panel-button panel-button--primary">
            {canAutoSave ? 'Save Now' : 'Save'}
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
          <button type="button" className="panel-button panel-button--ghost" onClick={onCancel}>
            Close
          </button>
        </div>

        {saveStatusText ? <p className="editor-info-panel__status">{saveStatusText}</p> : null}
        {saveWarning ? <p className="editor-info-panel__error">{saveWarning}</p> : null}
      </form>
    </aside>
  );
}

export default EditorInfoPanel;
