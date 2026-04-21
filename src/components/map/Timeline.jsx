import React, { useEffect, useMemo, useRef, useState } from 'react';
import './Timeline.css';
import { isVisibleInYear, toOptionalYear } from '../../utils/eraUtils';
import { useLocationData } from '../../context/LocationDataContext';
import { useRegions } from '../../context/RegionDataContext';
import { useTimelineData } from '../../context/TimelineDataContext';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatYear(year) {
  if (year <= 0) return 'Pre-history';
  return `Year ${year}`;
}

function getPercent(year, minYear, maxYear) {
  const safeYear = clamp(year, minYear, maxYear);
  return ((safeYear - minYear) / Math.max(1, maxYear - minYear)) * 100;
}

function getCurrentEra(eras, currentYear) {
  return eras.find((era) => {
    const start = toOptionalYear(era.startYear);
    const end = toOptionalYear(era.endYear);
    if (start != null && currentYear < start) return false;
    if (end != null && currentYear > end) return false;
    return true;
  }) || null;
}

function getRangePosition(startYear, endYear, minYear, maxYear) {
  const normalizedStart = clamp(startYear ?? minYear, minYear, maxYear);
  const normalizedEnd = clamp(endYear ?? maxYear, minYear, maxYear);
  const leftYear = Math.min(normalizedStart, normalizedEnd);
  const rightYear = Math.max(normalizedStart, normalizedEnd);
  const left = getPercent(leftYear, minYear, maxYear);
  const right = getPercent(rightYear, minYear, maxYear);
  return {
    left: `${left}%`,
    width: `${Math.max(right - left, 1)}%`,
  };
}

function getEraJumpYear(era, minYear, maxYear) {
  const start = toOptionalYear(era.startYear) ?? minYear;
  const end = toOptionalYear(era.endYear) ?? maxYear;
  return Math.round((start + end) / 2);
}

function buildTrackEntities(locations, regions) {
  const locationTracks = locations
    .filter((location) => toOptionalYear(location.timeStart) != null || toOptionalYear(location.timeEnd) != null)
    .map((location) => ({
      key: `location:${location.id}`,
      id: location.id,
      entityType: 'location',
      label: location.name || 'Unnamed location',
      subtitle: location.type || 'Location',
      timeStart: toOptionalYear(location.timeStart),
      timeEnd: toOptionalYear(location.timeEnd),
      color: '#facc15',
    }));

  const regionTracks = regions
    .filter((region) => toOptionalYear(region.timeStart) != null || toOptionalYear(region.timeEnd) != null)
    .map((region) => ({
      key: `region:${region.id}`,
      id: region.id,
      entityType: 'region',
      label: region.name || 'Unnamed region',
      subtitle: region.category || 'Region',
      timeStart: toOptionalYear(region.timeStart),
      timeEnd: toOptionalYear(region.timeEnd),
      color: region.color || '#fb923c',
    }));

  return [...locationTracks, ...regionTracks].sort((left, right) => {
    const leftStart = left.timeStart ?? Number.NEGATIVE_INFINITY;
    const rightStart = right.timeStart ?? Number.NEGATIVE_INFINITY;
    if (leftStart !== rightStart) return leftStart - rightStart;
    const leftEnd = left.timeEnd ?? Number.POSITIVE_INFINITY;
    const rightEnd = right.timeEnd ?? Number.POSITIVE_INFINITY;
    if (leftEnd !== rightEnd) return leftEnd - rightEnd;
    return left.label.localeCompare(right.label);
  });
}

