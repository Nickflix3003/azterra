export const REGION_CATEGORIES = [
  'continent',
  'kingdom',
  'province',
  'territory',
  'faction',
  'danger',
  'wilds',
  'other',
];

export const DEFAULT_REGION_CATEGORY = REGION_CATEGORIES[0];

const toOptionalYear = (value) => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const clamp = (value, min = 0, max = 1) => {
  if (typeof value !== 'number' || Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
};

export const normalizeRegionEntry = (region = {}) => {
  const sanitizePoints = (arr = []) =>
    Array.isArray(arr)
      ? arr
          .filter((point) => Array.isArray(point) && point.length >= 2)
          .map(([x, y]) => [Number(x) || 0, Number(y) || 0])
      : [];

  const points = sanitizePoints(region.points);
  const parts = Array.isArray(region.parts)
    ? region.parts
        .map((part) => sanitizePoints(part))
        .filter((part) => part.length >= 3)
    : [];

  return {
    ...region,
    id:
      region.id ||
      (region.name ? `region-${region.name.toLowerCase().replace(/\s+/g, '-')}` : `region-${Date.now()}`),
    name: region.name || 'New Region',
    color: region.color || '#f97316',
    borderColor: region.borderColor || region.color || '#ea580c',
    opacity: region.opacity !== undefined ? clamp(region.opacity, 0, 1) : 0.3,
    category: region.category || DEFAULT_REGION_CATEGORY,
    labelEnabled: region.labelEnabled !== false,
    ...(typeof region.secretId === 'string' && region.secretId.trim()
      ? { secretId: region.secretId.trim() }
      : {}),
    ...(toOptionalYear(region.timeStart) != null && { timeStart: toOptionalYear(region.timeStart) }),
    ...(toOptionalYear(region.timeEnd) != null && { timeEnd: toOptionalYear(region.timeEnd) }),
    points,
    parts,
  };
};
