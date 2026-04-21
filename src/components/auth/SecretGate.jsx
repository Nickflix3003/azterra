import React from 'react';
import { useAuth } from '../../context/AuthContext';

/**
 * Renders gated content only when the given secret is unlocked.
 * Falls back to the provided `fallback` (or null) when locked.
 */
function SecretGate({ secretId, fallback = null, children }) {
  const { isSecretUnlocked, role } = useAuth();
  const unlocked = role === 'admin' || isSecretUnlocked(secretId);

  if (!unlocked) {
    return fallback ?? null;
  }

  return <>{children}</>;
}

export default SecretGate;
