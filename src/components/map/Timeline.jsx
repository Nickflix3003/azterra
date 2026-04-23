import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import './Timeline.css';
import { isVisibleInYear, toOptionalYear } from '../../utils/eraUtils';
import { useLocationData } from '../../context/LocationDataContext';
import { useRegions } from '../../context/RegionDataContext';
import { useTimelineData } from '../../context/TimelineDataContext';

const MIN_ZOOM_SPAN = 20;
const COMPACT_ERA_ROW_HEIGHT_REM = 0.86;
const COMPACT_TRACK_ROW_HEIGHT_REM = 0.64;
const EDITOR_ROW_HEIGHT_REM = 2.7;

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

function getHoverKey(entity) {
  if (!entity?.type || entity?.id == null) return '';
  return `${entity.type}:${entity.id}`;
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
        type: 'location',
        name: location.name || 'Unnamed location',
        color: '#facc15',
        timeStart: interval.start,
        timeEnd: interval.end,
        start: interval.start,
        end: interval.end,
      };
    });

  const regionTracks = regions
    .filter((region) => toOptionalYear(region.timeStart) != null || toOptionalYear(region.timeEnd) != null)
    .map((region) => {
      const interval = normalizeInterval(region.timeStart, region.timeEnd, minYear, maxYear);
      return {
        key: `region:${region.id}`,
        id: region.id,
        type: 'region',
        name: region.name || 'Unnamed region',
        color: region.color || '#fb923c',
        timeStart: interval.start,
        timeEnd: interval.end,
        start: interval.start,
        end: interval.end,
      };
    });

  return [...locationTracks, ...regionTracks].sort((left, right) => {
    if (left.start !== right.start) return left.start - right.start;
    if (left.end !== right.end) return left.end - right.end;
    return left.name.localeCompare(right.name);
  });
}

