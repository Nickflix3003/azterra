/**
 * markerUtils.js
 *
 * Pure utility functions for map marker rendering, normalization,
 * and placement logic. No React imports — safe to use anywhere.
 */

import {
  MARKER_PLACEHOLDER_COLORS,
  ICON_BASE_URL,
  DEFAULT_TYPE_ICON,
  TYPE_CONFIG,
  GENERIC_MARKER_TYPE,
  getTypeConfig,
  getDefaultIconKey,
  resolveIconKey,
  buildIconSrc,
} from '../constants/mapConstants';
import { toOptionalYear } from './eraUtils';

// ─── SVG placeholder markers ─────────────────────────────────────────────────

/**
 * Builds a nav-style SVG data URI for use as a Leaflet icon when the
 * real PNG sprite is not yet loaded or missing.
 */
export const buildNavStyleMarker = (color, letter) => {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 40"><path d="M16 3C9.4 3 4 8.4 4 15c0 8.7 12 20 12 20s12-11.3 12-20C28 8.4 22.6 3 16 3Z" fill="white" stroke="${color}" stroke-width="2" /><circle cx="16" cy="15" r="7" fill="${color}" stroke="#0f172a" stroke-width="2"/><text x="16" y="19" text-anchor="middle" font-family="Inter,Arial,sans-serif" font-size="9" font-weight="700" fill="#0f172a">${letter}</text></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
};

export const PLACEHOLDER_MARKER_SRC = {
  city:     buildNavStyleMarker(MARKER_PLACEHOLDER_COLORS.city,     'C'),
  town:     buildNavStyleMarker(MARKER_PLACEHOLDER_COLORS.town,     'T'),
  dungeon:  buildNavStyleMarker(MARKER_PLACEHOLDER_COLORS.dungeon,  'D'),
  landmark: buildNavStyleMarker(MARKER_PLACEHOLDER_COLORS.landmark, 'L'),
  generic:  buildNavStyleMarker(MARKER_PLACEHOLDER_COLORS.generic,  'M'),
};

export const getPlaceholderMarkerSrc = (type) => {
  const typeConfig = getTypeConfig(type);
  return PLACEHOLDER_MARKER_SRC[typeConfig.id] || PLACEHOLDER_MARKER_SRC.generic;
};

// ─── Location normalization ──────────────────────────────────────────────────

/**
 * Normalizes a raw location entry from the API or static JSON into
 * the canonical shape used by the map. Handles both .lat/.lng and .x/.y
 * coordinate formats.
 */
export const normalizeLocationEntry = (location) => {
  const typeConfig = getTypeConfig(location.type);
  const iconKey = location.iconKey || getDefaultIconKey(typeConfig.id);
  const lat = location.lat ?? location.x ?? 0;
  const lng = location.lng ?? location.y ?? 0;
  return {
    id:          location.id,
    name:        location.name || typeConfig.label,
    type:        typeConfig.id,
    iconKey,
    lat,
    lng,
    x:           location.x ?? lat,
    y:           location.y ?? lng,
    lore:        location.lore        ?? '',
    description: location.description ?? '',
    category:    location.category ?? typeConfig.label,
    tags:        Array.isArray(location.tags) ? location.tags : [],
    regionId:    location.regionId ?? null,
    glowColor:   location.glowColor || typeConfig.glowColor,
    // Preserve optional fields so they are not stripped during normalization
    ...(location.pinned    != null && { pinned:    location.pinned }),
    ...(toOptionalYear(location.timeStart) != null && { timeStart: toOptionalYear(location.timeStart) }),
    ...(toOptionalYear(location.timeEnd)   != null && { timeEnd:   toOptionalYear(location.timeEnd) }),
    ...(location.gallery   != null && { gallery:   location.gallery }),
    ...(location.createdBy != null && { createdBy: location.createdBy }),
    ...(location.createdAt != null && { createdAt: location.createdAt }),
    ...(location.updatedBy != null && { updatedBy: location.updatedBy }),
    ...(location.updatedAt != null && { updatedAt: location.updatedAt }),
  };
};

export const normalizeLocations = (locations) =>
  locations.map((location) => normalizeLocationEntry(location));

// ─── Filter helpers ──────────────────────────────────────────────────────────

/**
 * Maps a location's type string to the key used in markerFilters state.
 */
export const getMarkerFilterKey = (typeId) => {
  const normalized = (typeId || '').toLowerCase();
  if (['city', 'town', 'dungeon', 'ruins', 'landmark', 'npc'].includes(normalized)) {
    return normalized;
  }
  if (normalized === 'generic') return 'generic';
  return 'custom';
};

// ─── Placement helpers ───────────────────────────────────────────────────────

/**
 * Returns { typeId, label, iconKey } for the active placement mode,
 * whether driven by a palette selection or a generic type button.
 */
export const getPlacementConfig = ({ paletteItem, activeTypeId }) => {
  if (paletteItem) {
    return {
      typeId:  paletteItem.type,
      label:   paletteItem.label,
      iconKey: paletteItem.iconKey,
    };
  }
  if (activeTypeId) {
    const typeConfig = getTypeConfig(activeTypeId);
    return {
      typeId:  typeConfig.id,
      label:   typeConfig.label,
      iconKey: getDefaultIconKey(typeConfig.id),
    };
  }
  return null;
};

// Re-export the icon helpers so callers that only need marker utils
// don't also need to import from mapConstants.
export { resolveIconKey, buildIconSrc, getTypeConfig, getDefaultIconKey };
