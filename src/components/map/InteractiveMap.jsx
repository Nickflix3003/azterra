import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, Marker, Popup, useMap, useMapEvent } from 'react-leaflet';
import SidePanel from '../UI/SidePanel';
import IntroOverlay from '../IntroOverlay';
import EditorInfoPanel from './EditorInfoPanel';
import { useAuth } from '../../context/AuthContext';
import { useMapEffects } from '../../context/MapEffectsContext';
import { useLocationData } from '../../context/LocationDataContext';
import { useContent } from '../../context/ContentContext';
import VignetteLayer from './layers/VignetteLayer';
import FogLayer from './layers/FogLayer';
import CloudLayer from './layers/CloudLayer';
import HeatmapLayer from './layers/HeatmapLayer';
import RegionLayer from './layers/RegionLayer';
import LabelLayer from './layers/LabelLayer';
import ParallaxLayer from './layers/ParallaxLayer';
import DiagnosticsPanel from './DiagnosticsPanel';
import MarkerPalette from './MarkerPalette';
import RegionInfoPanel from './RegionInfoPanel';
import EditorSidePanel from './EditorSidePanel';
import FilterHoverPanel from './FilterHoverPanel';
import { useRegions } from '../../context/RegionDataContext';
import {
  DEFAULT_REGION_CATEGORY,
  REGION_CATEGORIES,
  normalizeRegionEntry,
} from '../../constants/regionConstants';
import { evaluateContentHealth } from '../../utils/contentDiagnostics';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './Map.css';
import locationsData from '../../data/locations.json';

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const ASSET_BASE_URL = import.meta.env.BASE_URL || '/';
const ICON_BASE_URL = `${ASSET_BASE_URL}icons/cities/`;
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '/api';
const getFallbackLocations = () => locationsData.map((location) => ({ ...location }));

// Fix for default marker icons
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// Demo locations
const DEMO_LOCATIONS = [
  { id: 1, name: 'London', lat: 51.505, lng: -0.09, glowColor: '#FFD700' },
  { id: 2, name: 'Paris', lat: 48.8566, lng: 2.3522, glowColor: '#74c2e1' }
  // Add more if desired
];

const MARKER_TYPES = [
  { id: 'city', label: 'City', glowColor: '#F7B267' },
  { id: 'town', label: 'Town', glowColor: '#74c2e1' },
  { id: 'dungeon', label: 'Dungeon', glowColor: '#8E7CC3' },
  { id: 'landmark', label: 'Landmark', glowColor: '#FFDAB9' },
];

const GENERIC_MARKER_TYPE = { id: 'generic', label: 'Generic', glowColor: '#9ca3af' };
const TYPE_CONFIG = MARKER_TYPES.reduce(
  (acc, type) => ({ ...acc, [type.id]: type }),
  { [GENERIC_MARKER_TYPE.id]: GENERIC_MARKER_TYPE }
);

const LOCATION_FILTER_OPTIONS = [
  ...MARKER_TYPES.map((type) => ({ id: type.id, label: type.label })),
  { id: GENERIC_MARKER_TYPE.id, label: GENERIC_MARKER_TYPE.label },
];

const DEFAULT_TYPE_ICON = {
  city: 'city-gold',
  town: 'town-oak',
  dungeon: 'dungeon-abyss',
  landmark: 'landmark-spire',
  generic: 'city-gold',
};

const MARKER_ICON_OPTIONS = [
  { iconKey: 'city-gold', label: 'Gilded City', type: 'city' },
  { iconKey: 'city-blue', label: 'Azure City', type: 'city' },
  { iconKey: 'city-crimson', label: 'Crimson City', type: 'city' },
  { iconKey: 'city-emerald', label: 'Emerald City', type: 'city' },
  { iconKey: 'town-oak', label: 'Oak Town', type: 'town' },
  { iconKey: 'town-harbor', label: 'Harbor Town', type: 'town' },
  { iconKey: 'town-river', label: 'River Town', type: 'town' },
  { iconKey: 'dungeon-abyss', label: 'Abyss Dungeon', type: 'dungeon' },
  { iconKey: 'dungeon-ember', label: 'Ember Dungeon', type: 'dungeon' },
  { iconKey: 'landmark-spire', label: 'Sun Spire', type: 'landmark' },
  { iconKey: 'landmark-obelisk', label: 'Obelisk', type: 'landmark' },
  { iconKey: 'port-azure', label: 'Azure Port', type: 'city' },
  { iconKey: 'port-sunset', label: 'Sunset Port', type: 'city' },
  { iconKey: 'citadel-iron', label: 'Iron Citadel', type: 'city' },
  { iconKey: 'citadel-sun', label: 'Sun Citadel', type: 'city' },
  { iconKey: 'village-meadow', label: 'Meadow Village', type: 'town' },
  { iconKey: 'village-sand', label: 'Sand Village', type: 'town' },
  { iconKey: 'camp-northern', label: 'Northern Camp', type: 'landmark' },
  { iconKey: 'camp-jungle', label: 'Jungle Camp', type: 'landmark' },
  { iconKey: 'academy-star', label: 'Star Academy', type: 'landmark' },
];

const REGION_FILTER_OPTIONS = REGION_CATEGORIES.map((category) => ({
  id: category,
  label: category.charAt(0).toUpperCase() + category.slice(1),
}));

const createDefaultRegionFilters = () =>
  REGION_FILTER_OPTIONS.reduce((acc, option) => {
    acc[option.id] = true;
    return acc;
  }, {});

const normalizeCategoryId = (value) => {
  if (!value || typeof value !== 'string') return DEFAULT_REGION_CATEGORY;
  return value.toLowerCase();
};

const getDefaultIconKey = (typeId) => DEFAULT_TYPE_ICON[typeId] || DEFAULT_TYPE_ICON.generic;

const getTypeConfig = (type) => {
  if (!type) return GENERIC_MARKER_TYPE;
  const key = typeof type === 'string' ? type.toLowerCase() : type;
  return TYPE_CONFIG[key] || GENERIC_MARKER_TYPE;
};

const resolveIconKey = (location) => location.iconKey || getDefaultIconKey(location.type);
const buildIconSrc = (iconKey) => `${ICON_BASE_URL}${iconKey}.png`;

const MARKER_PLACEHOLDER_COLORS = {
  city: '#facc15',
  town: '#93c5fd',
  dungeon: '#c084fc',
  landmark: '#fb923c',
  generic: '#e5e7eb',
};

const buildNavStyleMarker = (color, letter) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40"><path d="M16 3C9.4 3 4 8.4 4 15c0 8.7 12 20 12 20s12-11.3 12-20C28 8.4 22.6 3 16 3Z" fill="white" stroke="${color}" stroke-width="2" /><circle cx="16" cy="15" r="7" fill="${color}" stroke="#0f172a" stroke-width="2"/><text x="16" y="19" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="9" font-weight="700" fill="#0f172a">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

