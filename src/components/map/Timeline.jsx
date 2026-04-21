import React, { useEffect, useMemo, useRef, useState } from 'react';
import './Timeline.css';
import { isVisibleInYear, toOptionalYear } from '../../utils/eraUtils';
import { useLocationData } from '../../context/LocationDataContext';
import { useRegions } from '../../context/RegionDataContext';
import { useTimelineData } from '../../context/TimelineDataContext';

const MIN_ZOOM_SPAN = 20;
const LANE_ROW_HEIGHT_REM = 2.55;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function formatYear(year) {
  if (year < 0) return `${Math.abs(year)} Pre`;
  if (year === 0) return 'Pre';
  return `Year ${year}`;
}

function formatYearTick(year) {
  if (year === 0) return 'Pre';
  return `${year}`;
}

function formatRange(startYear, endYear) {
  return `${formatYearTick(startYear)} to ${formatYearTick(endYear)}`;
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

function clampWindow(start, end, minYear, maxYear) {
  const totalSpan = maxYear - minYear;
  const desiredSpan = clamp(Math.round(end - start), MIN_ZOOM_SPAN, totalSpan);

  let nextStart = Math.round(start);
  let nextEnd = nextStart + desiredSpan;

  if (nextStart < minYear) {
    nextEnd += minYear - nextStart;
    nextStart = minYear;
  }

  if (nextEnd > maxYear) {
    nextStart -= nextEnd - maxYear;
    nextEnd = maxYear;
  }

  if (nextStart < minYear) {
    nextStart = minYear;
    nextEnd = minYear + desiredSpan;
  }

  return {
    start: Math.round(nextStart),
    end: Math.round(nextEnd),
  };
}

function normalizeInterval(start, end, minYear, maxYear) {
  const rawStart = toOptionalYear(start);
  const rawEnd = toOptionalYear(end);
  const normalizedStart = clamp(Math.min(rawStart ?? minYear, rawEnd ?? maxYear), minYear, maxYear);
  const normalizedEnd = clamp(Math.max(rawStart ?? minYear, rawEnd ?? maxYear), minYear, maxYear);
  return {
    start: normalizedStart,
    end: normalizedEnd,
  };
}

function buildTrackEntities(locations, regions, minYear, maxYear) {
  const locationTracks = locations
    .filter((location) => toOptionalYear(location.timeStart) != null || toOptionalYear(location.timeEnd) != null)
    .map((location) => {
      const interval = normalizeInterval(location.timeStart, location.timeEnd, minYear, maxYear);
      return {
        key: `location:${location.id}`,
        id: location.id,
        entityType: 'location',
        label: location.name || 'Unnamed location',
        subtitle: location.type || 'Location',
        color: '#facc15',
        ...interval,
      };
    });

  const regionTracks = regions
    .filter((region) => toOptionalYear(region.timeStart) != null || toOptionalYear(region.timeEnd) != null)
    .map((region) => {
      const interval = normalizeInterval(region.timeStart, region.timeEnd, minYear, maxYear);
      return {
        key: `region:${region.id}`,
        id: region.id,
        entityType: 'region',
        label: region.name || 'Unnamed region',
        subtitle: region.category || 'Region',
        color: region.color || '#fb923c',
        ...interval,
      };
    });

  return [...locationTracks, ...regionTracks].sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    if (left.end !== right.end) return left.end - right.end;
    return left.label.localeCompare(right.label);
  });
}

function buildEraBands(eras, minYear, maxYear) {
  return eras.map((era) => {
    const interval = normalizeInterval(era.startYear, era.endYear, minYear, maxYear);
    return {
      key: `era:${era.id}`,
      id: era.id,
      label: era.label || 'Era',
      color: era.color || '#7c3aed',
      ...interval,
    };
  }).sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    if (left.end !== right.end) return left.end - right.end;
    return left.label.localeCompare(right.label);
  });
}

function packIntoLanes(items, viewStart, viewEnd) {
  const laneEnds = [];
  const placed = [];

  items
    .filter((item) => item.end >= viewStart && item.start <= viewEnd)
    .forEach((item) => {
      let lane = laneEnds.findIndex((lastEnd) => item.start > lastEnd);
      if (lane === -1) lane = laneEnds.length;
      laneEnds[lane] = item.end;
      placed.push({
        ...item,
        lane,
        displayStart: Math.max(item.start, viewStart),
        displayEnd: Math.min(item.end, viewEnd),
      });
    });

  return {
    placed,
    laneCount: Math.max(laneEnds.length, 1),
  };
}

