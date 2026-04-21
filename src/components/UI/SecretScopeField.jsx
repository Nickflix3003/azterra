import React from 'react';
import { useAuth } from '../../context/AuthContext';
import { useSecrets } from '../../context/SecretDataContext';

function SecretScopeField({
  secretId = null,
  onChange,
  disabled = false,
  visibilityLabel = 'Visibility',
  secretLabel = 'Required Secret',
  className = '',
}) {
  const { role } = useAuth();
  const { secrets, manageableSecrets, loadingSecrets } = useSecrets();

  const currentSecretId = typeof secretId === 'string' && secretId.trim() ? secretId.trim() : '';
  const isSecretScoped = Boolean(currentSecretId);
  const currentSecret = secrets.find((secret) => secret.id === currentSecretId) || null;
  const currentIsManageable = manageableSecrets.some((secret) => secret.id === currentSecretId);
  const canAssignSecrets = role === 'admin' || manageableSecrets.length > 0;

  if (!canAssignSecrets && !currentSecretId) return null;

  const handleVisibilityChange = (event) => {
    const nextMode = event.target.value;
    if (nextMode === 'public') {
      onChange?.(null);
      return;
    }
    if (currentSecretId) {
      onChange?.(currentSecretId);
      return;
    }
    onChange?.(manageableSecrets[0]?.id || null);
  };

  return (
    <div className={`secret-scope-field ${className}`.trim()}>
      <label className="editor-info-panel__field">
        <span>{visibilityLabel}</span>
        <select
          value={isSecretScoped ? 'secret' : 'public'}
          onChange={handleVisibilityChange}
          disabled={disabled || !canAssignSecrets}
        >
          <option value="public">Public</option>
          <option value="secret">Secret</option>
        </select>
      </label>

      {(isSecretScoped || (!currentSecretId && loadingSecrets)) && (
        <label className="editor-info-panel__field">
          <span>{secretLabel}</span>
          <select
            value={currentSecretId}
            onChange={(event) => onChange?.(event.target.value || null)}
            disabled={disabled || loadingSecrets || manageableSecrets.length === 0}
          >
            <option value="">
              {loadingSecrets
                ? 'Loading secrets...'
                : manageableSecrets.length === 0
                  ? 'Create a secret first'
                  : 'Choose a secret'}
            </option>
            {currentSecret && !currentIsManageable && (
              <option value={currentSecret.id}>
                {currentSecret.title} (not managed by you)
              </option>
            )}
            {manageableSecrets.map((secret) => (
              <option key={secret.id} value={secret.id}>
                {secret.title}
              </option>
            ))}
          </select>
        </label>
      )}

      {currentSecret && (
        <p className="secret-scope-field__hint">
          Locked behind <strong>{currentSecret.title}</strong>
        </p>
      )}
      {isSecretScoped && currentSecret && !currentIsManageable && (
        <p className="secret-scope-field__hint secret-scope-field__hint--warning">
          This item is attached to a secret you do not manage.
        </p>
      )}
      {isSecretScoped && !currentSecret && !loadingSecrets && manageableSecrets.length === 0 && (
        <p className="secret-scope-field__hint secret-scope-field__hint--warning">
          No manageable secrets exist yet. Create one in the Secrets page first.
        </p>
      )}
    </div>
  );
}

export default SecretScopeField;