const PLACEHOLDER_MARKER_SRC = {
  city: buildNavStyleMarker(MARKER_PLACEHOLDER_COLORS.city, 'C'),
  town: buildNavStyleMarker(MARKER_PLACEHOLDER_COLORS.town, 'T'),
  dungeon: buildNavStyleMarker(MARKER_PLACEHOLDER_COLORS.dungeon, 'D'),
  landmark: buildNavStyleMarker(MARKER_PLACEHOLDER_COLORS.landmark, 'L'),
  generic: buildNavStyleMarker(MARKER_PLACEHOLDER_COLORS.generic, 'M'),
};

const getPlaceholderMarkerSrc = (type) => {
  const typeConfig = getTypeConfig(type);
  return PLACEHOLDER_MARKER_SRC[typeConfig.id] || PLACEHOLDER_MARKER_SRC.generic;
};

const normalizeLocationEntry = (location) => {
  const typeConfig = getTypeConfig(location.type);
  const iconKey = location.iconKey || getDefaultIconKey(typeConfig.id);
  const lat = location.lat ?? location.x ?? 0;
  const lng = location.lng ?? location.y ?? 0;
  return {
    id: location.id,
    name: location.name || `${typeConfig.label}`,
    type: typeConfig.id,
    iconKey,
    lat,
    lng,
    x: location.x ?? lat,
    y: location.y ?? lng,
    description: location.description ?? '',
    category: location.category ?? typeConfig.label,
    tags: Array.isArray(location.tags) ? location.tags : [],
    regionId: location.regionId ?? null,
    glowColor: location.glowColor || typeConfig.glowColor,
  };
};

const normalizeLocations = (locations) => locations.map((location) => normalizeLocationEntry(location));

const getMarkerFilterKey = (typeId) => {
  const normalized = (typeId || '').toLowerCase();
  if (['city', 'town', 'dungeon', 'ruins', 'landmark', 'npc'].includes(normalized)) {
    return normalized;
  }
  if (normalized === 'generic') return 'generic';
  return 'custom';
};

const getPlacementConfig = ({ paletteItem, activeTypeId }) => {
  if (paletteItem) {
    return {
      typeId: paletteItem.type,
      label: paletteItem.label,
      iconKey: paletteItem.iconKey,
    };
  }
  if (activeTypeId) {
    const typeConfig = getTypeConfig(activeTypeId);
    return {
      typeId: typeConfig.id,
      label: typeConfig.label,
      iconKey: getDefaultIconKey(typeConfig.id),
    };
  }
  return null;
};

const TILE_SIZE = 256;
const TILE_MIN_ZOOM_LEVEL = 0;
const TILE_MAX_ZOOM_LEVEL = 8; // matches tilemapresource (orders 0..8)
const INTERACTIVE_MAX_ZOOM_LEVEL = 8; // allow native res at max zoom
const INTERACTIVE_MIN_ZOOM_LEVEL = 3;
// Native raster size derived from z=8 folder (160 x 160 tiles @256px = 40,960px square).
const MAP_PIXEL_WIDTH = TILE_SIZE * 160;
const MAP_PIXEL_HEIGHT = TILE_SIZE * 160;
const BASE_TILE_COLS = MAP_PIXEL_WIDTH / TILE_SIZE;
const BASE_TILE_ROWS = MAP_PIXEL_HEIGHT / TILE_SIZE;
const MAP_CENTER = [MAP_PIXEL_HEIGHT / 2, MAP_PIXEL_WIDTH / 2];
const PAN_STEP = 200;
const MAP_PADDING = TILE_SIZE * 0.75; // allow slight drift before bounce
const MAP_BOUNDS = L.latLngBounds(
  [-MAP_PADDING, -MAP_PADDING],
  [MAP_PIXEL_HEIGHT + MAP_PADDING, MAP_PIXEL_WIDTH + MAP_PADDING]
);
const EDITOR_MAX_BOUNDS = null;
const BOUNDS_VISCOSITY = 0.35; // gentle resistance for a boomerang effect
const ZOOM_SNAP = 0.5;
const ZOOM_DELTA = 0.5;
const WHEEL_PX_PER_ZOOM_LEVEL = 240;
const MAX_SCALE = Math.pow(2, TILE_MAX_ZOOM_LEVEL);
const TILESET_CRS = L.extend({}, L.CRS.Simple, {
  scale: (zoom) => Math.pow(2, zoom) / MAX_SCALE,
  zoom: (scale) => Math.log(scale * MAX_SCALE) / Math.LN2,
  // Use a top-left origin; tile Y inversion is handled in InvertedYTileLayer.
  transformation: new L.Transformation(1, 0, 1, 0),
});

let introShownThisSession = false;

// Helpers to invert tile Y when Leaflet requests top-origin rows against bottom-origin tiles.
const getTileCountForZoom = (z) => {
  const factor = Math.pow(2, TILE_MAX_ZOOM_LEVEL - z);
  return {
    x: Math.ceil(BASE_TILE_COLS / factor),
    y: Math.ceil(BASE_TILE_ROWS / factor),
  };
};

const buildTileUrl = (z, x, y) => {
  const counts = getTileCountForZoom(z);
  if (x < 0 || y < 0 || x >= counts.x || y >= counts.y) {
    return null;
  }
  const invertedY = counts.y - 1 - y;
  return `${ASSET_BASE_URL}tiles/${z}/${x}/${invertedY}.jpg`;
};

function InvertedYTileLayer({
  minZoom,
  maxZoom,
  maxNativeZoom,
  minNativeZoom,
  tileSize,
  keepBuffer,
}) {
  const map = useMap();
  const EMPTY_TILE = 'data:image/gif;base64,R0lGODlhAQABAAD/ACwAAAAAAQABAAACADs=';

  useEffect(() => {
    const LayerClass = L.TileLayer.extend({
      getTileUrl(coords) {
        const counts = getTileCountForZoom(coords.z);
        if (coords.x < 0 || coords.y < 0 || coords.x >= counts.x || coords.y >= counts.y) {
          return EMPTY_TILE;
        }
        const invertedY = counts.y - 1 - coords.y;
        return `${ASSET_BASE_URL}tiles/${coords.z}/${coords.x}/${invertedY}.jpg`;
      },
    });

    const layer = new LayerClass('', {
      minZoom,
      maxZoom,
      maxNativeZoom,
      minNativeZoom,
      tileSize,
      noWrap: true,
      keepBuffer,
      reuseTiles: true,
      updateWhenIdle: false,
      updateWhenZooming: true,
    });
    layer.addTo(map);

    return () => {
      layer.removeFrom(map);
    };
  }, [map, minZoom, maxZoom, maxNativeZoom, minNativeZoom, tileSize, keepBuffer]);

  return null;
}