function getNiceStep(span) {
  const roughStep = Math.max(1, span / 5);
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500];
  return steps.find((step) => step >= roughStep) || 1000;
}

function buildTickValues(viewStart, viewEnd) {
  const step = getNiceStep(viewEnd - viewStart);
  const values = new Set([viewStart, viewEnd]);

  if (viewStart < 0 && viewEnd > 0) {
    values.add(0);
  }

  let cursor = Math.ceil(viewStart / step) * step;
  while (cursor < viewEnd) {
    values.add(Math.round(cursor));
    cursor += step;
  }

  return Array.from(values)
    .filter((value) => value >= viewStart && value <= viewEnd)
    .sort((left, right) => left - right);
}

function getWindowPosition(viewStart, viewEnd, minYear, maxYear) {
  const left = getPercent(viewStart, minYear, maxYear);
  const right = getPercent(viewEnd, minYear, maxYear);
  return {
    left: `${left}%`,
    width: `${Math.max(right - left, 1)}%`,
  };
}

function getBarPosition(start, end, viewStart, viewEnd) {
  const left = getPercent(start, viewStart, viewEnd);
  const right = getPercent(end, viewStart, viewEnd);
  return {
    left: `${left}%`,
    width: `${Math.max(right - left, 1)}%`,
  };
}

