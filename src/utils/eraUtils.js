export function toOptionalYear(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function isVisibleInYear(entity, currentYear, timelineActive, isEditorMode = false) {
  if (!timelineActive || isEditorMode) return true;

  const start = toOptionalYear(entity?.timeStart);
  const end = toOptionalYear(entity?.timeEnd);

  if (start == null && end == null) return true;
  if (start != null && currentYear < start) return false;
  if (end != null && currentYear > end) return false;
  return true;
}
