export function hasRole(user, roles = []) {
  if (!roles || roles.length === 0) return true;
  const current = user?.role || 'guest';
  return roles.includes(current);
}

export function hasSecret(user, secretId) {
  if (!secretId) return true;
  if (user?.role === 'admin') return true;
  const unlocked = Array.isArray(user?.unlockedSecrets) ? user.unlockedSecrets : [];
  if (unlocked.includes(secretId)) return true;
  const owned = Array.isArray(user?.ownedSecretIds) ? user.ownedSecretIds : [];
  return owned.includes(secretId);
}

export function canView(user, { roles = [], secretId } = {}) {
  return hasRole(user, roles) && hasSecret(user, secretId);
}