export default function Timeline({
  currentYear,
  onYearChange,
  timelineActive,
  onToggle,
  isEditorMode = false,
  canManageEras = false,
  hoveredEntity = null,
  minYear = -50,
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
  const [viewWindow, setViewWindow] = useState({ start: minYear, end: maxYear });
  const sliderShellRef = useRef(null);

  useEffect(() => {
    setViewWindow({ start: minYear, end: maxYear });
  }, [minYear, maxYear]);

  const visibleStart = viewWindow.start;
  const visibleEnd = viewWindow.end;
  const visibleSpan = visibleEnd - visibleStart;
  const totalSpan = maxYear - minYear;
  const isZoomed = visibleStart !== minYear || visibleEnd !== maxYear;
  const safeCurrentYear = clamp(currentYear, visibleStart, visibleEnd);

  useEffect(() => {
    if (currentYear < visibleStart) {
      onYearChange(visibleStart);
    } else if (currentYear > visibleEnd) {
      onYearChange(visibleEnd);
    }
  }, [currentYear, onYearChange, visibleEnd, visibleStart]);

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
    () => buildTrackEntities(locations, regions, minYear, maxYear),
    [locations, maxYear, minYear, regions]
  );

  const eraBands = useMemo(
    () => buildEraBands(eras, minYear, maxYear),
    [eras, maxYear, minYear]
  );

  const packedTracks = useMemo(
    () => packIntoLanes(trackEntities, visibleStart, visibleEnd),
    [trackEntities, visibleEnd, visibleStart]
  );

  const packedEras = useMemo(
    () => packIntoLanes(eraBands, visibleStart, visibleEnd),
    [eraBands, visibleEnd, visibleStart]
  );

  const tickValues = useMemo(
    () => buildTickValues(visibleStart, visibleEnd),
    [visibleEnd, visibleStart]
  );

  const hoveredKey = hoveredEntity?.type && hoveredEntity?.id != null
    ? `${hoveredEntity.type}:${hoveredEntity.id}`
    : '';

  const sliderPercent = getPercent(safeCurrentYear, visibleStart, visibleEnd);
  const globalMarkerPercent = getPercent(currentYear, minYear, maxYear);
  const zoomWindowPosition = getWindowPosition(visibleStart, visibleEnd, minYear, maxYear);

  const handleResetZoom = () => {
    setViewWindow({ start: minYear, end: maxYear });
  };

  const handleSliderWheel = (event) => {
    event.preventDefault();
    const rect = sliderShellRef.current?.getBoundingClientRect();
    if (!rect?.width) return;

    const anchorPercent = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    const anchorYear = visibleStart + anchorPercent * visibleSpan;
    const nextSpanRaw = event.deltaY < 0
      ? visibleSpan * 0.8
      : visibleSpan * 1.25;
    const nextSpan = Math.abs(nextSpanRaw - totalSpan) < 4
      ? totalSpan
      : clamp(Math.round(nextSpanRaw), MIN_ZOOM_SPAN, totalSpan);

    const clampedWindow = clampWindow(
      anchorYear - anchorPercent * nextSpan,
      anchorYear + (1 - anchorPercent) * nextSpan,
      minYear,
      maxYear
    );

    setViewWindow(clampedWindow);
    onYearChange(clamp(Math.round(anchorYear), clampedWindow.start, clampedWindow.end));
  };

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
        <span className="timeline-bar__expand-icon">{isExpanded ? 'v' : '^'}</span>
        <span className="timeline-bar__expand-label">{isExpanded ? 'Collapse Timeline' : 'Expand Timeline'}</span>
      </button>

      {isExpanded && (
        <div className="timeline-window">
          <div className="timeline-window__header">
            <div>
              <p className="timeline-window__eyebrow">Chronology</p>
              <h3>Stacked time bands</h3>
            </div>
            <div className="timeline-window__header-meta">
              <strong>{formatRange(visibleStart, visibleEnd)}</strong>
              <span>
                {hoveredEntity?.name
                  ? `Highlighting ${hoveredEntity.name}`
                  : 'Hover a city or region to spotlight its band'}
              </span>
            </div>
          </div>

          <div className="timeline-window__viewport custom-scrollbar">
            <div className="timeline-window__axis">
              {tickValues.map((tick) => (
                <span
                  key={`axis-${tick}`}
                  className="timeline-window__axis-tick"
                  style={{ left: `${getPercent(tick, visibleStart, visibleEnd)}%` }}
                >
                  {formatYearTick(tick)}
                </span>
              ))}
            </div>

            <div className="timeline-window__section">
              <div className="timeline-window__section-heading">
                <span>World Eras</span>
                <small>{loadingEras ? 'Loading...' : `${eras.length} saved era${eras.length === 1 ? '' : 's'}`}</small>
              </div>
              <div
                className="timeline-window__lanes timeline-window__lanes--eras"
                style={{ minHeight: `${packedEras.laneCount * LANE_ROW_HEIGHT_REM}rem` }}
              >
                {Array.from({ length: packedEras.laneCount }).map((_, laneIndex) => (
                  <div
                    key={`era-lane-${laneIndex}`}
                    className="timeline-window__lane"
                    style={{ top: `${laneIndex * LANE_ROW_HEIGHT_REM}rem` }}
                  />
                ))}
                <span
                  className="timeline-window__year-line"
                  style={{ left: `${sliderPercent}%` }}
                />
                {packedEras.placed.map((era) => (
                  <button
                    key={era.key}
                    type="button"
                    className={`timeline-window__bar timeline-window__bar--era ${currentEra?.id === era.id ? 'is-current' : ''}`}
                    style={{
                      ...getBarPosition(era.displayStart, era.displayEnd, visibleStart, visibleEnd),
                      top: `${era.lane * LANE_ROW_HEIGHT_REM + 0.32}rem`,
                      '--bar-color': era.color,
                    }}
                    onClick={() => onYearChange(clamp(Math.round((era.start + era.end) / 2), visibleStart, visibleEnd))}
                    title={`${era.label} (${era.start} to ${era.end})`}
                  >
                    <span>{era.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="timeline-window__section">
              <div className="timeline-window__section-heading">
                <span>Places and Regions</span>
                <small>{packedTracks.placed.length} visible dated bands</small>
              </div>
              <div
                className="timeline-window__lanes timeline-window__lanes--tracks"
                style={{ minHeight: `${packedTracks.laneCount * LANE_ROW_HEIGHT_REM}rem` }}
              >
                {Array.from({ length: packedTracks.laneCount }).map((_, laneIndex) => (
                  <div
                    key={`track-lane-${laneIndex}`}
                    className="timeline-window__lane"
                    style={{ top: `${laneIndex * LANE_ROW_HEIGHT_REM}rem` }}
                  />
                ))}
                <span
                  className="timeline-window__year-line"
                  style={{ left: `${sliderPercent}%` }}
                />
                {packedTracks.placed.length === 0 && (
                  <div className="timeline-window__empty-state">
                    No dated cities or regions fall inside this zoom window yet.
                  </div>
                )}
                {packedTracks.placed.map((track) => (
                  <div
                    key={track.key}
                    className={[
                      'timeline-window__bar',
                      'timeline-window__bar--track',
                      track.key === hoveredKey ? 'is-hovered' : '',
                      isVisibleInYear(track, currentYear, true, false) ? 'is-current' : '',
                    ].join(' ')}
                    style={{
                      ...getBarPosition(track.displayStart, track.displayEnd, visibleStart, visibleEnd),
                      top: `${track.lane * LANE_ROW_HEIGHT_REM + 0.32}rem`,
                      '--bar-color': track.color,
                    }}
                    title={`${track.label} (${track.start} to ${track.end})`}
                  >
                    <span className={`timeline-window__bar-type timeline-window__bar-type--${track.entityType}`}>
                      {track.entityType === 'region' ? 'Region' : 'Location'}
                    </span>
                    <span className="timeline-window__bar-label">{track.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {isEditorMode && canManageEras && (
            <details className="timeline-editor">
              <summary>Manage eras</summary>
              <div className="timeline-editor__toolbar">
                <button
                  type="button"
                  className="timeline-editor__add"
                  onClick={handleAddEra}
                >
                  Add Era
                </button>
              </div>
              <div className="timeline-editor__grid">
                {eras.map((era) => (
                  <article key={`editor-${era.id}`} className="timeline-editor__card">
                    <div className="timeline-editor__row timeline-editor__row--title">
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
                      <label className="timeline-editor__color">
                        <span>Color</span>
                        <input
                          type="color"
                          value={era.color || '#c084fc'}
                          onChange={(event) => handleEraFieldChange(era.id, 'color', event.target.value)}
                          onBlur={() => handleEraFieldCommit(era.id)}
                        />
                      </label>
                    </div>
                    <div className="timeline-editor__row">
                      <label>
                        <span>Start</span>
                        <input
                          type="number"
                          min={minYear}
                          max={maxYear}
                          value={era.startYear ?? ''}
                          onChange={(event) => handleEraFieldChange(era.id, 'startYear', event.target.value)}
                          onBlur={() => handleEraFieldCommit(era.id)}
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
                        />
                      </label>
                      <button
                        type="button"
                        className="timeline-editor__delete"
                        onClick={() => deleteEra(era.id).catch(() => null)}
                      >
                        Delete
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </details>
          )}
        </div>
      )}

      <div className="timeline-bar__summary">
        <div className="timeline-bar__summary-left">
          <button
            type="button"
            className={`timeline-bar__toggle ${timelineActive ? 'is-active' : ''}`}
            onClick={onToggle}
            title={timelineActive ? 'Timeline filter is on.' : 'Enable timeline filtering.'}
          >
            <span className="timeline-bar__toggle-icon">[=]</span>
            <span className="timeline-bar__toggle-label">Timeline</span>
          </button>

          <div className="timeline-bar__summary-meta">
            <div className="timeline-bar__year-display" aria-live="polite" aria-atomic="true">
              <span className="timeline-bar__year-num">{formatYear(currentYear)}</span>
              <span className="timeline-bar__year-era">{currentEra?.label || 'Uncharted Age'}</span>
            </div>
            <div className="timeline-bar__counts">
              <span>{visibleLocationCount} places</span>
              <span>{visibleRegionCount} realms</span>
              <span>{timelineActive ? 'Filtered by era' : 'Showing every era'}</span>
            </div>
          </div>
        </div>

        <div className="timeline-bar__summary-center">
          <div className="timeline-bar__zoom-strip" aria-hidden="true">
            <span className="timeline-bar__zoom-window" style={zoomWindowPosition} />
            <span className="timeline-bar__current-marker timeline-bar__current-marker--global" style={{ left: `${globalMarkerPercent}%` }} />
          </div>
          <div
            ref={sliderShellRef}
            className="timeline-bar__slider-wrap"
            onWheel={handleSliderWheel}
            title="Scroll here to zoom the visible year window."
          >
            <div className="timeline-bar__ticks" aria-hidden="true">
              {tickValues.map((tick) => (
                <span
                  key={`tick-${tick}`}
                  className="timeline-bar__tick"
                  style={{ left: `${getPercent(tick, visibleStart, visibleEnd)}%` }}
                >
                  <span className="timeline-bar__tick-label">{formatYearTick(tick)}</span>
                </span>
              ))}
            </div>
            <input
              type="range"
              className="timeline-bar__slider"
              min={visibleStart}
              max={visibleEnd}
              step={1}
              value={safeCurrentYear}
              onChange={(event) => onYearChange(Number(event.target.value))}
              aria-label="Current year on the world timeline"
              style={{ '--pct': `${sliderPercent}%` }}
            />
          </div>
        </div>

        <div className="timeline-bar__summary-right">
          <div className="timeline-bar__window-card">
            <span className="timeline-bar__eyebrow">View Window</span>
            <strong>{formatRange(visibleStart, visibleEnd)}</strong>
            <span>{visibleSpan} year span</span>
          </div>
          <div className="timeline-bar__summary-actions">
            {isZoomed && (
              <button
                type="button"
                className="timeline-bar__reset"
                onClick={handleResetZoom}
              >
                Full Range
              </button>
            )}
            <span className="timeline-bar__summary-note">Scroll the bar to zoom</span>
          </div>
        </div>
      </div>
    </section>
  );
}
