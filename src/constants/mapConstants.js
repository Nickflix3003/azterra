/**
 * mapConstants.js
 *
 * Shared constants for the interactive map: marker types, icon options,
 * tile configuration, CRS, and bounds. Import from here instead of
 * defining inline in InteractiveMap.jsx.
 */

import L from 'leaflet';
import {
  DEFAULT_REGION_CATEGORY,
  REGION_CATEGORIES,
} from './regionConstants';

// ─── Asset paths ────────────────────────────────────────────────────────────
export const ASSET_BASE_URL = import.meta.env.BASE_URL || '/';
export const ICON_BASE_URL = `${ASSET_BASE_URL}icons/cities/`;
export const API_BASE_URL = '/api';

// ─── Marker types ────────────────────────────────────────────────────────────
export const MARKER_TYPES = [
  { id: 'city',     label: 'City',     glowColor: '#F7B267' },
  { id: 'town',     label: 'Town',     glowColor: '#74c2e1' },
  { id: 'dungeon',  label: 'Dungeon',  glowColor: '#8E7CC3' },
  { id: 'landmark', label: 'Landmark', glowColor: '#FFDAB9' },
];

export const GENERIC_MARKER_TYPE = { id: 'generic', label: 'Generic', glowColor: '#9ca3af' };

export const LOCATION_EDITOR_TYPE_OPTIONS = [
  { id: 'city', label: 'City', glowColor: '#F7B267' },
  { id: 'town', label: 'Town', glowColor: '#74c2e1' },
  { id: 'village', label: 'Village', glowColor: '#8fd3a8' },
  { id: 'institute', label: 'Institute', glowColor: '#c4a7ff' },
  { id: 'dungeon', label: 'Dungeon', glowColor: '#8E7CC3' },
  { id: 'landmark', label: 'Landmark', glowColor: '#FFDAB9' },
  { id: 'other', label: 'Other', glowColor: '#9ca3af' },
];

export const TYPE_CONFIG = LOCATION_EDITOR_TYPE_OPTIONS.reduce(
  (acc, type) => ({ ...acc, [type.id]: type }),
  { [GENERIC_MARKER_TYPE.id]: GENERIC_MARKER_TYPE },
);

export const LOCATION_FILTER_OPTIONS = [
  ...MARKER_TYPES.map((type) => ({ id: type.id, label: type.label })),
  { id: GENERIC_MARKER_TYPE.id, label: GENERIC_MARKER_TYPE.label },
];

export const MARKER_PALETTE_CATEGORIES = [
  { id: 'city', label: 'City' },
  { id: 'town', label: 'Town' },
  { id: 'building', label: 'Building' },
  { id: 'dungeon', label: 'Dungeon' },
  { id: 'landmark', label: 'Landmark' },
  { id: 'nature', label: 'Nature' },
  { id: 'icon', label: 'Icon' },
  { id: 'other', label: 'Other' },
];

// ─── Icon options ────────────────────────────────────────────────────────────
export const DEFAULT_TYPE_ICON = {
  city:     'city-gold',
  town:     'town-oak',
  village:  'village-meadow',
  institute:'academy-star',
  dungeon:  'dungeon-abyss',
  landmark: 'landmark-spire',
  other:    'city-gold',
  generic:  'city-gold',
};

export const MARKER_ICON_OPTIONS = [
  { iconKey: 'city-blue',        label: '', type: 'city',      group: 'city' },
  { iconKey: 'city-crimson',     label: '', type: 'city',      group: 'city' },
  { iconKey: 'city-emerald',     label: '', type: 'city',      group: 'city' },
  { iconKey: 'citadel-iron',     label: '', type: 'city',      group: 'city' },
  { iconKey: 'citadel-sun',      label: '', type: 'city',      group: 'city' },
  { iconKey: 'village-sand',     label: '', type: 'town',      group: 'city' },
  { iconKey: 'town-oak',         label: '', type: 'town',      group: 'town' },
  { iconKey: 'village-meadow',   label: '', type: 'town',      group: 'town' },
  { iconKey: 'dungeon-abyss',    label: '', type: 'dungeon',   group: 'dungeon' },
  { iconKey: 'dungeon-ember',    label: '', type: 'dungeon',   group: 'dungeon' },
  { iconKey: 'landmark-spire',   label: '', type: 'dungeon',   group: 'dungeon' },
  { iconKey: 'town-harbor',      label: '', type: 'town',      group: 'building' },
  { iconKey: 'town-river',       label: '', type: 'town',      group: 'building' },
  { iconKey: 'landmark-obelisk', label: '', type: 'landmark',  group: 'landmark' },
  { iconKey: 'camp-northern',    label: '', type: 'landmark',  group: 'icon' },
  { iconKey: 'camp-jungle',      label: '', type: 'landmark',  group: 'icon' },
  { iconKey: 'academy-star',     label: '', type: 'institute', group: 'icon' },
  { iconKey: 'city-gold',        label: '', type: 'city',      group: 'icon' },
  { iconKey: 'port-azure',       label: '', type: 'city',      group: 'other' },
  { iconKey: 'port-sunset',      label: '', type: 'city',      group: 'other' },
];