export default function Timeline({
  currentYear,
  onYearChange,
  timelineActive,
  onToggle,
  isEditorMode = false,
  canManageEras = false,
  hoveredEntity = null,
  minYear = 0,
  maxYear = 1000,
}) {
  const { locations } = useLocationData();
  const { regions } = useRegions();
  const {
    eras,
    loadingEras,
    createEra,
    updateEra,
    deleteEra,
    flushPendingEraSaves,
  } = useTimelineData();

  const [isExpanded, setIsExpanded] = useState(false);
  const trackRefs = useRef({});

  const visibleLocationCount = timelineActive
    ? locations.filter((location) => isVisibleInYear(location, currentYear, true, isEditorMode)).length
    : locations.length;

  const visibleRegionCount = timelineActive
    ? regions.filter((region) => isVisibleInYear(region, currentYear, true, isEditorMode)).length
    : regions.length;

  const currentEra = useMemo(
    () => getCurrentEra(eras, currentYear),
    [currentYear, eras]
  );

  const trackEntities = useMemo(
    () => buildTrackEntities(locations, regions),
    [locations, regions]
  );

  const hoveredKey = hoveredEntity?.type && hoveredEntity?.id != null
    ? `${hoveredEntity.type}:${hoveredEntity.id}`
    : '';

  useEffect(() => {
    if (!isExpanded || !hoveredKey) return;
    const row = trackRefs.current[hoveredKey];
    if (row?.scrollIntoView) {
      row.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [hoveredKey, isExpanded]);

  const sliderPercent = getPercent(currentYear, minYear, maxYear);

  const handleAddEra = () => {
    const startYear = clamp(currentYear, minYear, maxYear);
    const endYear = clamp(currentYear + 120, minYear, maxYear);
    createEra({
      label: `New Era ${eras.length + 1}`,
      startYear,
      endYear,
      color: ['#d97706', '#2563eb', '#059669', '#7c3aed', '#be123c'][eras.length % 5],
    }).catch(() => null);
  };

  const handleEraFieldChange = (eraId, field, value) => {
    const nextValue = field === 'startYear' || field === 'endYear'
      ? toOptionalYear(value)
      : value;
    updateEra(eraId, { [field]: nextValue }, { mode: 'debounced' });
  };

  const handleEraFieldCommit = (eraId) => {
    flushPendingEraSaves([eraId]).catch(() => null);
  };

  return (
    <section
      className={[
        'timeline-bar',
        timelineActive ? 'timeline-bar--active' : '',
        isExpanded ? 'timeline-bar--expanded' : 'timeline-bar--collapsed',
      ].join(' ')}
      aria-label="World timeline"
    >
      <button
        type="button"
        className="timeline-bar__expand-toggle"
        aria-expanded={isExpanded}
        onClick={() => setIsExpanded((prev) => !prev)}
      >
        <span className="timeline-bar__expand-icon">{isExpanded ? '▾' : '▴'}</span>
        <span className="timeline-bar__expand-label">{isExpanded ? 'Collapse' : 'Expand Timeline'}</span>
      </button>

      <div className="timeline-bar__summary">
        <div className="timeline-bar__summary-left">
          <button
            type="button"
            className={`timeline-bar__toggle ${timelineActive ? 'is-active' : ''}`}
            onClick={onToggle}
            title={timelineActive ? 'Timeline filter is on.' : 'Enable timeline filtering.'}
          >
            <span className="timeline-bar__toggle-icon">⏳</span>
            <span className="timeline-bar__toggle-label">Timeline</span>
          </button>

          <div className="timeline-bar__summary-meta">
            <div className="timeline-bar__year-display" aria-live="polite" aria-atomic="true">
              <span className="timeline-bar__year-num">{formatYear(currentYear)}</span>
              <span className="timeline-bar__year-era">
                {currentEra?.label || 'Uncharted Age'}
              </span>
            </div>
            <div className="timeline-bar__counts">
              <span>{visibleLocationCount} places</span>
              <span>{visibleRegionCount} realms</span>
              <span>{timelineActive ? 'Filtered by era' : 'Showing every era'}</span>
            </div>
          </div>
        </div>

        <div className="timeline-bar__summary-center">
          <div className="timeline-bar__mini-track-strip" aria-hidden="true">
            {trackEntities.map((entity) => (
              <span
                key={entity.key}
                className={`timeline-bar__mini-track ${hoveredKey === entity.key ? 'is-highlighted' : ''}`}
                style={{
                  ...getRangePosition(entity.timeStart, entity.timeEnd, minYear, maxYear),
                  '--track-color': entity.color,
                }}
              />
            ))}
            <span
              className="timeline-bar__current-marker"
              style={{ left: `${sliderPercent}%` }}
            />
          </div>

          <div className="timeline-bar__slider-wrap">
            <div className="timeline-bar__ticks" aria-hidden="true">
              {[0, 25, 50, 75, 100].map((position) => {
                const year = Math.round(minYear + ((maxYear - minYear) * position) / 100);
                return (
                  <span key={position} className="timeline-bar__tick" style={{ left: `${position}%` }}>
                    <span className="timeline-bar__tick-label">{year === 0 ? 'Pre' : year}</span>
                  </span>
                );
              })}
            </div>

            <input
              type="range"
              className="timeline-bar__slider"
              min={minYear}
              max={maxYear}
              step={1}
              value={currentYear}
              onChange={(event) => onYearChange(Number(event.target.value))}
              aria-label="Current year on the world timeline"
              style={{ '--pct': `${sliderPercent}%` }}
            />
          </div>
        </div>

        <div className="timeline-bar__summary-right">
          <div className="timeline-bar__current-era-card">
            <span className="timeline-bar__eyebrow">Era</span>
            <strong>{currentEra?.label || 'Uncharted Age'}</strong>
            <span>
              {currentEra
                ? `${currentEra.startYear ?? minYear}–${currentEra.endYear ?? maxYear}`
                : `${minYear}–${maxYear}`}
            </span>
          </div>
          <div className="timeline-bar__summary-note">
            {trackEntities.length} dated marker{trackEntities.length === 1 ? '' : 's'} tracked
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="timeline-bar__expanded-body">
          <div className="timeline-bar__expanded-grid">
            <section className="timeline-panel timeline-panel--eras">
              <div className="timeline-panel__header">
                <div>
                  <p className="timeline-panel__eyebrow">World Ages</p>
                  <h3>Colored eras</h3>
                </div>
                <span className="timeline-panel__status">
                  {loadingEras ? 'Loading…' : `${eras.length} saved`}
                </span>
              </div>

              <div className="timeline-era-scale">
                {eras.map((era) => (
                  <button
                    key={era.id}
                    type="button"
                    className="timeline-era-scale__band"
                    style={{
                      ...getRangePosition(
                        toOptionalYear(era.startYear),
                        toOptionalYear(era.endYear),
                        minYear,
                        maxYear
                      ),
                      '--era-color': era.color,
                    }}
                    onClick={() => onYearChange(getEraJumpYear(era, minYear, maxYear))}
                    title={`${era.label} (${era.startYear ?? minYear}–${era.endYear ?? maxYear})`}
                  >
                    <span>{era.label}</span>
                  </button>
                ))}
                <span
                  className="timeline-era-scale__marker"
                  style={{ left: `${sliderPercent}%` }}
                />
              </div>

              <div className="timeline-era-pills">
                {eras.map((era) => (
                  <button
                    key={`pill-${era.id}`}
                    type="button"
                    className={`timeline-era-pill ${currentEra?.id === era.id ? 'is-current' : ''}`}
                    onClick={() => onYearChange(getEraJumpYear(era, minYear, maxYear))}
                    style={{ '--era-color': era.color }}
                  >
                    <span>{era.label}</span>
                    <small>{era.startYear ?? minYear}–{era.endYear ?? maxYear}</small>
                  </button>
                ))}
              </div>
            </section>

            <section className="timeline-panel timeline-panel--tracks">
              <div className="timeline-panel__header">
                <div>
                  <p className="timeline-panel__eyebrow">Existence Tracks</p>
                  <h3>Cities and regions through time</h3>
                </div>
                <span className="timeline-panel__status">
                  Hover a city or region to spotlight it here
                </span>
              </div>

              <div className="timeline-track-list custom-scrollbar">
                {trackEntities.length === 0 && (
                  <div className="timeline-track-list__empty">
                    No dated cities or regions yet. Add timeline years to map entries and they will appear here.
                  </div>
                )}

                {trackEntities.map((entity) => {
                  const isHovered = hoveredKey === entity.key;
                  const isCurrent = isVisibleInYear(entity, currentYear, true, false);
                  return (
                    <div
                      key={entity.key}
                      ref={(element) => {
                        trackRefs.current[entity.key] = element;
                      }}
                      className={[
                        'timeline-track',
                        isHovered ? 'is-hovered' : '',
                        isCurrent ? 'is-current' : '',
                      ].join(' ')}
                    >
                      <div className="timeline-track__meta">
                        <span className={`timeline-track__type timeline-track__type--${entity.entityType}`}>
                          {entity.entityType === 'region' ? 'Region' : 'Location'}
                        </span>
                        <strong>{entity.label}</strong>
                        <small>{entity.subtitle}</small>
                      </div>

                      <div className="timeline-track__lane">
                        <span
                          className="timeline-track__range"
                          style={{
                            ...getRangePosition(entity.timeStart, entity.timeEnd, minYear, maxYear),
                            '--track-color': entity.color,
                          }}
                        />
                        <span
                          className="timeline-track__marker"
                          style={{ left: `${sliderPercent}%` }}
                        />
                      </div>

                      <div className="timeline-track__years">
                        <span>{entity.timeStart ?? minYear}</span>
                        <span>{entity.timeEnd ?? maxYear}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          {isEditorMode && canManageEras && (
            <section className="timeline-panel timeline-panel--editor">
              <div className="timeline-panel__header">
                <div>
                  <p className="timeline-panel__eyebrow">Timeline Editor</p>
                  <h3>Manage eras</h3>
                </div>
                <button
                  type="button"
                  className="timeline-panel__action"
                  onClick={handleAddEra}
                >
                  Add Era
                </button>
              </div>

              <div className="timeline-era-editor">
                {eras.map((era) => (
                  <article key={`editor-${era.id}`} className="timeline-era-editor__card">
                    <div className="timeline-era-editor__row timeline-era-editor__row--title">
                      <label>
                        <span>Name</span>
                        <input
                          type="text"
                          value={era.label || ''}
                          onChange={(event) => handleEraFieldChange(era.id, 'label', event.target.value)}
                          onBlur={() => handleEraFieldCommit(era.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleEraFieldCommit(era.id);
                            }
                          }}
                        />
                      </label>
                      <label className="timeline-era-editor__color">
                        <span>Color</span>
                        <input
                          type="color"
                          value={era.color || '#c084fc'}
                          onChange={(event) => handleEraFieldChange(era.id, 'color', event.target.value)}
                          onBlur={() => handleEraFieldCommit(era.id)}
                        />
                      </label>
                    </div>

                    <div className="timeline-era-editor__row">
                      <label>
                        <span>Start</span>
                        <input
                          type="number"
                          min={minYear}
                          max={maxYear}
                          value={era.startYear ?? ''}
                          onChange={(event) => handleEraFieldChange(era.id, 'startYear', event.target.value)}
                          onBlur={() => handleEraFieldCommit(era.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleEraFieldCommit(era.id);
                            }
                          }}
                        />
                      </label>
                      <label>
                        <span>End</span>
                        <input
                          type="number"
                          min={minYear}
                          max={maxYear}
                          value={era.endYear ?? ''}
                          onChange={(event) => handleEraFieldChange(era.id, 'endYear', event.target.value)}
                          onBlur={() => handleEraFieldCommit(era.id)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter') {
                              event.preventDefault();
                              handleEraFieldCommit(era.id);
                            }
                          }}
                        />
                      </label>
                      <button
                        type="button"
                        className="timeline-era-editor__delete"
                        onClick={() => deleteEra(era.id).catch(() => null)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </section>
  );
}