// Keyboard controls remain as-is
function KeyboardControls() {
  const map = useMap();
  useEffect(() => {
    const handleKeyDown = (e) => {
      const center = map.getCenter();
      switch (e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
          map.panTo([center.lat - PAN_STEP, center.lng]);
          break;
        case 'ArrowDown':
        case 's':
        case 'S':
          map.panTo([center.lat + PAN_STEP, center.lng]);
          break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
          map.panTo([center.lat, center.lng - PAN_STEP]);
          break;
        case 'ArrowRight':
        case 'd':
        case 'D':
          map.panTo([center.lat, center.lng + PAN_STEP]);
          break;
        default:
          break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [map]);
  return null;
}

function ZoomControls() {
  const map = useMap();

  return (
    <div className="zoom-controls">
      <button
        className="zoom-button"
        type="button"
        aria-label="Zoom in"
        onClick={() => map.zoomIn()}
      >
        +
      </button>
      <button
        className="zoom-button"
        type="button"
        aria-label="Zoom out"
        onClick={() => map.zoomOut()}
      >
        -
      </button>
    </div>
  );
}

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

function EditorPlacementHandler({ isEnabled, onPlaceMarker }) {
  useMapEvent('click', (event) => {
    if (!isEnabled) return;
    onPlaceMarker(event.latlng);
  });
  return null;
}

function RegionDrawingHandler({ isActive, onAddPoint, onFinish }) {
  useMapEvent('click', (event) => {
    if (!isActive) return;
    onAddPoint(event.latlng);
  });

  useMapEvent('dblclick', (event) => {
    if (!isActive) return;
    event.originalEvent?.preventDefault();
    onFinish();
  });

  return null;
}

function LabelPlacementHandler({ isActive, onPlace }) {
  useMapEvent('click', (event) => {
    if (!isActive) return;
    onPlace(event.latlng);
  });
  return null;
}

function ZoomWatcher({ onZoomChange }) {
  const map = useMap();
  useEffect(() => {
    if (!map || !onZoomChange) return;
    const sync = () => onZoomChange(map.getZoom());
    sync();
    map.on('zoom', sync);
    map.on('zoomend', sync);
    map.on('zoomlevelschange', sync);
    return () => {
      map.off('zoom', sync);
      map.off('zoomend', sync);
      map.off('zoomlevelschange', sync);
    };
  }, [map, onZoomChange]);
  return null;
}

// LocationMarker handles its own hover/selection state
function LocationMarker({
  location,
  onLocationClick,
  isSelected,
  isEditorMode,
  onDragEnd,
  zoomLevel,
  resolveIcon,
}) {
  const [isHovered, setIsHovered] = useState(false);

  const iconSize = (() => {
    const base = 36;
    const scale = 1 + (zoomLevel - 4) * 0.08;
    return clamp(base * scale, 20, 64);
  })();

  const resolvedIcon = resolveIcon ? resolveIcon(location) : { src: buildIconSrc(resolveIconKey(location)) };
  const placeholderSrc = resolvedIcon?.placeholder || getPlaceholderMarkerSrc(location?.type);
  const iconSrc = resolvedIcon?.src || placeholderSrc;
  const safeName = (location.name || '').replace(/"/g, '&quot;');

  return (
    <Marker
      position={[location.lat, location.lng]}
      draggable={isEditorMode}
      icon={L.divIcon({
        className: `custom-marker custom-marker--${location.type} ${isSelected ? 'custom-marker--selected' : ''
          }`,
        html: `
          <div class="custom-marker__wrapper ${isHovered ? 'is-hovered' : ''}">
            <img src="${iconSrc}" alt="${safeName}"
              class="custom-marker__image" loading="lazy"
              style="width:${iconSize}px;height:${iconSize}px;"
              onerror="this.onerror=null;this.dataset.missing='1';this.src='${placeholderSrc}'" />
          </div>
        `,
        iconSize: [iconSize, iconSize],
        iconAnchor: [iconSize / 2, iconSize],
      })}
      eventHandlers={{
        mouseover: () => setIsHovered(true),
        mouseout: () => setIsHovered(false),
        click: () => onLocationClick(location),
        dragend: (event) => {
          if (!isEditorMode || !onDragEnd) return;
          const { lat, lng } = event.target.getLatLng();
          onDragEnd(location.id, { lat, lng });
        },
      }}
    >
      {isHovered && (
        <Popup>
          <div className="location-popup">
            <h3>{location.name}</h3>
          </div>
        </Popup>
      )}
    </Marker>
  );
}

function InteractiveMap({ isEditorMode = false, filtersOpen = false, onToggleFilters }) {
  const allowDrag = false;
  const tilePrefetchCacheRef = useRef(new Set());
  const lastZoomRef = useRef(null);
  const wheelDeltaRef = useRef(0);
  const wheelFocusRef = useRef(null);
  const wheelRafRef = useRef(null);
  const wheelResetRef = useRef(null);
  const zoomFocusRef = useRef(null);
  const { role, user } = useAuth();
  const { cloudsEnabled, fogEnabled, vignetteEnabled, heatmapMode, intensities, setIntensity } =
    useMapEffects();
  const { locations, setLocations, selectedLocationId, selectLocation } = useLocationData();
  const { regions, setRegions, selectedRegionId: activeRegionId, selectRegion } = useRegions();
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
  const [mapLabels, setMapLabels] = useState([]);
  const [isPlacingLabel, setIsPlacingLabel] = useState(false);
  const [isEditorPanelOpen, setIsEditorPanelOpen] = useState(true);
  const saveTimeoutRef = useRef(null);
  const lastSavedSnapshotRef = useRef('[]');
  const skipNextAutoSaveRef = useRef(false);
  const regionSaveTimeoutRef = useRef(null);
  const lastRegionSnapshotRef = useRef('[]');
  const mapContainerRef = useRef(null);
  const iconCheckQueueRef = useRef(new Set());
  const [saveWarning, setSaveWarning] = useState('');
  const [diagnostics, setDiagnostics] = useState({});
  const [diagRefreshToken, setDiagRefreshToken] = useState(0);
  const [iconStatuses, setIconStatuses] = useState({});
  const isAdmin = role === 'admin';
  const center = MAP_CENTER;
  const zoom = INTERACTIVE_MIN_ZOOM_LEVEL;
  const serializedLocations = useMemo(() => JSON.stringify(locations), [locations]);
  const serializedRegions = useMemo(() => JSON.stringify(regions), [regions]);
  const canAutoSave = role === 'editor' || role === 'admin';
  const filteredLocations = useMemo(
    () =>
      !showMarkers
        ? []
        : locations.filter((location) => {
          const key = getMarkerFilterKey(location.type);
          const flag = markerFilters[key];
          return flag !== false;
        }),
    [locations, markerFilters, showMarkers]
  );
  const filteredRegions = useMemo(
    () =>
      !showRegionsLayer && !isRegionMode
        ? []
        : regions.filter((region) => {
          if (isRegionMode && region.id === activeRegionId) return true;
          const categoryId = normalizeCategoryId(region.category);
          const flag = regionFilters[categoryId];
          return flag !== false;
        }),
    [regions, regionFilters, isRegionMode, activeRegionId, showRegionsLayer]
  );
  const regionLabelsEnabled = filteredRegions.some((region) => region.labelEnabled !== false);
  const zoomProgress = clamp((mapZoom - INTERACTIVE_MIN_ZOOM_LEVEL) / (INTERACTIVE_MAX_ZOOM_LEVEL - INTERACTIVE_MIN_ZOOM_LEVEL), 0, 1);
  const reportDiagnostics = useCallback((key, entry) => {
    setDiagnostics((prev) => {
      const current = prev[key] || {};
      const next = { ...current, ...entry };
      if (current.status === next.status && current.message === next.message) {
        return prev;
      }
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
    const safeValue = clamp(value, 0, 1.25);
    setIntensity(key, safeValue);
  };
  const resolveMarkerIcon = useCallback(
    (location) => {
      const iconKey = resolveIconKey(location);
      const status = iconStatuses[iconKey];
      const placeholderSrc = getPlaceholderMarkerSrc(location?.type);
      if (status?.status === 'ok') {
        return { key: iconKey, src: status.src, placeholder: placeholderSrc };
      }
      return { key: iconKey, src: placeholderSrc, placeholder: placeholderSrc, fallback: true };
    },
    [iconStatuses]
  );
  useEffect(() => {
    let isMounted = true;
    const fetchLocations = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/locations`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load locations.');
        }
        const nextLocations = Array.isArray(data.locations)
          ? normalizeLocations(data.locations)
          : normalizeLocations(getFallbackLocations());
        if (isMounted) {
          setLocations(nextLocations);
          lastSavedSnapshotRef.current = JSON.stringify(nextLocations);
          skipNextAutoSaveRef.current = true;
        }
      } catch (error) {
        console.error('Unable to load locations', error);
        if (isMounted) {
          const fallbackLocations = normalizeLocations(getFallbackLocations());
          setLocations(fallbackLocations);
          lastSavedSnapshotRef.current = JSON.stringify(fallbackLocations);
          skipNextAutoSaveRef.current = true;
        }
      }
    };
    fetchLocations();
    return () => {
      isMounted = false;
    };
  }, []);

  useEffect(() => {
    let isMounted = true;
    const fetchRegions = async () => {
      try {
        const response = await fetch(`${API_BASE_URL}/regions`);
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to load regions.');
        }
        if (isMounted) {
          const normalized = Array.isArray(data.regions) ? data.regions.map(normalizeRegionEntry) : [];
          setRegions(normalized);
          lastRegionSnapshotRef.current = JSON.stringify(normalized);
        }
      } catch (error) {
        console.error('Unable to load regions', error);
        if (isMounted) {
          setRegions([]);
          lastRegionSnapshotRef.current = '[]';
        }
      }
    };
    fetchRegions();
    return () => {
      isMounted = false;
    };
  }, [setRegions]);

  useEffect(() => {
    setRegionFilters((prev) => {
      let changed = false;
      const next = { ...prev };
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

  useEffect(() => {
    const uniqueKeys = new Set(locations.map((location) => resolveIconKey(location)));
    uniqueKeys.add(DEFAULT_TYPE_ICON.generic);
    uniqueKeys.forEach((key) => {
      if (!key) return;
      if (iconCheckQueueRef.current.has(key)) return;
      iconCheckQueueRef.current.add(key);
      const src = buildIconSrc(key);
      const img = new Image();
      img.onload = () => {
        setIconStatuses((prev) => {
          if (prev[key]?.status === 'ok') return prev;
          return { ...prev, [key]: { status: 'ok', src } };
        });
      };
      img.onerror = () => {
        setIconStatuses((prev) => {
          if (prev[key]?.status === 'error') return prev;
          return { ...prev, [key]: { status: 'error', src } };
        });
      };
      img.src = src;
    });
  }, [locations, diagRefreshToken]);

  useEffect(() => {
    const uniqueKeys = new Set(locations.map((location) => resolveIconKey(location)));
    uniqueKeys.add(DEFAULT_TYPE_ICON.generic);
    let missing = 0;
    let loaded = 0;
    let pending = 0;
    uniqueKeys.forEach((key) => {
      const status = iconStatuses[key]?.status;
      if (status === 'ok') loaded += 1;
      else if (status === 'error') missing += 1;
      else pending += 1;
    });
    const message = `${locations.length} markers; ${loaded}/${uniqueKeys.size} icons loaded${missing ? `; ${missing} using fallback` : ''
      }${pending ? `; ${pending} pending` : ''}`;
    const status = missing ? 'warn' : pending ? 'pending' : 'ok';
    reportDiagnostics('marker-icons', { status, message });
  }, [locations, iconStatuses, reportDiagnostics]);

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
    const locationIds = locations.map((location) => location.id);
    const { status, message } = evaluateContentHealth(contentEntries, { locationIds });
    reportDiagnostics('content', { status, message });
  }, [contentEntries, contentLoading, locations, reportDiagnostics]);

  useEffect(() => {
    if (!contentIssues) return;
    const unreadable = contentIssues.unreadableFiles || [];
    if (unreadable.length) {
      reportDiagnostics('content-importer', {
        status: 'warn',
        message: `Unreadable files: ${unreadable.map((item) => item.path).join(', ')}`,
      });
      return;
    }
    const issueCount = contentIssues.issueCount || 0;
    const status = issueCount ? contentIssues.status || 'warn' : 'ok';
    reportDiagnostics('content-importer', {
      status,
      message: issueCount
        ? `Importer reported ${issueCount} issues across ${contentIssues.entryCount || contentEntries.length} entries.`
        : `Importer validated ${contentIssues.entryCount || contentEntries.length} entries.`,
    });
  }, [contentIssues, contentEntries.length, reportDiagnostics]);

  useEffect(() => {
    if (contentError) {
      reportDiagnostics('content', {
        status: 'warn',
        message: `Using fallback content: ${contentError}`,
      });
    }
  }, [contentError, reportDiagnostics]);

  const handleLocationClick = (location) => {
    selectLocation(location.id);
    if (isEditorMode) {
      setEditorSelection({
        id: location.id,
        draft: {
          name: location.name || '',
          type: location.type || '',
          description: location.description || '',
        },
      });
      return;
    }
    const base = import.meta.env.BASE_URL || '/';
    window.location.href = `${base}location/${location.id}`;
  };

  const handleClosePanel = () => selectLocation(null);

  const handleMarkerDragEnd = (id, coords) => {
    setLocations((prev) =>
      prev.map((location) =>
        location.id === id ? { ...location, lat: coords.lat, lng: coords.lng } : location
      )
    );
  };

  const handleRegionPointAdd = (latlng) => {
    setRegionDraftPoints((prev) => [...prev, [latlng.lng, latlng.lat]]);
  };

  const focusRegionOnMap = (regionId) => {
    if (!mapInstance) return;
    const region = regions.find((entry) => entry.id === regionId);
    if (!region) return;
    const polygons = getRegionPolygons(region);
    const allPoints = polygons.flat();
    if (!allPoints.length) return;
    const latLngs = allPoints.map(([x, y]) => L.latLng(y, x));
    mapInstance.fitBounds(L.latLngBounds(latLngs).pad(0.2));
  };

  const getRegionPolygons = useCallback((region) => {
    if (!region) return [];
    const base = Array.isArray(region.points) && region.points.length >= 3 ? [region.points] : [];
    const extras = Array.isArray(region.parts)
      ? region.parts.filter((part) => Array.isArray(part) && part.length >= 3)
      : [];
    return [...base, ...extras];
  }, []);

  const updateRegionField = (regionId, field, value) => {
    setRegions((prev) =>
      prev.map((region) =>
        region.id === regionId
          ? {
            ...region,
            [field]:
              field === 'opacity'
                ? Math.min(Math.max(Number(value) || 0, 0), 1)
                : field === 'labelEnabled'
                  ? Boolean(value)
                  : value,
          }
          : region
      )
    );
  };

  const handleRegionFinish = () => {
    setRegionDraftPoints((prevPoints) => {
      if (prevPoints.length < 3) return prevPoints;
      if (regionDraftTargetId) {
        setRegions((existing) =>
          existing.map((region) => {
            if (region.id !== regionDraftTargetId) return region;
            const polygons = getRegionPolygons(region);
            const [first, ...rest] = polygons;
            const nextParts = first ? [...rest, prevPoints] : [...rest];
            return {
              ...region,
              points: first || prevPoints,
              parts: nextParts,
            };
          })
        );
        return [];
      }
      const regionId = crypto.randomUUID ? crypto.randomUUID() : `region-${Date.now()}`;
      const newRegion = {
        id: regionId,
        name: 'New Region',
        color: '#f97316',
        borderColor: '#ea580c',
        opacity: 0.3,
        category: DEFAULT_REGION_CATEGORY,
        labelEnabled: true,
        points: prevPoints.map(([x, y]) => [x, y]),
        parts: [],
      };
      setRegions((existing) => [...existing, newRegion]);
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

  const handleSelectPaletteItem = (item) => {
    setSelectedPaletteItem((prev) => {
      const next = prev && prev.iconKey === item.iconKey ? null : item;
      setActivePlacementTypeId(next ? next.type : null);
      return next;
    });
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

  const handleStartLabelPlacement = () => {
    setIsPlacingLabel(true);
    setIsRegionMode(false);
    setSelectedPaletteItem(null);
    setActivePlacementTypeId(null);
  };

  const handlePlaceLabel = (latlng) => {
    const id =
      typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `label-${Date.now()}`;
    setMapLabels((prev) => [
      ...prev,
      {
        id,
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
      },
    ]);
    setIsPlacingLabel(false);
  };

  const handleLabelDrag = (id, coords) => {
    setMapLabels((prev) => prev.map((label) => (label.id === id ? { ...label, ...coords } : label)));
  };

  const handleLabelFieldChange = (id, field, value) => {
    const numericFields = ['size', 'zoomScale', 'fadeInStart', 'fadeInEnd'];
    const booleanFields = ['scaleWithZoom'];
    setMapLabels((prev) =>
      prev.map((label) => {
        if (label.id !== id) return label;
        let nextValue = value;
        if (numericFields.includes(field)) {
          const parsed = Number(value);
          nextValue = Number.isFinite(parsed) ? parsed : 0;
        } else if (booleanFields.includes(field)) {
          nextValue = value === false || value === 'false' ? false : Boolean(value);
        }

        if (field === 'fadeInStart' || field === 'fadeInEnd') {
          const epsilon = 0.05;
          const currentStart = field === 'fadeInStart' ? nextValue : label.fadeInStart ?? 2.8;
          let currentEnd = field === 'fadeInEnd' ? nextValue : label.fadeInEnd ?? currentStart + 1.2;
          if (currentEnd <= currentStart + epsilon) {
            currentEnd = currentStart + epsilon;
            if (field === 'fadeInEnd') nextValue = currentEnd;
          }
          if (field === 'fadeInStart' && nextValue >= currentEnd - epsilon) {
            nextValue = currentEnd - epsilon;
          }
          return {
            ...label,
            fadeInStart: field === 'fadeInStart' ? nextValue : currentStart,
            fadeInEnd: field === 'fadeInEnd' ? nextValue : currentEnd,
          };
        }

        return { ...label, [field]: nextValue };
      })
    );
  };

  const handleDeleteLabel = (id) => {
    setMapLabels((prev) => prev.filter((label) => label.id !== id));
  };

  const handleRegionFieldChange = (field, value, regionId = activeRegionId) => {
    if (!regionId) return;
    updateRegionField(regionId, field, value);
  };

  const handleDeleteRegion = (targetId = activeRegionId) => {
    if (!targetId) return;
    if (!window.confirm('Delete this region?')) return;
    setRegions((prev) => prev.filter((region) => region.id !== targetId));
    if (activeRegionId === targetId) {
      selectRegion(null);
    }
  };

  const handleRegionClick = (regionId) => {
    if (isEditorMode) {
      selectRegion(regionId);
      setRegionDraftPoints([]);
      setIsPlacingLabel(false);
    } else {
      const base = import.meta.env.BASE_URL || '/';
      window.location.href = `${base}region/${regionId}`;
    }
  };

  const handleMergeRegions = (targetId, sourceId) => {
    if (!targetId || !sourceId || targetId === sourceId) return;
    setRegions((prev) => {
      const target = prev.find((r) => r.id === targetId);
      const source = prev.find((r) => r.id === sourceId);
      if (!target || !source) return prev;
      const mergedPolygons = [...getRegionPolygons(target), ...getRegionPolygons(source)];
      if (!mergedPolygons.length) return prev.filter((r) => r.id !== sourceId);
      const [first, ...rest] = mergedPolygons;
      return prev
        .filter((region) => region.id !== sourceId)
        .map((region) =>
          region.id === targetId
            ? {
              ...region,
              points: first,
              parts: rest,
            }
            : region
        );
    });
    selectRegion(targetId);
    setRegionDraftTargetId(null);
    setRegionDraftPoints([]);
    setIsPlacingLabel(false);
  };

  const handleAssignLocationToRegion = () => {
    if (!selectedLocation || !activeRegionId) return;
    setLocations((prev) =>
      prev.map((location) =>
        location.id === selectedLocation.id ? { ...location, regionId: activeRegionId } : location
      )
    );
  };

  const handleSelectPlacementType = (typeId) => {
    setActivePlacementTypeId(typeId);
    if (typeId) {
      setSelectedPaletteItem(null);
    }
  };

  const handlePlaceMarker = (latlng) => {
    const placementConfig = getPlacementConfig({
      paletteItem: selectedPaletteItem,
      activeTypeId: activePlacementTypeId,
    });
    if (!placementConfig) return;
    const typeConfig = getTypeConfig(placementConfig.typeId);
    const nextId =
      locations.reduce(
        (maxId, location) => (typeof location.id === 'number' ? Math.max(maxId, location.id) : maxId),
        0
      ) + 1;
    const newLocation = normalizeLocationEntry({
      id: nextId,
      name: placementConfig.label ? `New ${placementConfig.label}` : `New ${typeConfig.label}`,
      type: placementConfig.typeId,
      iconKey: placementConfig.iconKey,
      description: '',
      category: typeConfig.label,
      tags: [],
      regionId: null,
      lat: latlng.lat,
      lng: latlng.lng,
    });
    setLocations((prev) => [...prev, newLocation]);
    selectLocation(newLocation.id);
    setEditorSelection({
      id: newLocation.id,
      draft: {
        name: newLocation.name,
        type: newLocation.type,
        description: newLocation.description,
      },
    });
  };

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
      if (!trimmed) {
        throw new Error('Please provide JSON to import.');
      }
      const parsed = JSON.parse(trimmed);
      if (!Array.isArray(parsed)) {
        throw new Error('JSON must be an array of locations.');
      }
      const parsedLocations = parsed.map((entry, index) => ({
        id: typeof entry.id === 'number' ? entry.id : index + 1,
        name: entry.name ?? `Location ${index + 1}`,
        type: entry.type ?? 'generic',
        description: entry.description ?? '',
        lore: entry.lore ?? '',
        lat: typeof entry.lat === 'number' ? entry.lat : 0,
        lng: typeof entry.lng === 'number' ? entry.lng : 0,
        glowColor: entry.glowColor,
      }));
      const normalized = normalizeLocations(parsedLocations);
      setLocations(normalized);
      skipNextAutoSaveRef.current = true;
      selectLocation(null);
      setEditorSelection(null);
      setImportError('');
      setJsonBuffer(JSON.stringify(normalized, null, 2));
    } catch (error) {
      setImportError(error.message || 'Unable to import JSON.');
    }
  };

  const handleServerSave = useCallback(
    async (nextLocations) => {
      if (!user) {
        setSaveWarning('Please sign in again to save changes.');
        return;
      }
      try {
        const response = await fetch(`${API_BASE_URL}/locations/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ locations: nextLocations }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to save locations.');
        }
        skipNextAutoSaveRef.current = true;
        const normalized = normalizeLocations(data.locations);
        setLocations(normalized);
        lastSavedSnapshotRef.current = JSON.stringify(normalized);
        setSaveWarning('');
      } catch (error) {
        console.error('Unable to save locations', error);
        setSaveWarning(error.message || 'Unable to save locations right now.');
      }
    },
    [user]
  );

  const handleRegionSave = useCallback(
    async (nextRegions) => {
      if (!user) return;
      try {
        const response = await fetch(`${API_BASE_URL}/regions/save`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          credentials: 'include',
          body: JSON.stringify({ regions: nextRegions }),
        });
        const data = await response.json();
        if (!response.ok) {
          throw new Error(data.error || 'Failed to save regions.');
        }
        const normalized = Array.isArray(data.regions)
          ? data.regions.map(normalizeRegionEntry)
          : [];
        setRegions(normalized);
        lastRegionSnapshotRef.current = JSON.stringify(normalized);
      } catch (error) {
        console.error('Unable to save regions', error);
      }
    },
    [user, setRegions]
  );

  useEffect(() => {
    if (isEditorMode) {
      selectLocation(null);
    } else {
      setEditorSelection(null);
      setActivePlacementTypeId(null);
      setIsRegionMode(false);
      setIsPlacingLabel(false);
      selectRegion(null);
    }
  }, [isEditorMode, selectLocation, selectRegion]);

  useEffect(() => {
    if (!isEditorMode) return;
    return () => {
      setIsRegionMode(false);
      setIsPlacingLabel(false);
    };
  }, [isEditorMode]);

  useEffect(() => {
    if (!isEditorMode) {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
      lastSavedSnapshotRef.current = serializedLocations;
      setSaveWarning('');
      return;
    }

    if (!canAutoSave) {
      if (serializedLocations !== lastSavedSnapshotRef.current) {
        setSaveWarning('Only approved editors can save changes to the shared map.');
        lastSavedSnapshotRef.current = serializedLocations;
      }
      return;
    }

    if (!user) {
      setSaveWarning('Please sign in again to save changes.');
      return;
    }

    setSaveWarning('');

    if (skipNextAutoSaveRef.current) {
      skipNextAutoSaveRef.current = false;
      lastSavedSnapshotRef.current = serializedLocations;
      return;
    }

    if (serializedLocations === lastSavedSnapshotRef.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      saveTimeoutRef.current = null;
      handleServerSave(locations);
    }, 400);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
        saveTimeoutRef.current = null;
      }
    };
  }, [serializedLocations, isEditorMode, canAutoSave, handleServerSave, locations, user]);

  useEffect(() => {
    if (!canAutoSave || !user) return;
    if (serializedRegions === lastRegionSnapshotRef.current) return;

    if (regionSaveTimeoutRef.current) {
      clearTimeout(regionSaveTimeoutRef.current);
    }

    regionSaveTimeoutRef.current = setTimeout(() => {
      regionSaveTimeoutRef.current = null;
      handleRegionSave(regions);
    }, 500);

    return () => {
      if (regionSaveTimeoutRef.current) {
        clearTimeout(regionSaveTimeoutRef.current);
        regionSaveTimeoutRef.current = null;
      }
    };
  }, [serializedRegions, canAutoSave, handleRegionSave, regions, user]);

  useEffect(() => () => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    if (regionSaveTimeoutRef.current) {
      clearTimeout(regionSaveTimeoutRef.current);
    }
  }, []);

  const selectedLocation =
    locations.find((location) => location.id === selectedLocationId) || null;
  const selectedRegion = regions.find((region) => region.id === activeRegionId) || null;

  const handleEditorFieldChange = (field, value) => {
    setEditorSelection((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        draft: {
          ...prev.draft,
          [field]: value,
        },
      };
    });
  };

  const handleEditorSave = () => {
    if (!editorSelection) return;
    setLocations((prev) =>
      prev.map((location) =>
        location.id === editorSelection.id
          ? normalizeLocationEntry({ ...location, ...editorSelection.draft })
          : location
      )
    );
    setEditorSelection(null);
    if (!canAutoSave) {
      setSaveWarning('Only approved editors can save changes to the shared map.');
    }
  };

  const handleEditorCancel = () => {
    setEditorSelection(null);
  };

  const handleDeleteLocation = () => {
    if (!editorSelection) return;
    if (!canAutoSave) {
      setSaveWarning('Only approved editors can save changes to the shared map.');
      return;
    }
    const confirmed = typeof window === 'undefined' ? true : window.confirm('Are you sure you want to delete this location?');
    if (!confirmed) return;
    const targetId = editorSelection.id;
    setLocations((prev) => prev.filter((location) => location.id !== targetId));
    setEditorSelection(null);
    if (selectedLocationId === targetId) {
      selectLocation(null);
    }
  };

  const editorDraft = editorSelection?.draft ?? null;
  const markerPaletteNode = (
    <MarkerPalette
      isEditorMode={isEditorMode}
      options={MARKER_ICON_OPTIONS}
      selectedOption={selectedPaletteItem}
      onSelect={handleSelectPaletteItem}
      categoryOptions={MARKER_TYPES}
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
  const locationEditorNode = isEditorMode ? (
    <EditorInfoPanel
      isOpen={Boolean(editorSelection)}
      draft={editorDraft}
      onFieldChange={handleEditorFieldChange}
      onSave={handleEditorSave}
      onCancel={handleEditorCancel}
      canAutoSave={canAutoSave}
      saveWarning={saveWarning}
      canDelete={canAutoSave}
      onDelete={handleDeleteLocation}
    />
  ) : null;
  useEffect(() => {
    if (!mapInstance) return;
    const syncZoom = () => setMapZoom(mapInstance.getZoom());
    syncZoom();
    mapInstance.on('zoom', syncZoom);
    mapInstance.on('zoomend', syncZoom);
    return () => {
      mapInstance.off('zoom', syncZoom);
      mapInstance.off('zoomend', syncZoom);
    };
  }, [mapInstance]);

  useEffect(() => {
    const node = mapContainerRef.current;
    if (!node) return undefined;
    const preventCtrlWheel = (event) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };
    const preventBrowserZoomKeys = (event) => {
      if ((event.ctrlKey || event.metaKey) && ['+', '-', '=', '_', '0'].includes(event.key)) {
        event.preventDefault();
      }
    };
    const preventGesture = (event) => event.preventDefault();

    node.addEventListener('wheel', preventCtrlWheel, { passive: false });
    window.addEventListener('keydown', preventBrowserZoomKeys, { passive: false });
    window.addEventListener('gesturestart', preventGesture, { passive: false });
    window.addEventListener('gesturechange', preventGesture, { passive: false });

    return () => {
      node.removeEventListener('wheel', preventCtrlWheel);
      window.removeEventListener('keydown', preventBrowserZoomKeys);
      window.removeEventListener('gesturestart', preventGesture);
      window.removeEventListener('gesturechange', preventGesture);
    };
  }, []);

  useEffect(() => {
    if (!mapInstance) return;
    mapInstance.invalidateSize();
  }, [mapInstance, isEditorMode]);

  useEffect(() => {
    if (!mapInstance) return;

    const container = mapInstance.getContainer();
    const basePx = 220;

    const handleWheel = (event) => {
      event.preventDefault();
      event.stopPropagation();

      let deltaY = event.deltaY;
      if (event.deltaMode === 1) {
        deltaY *= 40;
      } else if (event.deltaMode === 2) {
        deltaY *= 120;
      }

      const speed = clamp(Math.abs(deltaY) / 120, 0.6, 4);
      const accel = 0.5 + speed * 0.5;
      let deltaZoom = (-deltaY / basePx) * accel;
      deltaZoom = clamp(deltaZoom, -1.2, 1.2);

      wheelDeltaRef.current += deltaZoom;
      wheelFocusRef.current = mapInstance.mouseEventToLatLng(event);
      zoomFocusRef.current = wheelFocusRef.current;
      if (wheelResetRef.current) {
        clearTimeout(wheelResetRef.current);
      }
      wheelResetRef.current = setTimeout(() => {
        wheelDeltaRef.current = 0;
        wheelResetRef.current = null;
      }, 140);

      if (!wheelRafRef.current) {
        wheelRafRef.current = requestAnimationFrame(() => {
          const current = mapInstance.getZoom();
          const next = clamp(
            current + wheelDeltaRef.current,
            INTERACTIVE_MIN_ZOOM_LEVEL,
            INTERACTIVE_MAX_ZOOM_LEVEL
          );
          const focus = wheelFocusRef.current || mapInstance.getCenter();
          if (next !== current) {
            mapInstance.setZoomAround(focus, next, { animate: true });
          }
          const residual = wheelDeltaRef.current - (next - current);
          wheelDeltaRef.current = Math.abs(residual) < 0.002 ? 0 : residual * 0.85;
          wheelRafRef.current = null;
        });
      }
    };

    container.addEventListener('wheel', handleWheel, { passive: false });
    return () => {
      container.removeEventListener('wheel', handleWheel);
      if (wheelRafRef.current) cancelAnimationFrame(wheelRafRef.current);
      if (wheelResetRef.current) clearTimeout(wheelResetRef.current);
      wheelRafRef.current = null;
      wheelResetRef.current = null;
    };
  }, [mapInstance]);

  useEffect(() => {
    if (!mapInstance) return;
    const clearZoomFocus = () => {
      zoomFocusRef.current = null;
    };
    mapInstance.on('zoomend', clearZoomFocus);
    return () => {
      mapInstance.off('zoomend', clearZoomFocus);
    };
  }, [mapInstance]);

  useEffect(() => {
    if (!mapInstance) return;

    const prefetchZoomLevels = (levels, marginTiles = 2) => {
      const cache = tilePrefetchCacheRef.current;
      levels.forEach((targetZoom) => {
        if (
          targetZoom < INTERACTIVE_MIN_ZOOM_LEVEL ||
          targetZoom > INTERACTIVE_MAX_ZOOM_LEVEL
        ) {
          return;
        }
        const bounds = mapInstance.getPixelBounds(targetZoom);
        const tileSize = TILE_SIZE;
        const min = bounds.min.divideBy(tileSize).floor();
        const max = bounds.max.divideBy(tileSize).floor();
        const counts = getTileCountForZoom(targetZoom);
        const minX = Math.max(min.x - marginTiles, 0);
        const minY = Math.max(min.y - marginTiles, 0);
        const maxX = Math.min(max.x + marginTiles, counts.x - 1);
        const maxY = Math.min(max.y + marginTiles, counts.y - 1);

        for (let x = minX; x <= maxX; x += 1) {
          for (let y = minY; y <= maxY; y += 1) {
            const url = buildTileUrl(targetZoom, x, y);
            if (!url || cache.has(url)) continue;
            cache.add(url);
            const img = new Image();
            img.src = url;
          }
        }
      });
    };

    const triggerPrefetch = (direction = 'neutral', targetZoom = null) => {
      const currentZoom = mapInstance.getZoom();
      const baseZoom = Math.round(
        Number.isFinite(targetZoom) ? targetZoom : currentZoom
      );
      const zoomScale = clamp(
        (baseZoom - INTERACTIVE_MIN_ZOOM_LEVEL) /
          (INTERACTIVE_MAX_ZOOM_LEVEL - INTERACTIVE_MIN_ZOOM_LEVEL),
        0,
        1
      );
      const outMargin = Math.round(2 + zoomScale * 6);
      const inMargin = Math.round(2 + zoomScale * 3);

      if (direction === 'out') {
        prefetchZoomLevels([baseZoom, baseZoom - 1], outMargin);
      } else if (direction === 'in') {
        prefetchZoomLevels([baseZoom, baseZoom + 1], inMargin);
      } else {
        prefetchZoomLevels([baseZoom + 1, baseZoom - 1], 2);
      }
    };

    const handleZoomAnim = (event) => {
      const previous = lastZoomRef.current ?? mapInstance.getZoom();
      const direction = event.zoom < previous ? 'out' : 'in';
      triggerPrefetch(direction, event.zoom);
    };
    const handleZoomEnd = () => {
      lastZoomRef.current = mapInstance.getZoom();
      triggerPrefetch('neutral');
    };

    triggerPrefetch();
    mapInstance.on('zoomanim', handleZoomAnim);
    mapInstance.on('zoomend', handleZoomEnd);

    return () => {
      mapInstance.off('zoomanim', handleZoomAnim);
      mapInstance.off('zoomend', handleZoomEnd);
    };
  }, [mapInstance]);

  useEffect(() => {
    if (!mapInstance || !mapInstance.doubleClickZoom) return;
    if (isRegionMode) {
      mapInstance.doubleClickZoom.disable();
    } else {
      mapInstance.doubleClickZoom.enable();
    }
  }, [isRegionMode, mapInstance]);

  useEffect(() => {
    if (!isRegionMode) return undefined;
    const handleKey = (event) => {
      if (event.key === 'Escape') {
        setIsPlacingLabel(false);
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isRegionMode]);

  useEffect(() => {
    if (!mapInstance) return;
    const handlers = [
      mapInstance.dragging,
      mapInstance.scrollWheelZoom,
      mapInstance.doubleClickZoom,
      mapInstance.boxZoom,
      mapInstance.keyboard,
      mapInstance.touchZoom,
    ];
    handlers.forEach((handler) => {
      if (!handler) return;
      if (isIntroVisible && handler.disable) {
        handler.disable();
      } else if (!isIntroVisible && handler.enable) {
        handler.enable();
      }
    });
  }, [mapInstance, isIntroVisible]);

  useEffect(() => {
    if (!isIntroVisible) return;

    const preventWheelZoom = (event) => {
      if (event.ctrlKey) {
        event.preventDefault();
      }
    };

    const preventKeyZoom = (event) => {
      if (
        (event.ctrlKey || event.metaKey) &&
        ['+', '-', '=', '_', '0'].includes(event.key)
      ) {
        event.preventDefault();
      }
    };

    const preventGesture = (event) => {
      event.preventDefault();
    };

    window.addEventListener('wheel', preventWheelZoom, { passive: false });
    window.addEventListener('keydown', preventKeyZoom, { passive: false });
    window.addEventListener('gesturestart', preventGesture, { passive: false });
    window.addEventListener('gesturechange', preventGesture, { passive: false });

    return () => {
      window.removeEventListener('wheel', preventWheelZoom);
      window.removeEventListener('keydown', preventKeyZoom);
      window.removeEventListener('gesturestart', preventGesture);
      window.removeEventListener('gesturechange', preventGesture);
    };
  }, [isIntroVisible]);

  const handleIntroFinish = () => {
    introShownThisSession = true;
    setIsIntroVisible(false);
  };

  useEffect(() => {
    if (!mapInstance) return;

    if (!mapInstance.__origLimitFns) {
      mapInstance.__origLimitFns = {
        limitCenter: mapInstance._limitCenter,
        limitOffset: mapInstance._limitOffset,
        limitBounds: mapInstance._limitBounds,
        enforceMaxBounds: mapInstance._enforceMaxBounds,
        getBoundsOffset: mapInstance._getBoundsOffset,
        panInsideBounds: mapInstance.panInsideBounds,
      };
    }

    if (isEditorMode) {
      // Clear bounds and bypass limiters for free panning.
      mapInstance.setMaxBounds(null);
      mapInstance.options.maxBounds = null;
      mapInstance.options.maxBoundsViscosity = 0;
      mapInstance._bounds = null;
      if (mapInstance.dragging && mapInstance.dragging._draggable) {
        mapInstance.dragging._draggable._bounds = null;
      }
      mapInstance._limitCenter = (center) => center;
      mapInstance._limitOffset = (offset) => offset;
      mapInstance._limitBounds = (bounds) => bounds;
      mapInstance._enforceMaxBounds = () => mapInstance;
      mapInstance._getBoundsOffset = () => L.point(0, 0);
      mapInstance.panInsideBounds = () => mapInstance;
    } else {
      // Restore normal limiting behavior.
      const { limitCenter, limitOffset, limitBounds, enforceMaxBounds, getBoundsOffset, panInsideBounds } = mapInstance.__origLimitFns || {};
      if (limitCenter) mapInstance._limitCenter = limitCenter;
      if (limitOffset) mapInstance._limitOffset = limitOffset;
      if (limitBounds) mapInstance._limitBounds = limitBounds;
      if (enforceMaxBounds) mapInstance._enforceMaxBounds = enforceMaxBounds;
      if (getBoundsOffset) mapInstance._getBoundsOffset = getBoundsOffset;
      if (panInsideBounds) mapInstance.panInsideBounds = panInsideBounds;
      mapInstance.setMaxBounds(MAP_BOUNDS);
      mapInstance.options.maxBounds = MAP_BOUNDS;
      mapInstance.options.maxBoundsViscosity = BOUNDS_VISCOSITY;
      if (typeof mapInstance.panInsideBounds === 'function') {
        mapInstance.panInsideBounds(MAP_BOUNDS, { animate: true, duration: 0.35 });
      }
    }
  }, [mapInstance, isEditorMode]);

  return (
    <div className={`map-wrapper ${isIntroVisible ? 'map-wrapper--locked' : ''}`}>
      <div className="map-layout">
        <div className="map-layout__canvas">
          <div className="map-container-wrapper" ref={mapContainerRef}>
            <MapContainer
              key={`map-${isEditorMode ? 'edit' : 'view'}`}
              center={center}
              zoom={zoom}
              minZoom={INTERACTIVE_MIN_ZOOM_LEVEL}
              maxZoom={INTERACTIVE_MAX_ZOOM_LEVEL}
              maxBounds={undefined}
              maxBoundsViscosity={0}
              crs={TILESET_CRS}
              className="leaflet-map"
              scrollWheelZoom={false}
              dragging={allowDrag}
              doubleClickZoom={true}
              zoomControl={false}
              zoomSnap={0.25}
              zoomDelta={ZOOM_DELTA}
              wheelPxPerZoomLevel={180}
              wheelDebounceTime={40}
              zoomAnimation={true}
              zoomAnimationThreshold={8}
              markerZoomAnimation={true}
              inertia={true}
              inertiaDeceleration={1800}
              whenCreated={setMapInstance}
              style={{ height: '100%', width: '100%' }}
            >
              <InvertedYTileLayer
                tileSize={TILE_SIZE}
                minZoom={INTERACTIVE_MIN_ZOOM_LEVEL}
                maxZoom={INTERACTIVE_MAX_ZOOM_LEVEL}
                maxNativeZoom={TILE_MAX_ZOOM_LEVEL}
                minNativeZoom={TILE_MIN_ZOOM_LEVEL}
                keepBuffer={10}
              />
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
              {allowDrag && <KeyboardControls />}
              <ZoomControls />
              {filteredLocations.map((location) => (
                <LocationMarker
                  key={location.id}
                  location={location}
                  onLocationClick={handleLocationClick}
                  isSelected={selectedLocation && selectedLocation.id === location.id}
                  isEditorMode={isEditorMode}
                  onDragEnd={handleMarkerDragEnd}
                  zoomLevel={mapZoom}
                  resolveIcon={resolveMarkerIcon}
                />
              ))}
              <LabelLayer
                labels={isEditorMode ? mapLabels : showMapLabels ? mapLabels : []}
                zoomLevel={mapZoom}
                isEditable={isEditorMode}
                isEditorMode={isEditorMode}
                onDragLabel={handleLabelDrag}
              />
              <RegionLayer
                regions={filteredRegions}
                draftPoints={regionDraftPoints}
                selectedRegionId={activeRegionId}
                onRegionClick={handleRegionClick}
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
                zoomFocusRef={zoomFocusRef}
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
              locations={filteredLocations}
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
                labels={mapLabels}
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

      {selectedLocation && (
        <SidePanel
          location={selectedLocation}
          onClose={handleClosePanel}
        />
      )}
      {isIntroVisible && (
        <IntroOverlay onFinish={handleIntroFinish} />
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
    </div>
  );
}

export default InteractiveMap;































