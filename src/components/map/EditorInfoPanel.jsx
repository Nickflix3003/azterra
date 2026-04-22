import React, { useEffect, useMemo, useState } from 'react';
import { useLocationData } from '../../context/LocationDataContext';
import { useRegions } from '../../context/RegionDataContext';
import { useToast } from '../../context/ToastContext';
import SceneCanvas from '../scene/SceneCanvas';
import SecretScopeField from '../UI/SecretScopeField';

function makePoiId() {
  return `poi-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function blankScene() {
  return {
    imageUrl: '',
    assetPath: '',
    width: null,
    height: null,
    pois: [],
  };
}

// Dual-thumb range slider
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
  const { regions } = useRegions();
  const { toast } = useToast();
  const currentLocation = locations.find((location) => location.id === selectedLocationId) || null;

  const [sceneDraft, setSceneDraft] = useState(blankScene());
  const [sceneLoading, setSceneLoading] = useState(false);
  const [sceneSaving, setSceneSaving] = useState(false);
  const [sceneUploading, setSceneUploading] = useState(false);
  const [selectedPoiId, setSelectedPoiId] = useState(null);

  useEffect(() => {
    let cancelled = false;

    async function loadScene() {
      if (!currentLocation?.id) {
        setSceneDraft(blankScene());
        setSelectedPoiId(null);
        return;
      }

      setSceneLoading(true);
      try {
        const response = await fetch(`/api/locations/${currentLocation.id}/scene`, {
          credentials: 'include',
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(data.error || 'Unable to load location scene.');
        }
        if (cancelled) return;
        setSceneDraft({
          imageUrl: data.scene?.imageUrl || '',
          assetPath: data.scene?.assetPath || '',
          width: data.scene?.width ?? null,
          height: data.scene?.height ?? null,
          pois: Array.isArray(data.scene?.pois) ? data.scene.pois : [],
        });
        setSelectedPoiId((prev) =>
          (data.scene?.pois || []).some((poi) => String(poi.id) === String(prev))
            ? prev
            : data.scene?.pois?.[0]?.id || null
        );
      } catch (error) {
        if (!cancelled) {
          setSceneDraft(blankScene());
          setSelectedPoiId(null);
          toast.error(error.message || 'Unable to load location scene.');
        }
      } finally {
        if (!cancelled) setSceneLoading(false);
      }
    }

    if (isOpen) {
      loadScene();
    }

    return () => {
      cancelled = true;
    };
  }, [currentLocation?.id, isOpen, toast]);

  useEffect(() => {
    if (!sceneDraft.pois.some((poi) => String(poi.id) === String(selectedPoiId))) {
      setSelectedPoiId(sceneDraft.pois[0]?.id || null);
    }
  }, [sceneDraft.pois, selectedPoiId]);

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

  const timeStart = draft.timeStart != null ? Number(draft.timeStart) : undefined;
  const timeEnd = draft.timeEnd != null ? Number(draft.timeEnd) : undefined;
  const hasEra = timeStart != null || timeEnd != null;
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

  const selectedPoi = useMemo(
    () => sceneDraft.pois.find((poi) => String(poi.id) === String(selectedPoiId)) || null,
    [sceneDraft.pois, selectedPoiId]
  );

  const updatePoi = (poiId, patch) => {
    setSceneDraft((prev) => ({
      ...prev,
      pois: prev.pois.map((poi) => (
        String(poi.id) === String(poiId)
          ? { ...poi, ...patch }
          : poi
      )),
    }));
  };

  const handleAddPoi = ({ x, y }) => {
    const nextPoi = {
      id: makePoiId(),
      name: `POI ${sceneDraft.pois.length + 1}`,
      x,
      y,
      icon: '✦',
      dmNotes: '',
    };
    setSceneDraft((prev) => ({
      ...prev,
      pois: [...prev.pois, nextPoi],
    }));
    setSelectedPoiId(nextPoi.id);
  };

  const handleSaveScene = async () => {
    if (!currentLocation?.id) return;
    setSceneSaving(true);
    try {
      const response = await fetch(`/api/locations/${currentLocation.id}/scene`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sceneDraft),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Unable to save location scene.');
      }
      setSceneDraft({
        imageUrl: data.scene?.imageUrl || '',
        assetPath: data.scene?.assetPath || '',
        width: data.scene?.width ?? null,
        height: data.scene?.height ?? null,
        pois: Array.isArray(data.scene?.pois) ? data.scene.pois : [],
      });
      toast.success('Location scene saved.');
    } catch (error) {
      toast.error(error.message || 'Unable to save location scene.');
    } finally {
      setSceneSaving(false);
    }
  };

  const handleSceneUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !currentLocation?.id) return;

    const formData = new FormData();
    formData.append('image', file);

    setSceneUploading(true);
    try {
      const response = await fetch(`/api/locations/${currentLocation.id}/scene/upload`, {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data.error || 'Unable to upload scene image.');
      }
      setSceneDraft((prev) => ({
        ...prev,
        imageUrl: data.scene?.imageUrl || data.url || '',
        assetPath: data.scene?.assetPath || data.url || '',
      }));
      toast.success('Scene image uploaded.');
    } catch (error) {
      toast.error(error.message || 'Unable to upload scene image.');
    } finally {
      event.target.value = '';
      setSceneUploading(false);
    }
  };

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
            placeholder="Location name..."
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
            placeholder="e.g. City, Dungeon, Ruin..."
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
            onChange={(event) => onFieldChange('regionId', event.target.value !== '' ? event.target.value : null)}
            onBlur={handleFieldBlur}
          >
            <option value="">— No region —</option>
            {[...regions]
              .sort((left, right) => (left.name || '').localeCompare(right.name || ''))
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
            {draft.pinned ? '🔒 Position Locked' : '📍 Unlocked — click to lock'}
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

        <div className="editor-info-panel__field editor-info-panel__field--scene">
          <div className="editor-scene__header">
            <div>
              <span>DM Scene Setup</span>
              <small>Prep a revealable scene image and place POIs for live play.</small>
            </div>
            <button
              type="button"
              className="panel-button panel-button--primary panel-button--sm"
              onClick={handleSaveScene}
              disabled={sceneLoading || sceneSaving}
            >
              {sceneSaving ? 'Saving Scene...' : 'Save Scene'}
            </button>
          </div>

          <label className="editor-info-panel__field">
            <span>Scene Image URL</span>
            <input
              type="text"
              value={sceneDraft.imageUrl || ''}
              onChange={(event) => setSceneDraft((prev) => ({ ...prev, imageUrl: event.target.value, assetPath: prev.assetPath || event.target.value }))}
              placeholder="https://..."
            />
          </label>

          <div className="editor-scene__upload-row">
            <label className="panel-button panel-button--ghost panel-button--sm editor-scene__upload-btn">
              {sceneUploading ? 'Uploading...' : 'Upload Scene Image'}
              <input type="file" accept="image/*" onChange={handleSceneUpload} disabled={sceneUploading} hidden />
            </label>
            {(sceneDraft.width || sceneDraft.height) && (
              <span className="editor-scene__meta">
                {sceneDraft.width || '?'} × {sceneDraft.height || '?'}
              </span>
            )}
          </div>

          <SceneCanvas
            imageUrl={sceneDraft.imageUrl}
            pois={sceneDraft.pois}
            selectedPoiId={selectedPoiId}
            editable
            onSelectPoi={setSelectedPoiId}
            onAddPoi={handleAddPoi}
            onMovePoi={(poiId, position) => updatePoi(poiId, position)}
            onImageLoad={(dimensions) => setSceneDraft((prev) => ({ ...prev, ...dimensions }))}
            emptyTitle="No scene image yet"
            emptyText="Paste a scene image URL or upload one, then click on the image to place POIs."
          />

          <div className="editor-scene__split">
            <div className="editor-scene__poi-list">
              <div className="editor-scene__subhead">
                <strong>POIs</strong>
                <span>{sceneDraft.pois.length}</span>
              </div>
              {sceneDraft.pois.length === 0 ? (
                <p className="editor-scene__empty">Click on the image to create the first point of interest.</p>
              ) : (
                sceneDraft.pois.map((poi) => (
                  <button
                    key={poi.id}
                    type="button"
                    className={`editor-scene__poi-item ${String(selectedPoiId) === String(poi.id) ? 'editor-scene__poi-item--active' : ''}`}
                    onClick={() => setSelectedPoiId(poi.id)}
                  >
                    <span>{poi.icon || '✦'}</span>
                    <div>
                      <strong>{poi.name || 'Point of Interest'}</strong>
                      <small>{Math.round((poi.x || 0) * 100)}% / {Math.round((poi.y || 0) * 100)}%</small>
                    </div>
                  </button>
                ))
              )}
            </div>

            <div className="editor-scene__poi-editor">
              <div className="editor-scene__subhead">
                <strong>Selected POI</strong>
              </div>
              {!selectedPoi ? (
                <p className="editor-scene__empty">Select a POI to rename it, change its icon, or add DM notes.</p>
              ) : (
                <>
                  <label className="editor-info-panel__field">
                    <span>Name</span>
                    <input
                      type="text"
                      value={selectedPoi.name || ''}
                      onChange={(event) => updatePoi(selectedPoi.id, { name: event.target.value })}
                    />
                  </label>
                  <label className="editor-info-panel__field">
                    <span>Icon</span>
                    <input
                      type="text"
                      value={selectedPoi.icon || ''}
                      onChange={(event) => updatePoi(selectedPoi.id, { icon: event.target.value || '✦' })}
                      placeholder="✦"
                    />
                  </label>
                  <label className="editor-info-panel__field">
                    <span>DM Notes</span>
                    <textarea
                      rows={4}
                      value={selectedPoi.dmNotes || ''}
                      onChange={(event) => updatePoi(selectedPoi.id, { dmNotes: event.target.value })}
                      placeholder="What should the DM remember about this reveal?"
                    />
                  </label>
                  <div className="editor-scene__poi-actions">
                    <button
                      type="button"
                      className="panel-button panel-button--danger panel-button--sm"
                      onClick={() => {
                        setSceneDraft((prev) => ({
                          ...prev,
                          pois: prev.pois.filter((poi) => String(poi.id) !== String(selectedPoi.id)),
                        }));
                        setSelectedPoiId(null);
                      }}
                    >
                      Remove POI
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="editor-info-panel__field editor-info-panel__field--era">
          <div className="era-header">
            <span>Era (Timeline)</span>
            {hasEra && (
              <button
                type="button"
                className="era-clear-btn"
                onClick={() => {
                  onFieldChange('timeStart', undefined);
                  onFieldChange('timeEnd', undefined);
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
            onChangeStart={(value) => onFieldChange('timeStart', value)}
            onChangeEnd={(value) => onFieldChange('timeEnd', value)}
          />

          <div className="era-year-row">
            <label className="era-year-field">
              <span>Start Year</span>
              <input
                type="number"
                min={0}
                max={1000}
                value={timeStart ?? ''}
                onChange={(event) => onFieldChange('timeStart', event.target.value === '' ? undefined : Number(event.target.value))}
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
                onChange={(event) => onFieldChange('timeEnd', event.target.value === '' ? undefined : Number(event.target.value))}
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
