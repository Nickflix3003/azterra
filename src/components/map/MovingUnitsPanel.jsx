import React, { useMemo } from 'react';
import { useMovingUnits } from '../../context/MovingUnitDataContext';
import { useLocationData } from '../../context/LocationDataContext';
import { getActiveTimelineWaypointIndex } from '../../utils/timePositionUtils';

const UNIT_KIND_OPTIONS = [
  { id: 'troop', label: 'Troop' },
  { id: 'fleet', label: 'Fleet' },
  { id: 'caravan', label: 'Caravan' },
  { id: 'patrol', label: 'Patrol' },
  { id: 'other', label: 'Other' },
];

const UNIT_ICON_OPTIONS = [
  { id: 'banner', label: 'Banner' },
  { id: 'ship', label: 'Ship' },
  { id: 'cart', label: 'Cart' },
  { id: 'horse', label: 'Horse' },
  { id: 'camp', label: 'Camp' },
];
const DEFAULT_TROOP_COUNT = 24;
const DEFAULT_BOID_CONFIG = Object.freeze({
  separationWeight: 1.4,
  alignmentWeight: 0.72,
  cohesionWeight: 0.38,
  anchorPullWeight: 0.82,
  arrivalWeight: 0.66,
  maxSpeed: 0.055,
  maxForce: 0.018,
  neighborRadius: 0.74,
  separationRadius: 0.24,
  idleOrbitRadius: 0.48,
});
const BOID_FIELDS = [
  { key: 'separationWeight', label: 'Separation', min: 0, max: 4, step: 0.02 },
  { key: 'alignmentWeight', label: 'Alignment', min: 0, max: 3, step: 0.02 },
  { key: 'cohesionWeight', label: 'Cohesion', min: 0, max: 3, step: 0.02 },
  { key: 'anchorPullWeight', label: 'Anchor Pull', min: 0, max: 3, step: 0.02 },
  { key: 'arrivalWeight', label: 'Arrival', min: 0, max: 3, step: 0.02 },
  { key: 'maxSpeed', label: 'Max Speed', min: 0.005, max: 0.18, step: 0.001 },
  { key: 'maxForce', label: 'Max Force', min: 0.002, max: 0.08, step: 0.001 },
  { key: 'neighborRadius', label: 'Neighbor Radius', min: 0.1, max: 2, step: 0.01 },
  { key: 'separationRadius', label: 'Separation Radius', min: 0.05, max: 1, step: 0.01 },
  { key: 'idleOrbitRadius', label: 'Idle Orbit', min: 0.1, max: 2, step: 0.01 },
];

function buildDefaultWaypoint(currentYear = 500, defaultCoordinates = { lat: 0, lng: 0 }) {
  return {
    id: `waypoint-${Date.now()}`,
    startYear: currentYear,
    endYear: null,
    targetLocationId: null,
    lat: defaultCoordinates.lat ?? 0,
    lng: defaultCoordinates.lng ?? 0,
  };
}

function cloneTimeline(unit, currentYear, defaultCoordinates) {
  return Array.isArray(unit?.movementTimeline) && unit.movementTimeline.length
    ? unit.movementTimeline
    : [buildDefaultWaypoint(currentYear, defaultCoordinates)];
}

function getUnitSummary(unit) {
  if (unit.kind === 'troop') {
    const count = Number(unit.troopCount) || DEFAULT_TROOP_COUNT;
    return `Troop · ${count} troop${count === 1 ? '' : 's'}`;
  }
  const label = UNIT_KIND_OPTIONS.find((option) => option.id === unit.kind)?.label || 'Unit';
  return label;
}

