/**
 * InteractiveMap.jsx
 *
 * The main Leaflet-based world map.  Constants, utilities, and sub-components
 * have been extracted into dedicated modules to keep this file manageable:
 *
 *   ../../constants/mapConstants   — tile config, CRS, marker types, icon lists
 *   ../../utils/markerUtils        — icon resolution, location normalisation
 *   ./MapControls                  — Leaflet child components (tile layer, zoom, etc.)
 *   ./LocationMarker               — individual marker component
 */

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Map.css';

// ─── Context & auth ──────────────────────────────────────────────────────────
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useMapEffects } from '../../context/MapEffectsContext';
import { useLocationData } from '../../context/LocationDataContext';
import { useMovingUnits } from '../../context/MovingUnitDataContext';
import { useContent } from '../../context/ContentContext';
import { useLabels } from '../../context/LabelDataContext';
import { useRegions } from '../../context/RegionDataContext';

// ─── Layers & UI components ───────────────────────────────────────────────────
import SidePanel from '../UI/SidePanel';
import IntroLoadingScreen from '../IntroLoadingScreen';
import EditorInfoPanel from './EditorInfoPanel';
import VignetteLayer from './layers/VignetteLayer';
import FogLayer from './layers/FogLayer';
import CloudLayer from './layers/CloudLayer';
import HeatmapLayer from './layers/HeatmapLayer';
import RegionLayer from './layers/RegionLayer';
import LabelLayer from './layers/LabelLayer';
import ParallaxLayer from './layers/ParallaxLayer';
import DiagnosticsPanel from './DiagnosticsPanel';
import MarkerPalette from './MarkerPalette';
import MovingUnitLayer from './MovingUnitLayer';
import MovingUnitsPanel from './MovingUnitsPanel';
import ConfirmModal from './ConfirmModal';
import EditorSidePanel from './EditorSidePanel';
import FilterHoverPanel from './FilterHoverPanel';

// ─── Map sub-components ───────────────────────────────────────────────────────
import LocationMarker from './LocationMarker';
import {
  InvertedYTileLayer,
  KeyboardControls,
  ZoomControls,
  BoundsEnforcer,
  MapInstanceProvider,
  ZoomWatcher,
  EditorPlacementHandler,
  RegionDrawingHandler,
  LabelPlacementHandler,
  MovingUnitPlacementHandler,
  ViewSelectionCloseHandler,
} from './MapControls';

// ─── Constants ────────────────────────────────────────────────────────────────
import {
  API_BASE_URL,
  MARKER_TYPES,
  MARKER_PALETTE_CATEGORIES,
  MARKER_ICON_OPTIONS,
  DEFAULT_TYPE_ICON,
  TILE_SIZE,
  TILE_MIN_ZOOM_LEVEL,
  TILE_MAX_ZOOM_LEVEL,
  INTERACTIVE_MIN_ZOOM_LEVEL,
  INTERACTIVE_MAX_ZOOM_LEVEL,
  MAP_CENTER,
  MAP_BOUNDS,
  TILESET_CRS,
  ZOOM_SNAP,
  ZOOM_DELTA,
  WHEEL_PX_PER_ZOOM_LEVEL,
  clamp,
  getTypeConfig,
  resolveIconKey,
  buildIconSrc,
  createDefaultRegionFilters,
  normalizeCategoryId,
} from '../../constants/mapConstants';

// ─── Utilities ────────────────────────────────────────────────────────────────
import {
  normalizeLocationEntry,
  normalizeLocations,
  getMarkerFilterKey,
  getPlaceholderMarkerSrc,
  getPlacementConfig,
} from '../../utils/markerUtils';
import {
  applyWaypointCoordinateUpdate,
  buildPlatoonOffsets,
  normalizePositionTimeline,
  resolveLocationPosition,
  resolveMovingUnitHeading,
  resolveMovingUnitLeaderPosition,
  isMovingUnitVisibleAtYear,
} from '../../utils/timePositionUtils';
import { isVisibleInYear, toOptionalYear } from '../../utils/eraUtils';
import { findContainingRegionId, getRegionPolygons } from '../../utils/regionGeometry';

// ─── Region constants ─────────────────────────────────────────────────────────
import {
  DEFAULT_REGION_CATEGORY,
} from '../../constants/regionConstants';

// ─── Content diagnostics ──────────────────────────────────────────────────────
import { evaluateContentHealth } from '../../utils/contentDiagnostics';

// ─── Static data ──────────────────────────────────────────────────────────────
import locationsData from '../../data/locations.json';

// ─── Leaflet default icon fix ─────────────────────────────────────────────────
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// ─── Module-level helpers ─────────────────────────────────────────────────────

/** Returns a fresh copy of the bundled static locations.
 *  locations.json may be a bare array OR { locations: [...] } — handle both. */
const getFallbackLocations = () => {
  const arr = Array.isArray(locationsData)
    ? locationsData
    : (locationsData.locations ?? []);
  return arr.map((location) => ({ ...location }));
};

/** Tracks whether the intro has already been shown in this browser session. */
let introShownThisSession = false;

// ─── EditorToolbox ────────────────────────────────────────────────────────────
/**
 * A small editor-only panel for type selection and JSON import/export.
 * Rendered as a slot inside EditorSidePanel via InteractiveMap.
 */
function EditorToolbox({
  isEditorMode,
  selectedTypeId,
  onSelectType,
  jsonBuffer,
  onJsonChange,
  onExportJson,
  onImportJson,
  importError,
  showTypeButtons = true,
}) {
  if (!isEditorMode) return null;

  const selectedType = MARKER_TYPES.find((type) => type.id === selectedTypeId);

  return (
    <div className="editor-toolbox" aria-label="Editor toolbox">
      <div className="editor-toolbox__header">
        <p>Editor Toolbox</p>
        {showTypeButtons && (
          <span className="editor-toolbox__status">
            {selectedType ? `Placing: ${selectedType.label}` : 'Select a marker type'}
          </span>
        )}
      </div>
      {showTypeButtons && (
        <>
          <div className="editor-toolbox__buttons">
            {MARKER_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                className={`toolbox-button ${selectedTypeId === type.id ? 'toolbox-button--active' : ''}`}
                onClick={() => onSelectType(selectedTypeId === type.id ? null : type.id)}
              >
                {type.label}
              </button>
            ))}
          </div>
          {selectedType && (
            <p className="editor-toolbox__hint">
              Click anywhere on the map to place a {selectedType.label}.
            </p>
          )}
        </>
      )}
      <div className="editor-toolbox__data">
        <div className="editor-toolbox__data-actions">
          <button
            type="button"
            className="toolbox-button toolbox-button--ghost"
            onClick={onExportJson}
          >
            Export JSON
          </button>
          <button
            type="button"
            className="toolbox-button toolbox-button--primary"
            onClick={onImportJson}
          >
            Import JSON
          </button>
        </div>
        <textarea
          className="editor-toolbox__textarea"
          placeholder="Paste JSON array here..."
          value={jsonBuffer}
          onChange={(event) => onJsonChange(event.target.value)}
          rows={6}
        />
        {importError && <p className="editor-toolbox__error">{importError}</p>}
      </div>
    </div>
  );
}

// ─── InteractiveMap ───────────────────────────────────────────────────────────

