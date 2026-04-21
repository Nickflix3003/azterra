export function isAdminUser(user) {
  return user?.role === 'admin';
}

export function getSecretId(item = {}) {
  return typeof item.secretId === 'string' && item.secretId.trim()
    ? item.secretId.trim()
    : null;
}

export function hasUnlockedSecret(user, secretId) {
  if (!secretId) return true;
  if (isAdminUser(user)) return true;
  const unlocked = Array.isArray(user?.unlockedSecrets) ? user.unlockedSecrets : [];
  if (unlocked.includes(secretId)) return true;
  const owned = Array.isArray(user?.ownedSecretIds) ? user.ownedSecretIds : [];
  return owned.includes(secretId);
}

export function canAccessSecretItem(user, item = {}) {
  return hasUnlockedSecret(user, getSecretId(item));
}

export function sanitizeSecretMetadata(item = {}) {
  if (!item || typeof item !== 'object') return item;
  const next = { ...item };
  delete next.secretId;
  return next;
}

export function sanitizeSecretItems(items = [], user) {
  return (Array.isArray(items) ? items : [])
    .filter((item) => canAccessSecretItem(user, item))
    .map((item) => (isAdminUser(user) ? item : sanitizeSecretMetadata(item)));
}