export default function MovingUnitsPanel({
  canAutoSave = false,
  currentYear = 500,
  defaultCoordinates = { lat: 0, lng: 0 },
}) {
  const {
    movingUnits,
    selectedMovingUnitId,
    selectMovingUnit,
    createMovingUnit,
    updateMovingUnit,
    deleteMovingUnit,
    getMovingUnitSaveState,
  } = useMovingUnits();
  const { locations } = useLocationData();

  const selectedUnit = movingUnits.find((unit) => String(unit.id) === String(selectedMovingUnitId)) || null;
  const sortedLocations = useMemo(
    () => [...locations].sort((left, right) => (left.name || '').localeCompare(right.name || '')),
    [locations]
  );

  const handleCreateUnit = async () => {
    if (!canAutoSave) return;
    const created = await createMovingUnit({
      name: 'New Unit',
      kind: 'troop',
      icon: 'banner',
      color: '#f8d86a',
      lat: defaultCoordinates.lat ?? 0,
      lng: defaultCoordinates.lng ?? 0,
      troopCount: DEFAULT_TROOP_COUNT,
      simulationMode: 'boids',
      boidConfig: DEFAULT_BOID_CONFIG,
      movementTimeline: [buildDefaultWaypoint(currentYear, defaultCoordinates)],
      platoonStyle: { followers: 5, spread: 0.34 },
    }).catch(() => null);
    if (created) {
      selectMovingUnit(created.id);
    }
  };

  const updateSelectedUnit = (updates, options = {}) => {
    if (!selectedUnit || !canAutoSave) return;
    updateMovingUnit(selectedUnit.id, updates, options).catch(() => null);
  };

  const handleKindChange = (nextKind) => {
    if (!selectedUnit) return;
    updateSelectedUnit({
      kind: nextKind,
      icon:
        nextKind === 'fleet'
          ? 'ship'
          : nextKind === 'caravan'
            ? 'cart'
            : selectedUnit.icon || 'banner',
      troopCount: nextKind === 'troop'
        ? Math.max(1, Number(selectedUnit.troopCount) || DEFAULT_TROOP_COUNT)
        : 1,
      simulationMode: nextKind === 'troop' ? 'boids' : 'formation',
      boidConfig: nextKind === 'troop'
        ? { ...DEFAULT_BOID_CONFIG, ...(selectedUnit.boidConfig || {}) }
        : { ...(selectedUnit.boidConfig || DEFAULT_BOID_CONFIG) },
    }, { mode: 'immediate', successMode: 'none' });
  };

  const isTroop = selectedUnit?.kind === 'troop';

  const updateWaypoint = (stopId, patch) => {
    if (!selectedUnit) return;
    const nextTimeline = cloneTimeline(selectedUnit, currentYear, defaultCoordinates).map((stop) =>
      String(stop.id) === String(stopId) ? { ...stop, ...patch } : stop
    );
    updateSelectedUnit({ movementTimeline: nextTimeline }, { mode: 'debounced', successMode: 'none' });
  };

  const addWaypoint = () => {
    if (!selectedUnit) return;
    const nextTimeline = [
      ...cloneTimeline(selectedUnit, currentYear, defaultCoordinates),
      buildDefaultWaypoint(currentYear, defaultCoordinates),
    ];
    updateSelectedUnit({ movementTimeline: nextTimeline }, { mode: 'immediate', successMode: 'none' });
  };

  const removeWaypoint = (stopId) => {
    if (!selectedUnit) return;
    const timeline = cloneTimeline(selectedUnit, currentYear, defaultCoordinates);
    const nextTimeline = timeline.filter((stop) => String(stop.id) !== String(stopId));
    updateSelectedUnit(
      { movementTimeline: nextTimeline.length ? nextTimeline : [buildDefaultWaypoint(currentYear, defaultCoordinates)] },
      { mode: 'immediate', successMode: 'none' }
    );
  };

  const handleDeleteUnit = () => {
    if (!selectedUnit || !canAutoSave) return;
    const confirmed = window.confirm(`Delete "${selectedUnit.name || 'this unit'}"?`);
    if (!confirmed) return;
    deleteMovingUnit(selectedUnit.id).catch(() => null);
  };

  const saveState = selectedUnit ? getMovingUnitSaveState(selectedUnit.id) : null;
  const saveStatusText = saveState?.error
    ? `Retry save: ${saveState.error}`
    : saveState?.saving
      ? 'Saving...'
      : saveState?.dirty
        ? 'Unsaved changes'
        : saveState?.lastSavedAt
          ? 'Saved'
          : '';

  return (
    <div className="editor-side-panel__section">
      <div className="editor-side-panel__section-header">
        <h3>Moving Units</h3>
        <p>Troops, fleets, caravans, and other timeline-driven groups.</p>
      </div>

      <div className="moving-units-panel">
        <div className="moving-units-panel__list">
          <button
            type="button"
            className="toolbox-button toolbox-button--primary"
            onClick={handleCreateUnit}
            disabled={!canAutoSave}
          >
            New Unit
          </button>

          {movingUnits.length === 0 ? (
            <p className="tool-drawer__empty">No moving units yet.</p>
          ) : (
            <div className="moving-units-panel__cards">
              {movingUnits.map((unit) => (
                <button
                  key={unit.id}
                  type="button"
                  className={`moving-units-panel__card ${selectedUnit?.id === unit.id ? 'is-active' : ''}`}
                  onClick={() => selectMovingUnit(unit.id)}
                >
                  <span
                    className="moving-units-panel__swatch"
                    style={{ backgroundColor: unit.color || '#f8d86a' }}
                  />
                  <span className="moving-units-panel__card-copy">
                    <strong>{unit.name || 'Unnamed Unit'}</strong>
                    <small>{getUnitSummary(unit)}</small>
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedUnit ? (
          <div className="moving-units-panel__editor">
            <label className="editor-info-panel__field">
              <span>Name</span>
              <input
                type="text"
                value={selectedUnit.name ?? ''}
                onChange={(event) => updateSelectedUnit({ name: event.target.value }, { mode: 'debounced', successMode: 'none' })}
              />
            </label>

            <div className="moving-units-panel__field-row">
              <label className="editor-info-panel__field">
                <span>Kind</span>
                <select
                  className="editor-info-panel__select"
                  value={selectedUnit.kind ?? 'troop'}
                  onChange={(event) => handleKindChange(event.target.value)}
                >
                  {UNIT_KIND_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="editor-info-panel__field">
                <span>Icon</span>
                <select
                  className="editor-info-panel__select"
                  value={selectedUnit.icon ?? 'banner'}
                  onChange={(event) => updateSelectedUnit({ icon: event.target.value }, { mode: 'immediate', successMode: 'none' })}
                >
                  {UNIT_ICON_OPTIONS.map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="moving-units-panel__field-row">
              <label className="editor-info-panel__field">
                <span>Color</span>
                <input
                  type="color"
                  value={selectedUnit.color || '#f8d86a'}
                  onChange={(event) => updateSelectedUnit({ color: event.target.value }, { mode: 'immediate', successMode: 'none' })}
                />
              </label>

              {isTroop ? (
                <label className="editor-info-panel__field">
                  <span>Troop Count</span>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={selectedUnit.troopCount ?? DEFAULT_TROOP_COUNT}
                    onChange={(event) =>
                      updateSelectedUnit({
                        troopCount: Math.max(1, Number(event.target.value) || DEFAULT_TROOP_COUNT),
                        simulationMode: 'boids',
                      }, { mode: 'immediate', successMode: 'none' })
                    }
                  />
                </label>
              ) : (
                <>
                  <label className="editor-info-panel__field">
                    <span>Followers</span>
                    <input
                      type="number"
                      min={1}
                      max={8}
                      value={selectedUnit.platoonStyle?.followers ?? 5}
                      onChange={(event) =>
                        updateSelectedUnit({
                          platoonStyle: {
                            ...(selectedUnit.platoonStyle || {}),
                            followers: Number(event.target.value),
                          },
                        }, { mode: 'immediate', successMode: 'none' })
                      }
                    />
                  </label>

                  <label className="editor-info-panel__field">
                    <span>Spread</span>
                    <input
                      type="number"
                      min={0.16}
                      max={0.72}
                      step={0.02}
                      value={selectedUnit.platoonStyle?.spread ?? 0.34}
                      onChange={(event) =>
                        updateSelectedUnit({
                          platoonStyle: {
                            ...(selectedUnit.platoonStyle || {}),
                            spread: Number(event.target.value),
                          },
                        }, { mode: 'immediate', successMode: 'none' })
                      }
                    />
                  </label>
                </>
              )}
            </div>

            {isTroop ? (
              <details className="moving-units-panel__advanced">
                <summary>Advanced flocking</summary>
                <div className="moving-units-panel__advanced-grid">
                  {BOID_FIELDS.map((field) => (
                    <label key={field.key} className="editor-info-panel__field">
                      <span>{field.label}</span>
                      <input
                        type="number"
                        min={field.min}
                        max={field.max}
                        step={field.step}
                        value={selectedUnit.boidConfig?.[field.key] ?? DEFAULT_BOID_CONFIG[field.key]}
                        onChange={(event) =>
                          updateSelectedUnit({
                            boidConfig: {
                              ...(selectedUnit.boidConfig || DEFAULT_BOID_CONFIG),
                              [field.key]: Number(event.target.value),
                            },
                            simulationMode: 'boids',
                          }, { mode: 'immediate', successMode: 'none' })
                        }
                      />
                    </label>
                  ))}
                </div>
              </details>
            ) : null}

            <div className="moving-units-panel__timeline">
              <div className="moving-units-panel__timeline-header">
                <div>
                  <h4>Movement Timeline</h4>
                  <p>Drag the unit or right-click the map to place the stop for year {currentYear}.</p>
                </div>
                <button type="button" className="toolbox-button toolbox-button--ghost" onClick={addWaypoint}>
                  Add Stop
                </button>
              </div>

              {cloneTimeline(selectedUnit, currentYear, defaultCoordinates).map((stop, index, timeline) => {
                const isLinked = Boolean(stop.targetLocationId);
                const activeIndex = getActiveTimelineWaypointIndex(timeline, currentYear);
                const isActiveStop = index === activeIndex;
                return (
                  <div key={stop.id} className={`moving-units-panel__stop ${isActiveStop ? 'is-current' : ''}`}>
                    <div className="moving-units-panel__stop-header">
                      <strong>{isActiveStop ? `Current stop for ${currentYear}` : `Stop ${index + 1}`}</strong>
                      {isActiveStop ? <span>Live edit target</span> : null}
                    </div>
                    <div className="moving-units-panel__field-row">
                      <label className="editor-info-panel__field">
                        <span>Start</span>
                        <input
                          type="number"
                          value={stop.startYear ?? currentYear}
                          onChange={(event) => updateWaypoint(stop.id, { startYear: Number(event.target.value) })}
                        />
                      </label>
                      <label className="editor-info-panel__field">
                        <span>End</span>
                        <input
                          type="number"
                          value={stop.endYear ?? ''}
                          placeholder="optional"
                          onChange={(event) => {
                            const nextValue = event.target.value === '' ? null : Number(event.target.value);
                            updateWaypoint(stop.id, { endYear: nextValue });
                          }}
                        />
                      </label>
                    </div>

                    <label className="editor-info-panel__field">
                      <span>Stop Type</span>
                      <select
                        className="editor-info-panel__select"
                        value={isLinked ? 'location' : 'coords'}
                        onChange={(event) => {
                          if (event.target.value === 'location') {
                            updateWaypoint(stop.id, {
                              targetLocationId: sortedLocations[0]?.id ?? null,
                              lat: null,
                              lng: null,
                            });
                          } else {
                            updateWaypoint(stop.id, {
                              targetLocationId: null,
                              lat: stop.lat ?? selectedUnit.lat ?? 0,
                              lng: stop.lng ?? selectedUnit.lng ?? 0,
                            });
                          }
                        }}
                      >
                        <option value="coords">Coordinates</option>
                        <option value="location">Linked Location</option>
                      </select>
                    </label>

                    {isLinked ? (
                      <label className="editor-info-panel__field">
                        <span>Location</span>
                        <select
                          className="editor-info-panel__select"
                          value={stop.targetLocationId ?? ''}
                          onChange={(event) => updateWaypoint(stop.id, { targetLocationId: event.target.value || null })}
                        >
                          <option value="">Select location</option>
                          {sortedLocations.map((location) => (
                            <option key={location.id} value={location.id}>
                              {location.name}
                            </option>
                          ))}
                        </select>
                      </label>
                    ) : (
                      <div className="moving-units-panel__field-row">
                        <label className="editor-info-panel__field">
                          <span>Latitude</span>
                          <input
                            type="number"
                            value={stop.lat ?? 0}
                            onChange={(event) => updateWaypoint(stop.id, { lat: Number(event.target.value) })}
                          />
                        </label>
                        <label className="editor-info-panel__field">
                          <span>Longitude</span>
                          <input
                            type="number"
                            value={stop.lng ?? 0}
                            onChange={(event) => updateWaypoint(stop.id, { lng: Number(event.target.value) })}
                          />
                        </label>
                      </div>
                    )}

                    <button
                      type="button"
                      className="toolbox-button toolbox-button--ghost moving-units-panel__remove-stop"
                      onClick={() => removeWaypoint(stop.id)}
                    >
                      Remove Stop
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="editor-info-panel__actions">
              <button type="button" className="panel-button panel-button--danger" onClick={handleDeleteUnit}>
                Delete
              </button>
            </div>
            {saveStatusText ? <p className="editor-info-panel__status">{saveStatusText}</p> : null}
          </div>
        ) : (
          <p className="tool-drawer__empty">Select a unit to edit its route and formation.</p>
        )}
      </div>
    </div>
  );
}