function buildEraBands(eras, minYear, maxYear) {
  return eras
    .map((era) => {
      const interval = normalizeInterval(era.startYear, era.endYear, minYear, maxYear);
      return {
        key: `era:${era.id}`,
        id: era.id,
        type: 'era',
        name: era.label || 'Era',
        color: era.color || '#7c3aed',
        startYear: interval.start,
        endYear: interval.end,
        start: interval.start,
        end: interval.end,
      };
    })
    .sort((left, right) => {
      if (left.start !== right.start) return left.start - right.start;
      if (left.end !== right.end) return left.end - right.end;
      return left.name.localeCompare(right.name);
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

function getYearFromClientX(clientX, rect, minYear, maxYear) {
  const percent = clamp((clientX - rect.left) / Math.max(rect.width, 1), 0, 1);
  return clamp(Math.round(minYear + percent * (maxYear - minYear)), minYear, maxYear);
}

export default function Timeline({
  currentYear,
  onYearChange,
  timelineActive,
  onToggle,
  isEditorMode = false,
  canManageEras = false,
  hoveredEntity = null,
  onHoverEntityChange,
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
  const [localHoveredItem, setLocalHoveredItem] = useState(null);

  const sliderShellRef = useRef(null);
  const editorAxisRef = useRef(null);
  const dragStateRef = useRef(null);

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

  useEffect(() => {
    if (!isExpanded && localHoveredItem) {
      setLocalHoveredItem(null);
      onHoverEntityChange?.(null);
    }
  }, [isExpanded, localHoveredItem, onHoverEntityChange]);

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

  const packedCompactTracks = useMemo(
    () => packIntoLanes(trackEntities, visibleStart, visibleEnd),
    [trackEntities, visibleEnd, visibleStart]
  );

  const packedCompactEras = useMemo(
    () => packIntoLanes(eraBands, visibleStart, visibleEnd),
    [eraBands, visibleEnd, visibleStart]
  );

  const packedEditorEras = useMemo(
    () => packIntoLanes(eraBands, minYear, maxYear),
    [eraBands, maxYear, minYear]
  );

  const tickValues = useMemo(
    () => buildTickValues(visibleStart, visibleEnd),
    [visibleEnd, visibleStart]
  );

  const editorTickValues = useMemo(
    () => buildTickValues(minYear, maxYear),
    [maxYear, minYear]
  );

  const activeHoveredItem = localHoveredItem || hoveredEntity || null;
  const hoveredKey = getHoverKey(activeHoveredItem);
  const sliderPercent = getPercent(safeCurrentYear, visibleStart, visibleEnd);
  const globalMarkerPercent = getPercent(currentYear, minYear, maxYear);
  const zoomWindowPosition = getWindowPosition(visibleStart, visibleEnd, minYear, maxYear);

  const handleHoverItem = useCallback((item) => {
    setLocalHoveredItem(item);
    if (item?.type === 'location' || item?.type === 'region') {
      onHoverEntityChange?.(item);
      return;
    }
    onHoverEntityChange?.(null);
  }, [onHoverEntityChange]);

  const clearHoverItem = useCallback(() => {
    setLocalHoveredItem(null);
    onHoverEntityChange?.(null);
  }, [onHoverEntityChange]);

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

  const handleEraPointerMove = useCallback((event) => {
    const dragState = dragStateRef.current;
    const rect = editorAxisRef.current?.getBoundingClientRect();
    if (!dragState || !rect?.width) return;

    const nextAnchorYear = getYearFromClientX(event.clientX, rect, minYear, maxYear);
    const delta = nextAnchorYear - dragState.anchorYear;
    let nextStart = dragState.startYear;
    let nextEnd = dragState.endYear;

    if (dragState.mode === 'move') {
      const span = dragState.endYear - dragState.startYear;
      nextStart = clamp(dragState.startYear + delta, minYear, maxYear - span);
      nextEnd = nextStart + span;
    } else if (dragState.mode === 'start') {
      nextStart = clamp(dragState.startYear + delta, minYear, dragState.endYear);
    } else {
      nextEnd = clamp(dragState.endYear + delta, dragState.startYear, maxYear);
    }

    updateEra(dragState.eraId, {
      startYear: nextStart,
      endYear: nextEnd,
    }, { mode: 'debounced' });
  }, [maxYear, minYear, updateEra]);

  const handleEraPointerUp = useCallback(() => {
    const dragState = dragStateRef.current;
    if (!dragState) return;

    dragStateRef.current = null;
    document.body.style.cursor = '';
    document.removeEventListener('pointermove', handleEraPointerMove);
    document.removeEventListener('pointerup', handleEraPointerUp);
    flushPendingEraSaves([dragState.eraId]).catch(() => null);
  }, [flushPendingEraSaves, handleEraPointerMove]);

  const handleBeginEraDrag = useCallback((event, era, mode = 'move') => {
    if (event.button !== undefined && event.button !== 0) return;
    const rect = editorAxisRef.current?.getBoundingClientRect();
    if (!rect?.width) return;

    event.preventDefault();
    event.stopPropagation();

    const startYear = toOptionalYear(era.startYear) ?? minYear;
    const endYear = toOptionalYear(era.endYear) ?? maxYear;

    dragStateRef.current = {
      eraId: era.id,
      mode,
      startYear,
      endYear,
      anchorYear: getYearFromClientX(event.clientX, rect, minYear, maxYear),
    };

    document.body.style.cursor = mode === 'move' ? 'grabbing' : 'ew-resize';
    document.addEventListener('pointermove', handleEraPointerMove);
    document.addEventListener('pointerup', handleEraPointerUp);
  }, [handleEraPointerMove, handleEraPointerUp, maxYear, minYear]);

  useEffect(() => () => {
    document.body.style.cursor = '';
    document.removeEventListener('pointermove', handleEraPointerMove);
    document.removeEventListener('pointerup', handleEraPointerUp);
  }, [handleEraPointerMove, handleEraPointerUp]);

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
      </button>

      {isExpanded && (
        <div className="timeline-window timeline-window--compact" onMouseLeave={clearHoverItem}>
          <div className="timeline-window__compact-meta">
            <span className="timeline-window__chip">{formatRange(visibleStart, visibleEnd)}</span>
            {activeHoveredItem?.name && (
              <span className="timeline-window__chip timeline-window__chip--hovered">
                {activeHoveredItem.name}
              </span>
            )}
          </div>

          <div className="timeline-window__axis timeline-window__axis--compact">
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

          <div className="timeline-window__compact-cluster custom-scrollbar">
            <div
              className="timeline-window__mini-lanes timeline-window__mini-lanes--eras"
              style={{ minHeight: `${packedCompactEras.laneCount * COMPACT_ERA_ROW_HEIGHT_REM}rem` }}
            >
              <span className="timeline-window__year-line" style={{ left: `${sliderPercent}%` }} />
              {Array.from({ length: packedCompactEras.laneCount }).map((_, laneIndex) => (
                <div
                  key={`compact-era-lane-${laneIndex}`}
                  className="timeline-window__mini-lane"
                  style={{ top: `${laneIndex * COMPACT_ERA_ROW_HEIGHT_REM}rem` }}
                />
              ))}
              {packedCompactEras.placed.map((era) => (
                <button
                  key={era.key}
                  type="button"
                  className={`timeline-window__mini-bar timeline-window__mini-bar--era ${currentEra?.id === era.id ? 'is-current' : ''}`}
                  style={{
                    ...getBarPosition(era.displayStart, era.displayEnd, visibleStart, visibleEnd),
                    top: `${era.lane * COMPACT_ERA_ROW_HEIGHT_REM + 0.11}rem`,
                    '--bar-color': era.color,
                  }}
                  onClick={() => onYearChange(clamp(Math.round((era.start + era.end) / 2), visibleStart, visibleEnd))}
                  onMouseEnter={() => handleHoverItem({ type: 'era', id: era.id, name: era.name })}
                  onMouseLeave={clearHoverItem}
                  title={`${era.name} (${era.start} to ${era.end})`}
                />
              ))}
            </div>

            <div
              className="timeline-window__mini-lanes timeline-window__mini-lanes--tracks"
              style={{ minHeight: `${packedCompactTracks.laneCount * COMPACT_TRACK_ROW_HEIGHT_REM}rem` }}
            >
              <span className="timeline-window__year-line" style={{ left: `${sliderPercent}%` }} />
              {Array.from({ length: packedCompactTracks.laneCount }).map((_, laneIndex) => (
                <div
                  key={`compact-track-lane-${laneIndex}`}
                  className="timeline-window__mini-lane"
                  style={{ top: `${laneIndex * COMPACT_TRACK_ROW_HEIGHT_REM}rem` }}
                />
              ))}
              {packedCompactTracks.placed.map((track) => (
                <div
                  key={track.key}
                  className={[
                    'timeline-window__mini-bar',
                    'timeline-window__mini-bar--track',
                    track.key === hoveredKey ? 'is-hovered' : '',
                    isVisibleInYear(track, currentYear, true, false) ? 'is-current' : '',
                  ].join(' ')}
                  style={{
                    ...getBarPosition(track.displayStart, track.displayEnd, visibleStart, visibleEnd),
                    top: `${track.lane * COMPACT_TRACK_ROW_HEIGHT_REM + 0.08}rem`,
                    '--bar-color': track.color,
                  }}
                  onMouseEnter={() => handleHoverItem({ type: track.type, id: track.id, name: track.name })}
                  onMouseLeave={clearHoverItem}
                  title={`${track.name} (${track.start} to ${track.end})`}
                />
              ))}
              {packedCompactTracks.placed.length === 0 && !loadingEras && (
                <div className="timeline-window__empty-state">No dated map items in this view.</div>
              )}
            </div>
          </div>
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
              <span className="timeline-bar__year-era">{currentEra?.name || currentEra?.label || 'Uncharted Age'}</span>
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
          </div>
        </div>
      </div>

      {isExpanded && isEditorMode && canManageEras && (
        <div className="timeline-editor-panel">
          <div className="timeline-editor-panel__header">
            <div>
              <p className="timeline-editor-panel__eyebrow">Editor</p>
              <h3>Era Workspace</h3>
            </div>
            <button
              type="button"
              className="timeline-editor__add"
              onClick={handleAddEra}
            >
              Add Era
            </button>
          </div>

          <div className="timeline-editor-panel__axis">
            {editorTickValues.map((tick) => (
              <span
                key={`editor-axis-${tick}`}
                className="timeline-editor-panel__axis-tick"
                style={{ left: `${getPercent(tick, minYear, maxYear)}%` }}
              >
                {formatYearTick(tick)}
              </span>
            ))}
          </div>

          <div
            ref={editorAxisRef}
            className="timeline-editor-panel__lanes"
            style={{ minHeight: `${packedEditorEras.laneCount * EDITOR_ROW_HEIGHT_REM}rem` }}
          >
            <span
              className="timeline-window__year-line timeline-window__year-line--editor"
              style={{ left: `${getPercent(currentYear, minYear, maxYear)}%` }}
            />
            {Array.from({ length: packedEditorEras.laneCount }).map((_, laneIndex) => (
              <div
                key={`editor-lane-${laneIndex}`}
                className="timeline-editor-panel__lane"
                style={{ top: `${laneIndex * EDITOR_ROW_HEIGHT_REM}rem` }}
              />
            ))}
            {packedEditorEras.placed.map((era) => (
              <div
                key={`editor-${era.id}`}
                className="timeline-editor-panel__era"
                style={{
                  ...getBarPosition(era.displayStart, era.displayEnd, minYear, maxYear),
                  top: `${era.lane * EDITOR_ROW_HEIGHT_REM + 0.35}rem`,
                  '--bar-color': era.color,
                }}
              >
                <button
                  type="button"
                  className="timeline-editor-panel__handle"
                  aria-label={`Adjust start of ${era.name}`}
                  onPointerDown={(event) => handleBeginEraDrag(event, era, 'start')}
                />
                <button
                  type="button"
                  className="timeline-editor-panel__era-body"
                  onPointerDown={(event) => handleBeginEraDrag(event, era, 'move')}
                  title="Drag to move this era"
                >
                  <span className="timeline-editor-panel__era-name">{era.name}</span>
                  <span className="timeline-editor-panel__era-range">{era.start} to {era.end}</span>
                </button>
                <button
                  type="button"
                  className="timeline-editor-panel__handle"
                  aria-label={`Adjust end of ${era.name}`}
                  onPointerDown={(event) => handleBeginEraDrag(event, era, 'end')}
                />
              </div>
            ))}
          </div>

          <div className="timeline-editor__grid">
            {eras.map((era) => (
              <article key={`editor-card-${era.id}`} className="timeline-editor__card">
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
                    className="timeline-editor__delete"
                    onClick={() => deleteEra(era.id).catch(() => null)}
                  >
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
