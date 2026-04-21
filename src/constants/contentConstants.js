export const CONTENT_TYPES = [
  'lore',
  'note',
  'region',
  'location',
  'character',
  'npc',
  'quest',
  'item',
];

export const CONTENT_STATUSES = ['complete', 'draft', 'placeholder'];
export const DEFAULT_CONTENT_STATUS = 'draft';

const normalizeStatus = (value) => {
  const normalized = typeof value === 'string' ? value.toLowerCase().trim() : '';
  if (CONTENT_STATUSES.includes(normalized)) return normalized;
  return DEFAULT_CONTENT_STATUS;
};

const normalizeType = (value) => (typeof value === 'string' ? value.toLowerCase().trim() : '');

export const normalizeContentEntry = (entry = {}) => {
  const id = entry.id ?? entry.slug ?? '';
  const type = normalizeType(entry.type);

  return {
    ...entry,
    id: id === null || id === undefined ? '' : String(id),
    type,
    title: typeof entry.title === 'string' ? entry.title.trim() : entry.title ?? '',
    status: normalizeStatus(entry.status),
    tags: Array.isArray(entry.tags) ? entry.tags.map((tag) => String(tag)) : [],
    summary: typeof entry.summary === 'string' ? entry.summary.trim() : entry.summary ?? '',
    body: typeof entry.body === 'string' ? entry.body : entry.body ?? '',
    obsidianPath:
      typeof entry.obsidianPath === 'string' ? entry.obsidianPath.trim() : entry.obsidianPath ?? '',
    mapLocationId:
      entry.mapLocationId === null || entry.mapLocationId === undefined
        ? null
        : entry.mapLocationId,
    secretId:
      typeof entry.secretId === 'string' && entry.secretId.trim()
        ? entry.secretId.trim()
        : null,
    imageDescription:
      typeof entry.imageDescription === 'string'
        ? entry.imageDescription.trim()
        : entry.imageDescription ?? '',
  };
};

export const normalizeContentList = (list) =>
  Array.isArray(list) ? list.map((entry) => normalizeContentEntry(entry)) : [];

export const isKnownContentType = (value) => {
  const type = normalizeType(value);
  if (!type) return false;
  return CONTENT_TYPES.includes(type);
};