function InteractiveMap({
  isEditorMode = false,
  filtersOpen = false,
  onToggleFilters,
  currentYear = 500,
  timelineActive = false,
  hoveredEntity = null,
  onLocationHoverChange,
  onRegionHoverChange,
}) {
  const PANEL_CLOSE_DURATION_MS = 220;
  const { role, user } = useAuth();
  const { toast } = useToast();
  const { cloudsEnabled, fogEnabled, vignetteEnabled, heatmapMode, intensities, setIntensity } =
    useMapEffects();
  const {
    locations,
    setLocations,
    selectedLocationId,
    selectLocation,
    createLocation,
    updateLocation,
    updateLocationLocal,
    deleteLocation,
    flushPendingLocationSaves,
    getLocationSaveState,
  } = useLocationData();
  const {
    movingUnits,
    selectedMovingUnitId,
    selectMovingUnit,
    updateMovingUnit,
    flushPendingMovingUnitSaves,
  } = useMovingUnits();
  const {
    regions,
    setRegions,
    selectedRegionId: activeRegionId,
    selectRegion,
    updateRegion,
    createRegion,
    deleteRegion: deleteRegionEntry,
    flushPendingRegionSaves,
  } = useRegions();
  const {
    labels,
    createLabel,
    updateLabel,
    deleteLabel,
    flushPendingLabelSaves,
  } = useLabels();
  const {
    entries: contentEntries,
    loading: contentLoading,
    error: contentError,
    issues: contentIssues,
  } = useContent();

  const [editorSelection, setEditorSelection] = useState(null);
  const [activePlacementTypeId, setActivePlacementTypeId] = useState(null);
  const [selectedPaletteItem, setSelectedPaletteItem] = useState(null);
  const [jsonBuffer, setJsonBuffer] = useState('');
  const [importError, setImportError] = useState('');
  const [isIntroVisible, setIsIntroVisible] = useState(() => !introShownThisSession);
  const [mapInstance, setMapInstance] = useState(null);
  const [mapZoom, setMapZoom] = useState(INTERACTIVE_MIN_ZOOM_LEVEL);
  const [isRegionMode, setIsRegionMode] = useState(false);
  const [regionDraftPoints, setRegionDraftPoints] = useState([]);
  const [regionDraftTargetId, setRegionDraftTargetId] = useState(null);
  const [showMarkers, setShowMarkers] = useState(true);
  const [markerFilters, setMarkerFilters] = useState({
    city: true,
    town: true,
    dungeon: true,
    ruins: true,
    landmark: true,
    npc: true,
    custom: true,
    generic: true,
  });
  const [showRegionsLayer, setShowRegionsLayer] = useState(true);
  const [regionFilters, setRegionFilters] = useState(() => createDefaultRegionFilters());
  const [particleFilters, setParticleFilters] = useState({
    snow: true,
    leaves: true,
    embers: true,
    magic: true,
    weather: true,
  });
  const [showMapLabels, setShowMapLabels] = useState(true);
  const [isPlacingLabel, setIsPlacingLabel] = useState(false);
  const [isEditorPanelOpen, setIsEditorPanelOpen] = useState(true);

  // Drag-and-drop state
  // Use a ref (not state) for the active marker ID so that setting it during
  // a Leaflet drag does NOT trigger a React re-render that would interrupt the drag.
  const draggingMarkerIdRef  = useRef(null);
  const draggingOriginRef    = useRef(null); // saves {lat,lng} at drag start
  const [showTrashZone, setShowTrashZone]   = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState(null); // { title, message, onConfirm }
  const trashZoneRef = useRef(null);
  // Track the last known mouse position via a document-level listener.
  // This is more reliable than originalEvent.clientX/Y from Leaflet's dragend,
  // which can sometimes be 0 or stale on certain browsers.
  const lastMousePosRef = useRef({ x: 0, y: 0 });

  const mapContainerRef         = useRef(null);
  const iconCheckQueueRef       = useRef(new Set());
  const viewPanelCloseTimeoutRef = useRef(null);
  const editorPanelCloseTimeoutRef = useRef(null);
  const animatedMovingUnitPositionsRef = useRef({});

  const [saveWarning, setSaveWarning]     = useState('');
  const [diagnostics, setDiagnostics]     = useState({});
  const [diagRefreshToken, setDiagRefreshToken] = useState(0);
  const [iconStatuses, setIconStatuses]   = useState({});
  const [isViewPanelClosing, setIsViewPanelClosing] = useState(false);
  const [isEditorLocationClosing, setIsEditorLocationClosing] = useState(false);
  const [animatedMovingUnitPositions, setAnimatedMovingUnitPositions] = useState({});
  const [formationPhase, setFormationPhase] = useState(0);

  const isAdmin = role === 'admin';
  const center  = MAP_CENTER;
  const zoom    = INTERACTIVE_MIN_ZOOM_LEVEL;

  const canAutoSave         = ['player', 'editor', 'admin'].includes(role);
  const hoveredLocationId = hoveredEntity?.type === 'location' ? hoveredEntity.id : null;
  const hoveredRegionId = hoveredEntity?.type === 'region' ? hoveredEntity.id : null;
  const buildEditorDraft = useCallback((location) => ({
    name: location?.name || '',
    type: location?.type || '',
    category: location?.category || '',
    lore: location?.lore || '',
    description: location?.description || '',
    secretId: location?.secretId ?? null,
    imageUrl: location?.imageUrl || '',
    imageDisplayMode: location?.imageDisplayMode || 'cover',
    pinned: location?.pinned ?? false,
    timeStart: location?.timeStart,
    timeEnd: location?.timeEnd,
    regionId: location?.regionId ?? null,
    positionTimeline: normalizePositionTimeline(location?.positionTimeline),
  }), []);

  useEffect(() => {
    return () => {
      if (viewPanelCloseTimeoutRef.current) {
        clearTimeout(viewPanelCloseTimeoutRef.current);
      }
      if (editorPanelCloseTimeoutRef.current) {
        clearTimeout(editorPanelCloseTimeoutRef.current);
      }
    };
  }, []);

  const filteredLocations = useMemo(
    () =>
      !showMarkers
        ? []
        : locations.filter((location) => {
            const key  = getMarkerFilterKey(location.type);
            const flag = markerFilters[key];
            if (flag === false) return false;
            if (hoveredLocationId != null && String(location.id) === String(hoveredLocationId)) {
              return true;
            }
            return isVisibleInYear(location, currentYear, timelineActive, isEditorMode);
          }),
    [locations, markerFilters, showMarkers, hoveredLocationId, timelineActive, currentYear, isEditorMode]
  );

  const useTemporalPositions = timelineActive || isEditorMode;
  const locationById = useMemo(
    () => new Map(locations.map((location) => [String(location.id), location])),
    [locations]
  );

  const displayedLocations = useMemo(
    () =>
      filteredLocations.map((location) => {
        if (!useTemporalPositions) return location;
        const resolvedPoint = resolveLocationPosition(location, currentYear, locationById);
        if (!resolvedPoint) return location;
        return {
          ...location,
          lat: resolvedPoint.lat,
          lng: resolvedPoint.lng,
        };
      }),
    [filteredLocations, useTemporalPositions, currentYear, locationById]
  );

  const filteredRegions = useMemo(
    () =>
      !showRegionsLayer && !isRegionMode
        ? []
        : regions.filter((region) => {
            if (isRegionMode && region.id === activeRegionId) return true;
            const categoryId = normalizeCategoryId(region.category);
            const flag       = regionFilters[categoryId];
            if (flag === false) return false;
            if (hoveredRegionId != null && String(region.id) === String(hoveredRegionId)) {
              return true;
            }
            return isVisibleInYear(region, currentYear, timelineActive, isEditorMode);
          }),
    [regions, regionFilters, isRegionMode, activeRegionId, showRegionsLayer, hoveredRegionId, currentYear, timelineActive, isEditorMode]
  );

  const filteredMapLabels = useMemo(() => {
    if (isEditorMode) return labels;
    if (!showMapLabels) return [];
    return labels.filter((label) => isVisibleInYear(label, currentYear, timelineActive, false));
  }, [labels, showMapLabels, currentYear, timelineActive, isEditorMode]);

  const visibleMovingUnits = useMemo(() => {
    if (!useTemporalPositions) return [];
    return movingUnits
      .filter((unit) => isEditorMode || isMovingUnitVisibleAtYear(unit, currentYear))
      .map((unit) => ({
        ...unit,
        targetLeader: resolveMovingUnitLeaderPosition(unit, currentYear, locationById),
      }))
      .filter((unit) => unit.targetLeader);
  }, [currentYear, isEditorMode, locationById, movingUnits, useTemporalPositions]);

  useEffect(() => {
    if (!visibleMovingUnits.length) {
      animatedMovingUnitPositionsRef.current = {};
      setAnimatedMovingUnitPositions({});
      return undefined;
    }

    const targets = Object.fromEntries(
      visibleMovingUnits.map((unit) => [String(unit.id), unit.targetLeader])
    );
    const starts = Object.fromEntries(
      visibleMovingUnits.map((unit) => [
        String(unit.id),
        animatedMovingUnitPositionsRef.current[String(unit.id)] || unit.targetLeader,
      ])
    );

    if (!useTemporalPositions) {
      animatedMovingUnitPositionsRef.current = targets;
      setAnimatedMovingUnitPositions(targets);
      return undefined;
    }

    const durationMs = 720;
    const rafHandle = { id: 0 };
    const startTime = performance.now();

    const step = (timestamp) => {
      const progress = Math.min(1, (timestamp - startTime) / durationMs);
      const nextPositions = Object.fromEntries(
        visibleMovingUnits.map((unit) => {
          const key = String(unit.id);
          const from = starts[key] || unit.targetLeader;
          const to = targets[key] || unit.targetLeader;
          return [key, {
            lat: from.lat + (to.lat - from.lat) * progress,
            lng: from.lng + (to.lng - from.lng) * progress,
          }];
        })
      );
      animatedMovingUnitPositionsRef.current = nextPositions;
      setAnimatedMovingUnitPositions(nextPositions);
      if (progress < 1) {
        rafHandle.id = window.requestAnimationFrame(step);
      }
    };

    rafHandle.id = window.requestAnimationFrame(step);
    return () => {
      if (rafHandle.id) {
        window.cancelAnimationFrame(rafHandle.id);
      }
    };
  }, [currentYear, useTemporalPositions, visibleMovingUnits]);

  useEffect(() => {
    if (!visibleMovingUnits.length) return undefined;
    const intervalId = window.setInterval(() => {
      setFormationPhase((prev) => prev + 0.16);
    }, 120);
    return () => window.clearInterval(intervalId);
  }, [visibleMovingUnits.length]);

  const displayedMovingUnits = useMemo(() => {
    if (!visibleMovingUnits.length) return [];
    let remainingFollowers = 40;
    let remainingUnits = visibleMovingUnits.length;

    return visibleMovingUnits.map((unit) => {
      const leader = animatedMovingUnitPositions[String(unit.id)] || unit.targetLeader;
      const desiredFollowers = unit.platoonStyle?.followers ?? 5;
      const perUnitBudget = remainingUnits > 0 ? Math.floor(remainingFollowers / remainingUnits) : 0;
      const allowedFollowers = remainingFollowers <= 0
        ? 0
        : Math.max(0, Math.min(desiredFollowers, Math.max(perUnitBudget, 1), 8));
      const fallbackHeading = resolveMovingUnitHeading(unit, currentYear, locationById);
      const animatedHeading =
        Math.abs((unit.targetLeader?.lat ?? leader.lat) - leader.lat) > 0.00001 ||
        Math.abs((unit.targetLeader?.lng ?? leader.lng) - leader.lng) > 0.00001
          ? resolveMovingUnitHeading({
              ...unit,
              movementTimeline: [
                {
                  id: `${unit.id}-current`,
                  startYear: currentYear,
                  endYear: null,
                  lat: leader.lat,
                  lng: leader.lng,
                },
                {
                  id: `${unit.id}-target`,
                  startYear: currentYear + 1,
                  endYear: null,
                  lat: unit.targetLeader?.lat,
                  lng: unit.targetLeader?.lng,
                },
              ],
            }, currentYear, locationById)
          : fallbackHeading;

      remainingFollowers -= allowedFollowers;
      remainingUnits -= 1;

      const followers = buildPlatoonOffsets(unit, allowedFollowers, {
        heading: animatedHeading,
        phase: formationPhase + remainingUnits * 0.24,
      }).map((offset, index) => ({
        id: `${unit.id}-follower-${index + 1}`,
        lat: leader.lat + offset.lat,
        lng: leader.lng + offset.lng,
        scale: offset.scale,
        heading: animatedHeading + (index % 2 === 0 ? -8 : 8),
      }));

      return {
        ...unit,
        lat: leader.lat,
        lng: leader.lng,
        heading: animatedHeading,
        followers,
      };
    });
  }, [animatedMovingUnitPositions, currentYear, formationPhase, locationById, visibleMovingUnits]);

  const regionLabelsEnabled = filteredRegions.some((region) => region.labelEnabled !== false);

  const zoomProgress = clamp(
    (mapZoom - INTERACTIVE_MIN_ZOOM_LEVEL) / (INTERACTIVE_MAX_ZOOM_LEVEL - INTERACTIVE_MIN_ZOOM_LEVEL),
    0,
    1
  );

  const reportDiagnostics = useCallback((key, entry) => {
    setDiagnostics((prev) => {
      const current = prev[key] || {};
      const next    = { ...current, ...entry };
      if (current.status === next.status && current.message === next.message) return prev;
      return { ...prev, [key]: next };
    });
  }, []);

  const handleDiagnosticsRefresh = () => {
    iconCheckQueueRef.current = new Set();
    setIconStatuses({});
    setDiagRefreshToken((prev) => prev + 1);
    reportDiagnostics('marker-icons', { status: 'pending', message: 'Rechecking icon sprites...' });
  };

  const handleIntensityChange = (key, value) => {
    setIntensity(key, clamp(value, 0, 1.25));
  };

  const resolveMarkerIcon = useCallback(
    (location) => {
      const iconKey        = resolveIconKey(location);
      const status         = iconStatuses[iconKey];
      const placeholderSrc = getPlaceholderMarkerSrc(location?.type);
      if (status?.status === 'ok') {
        return { key: iconKey, src: status.src, placeholder: placeholderSrc };
      }
      return { key: iconKey, src: placeholderSrc, placeholder: placeholderSrc, fallback: true };
    },
    [iconStatuses]
  );

  // ── Data fetching ────────────────────────────────────────────────────────────

  // Keep regionFilters in sync when regions gain a new category
  useEffect(() => {
    setRegionFilters((prev) => {
      let changed = false;
      const next  = { ...prev };
      regions.forEach((region) => {
        const categoryId = normalizeCategoryId(region.category);
        if (!(categoryId in next)) {
          next[categoryId] = true;
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [regions]);

  // ── Icon health checks ───────────────────────────────────────────────────────

  useEffect(() => {
    const uniqueKeys = new Set(locations.map((location) => resolveIconKey(location)));
    uniqueKeys.add(DEFAULT_TYPE_ICON.generic);
    uniqueKeys.forEach((key) => {
      if (!key) return;
      if (iconCheckQueueRef.current.has(key)) return;
      iconCheckQueueRef.current.add(key);
      const src = buildIconSrc(key);
      const img = new Image();
      img.onload  = () => setIconStatuses((prev) => prev[key]?.status === 'ok'    ? prev : { ...prev, [key]: { status: 'ok',    src } });
      img.onerror = () => setIconStatuses((prev) => prev[key]?.status === 'error' ? prev : { ...prev, [key]: { status: 'error', src } });
      img.src = src;
    });
  }, [locations, diagRefreshToken]);

  useEffect(() => {
    const uniqueKeys = new Set(locations.map((location) => resolveIconKey(location)));
    uniqueKeys.add(DEFAULT_TYPE_ICON.generic);
    let missing = 0, loaded = 0, pending = 0;
    uniqueKeys.forEach((key) => {
      const status = iconStatuses[key]?.status;
      if (status === 'ok')    loaded  += 1;
      else if (status === 'error') missing += 1;
      else pending += 1;
    });
    const message =
      `${locations.length} markers; ${loaded}/${uniqueKeys.size} icons loaded` +
      (missing ? `; ${missing} using fallback` : '') +
      (pending ? `; ${pending} pending`        : '');
    reportDiagnostics('marker-icons', { status: missing ? 'warn' : pending ? 'pending' : 'ok', message });
  }, [locations, iconStatuses, reportDiagnostics]);

  // ── Content diagnostics ──────────────────────────────────────────────────────

  useEffect(() => {
    if (contentLoading) {
      reportDiagnostics('content', { status: 'pending', message: 'Loading content entries...' });
      return;
    }
    if (!locations.length) {
      reportDiagnostics('content', {
        status: 'pending',
        message: 'Waiting for map data to validate content references.',
      });
      return;
    }
    const locationIds       = locations.map((location) => location.id);
    const { status, message } = evaluateContentHealth(contentEntries, { locationIds });
    reportDiagnostics('content', { status, message });
  }, [contentEntries, contentLoading, locations, reportDiagnostics]);

  useEffect(() => {
    if (!contentIssues) return;
    const unreadable  = contentIssues.unreadableFiles || [];
    if (unreadable.length) {
      reportDiagnostics('content-importer', {
        status:  'warn',
        message: `Unreadable files: ${unreadable.map((item) => item.path).join(', ')}`,
      });
      return;
    }
    const issueCount = contentIssues.issueCount || 0;
    reportDiagnostics('content-importer', {
      status:  issueCount ? contentIssues.status || 'warn' : 'ok',
      message: issueCount
        ? `Importer reported ${issueCount} issues across ${contentIssues.entryCount || contentEntries.length} entries.`
        : `Importer validated ${contentIssues.entryCount || contentEntries.length} entries.`,
    });
  }, [contentIssues, contentEntries.length, reportDiagnostics]);

  useEffect(() => {
    if (contentError) {
      reportDiagnostics('content', {
        status:  'warn',
        message: `Using fallback content: ${contentError}`,
      });
    }
  }, [contentError, reportDiagnostics]);

  // ── Location handlers ────────────────────────────────────────────────────────

  const handleLocationClick = (location) => {
    if (viewPanelCloseTimeoutRef.current) {
      clearTimeout(viewPanelCloseTimeoutRef.current);
      viewPanelCloseTimeoutRef.current = null;
    }
    if (editorPanelCloseTimeoutRef.current) {
      clearTimeout(editorPanelCloseTimeoutRef.current);
      editorPanelCloseTimeoutRef.current = null;
    }
    setIsViewPanelClosing(false);
    setIsEditorLocationClosing(false);

    if (editorSelection?.id && editorSelection.id !== location.id) {
      flushPendingLocationSaves([editorSelection.id], { successMode: 'none' }).catch(() => null);
    }
    selectMovingUnit(null);
    selectRegion(null);
    selectLocation(location.id);
    if (isEditorMode) {
      setEditorSelection({
        id:    location.id,
        draft: buildEditorDraft(location),
      });
    }
    // In view mode, selectLocation() triggers the SidePanel to open on the right.
  };

  const handleClosePanel = () => {
    if (!selectedLocation && !selectedRegion) return;
    if (viewPanelCloseTimeoutRef.current) {
      clearTimeout(viewPanelCloseTimeoutRef.current);
    }
    setIsViewPanelClosing(true);
    viewPanelCloseTimeoutRef.current = setTimeout(() => {
      selectLocation(null);
      selectRegion(null);
      setIsViewPanelClosing(false);
      viewPanelCloseTimeoutRef.current = null;
    }, PANEL_CLOSE_DURATION_MS);
  };

  const handleMovingUnitSelect = useCallback((unitId) => {
    if (editorSelection?.id) {
      flushPendingLocationSaves([editorSelection.id], { successMode: 'none' }).catch(() => null);
    }
    setEditorSelection(null);
    selectLocation(null);
    selectRegion(null);
    selectMovingUnit(unitId);
  }, [editorSelection?.id, flushPendingLocationSaves, selectLocation, selectMovingUnit, selectRegion]);

  const handleMovingUnitPlacement = useCallback((unitId, latlng) => {
    if (!unitId || !canAutoSave) return;
    const targetUnit = movingUnits.find((unit) => String(unit.id) === String(unitId));
    if (!targetUnit) return;
    const nextTimeline = applyWaypointCoordinateUpdate(targetUnit.movementTimeline, currentYear, latlng);
    updateMovingUnit(
      unitId,
      {
        lat: latlng.lat,
        lng: latlng.lng,
        movementTimeline: nextTimeline,
      },
      { mode: 'immediate', successMode: 'none' }
    ).catch(() => null);
  }, [canAutoSave, currentYear, movingUnits, updateMovingUnit]);

  const handleSelectedMovingUnitMapPlace = useCallback((latlng) => {
    if (!selectedMovingUnitId) return;
    handleMovingUnitPlacement(selectedMovingUnitId, latlng);
  }, [handleMovingUnitPlacement, selectedMovingUnitId]);

  const handleMarkerDragStart = useCallback((id) => {
    // Store ID and original position in refs — zero re-renders, so the Leaflet
    // drag operation is never interrupted by React reconciliation.
    draggingMarkerIdRef.current = id;
    const origin = locations.find((loc) => loc.id === id);
    draggingOriginRef.current   = origin ? { lat: origin.lat, lng: origin.lng } : null;
    // ONE state update to show the trash zone (renders it before user can reach it).
    setShowTrashZone(true);
  }, [locations]);

  const inferRegionIdForCoords = useCallback((lat, lng) => (
    findContainingRegionId(regions, lat, lng)
  ), [regions]);

  const handleMarkerDragEnd = useCallback((id, coords, originalEvent) => {
    const origin = draggingOriginRef.current;

    // ── Step 1: snapshot zone rect BEFORE any state updates ─────────────────
    // setShowTrashZone(false) will unmount the trash zone on the next render.
    // We must read getBoundingClientRect() now, while the element is still in the DOM.
    const zone = trashZoneRef.current;
    const zoneRect = zone ? zone.getBoundingClientRect() : null;

    // ── Step 2: resolve drop coordinates ────────────────────────────────────
    // Priority: originalEvent coords > lastMousePosRef (document mousemove tracker).
    // Leaflet's dragend originalEvent.clientX/Y can be 0 on some browsers.
    let clientX, clientY;
    if (originalEvent) {
      if (originalEvent.clientX != null && originalEvent.clientX !== 0) {
        clientX = originalEvent.clientX;
        clientY = originalEvent.clientY;
      } else if (originalEvent.changedTouches?.length) {
        clientX = originalEvent.changedTouches[0].clientX;
        clientY = originalEvent.changedTouches[0].clientY;
      }
    }
    // Fall back to the document-level mouse tracker if Leaflet gave us zeros.
    if (!clientX && !clientY) {
      clientX = lastMousePosRef.current.x;
      clientY = lastMousePosRef.current.y;
    }

    // ── Step 3: now it's safe to clear drag state / hide trash zone ──────────
    draggingMarkerIdRef.current = null;
    draggingOriginRef.current   = null;
    setShowTrashZone(false);

    // ── Step 4: check trash hit using the snapshotted rect ──────────────────
    if (clientX != null && zoneRect) {
      const isOverTrash =
        clientX >= zoneRect.left   - 20 &&   // generous ±20px tolerance
        clientX <= zoneRect.right  + 20 &&
        clientY >= zoneRect.top    - 20 &&
        clientY <= zoneRect.bottom + 20;

      if (isOverTrash) {
        // Snap marker back to its origin so it doesn't visually stay at the drop point.
        if (origin) {
          updateLocationLocal(id, { lat: origin.lat, lng: origin.lng });
        }
        const target = locations.find((loc) => loc.id === id);
        setPendingConfirm({
          title:   'Delete Marker',
          message: `Delete "${target?.name || 'this marker'}" from the map? This cannot be undone.`,
          onConfirm: async () => {
            setPendingConfirm(null);
            await deleteLocation(id, {
              successMessage: `"${target?.name || 'Location'}" deleted.`,
            }).catch(() => null);
            if (editorSelection?.id === id) setEditorSelection(null);
          },
        });
        return;
      }
    }

    // Normal reposition.
    const nextRegionId = inferRegionIdForCoords(coords.lat, coords.lng);
    const targetLocation = locations.find((loc) => String(loc.id) === String(id));
    if (!targetLocation) return;
    const nextUpdates =
      useTemporalPositions && Array.isArray(targetLocation.positionTimeline) && targetLocation.positionTimeline.length
        ? {
            positionTimeline: applyWaypointCoordinateUpdate(targetLocation.positionTimeline, currentYear, coords),
            regionId: nextRegionId,
          }
        : {
            lat: coords.lat,
            lng: coords.lng,
            regionId: nextRegionId,
          };
    updateLocation(
      id,
      nextUpdates,
      { mode: 'immediate', successMode: 'none' }
    );
  }, [currentYear, deleteLocation, editorSelection, inferRegionIdForCoords, locations, updateLocation, updateLocationLocal, useTemporalPositions]);

  // ── Region helpers ───────────────────────────────────────────────────────────

  const focusRegionOnMap = (regionId) => {
    if (!mapInstance) return;
    const region = regions.find((entry) => entry.id === regionId);
    if (!region) return;
    const allPoints = getRegionPolygons(region).flat();
    if (!allPoints.length) return;
    const latLngs = allPoints.map(([x, y]) => L.latLng(y, x));
    mapInstance.fitBounds(L.latLngBounds(latLngs).pad(0.2));
  };

  const updateRegionField = useCallback((regionId, field, value, options = {}) => {
    const normalizedValue =
      field === 'opacity'
        ? Math.min(Math.max(Number(value) || 0, 0), 1)
        : field === 'labelEnabled'
          ? Boolean(value)
          : value;
    return updateRegion(regionId, { [field]: normalizedValue }, options);
  }, [updateRegion]);

  const handleRegionPointAdd = (latlng) => {
    setRegionDraftPoints((prev) => [...prev, [latlng.lng, latlng.lat]]);
  };

  const handleRegionFinish = () => {
    setRegionDraftPoints((prevPoints) => {
      if (prevPoints.length < 3) return prevPoints;
      if (regionDraftTargetId) {
        const targetRegion = regions.find((region) => region.id === regionDraftTargetId);
        if (targetRegion) {
          const polygons = getRegionPolygons(targetRegion);
          const [first, ...rest] = polygons;
          updateRegion(
            regionDraftTargetId,
            {
              points: first || prevPoints,
              parts: first ? [...rest, prevPoints] : [...rest],
            },
            { mode: 'immediate', successMode: 'none' }
          ).catch(() => null);
        }
        return [];
      }
      const regionId = crypto.randomUUID ? crypto.randomUUID() : `region-${Date.now()}`;
      const newRegion = {
        id:           regionId,
        name:         'New Region',
        color:        '#f97316',
        borderColor:  '#ea580c',
        opacity:      0.3,
        category:     DEFAULT_REGION_CATEGORY,
        labelEnabled: true,
        points:       prevPoints.map(([x, y]) => [x, y]),
        parts:        [],
      };
      createRegion(newRegion, { mode: 'immediate', successMode: 'none' }).catch(() => null);
      selectRegion(regionId);
      return [];
    });
  };

  const handleRegionDraftReset = () => {
    setRegionDraftPoints([]);
    setIsPlacingLabel(false);
  };

  const handleStartSubregion = (regionId) => {
    if (!regionId || !canAutoSave) return;
    setRegionDraftPoints([]);
    setIsPlacingLabel(false);
    setRegionDraftTargetId(regionId);
    setIsRegionMode(true);
    selectRegion(regionId);
  };

  const handleCancelSubregion = () => {
    setRegionDraftPoints([]);
    setIsPlacingLabel(false);
    setRegionDraftTargetId(null);
  };

  const handleToggleRegionMode = () => {
    setIsRegionMode((prev) => {
      const next = !prev;
      if (!next) {
        setRegionDraftPoints([]);
        setIsPlacingLabel(false);
        selectRegion(null);
        setRegionDraftTargetId(null);
      } else {
        setSelectedPaletteItem(null);
        setActivePlacementTypeId(null);
        setRegionDraftTargetId(null);
        setRegionDraftPoints([]);
        setIsPlacingLabel(false);
        selectRegion(null);
      }
      return next;
    });
  };

  const handleRegionFieldChange = (field, value, regionId = activeRegionId) => {
    if (!regionId) return;
    const mode = field === 'labelEnabled' ? 'immediate' : 'debounced';
    updateRegionField(regionId, field, value, { mode, successMode: 'none' }).catch(() => null);
  };

  const handleDeleteRegion = (targetId = activeRegionId) => {
    if (!targetId) return;
    const target = regions.find((r) => r.id === targetId);
    setPendingConfirm({
      title:   'Delete Region',
      message: `Delete "${target?.name || 'this region'}"? All polygon data will be lost.`,
      onConfirm: async () => {
        await deleteRegionEntry(targetId, {
          mode: 'immediate',
          successMode: 'none',
        }).catch(() => null);
        if (activeRegionId === targetId) selectRegion(null);
        setPendingConfirm(null);
      },
    });
  };

  const handleRegionClick = (regionId) => {
    if (viewPanelCloseTimeoutRef.current) {
      clearTimeout(viewPanelCloseTimeoutRef.current);
      viewPanelCloseTimeoutRef.current = null;
    }
    setIsViewPanelClosing(false);

    if (isEditorMode) {
      selectRegion(regionId);
      setRegionDraftPoints([]);
      setIsPlacingLabel(false);
    } else {
      selectLocation(null);
      selectRegion(regionId);
      focusRegionOnMap(regionId);
    }
  };

  const handleMergeRegions = (targetId, sourceId) => {
    if (!targetId || !sourceId || targetId === sourceId) return;
    const target = regions.find((region) => region.id === targetId);
    const source = regions.find((region) => region.id === sourceId);
    if (!target || !source) return;
    const mergedPolygons = [...getRegionPolygons(target), ...getRegionPolygons(source)];
    const nextRegions = !mergedPolygons.length
      ? regions.filter((region) => region.id !== sourceId)
      : regions
          .filter((region) => region.id !== sourceId)
          .map((region) =>
            region.id === targetId
              ? { ...region, points: mergedPolygons[0], parts: mergedPolygons.slice(1) }
              : region
          );
    setRegions(nextRegions);
    flushPendingRegionSaves({ successMode: 'none' }).catch(() => null);
    selectRegion(targetId);
    setRegionDraftTargetId(null);
    setRegionDraftPoints([]);
    setIsPlacingLabel(false);
  };

  const handleAssignLocationToRegion = () => {
    if (!selectedLocation || !activeRegionId) return;
    setEditorSelection((prev) => (
      prev && prev.id === selectedLocation.id
        ? { ...prev, draft: { ...prev.draft, regionId: activeRegionId } }
        : prev
    ));
    updateLocation(selectedLocation.id, { regionId: activeRegionId }, { mode: 'immediate', successMode: 'none' });
  };

  // ── Label handlers ───────────────────────────────────────────────────────────

  const handleStartLabelPlacement = () => {
    setIsPlacingLabel(true);
    setIsRegionMode(false);
    setSelectedPaletteItem(null);
    setActivePlacementTypeId(null);
  };

  const handlePlaceLabel = async (latlng) => {
    try {
      await createLabel({
        text: 'New Label',
        color: '#fef3c7',
        font: "'Cinzel','Cormorant Garamond',serif",
        size: 1,
        zoomScale: 1,
        scaleWithZoom: true,
        fadeInStart: 3,
        fadeInEnd: 5,
        lat: latlng.lat,
        lng: latlng.lng,
      });
    } catch {
      // toast handled by shared label context
    }
    setIsPlacingLabel(false);
  };

  const handleLabelDrag = (id, coords) => {
    updateLabel(id, coords, { mode: 'immediate' }).catch(() => null);
  };

  const handleLabelFieldChange = (id, field, value) => {
    const currentLabel = labels.find((label) => String(label.id) === String(id));
    if (!currentLabel) return;
    const numericFields = ['size', 'zoomScale', 'fadeInStart', 'fadeInEnd'];
    const booleanFields = ['scaleWithZoom'];
    const yearFields = ['timeStart', 'timeEnd'];
    let nextValue = value;

    if (numericFields.includes(field)) {
      const parsed = Number(value);
      nextValue = Number.isFinite(parsed) ? parsed : 0;
    } else if (booleanFields.includes(field)) {
      nextValue = value === false || value === 'false' ? false : Boolean(value);
    } else if (yearFields.includes(field)) {
      nextValue = toOptionalYear(value);
    }

    let updates = { [field]: nextValue };
    if (field === 'fadeInStart' || field === 'fadeInEnd') {
      const epsilon = 0.05;
      const currentStart = field === 'fadeInStart'
        ? nextValue
        : currentLabel.fadeInStart ?? 2.8;
      let currentEnd = field === 'fadeInEnd'
        ? nextValue
        : currentLabel.fadeInEnd ?? currentStart + 1.2;

      if (currentEnd <= currentStart + epsilon) {
        currentEnd = currentStart + epsilon;
      }

      updates = {
        fadeInStart: field === 'fadeInStart' ? Math.min(currentStart, currentEnd - epsilon) : currentStart,
        fadeInEnd: currentEnd,
      };
    }

    updateLabel(id, updates, { mode: 'debounced' }).catch(() => null);
  };

  const handleDeleteLabel = (id) => {
    deleteLabel(id).catch(() => null);
  };

  // ── Marker placement handlers ────────────────────────────────────────────────

  const handleSelectPaletteItem = (item) => {
    setSelectedPaletteItem((prev) => {
      const next = prev && prev.iconKey === item.iconKey ? null : item;
      setActivePlacementTypeId(next ? next.type : null);
      return next;
    });
  };

  const handleSelectPlacementType = (typeId) => {
    setActivePlacementTypeId(typeId);
    if (typeId) setSelectedPaletteItem(null);
  };

  const openEditorForLocation = useCallback((location) => {
    selectLocation(location.id);
    setEditorSelection({
      id: location.id,
      draft: buildEditorDraft(location),
    });
  }, [buildEditorDraft, selectLocation]);

  const handlePlaceMarker = async (latlng) => {
    const placementConfig = getPlacementConfig({
      paletteItem: selectedPaletteItem,
      activeTypeId: activePlacementTypeId,
    });
    if (!placementConfig) return;
    const typeConfig = getTypeConfig(placementConfig.typeId);
    try {
      const created = await createLocation({
        name:        placementConfig.label ? `New ${placementConfig.label}` : `New ${typeConfig.label}`,
        type:        placementConfig.typeId,
        iconKey:     placementConfig.iconKey,
        description: '',
        category:    typeConfig.label,
        tags:        [],
        regionId:    inferRegionIdForCoords(latlng.lat, latlng.lng),
        lat:         latlng.lat,
        lng:         latlng.lng,
      }, {
        successMessage: `Placed "${placementConfig.label ? `New ${placementConfig.label}` : `New ${typeConfig.label}`}" on the map.`,
      });
      openEditorForLocation(created);
    } catch {
      // toast handled by shared location context
    }
  };

  // ── Drag-from-palette-to-map ─────────────────────────────────────────────────

  // Direct placement used by palette drag-and-drop (item is known, not from state)
  const placeMarkerWithItem = useCallback(async (latlng, item) => {
    if (!item) return;
    const placementConfig = getPlacementConfig({ paletteItem: item, activeTypeId: item.type });
    if (!placementConfig) return;
    const typeConfig = getTypeConfig(placementConfig.typeId);
    try {
      const created = await createLocation({
        name:        placementConfig.label ? `New ${placementConfig.label}` : `New ${typeConfig.label}`,
        type:        placementConfig.typeId,
        iconKey:     placementConfig.iconKey,
        description: '',
        category:    typeConfig.label,
        tags:        [],
        regionId:    inferRegionIdForCoords(latlng.lat, latlng.lng),
        lat:         latlng.lat,
        lng:         latlng.lng,
      }, {
        successMessage: `Placed "${placementConfig.label ? `New ${placementConfig.label}` : `New ${typeConfig.label}`}" on the map.`,
      });
      openEditorForLocation(created);
    } catch {
      // toast handled by shared location context
    }
  }, [createLocation, inferRegionIdForCoords, openEditorForLocation]);

  const handleMapDragOver = useCallback((e) => {
    if (!isEditorMode) return;
    // Allow drop only when carrying a palette marker
    if (e.dataTransfer?.types?.includes('application/x-marker')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, [isEditorMode]);

  const handleMapDrop = useCallback((e) => {
    if (!isEditorMode || !mapInstance) return;
    const raw = e.dataTransfer?.getData('application/x-marker');
    if (!raw) return;
    e.preventDefault();
    try {
      const item = JSON.parse(raw);
      const rect = mapContainerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const point = L.point(e.clientX - rect.left, e.clientY - rect.top);
      const latlng = mapInstance.containerPointToLatLng(point);
      placeMarkerWithItem(latlng, item);
    } catch {
      // ignore malformed drag data
    }
  }, [isEditorMode, mapInstance, placeMarkerWithItem]);

  // ── JSON import/export ───────────────────────────────────────────────────────

  const handleJsonBufferChange = (value) => {
    setJsonBuffer(value);
    setImportError('');
  };

  const handleExportJson = () => {
    setJsonBuffer(JSON.stringify(locations, null, 2));
    setImportError('');
  };

  const handleImportJson = () => {
    try {
      const trimmed = jsonBuffer.trim();
      if (!trimmed) throw new Error('Please provide JSON to import.');
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) throw new Error('JSON must be an array of locations.');
      const parsedLocations = parsed.map((entry, index) => ({
        id:          typeof entry.id === 'number' ? entry.id : index + 1,
        name:        entry.name        ?? `Location ${index + 1}`,
        type:        entry.type        ?? 'generic',
        description: entry.description ?? '',
        lore:        entry.lore        ?? '',
        lat:         typeof entry.lat === 'number' ? entry.lat : 0,
        lng:         typeof entry.lng === 'number' ? entry.lng : 0,
        glowColor:   entry.glowColor,
      }));
      const normalized = normalizeLocations(parsedLocations);
      setLocations(normalized);
      selectLocation(null);
      setEditorSelection(null);
      setImportError('');
      setJsonBuffer(JSON.stringify(normalized, null, 2));
      if (canAutoSave && user) {
        fetch(`${API_BASE_URL}/locations/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ locations: normalized }),
        })
          .then(async (response) => {
            const data = await response.json().catch(() => ({}));
            if (!response.ok) throw new Error(data.error || 'Unable to import locations.');
            setLocations(normalizeLocations(data.locations || []));
            setSaveWarning('');
            toast.success(`Imported ${normalized.length} locations.`);
          })
          .catch((error) => {
            setSaveWarning(error.message || 'Unable to import locations.');
            toast.error(error.message || 'Unable to import locations.');
          });
      }
    } catch (error) {
      setImportError(error.message || 'Unable to import JSON.');
    }
  };

  // ── Editor mode side-effects ─────────────────────────────────────────────────

  useEffect(() => {
    if (isEditorMode) {
      selectLocation(null);
      setSaveWarning('');
    } else {
      if (editorSelection?.id) {
        flushPendingLocationSaves([editorSelection.id], { successMode: 'none' }).catch(() => null);
      }
      flushPendingMovingUnitSaves(undefined, { successMode: 'none' }).catch(() => null);
      setEditorSelection(null);
      selectMovingUnit(null);
      setActivePlacementTypeId(null);
      setIsRegionMode(false);
      setIsPlacingLabel(false);
      selectRegion(null);
      setSaveWarning('');
      flushPendingLabelSaves().catch(() => null);
      flushPendingRegionSaves({ successMode: 'none' }).catch(() => null);
    }
  }, [editorSelection?.id, flushPendingLabelSaves, flushPendingLocationSaves, flushPendingMovingUnitSaves, flushPendingRegionSaves, isEditorMode, selectLocation, selectMovingUnit, selectRegion]);

  useEffect(() => {
    if (!isEditorMode) return;
    return () => {
      setIsRegionMode(false);
      setIsPlacingLabel(false);
    };
  }, [isEditorMode]);

  // ── Track last mouse position for reliable trash-zone hit detection ──────────
  // Leaflet's dragend originalEvent.clientX/Y can be 0 on some browsers.
  // A document-level mousemove listener gives us a reliable fallback.
  useEffect(() => {
    const handleMouseMove = (e) => {
      lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    };
    document.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => document.removeEventListener('mousemove', handleMouseMove);
  }, []);

  // ── Auto-save: locations ─────────────────────────────────────────────────────

  // ── Auto-save: regions ───────────────────────────────────────────────────────

  // Cleanup timeouts on unmount
  useEffect(() => () => {
    flushPendingLocationSaves(undefined, { successMode: 'none' }).catch(() => null);
    flushPendingLabelSaves().catch(() => null);
    flushPendingRegionSaves({ successMode: 'none' }).catch(() => null);
  }, [flushPendingLabelSaves, flushPendingLocationSaves, flushPendingRegionSaves]);

  // ── Map interaction side-effects ─────────────────────────────────────────────

  useEffect(() => {
    if (!mapInstance) return;
    const syncZoom = () => setMapZoom(mapInstance.getZoom());
    syncZoom();
    mapInstance.on('zoom',    syncZoom);
    mapInstance.on('zoomend', syncZoom);
    return () => {
      mapInstance.off('zoom',    syncZoom);
      mapInstance.off('zoomend', syncZoom);
    };
  }, [mapInstance]);

  useEffect(() => {
    // Guard: mapInstance must exist AND Leaflet's internal pane DOM must be ready.
    // The _panes object is only populated after the map has fully initialised its
    // container — calling invalidateSize() before that throws "_leaflet_pos" errors.
    if (!mapInstance?._panes) return;
    try {
      mapInstance.invalidateSize();
    } catch {
      // Map container not yet ready; will re-run when mapInstance stabilises.
    }
  }, [mapInstance, isEditorMode]);

  useEffect(() => {
    if (!mapInstance?.doubleClickZoom) return;
    if (isRegionMode) mapInstance.doubleClickZoom.disable();
    else              mapInstance.doubleClickZoom.enable();
  }, [isRegionMode, mapInstance]);

  useEffect(() => {
    if (!isRegionMode) return undefined;
    const handleKey = (event) => { if (event.key === 'Escape') setIsPlacingLabel(false); };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isRegionMode]);

  useEffect(() => {
    if (!mapInstance) return;
    const handlers = [
      mapInstance.dragging, mapInstance.scrollWheelZoom, mapInstance.doubleClickZoom,
      mapInstance.boxZoom,  mapInstance.keyboard,        mapInstance.touchZoom,
    ];
    handlers.forEach((handler) => {
      if (!handler) return;
      if (isIntroVisible && handler.disable) handler.disable();
      else if (!isIntroVisible && handler.enable) handler.enable();
    });
  }, [mapInstance, isIntroVisible]);

  const handleIntroFinish = () => {
    introShownThisSession = true;
    setIsIntroVisible(false);
  };

  // ── Loading progress ─────────────────────────────────────────────────────────

  const LOADING_DEBUG       = true;
  const loadStartTimeRef    = useRef(performance.now());
  const [loadProgress, setLoadProgress] = useState(0);

  useEffect(() => {
    if (!isIntroVisible) return;
    const elapsed = ((performance.now() - loadStartTimeRef.current) / 1000).toFixed(2);
    if (mapInstance) {
      if (LOADING_DEBUG) console.log(`[InteractiveMap] mapInstance ready at ${elapsed}s -> 100%`);
      setLoadProgress(100);
    } else {
      let progress = 10;
      if (Array.isArray(locations)) progress += 20;
      if (Array.isArray(regions))   progress += 20;
      if (LOADING_DEBUG) console.log(`[InteractiveMap] Loading at ${elapsed}s: ${progress}%`);
      setLoadProgress(progress);
    }
  }, [isIntroVisible, locations, regions, mapInstance]);

  // ── Derived state ────────────────────────────────────────────────────────────

  const selectedLocation = locations.find((location) => location.id === selectedLocationId) || null;
  const selectedRegion   = regions.find((region) => region.id === activeRegionId)           || null;
  const selectedRegionLocations = useMemo(
    () =>
      selectedRegion
        ? locations.filter((location) => String(location.regionId) === String(selectedRegion.id))
        : [],
    [locations, selectedRegion]
  );

  useEffect(() => {
    if (!isEditorMode || !editorSelection?.id || !selectedLocation) return;
    if (String(editorSelection.id) !== String(selectedLocation.id)) return;
    const nextDraft = buildEditorDraft(selectedLocation);
    const currentDraft = editorSelection.draft || {};
    const fields = ['name', 'type', 'category', 'lore', 'description', 'secretId', 'imageUrl', 'imageDisplayMode', 'pinned', 'timeStart', 'timeEnd', 'regionId'];
    const changed = fields.some((field) => currentDraft[field] !== nextDraft[field])
      || JSON.stringify(currentDraft.positionTimeline || []) !== JSON.stringify(nextDraft.positionTimeline || []);
    if (!changed) return;
    setEditorSelection((prev) => (
      prev && String(prev.id) === String(selectedLocation.id)
        ? { ...prev, draft: nextDraft }
        : prev
    ));
  }, [buildEditorDraft, editorSelection, isEditorMode, selectedLocation]);

  const handleEditorFieldChange = useCallback((field, value) => {
    if (!editorSelection) return;

    const nextValue = value === undefined ? null : value;
    setEditorSelection((prev) => {
      if (!prev) return prev;
      return { ...prev, draft: { ...prev.draft, [field]: nextValue } };
    });

    if (!canAutoSave) {
      setSaveWarning('Only approved editors can save changes to the shared map.');
      return;
    }

    setSaveWarning('');
    const mode =
      field === 'pinned' || field === 'regionId' || field === 'secretId'
        ? 'immediate'
        : 'debounced';
    updateLocation(editorSelection.id, { [field]: nextValue }, { mode, successMode: 'none' }).catch((error) => {
      setSaveWarning(error.message || 'Unable to save location.');
    });
  }, [canAutoSave, editorSelection, updateLocation]);

  // ── Rendered slot components ─────────────────────────────────────────────────

  const handleEditorCommit = useCallback(() => {
    if (!editorSelection?.id || !canAutoSave) {
      if (!canAutoSave) {
        setSaveWarning('Only approved editors can save changes to the shared map.');
      }
      return Promise.resolve();
    }

    setSaveWarning('');
    const name = editorSelection.draft?.name || selectedLocation?.name || 'Location';
    return flushPendingLocationSaves([editorSelection.id], {
      successMode: 'immediate',
      successMessage: `Saved "${name}".`,
    }).catch((error) => {
      setSaveWarning(error.message || 'Unable to save location.');
      return null;
    });
  }, [canAutoSave, editorSelection, flushPendingLocationSaves, selectedLocation?.name]);

  const handleEditorBlur = useCallback(() => {
    if (!editorSelection?.id || !canAutoSave) return;
    flushPendingLocationSaves([editorSelection.id], { successMode: 'none' }).catch((error) => {
      setSaveWarning(error.message || 'Unable to save location.');
    });
  }, [canAutoSave, editorSelection?.id, flushPendingLocationSaves]);

  const handleEditorSave = useCallback(() => {
    handleEditorCommit();
  }, [handleEditorCommit]);

  const handleEditorCancel = useCallback(() => {
    if (!editorSelection?.id) {
      setEditorSelection(null);
      selectLocation(null);
      return;
    }

    if (editorPanelCloseTimeoutRef.current) {
      clearTimeout(editorPanelCloseTimeoutRef.current);
    }

    const closingLocationId = editorSelection.id;
    setIsEditorLocationClosing(true);
    editorPanelCloseTimeoutRef.current = setTimeout(() => {
      if (canAutoSave) {
        flushPendingLocationSaves([closingLocationId], { successMode: 'none' }).catch(() => null);
      }
      setEditorSelection((prev) => (
        prev && String(prev.id) === String(closingLocationId) ? null : prev
      ));
      selectLocation(null);
      setIsEditorLocationClosing(false);
      editorPanelCloseTimeoutRef.current = null;
    }, PANEL_CLOSE_DURATION_MS);
  }, [canAutoSave, editorSelection?.id, flushPendingLocationSaves, selectLocation]);

  const handleDeleteLocation = useCallback(() => {
    if (!editorSelection) return;
    if (!canAutoSave) {
      setSaveWarning('Only approved editors can save changes to the shared map.');
      return;
    }

    const target = locations.find((loc) => loc.id === editorSelection.id);
    setPendingConfirm({
      title: 'Delete Location',
      message: `Delete "${target?.name || 'this location'}" from the map? This cannot be undone.`,
      onConfirm: async () => {
        await deleteLocation(editorSelection.id, {
          successMessage: `"${target?.name || 'Location'}" deleted.`,
        }).catch((error) => {
          setSaveWarning(error.message || 'Unable to delete location.');
        });
        setEditorSelection(null);
        if (selectedLocationId === editorSelection.id) selectLocation(null);
        setPendingConfirm(null);
      },
    });
  }, [canAutoSave, deleteLocation, editorSelection, locations, selectLocation, selectedLocationId]);

  const editorDraft = editorSelection?.draft ?? null;

  const markerPaletteNode = (
    <MarkerPalette
      isEditorMode={isEditorMode}
      options={MARKER_ICON_OPTIONS}
      selectedOption={selectedPaletteItem}
      onSelect={handleSelectPaletteItem}
      categoryOptions={MARKER_PALETTE_CATEGORIES}
      groupByCategory
    />
  );

  const markerToolboxNode = (
    <EditorToolbox
      isEditorMode={isEditorMode}
      selectedTypeId={activePlacementTypeId}
      onSelectType={handleSelectPlacementType}
      jsonBuffer={jsonBuffer}
      onJsonChange={handleJsonBufferChange}
      onExportJson={handleExportJson}
      onImportJson={handleImportJson}
      importError={importError}
      showTypeButtons={false}
    />
  );

  // Only render the editor form when a marker is actually selected.
  // Passing null when idle lets EditorSidePanel show its empty-state correctly
  // and avoids the JSX reference changing on every render (which would break
  // the useEffect dep array in EditorSidePanel).
  const locationEditorNode = isEditorMode && editorSelection ? (
    <EditorInfoPanel
      isOpen
      isClosing={isEditorLocationClosing}
      draft={editorDraft}
      onFieldChange={handleEditorFieldChange}
      onFieldBlur={handleEditorBlur}
      onFieldCommit={handleEditorCommit}
      onSave={handleEditorSave}
      onCancel={handleEditorCancel}
      canAutoSave={canAutoSave}
      saveWarning={saveWarning}
      saveState={getLocationSaveState(editorSelection.id)}
      canDelete={canAutoSave}
      onDelete={handleDeleteLocation}
    />
  ) : null;

  const movingUnitsPanelNode = isEditorMode ? (
    <MovingUnitsPanel
      canAutoSave={canAutoSave}
      currentYear={currentYear}
      defaultCoordinates={mapInstance?.getCenter?.() || center}
    />
  ) : null;

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className={`map-wrapper ${isIntroVisible ? 'map-wrapper--locked' : ''}`}>
      <div className="map-layout">
        <div className="map-layout__canvas">
          <div
            className="map-container-wrapper"
            ref={mapContainerRef}
            onDragOver={handleMapDragOver}
            onDrop={handleMapDrop}
          >
            {/* Trash zone — shown when a map marker is being dragged */}
            {showTrashZone && (
              <div ref={trashZoneRef} className="marker-trash-zone">
                <span className="marker-trash-zone__icon">🗑</span>
                <span className="marker-trash-zone__label">Drop to delete</span>
              </div>
            )}
            <MapContainer
              key={`map-${isEditorMode ? 'edit' : 'view'}`}
              center={center}
              zoom={zoom}
              minZoom={INTERACTIVE_MIN_ZOOM_LEVEL}
              maxZoom={INTERACTIVE_MAX_ZOOM_LEVEL}
              crs={TILESET_CRS}
              className="leaflet-map"
              scrollWheelZoom={true}
              dragging={true}
              doubleClickZoom={true}
              zoomControl={false}
              zoomSnap={ZOOM_SNAP}
              zoomDelta={ZOOM_DELTA}
              wheelPxPerZoomLevel={WHEEL_PX_PER_ZOOM_LEVEL}
              wheelDebounceTime={0}
              zoomAnimation={true}
              zoomAnimationThreshold={8}
              markerZoomAnimation={true}
              inertia={true}
              inertiaDeceleration={1800}
              style={{ height: '100%', width: '100%' }}
            >
              <InvertedYTileLayer
                tileSize={TILE_SIZE}
                minZoom={INTERACTIVE_MIN_ZOOM_LEVEL}
                maxZoom={INTERACTIVE_MAX_ZOOM_LEVEL}
                maxNativeZoom={TILE_MAX_ZOOM_LEVEL}
                minNativeZoom={TILE_MIN_ZOOM_LEVEL}
                keepBuffer={6}
              />
              <MapInstanceProvider onMapReady={setMapInstance} />
              <BoundsEnforcer bounds={MAP_BOUNDS} enabled={!isEditorMode} debug={true} />
              <EditorPlacementHandler
                isEnabled={
                  isEditorMode &&
                  !editorSelection &&
                  !isRegionMode &&
                  Boolean(selectedPaletteItem || activePlacementTypeId)
                }
                onPlaceMarker={handlePlaceMarker}
              />
              <ZoomWatcher onZoomChange={setMapZoom} />
              <RegionDrawingHandler
                isActive={isEditorMode && isRegionMode}
                onAddPoint={handleRegionPointAdd}
                onFinish={handleRegionFinish}
              />
              <LabelPlacementHandler
                isActive={isEditorMode && isPlacingLabel}
                onPlace={handlePlaceLabel}
              />
              <MovingUnitPlacementHandler
                isActive={isEditorMode && Boolean(selectedMovingUnitId) && !isRegionMode && !isPlacingLabel}
                onPlace={handleSelectedMovingUnitMapPlace}
              />
              <ViewSelectionCloseHandler
                isEnabled={
                  (!isEditorMode && Boolean(selectedLocation)) ||
                  (isEditorMode &&
                    (Boolean(editorSelection) || Boolean(selectedMovingUnitId)) &&
                    !isRegionMode &&
                    !isPlacingLabel)
                }
                onClose={isEditorMode
                  ? () => {
                      if (editorSelection) handleEditorCancel();
                      else selectMovingUnit(null);
                    }
                  : handleClosePanel}
              />
              <KeyboardControls />
              <ZoomControls />

              {displayedLocations.map((location) => (
                <LocationMarker
                  key={location.id}
                  location={location}
                  onLocationClick={handleLocationClick}
                  onHoverChange={onLocationHoverChange}
                  isTimelineHovered={hoveredLocationId != null && String(location.id) === String(hoveredLocationId)}
                  isSelected={selectedLocation && selectedLocation.id === location.id}
                  isEditorMode={isEditorMode}
                  onDragStart={handleMarkerDragStart}
                  onDragEnd={handleMarkerDragEnd}
                  zoomLevel={mapZoom}
                  resolveIcon={resolveMarkerIcon}
                />
              ))}

              <LabelLayer
                labels={filteredMapLabels}
                zoomLevel={mapZoom}
                isEditable={isEditorMode}
                isEditorMode={isEditorMode}
                onDragLabel={handleLabelDrag}
              />
              <RegionLayer
                regions={filteredRegions}
                draftPoints={regionDraftPoints}
                selectedRegionId={activeRegionId}
                highlightedRegionId={hoveredRegionId}
                onRegionClick={handleRegionClick}
                onRegionHoverChange={onRegionHoverChange}
                interactionEnabled={!isRegionMode}
                showLabels={regionLabelsEnabled}
                zoomLevel={mapZoom}
              />
              <FogLayer
                enabled={fogEnabled}
                intensity={intensities.fog}
                onDiagnostics={reportDiagnostics}
              />
              <CloudLayer
                enabled={cloudsEnabled}
                intensity={intensities.clouds}
                onDiagnostics={reportDiagnostics}
              />
              <MovingUnitLayer
                units={displayedMovingUnits}
                zoomLevel={mapZoom}
                selectedUnitId={selectedMovingUnitId}
                isEditorMode={isEditorMode}
                onSelectUnit={isEditorMode ? handleMovingUnitSelect : undefined}
                onDragUnitEnd={isEditorMode ? handleMovingUnitPlacement : undefined}
              />
            </MapContainer>
            {isEditorMode && (
              <div className="editor-zoom-bar" aria-hidden="true">
                <div className="editor-zoom-bar__track">
                  <div className="editor-zoom-bar__fill" style={{ width: `${Math.round(zoomProgress * 100)}%` }} />
                </div>
                <span className="editor-zoom-bar__value">Zoom {mapZoom.toFixed(1)}</span>
              </div>
            )}
            <VignetteLayer
              enabled={vignetteEnabled}
              intensity={intensities.vignette}
              onDiagnostics={reportDiagnostics}
            />

            <HeatmapLayer
              enabled={heatmapMode !== 'none'}
              map={mapInstance}
              locations={displayedLocations}
              heatmapMode={heatmapMode}
              onDiagnostics={reportDiagnostics}
            />
            <ParallaxLayer
              enabled
              map={mapInstance}
              containerRef={mapContainerRef}
              onDiagnostics={reportDiagnostics}
            />
          </div>
        </div>
        {isEditorMode && (
          <div className={`editor-panel-shell ${isEditorPanelOpen ? 'is-open' : 'is-closed'}`}>
            <div className="editor-panel-shell__panel">
              <EditorSidePanel
                isEditorMode={isEditorMode}
                markerPalette={markerPaletteNode}
                movingUnitsPanel={movingUnitsPanelNode}
                selectedMovingUnitId={selectedMovingUnitId}
                markerToolbox={markerToolboxNode}
                locationEditor={locationEditorNode}
                regions={regions}
                activeRegionId={activeRegionId}
                onSelectRegion={selectRegion}
                onFocusRegion={focusRegionOnMap}
                onDeleteRegion={handleDeleteRegion}
                canAutoSave={canAutoSave}
                isRegionMode={isRegionMode}
                onToggleRegionMode={handleToggleRegionMode}
                regionDraftPoints={regionDraftPoints}
                onFinishRegion={handleRegionFinish}
                onResetRegionDraft={handleRegionDraftReset}
                canAssignSelection={Boolean(isEditorMode && selectedLocation && activeRegionId)}
                onAssignSelection={handleAssignLocationToRegion}
                selectedRegionName={selectedRegion?.name || ''}
                selectedLocationName={selectedLocation?.name || ''}
                onRegionFieldChange={handleRegionFieldChange}
                onMergeRegion={handleMergeRegions}
                onStartSubregion={handleStartSubregion}
                onCancelSubregion={handleCancelSubregion}
                regionDraftTargetId={regionDraftTargetId}
                labels={labels}
                showMapLabels={showMapLabels}
                onToggleLabels={setShowMapLabels}
                onStartPlaceLabel={handleStartLabelPlacement}
                isPlacingLabel={isPlacingLabel}
                onLabelFieldChange={handleLabelFieldChange}
                onDeleteLabel={handleDeleteLabel}
                mapZoom={mapZoom}
              />
              <button
                type="button"
                className="editor-panel-shell__toggle-tab"
                aria-expanded={isEditorPanelOpen}
                onClick={() => setIsEditorPanelOpen((prev) => !prev)}
              >
                Tools
              </button>
            </div>
          </div>
        )}
      </div>

      {/* In view mode, show the read-only side panel */}
      {!isEditorMode && selectedLocation && (
        <SidePanel
          location={selectedLocation}
          onClose={handleClosePanel}
          isClosing={isViewPanelClosing}
        />
      )}
      {!isEditorMode && !selectedLocation && selectedRegion && (
        <SidePanel
          region={selectedRegion}
          regionLocations={selectedRegionLocations}
          onClose={handleClosePanel}
          onSelectLocation={handleLocationClick}
          isClosing={isViewPanelClosing}
        />
      )}
      {/* In editor mode, render the edit form as a fixed overlay on the right */}
      {isEditorMode && locationEditorNode}
      {isIntroVisible && (
        <IntroLoadingScreen
          onFinish={handleIntroFinish}
          manualProgress={loadProgress}
          isReady={!!mapInstance}
        />
      )}
      {isAdmin && (
        <DiagnosticsPanel
          diagnostics={diagnostics}
          onRefresh={handleDiagnosticsRefresh}
          intensities={intensities}
          onIntensityChange={handleIntensityChange}
        />
      )}
      <FilterHoverPanel
        isOpen={filtersOpen}
        onToggleOpen={onToggleFilters}
        showMarkers={showMarkers}
        markerFilters={markerFilters}
        onToggleMarkers={() => setShowMarkers((prev) => !prev)}
        onToggleMarkerCategory={(key, value) =>
          setMarkerFilters((prev) => ({ ...prev, [key]: value }))
        }
        showRegions={showRegionsLayer}
        onToggleRegions={() => setShowRegionsLayer((prev) => !prev)}
        particleFilters={particleFilters}
        onToggleParticle={(key, value) =>
          setParticleFilters((prev) => ({ ...prev, [key]: value }))
        }
      />
      <ConfirmModal
        isOpen={Boolean(pendingConfirm)}
        title={pendingConfirm?.title}
        message={pendingConfirm?.message}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onConfirm={pendingConfirm?.onConfirm}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
}

export default InteractiveMap;
