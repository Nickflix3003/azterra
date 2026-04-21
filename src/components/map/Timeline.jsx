/**
 * Timeline.jsx
 *
 * A horizontal scrubber bar that sits below the Azterra world map.
 * Lets players and editors move through in-world history and (when
 * filtering is active) hides locations that don't exist at the
 * current year.
 *
 * Props
 *   currentYear       number     The currently-viewed year
 *   onYearChange      fn         Called with new year number
 *   timelineActive    boolean    Whether filtering is on
 *   onToggle          fn         Toggle filtering on/off
 *   locations         array      Full location list (for count)
 *   isEditorMode      boolean    Show extra editor hints when true
 *   minYear           number     Slider lower bound  (default 0)
 *   maxYear           number     Slider upper bound  (default 1000)
 */

import React, { useRef, useState } from 'react';
import './Timeline.css';
import { isVisibleInYear } from '../../utils/eraUtils';

// ── Preset eras ──────────────────────────────────────────────────────────────
const PRESETS = [
  { label: 'Before Records',  year: 0   },
  { label: 'Founding Age',    year: 100 },
  { label: 'Age of Strife',   year: 300 },
  { label: 'Great Conquest',  year: 500 },
  { label: 'Current Era',     year: 750 },
  { label: 'End of Days',     year: 1000 },
];

function formatYear(y) {
  if (y <= 0)   return 'Pre-history';
  if (y < 100)  return `Year ${y}`;
  if (y < 1000) return `Year ${y}`;
  return `Year ${y}`;
}

function getEraLabel(y) {
  if (y <= 0)    return 'Before Records';
  if (y < 100)   return 'Early Age';
  if (y < 300)   return 'Founding Age';
  if (y < 500)   return 'Age of Strife';
  if (y < 700)   return 'Great Conquest';
  if (y < 900)   return 'Current Era';
  return 'End of Days';
}

export default function Timeline({
  currentYear,
  onYearChange,
  timelineActive,
  onToggle,
  locations = [],
  isEditorMode = false,
  minYear = 0,
  maxYear = 1000,
}) {
  const [presetOpen, setPresetOpen] = useState(false);
  const presetRef   = useRef(null);

  const visibleCount = timelineActive
    ? locations.filter((loc) => isVisibleInYear(loc, currentYear, true, isEditorMode)).length
    : locations.length;

  const pct = ((currentYear - minYear) / (maxYear - minYear)) * 100;

  const handlePreset = (year) => {
    onYearChange(year);
    setPresetOpen(false);
  };

  return (
    <div className={`timeline-bar ${timelineActive ? 'timeline-bar--active' : ''}`}>

      {/* ── Left controls (col 1, spans both rows) ── */}
      <div className="timeline-bar__left">
        <button
          type="button"
          className={`timeline-bar__toggle ${timelineActive ? 'is-active' : ''}`}
          onClick={onToggle}
          title={timelineActive ? 'Timeline filter ON — click to disable' : 'Enable timeline filter'}
        >
          <span className="timeline-bar__toggle-icon">⏳</span>
          <span className="timeline-bar__toggle-label">TIMELINE</span>
        </button>

        <div className="timeline-bar__count" title="Locations visible at this point in time">
          <span className="timeline-bar__count-num">{visibleCount}</span>
          <span className="timeline-bar__count-label">visible</span>
        </div>
      </div>

      {/* ── Year / era display (col 2, row 1) ── */}
      <div className="timeline-bar__year-display" aria-live="polite" aria-atomic="true">
        <span className="timeline-bar__year-num">{formatYear(currentYear)}</span>
        <span className="timeline-bar__year-era">{getEraLabel(currentYear)}</span>
      </div>

      {/* ── Slider (col 2, row 2) ── */}
      <div className="timeline-bar__slider-wrap">
        {/* Tick marks at 0, 25, 50, 75, 100 % */}
        <div className="timeline-bar__ticks" aria-hidden="true">
          {[0, 25, 50, 75, 100].map((p) => {
            const yr = Math.round(minYear + (p / 100) * (maxYear - minYear));
            return (
              <div key={p} className="timeline-bar__tick" style={{ left: `${p}%` }}>
                <span className="timeline-bar__tick-label">{yr === 0 ? 'Pre' : yr}</span>
              </div>
            );
          })}
        </div>

        {/* The actual range input */}
        <input
          type="range"
          className="timeline-bar__slider"
          min={minYear}
          max={maxYear}
          step={1}
          value={currentYear}
          onChange={(e) => onYearChange(Number(e.target.value))}
          aria-label="Current year on the world timeline"
          style={{ '--pct': `${pct}%` }}
        />
      </div>

      {/* ── Right controls (col 3, spans both rows) ── */}
      <div className="timeline-bar__right" ref={presetRef}>
        <div className="timeline-bar__preset-wrap">
          <button
            type="button"
            className="timeline-bar__preset-btn"
            onClick={() => setPresetOpen((v) => !v)}
          >
            ERAS {presetOpen ? '▲' : '▼'}
          </button>
          {presetOpen && (
            <div className="timeline-bar__preset-menu">
              {PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  className={`timeline-bar__preset-item ${currentYear === p.year ? 'is-active' : ''}`}
                  onClick={() => handlePreset(p.year)}
                >
                  <span className="preset-item__label">{p.label}</span>
                  <span className="preset-item__year">Year {p.year}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {isEditorMode && (
          <span className="timeline-bar__editor-hint">
            Select a location to set its era
          </span>
        )}
      </div>
    </div>
  );
}