// ─── Region filter options ───────────────────────────────────────────────────
export const REGION_FILTER_OPTIONS = REGION_CATEGORIES.map((category) => ({
  id: category,
  label: category.charAt(0).toUpperCase() + category.slice(1),
}));

export const createDefaultRegionFilters = () =>
  REGION_FILTER_OPTIONS.reduce((acc, option) => {
    acc[option.id] = true;
    return acc;
  }, {});

export const normalizeCategoryId = (value) => {
  if (!value || typeof value !== 'string') return DEFAULT_REGION_CATEGORY;
  return value.toLowerCase();
};

// ─── Tile & CRS configuration ────────────────────────────────────────────────
export const TILE_SIZE = 256;
export const TILE_MIN_ZOOM_LEVEL = 0;
export const TILE_MAX_ZOOM_LEVEL = 8;        // matches tilemapresource (orders 0..8)
export const INTERACTIVE_MAX_ZOOM_LEVEL = 8;
export const INTERACTIVE_MIN_ZOOM_LEVEL = 3;

// Native raster size: z=8 folder is 160x160 tiles @ 256px = 40,960px square
export const MAP_PIXEL_WIDTH  = TILE_SIZE * 160;
export const MAP_PIXEL_HEIGHT = TILE_SIZE * 160;
export const BASE_TILE_COLS   = MAP_PIXEL_WIDTH  / TILE_SIZE;
export const BASE_TILE_ROWS   = MAP_PIXEL_HEIGHT / TILE_SIZE;
export const MAP_CENTER       = [MAP_PIXEL_HEIGHT / 2, MAP_PIXEL_WIDTH / 2];

export const PAN_STEP               = 200;
export const ZOOM_SNAP              = 0.5;
export const ZOOM_DELTA             = 0.5;
export const WHEEL_PX_PER_ZOOM_LEVEL = 240;

export const MAP_BOUNDS = L.latLngBounds([0, 0], [MAP_PIXEL_HEIGHT, MAP_PIXEL_WIDTH]);

const MAX_SCALE = Math.pow(2, TILE_MAX_ZOOM_LEVEL);
export const TILESET_CRS = L.extend({}, L.CRS.Simple, {
  scale: (zoom)  => Math.pow(2, zoom) / MAX_SCALE,
  zoom:  (scale) => Math.log(scale * MAX_SCALE) / Math.LN2,
  // Top-left origin; tile Y inversion is handled in InvertedYTileLayer
  transformation: new L.Transformation(1, 0, 1, 0),
});

// ─── Demo / placeholder data ─────────────────────────────────────────────────
export const DEMO_LOCATIONS = [
  { id: 1, name: 'London', lat: 51.505, lng: -0.09,    glowColor: '#FFD700' },
  { id: 2, name: 'Paris',  lat: 48.8566, lng: 2.3522,  glowColor: '#74c2e1' },
];

export const MARKER_PLACEHOLDER_COLORS = {
  city:     '#facc15',
  town:     '#93c5fd',
  village:  '#86efac',
  institute:'#c4b5fd',
  dungeon:  '#c084fc',
  landmark: '#fb923c',
  other:    '#e5e7eb',
  generic:  '#e5e7eb',
};

// ─── Utility functions (used by both map and non-map code) ───────────────────
export const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

export const getTypeConfig = (type) => {
  if (!type) return GENERIC_MARKER_TYPE;
  const key = typeof type === 'string' ? type.toLowerCase() : type;
  return TYPE_CONFIG[key] || GENERIC_MARKER_TYPE;
};

export const getDefaultIconKey = (typeId) => DEFAULT_TYPE_ICON[typeId] || DEFAULT_TYPE_ICON.generic;
export const resolveIconKey    = (location) => location.iconKey || getDefaultIconKey(location.type);
export const buildIconSrc      = (iconKey)  => `${ICON_BASE_URL}${iconKey}.svg`;
