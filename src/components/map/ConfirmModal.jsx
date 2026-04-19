/**
 * ConfirmModal.jsx
 *
 * A custom in-page confirm dialog — replaces every window.confirm() call.
 * Supports a "danger" variant (red confirm button) for destructive actions.
 */

import React, { useEffect } from 'react';

export default function ConfirmModal({
  isOpen,
  title       = 'Are you sure?',
  message     = '',
  confirmLabel = 'Confirm',
  cancelLabel  = 'Cancel',
  onConfirm,
  onCancel,
  danger      = true,
}) {
  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e) => { if (e.key === 'Escape') onCancel?.(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isOpen, onCancel]);

  if (!isOpen) return null;

  return (
    <div className="confirm-overlay" onMouseDown={onCancel}>
      <div
        className={`confirm-modal ${danger ? 'confirm-modal--danger' : ''}`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="confirm-modal__icon">{danger ? '⚠' : '?'}</div>
        <h3 className="confirm-modal__title">{title}</h3>
        {message && <p className="confirm-modal__message">{message}</p>}
        <div className="confirm-modal__actions">
          <button
            className="confirm-modal__btn confirm-modal__btn--cancel"
            onClick={onCancel}
            autoFocus
          >
            {cancelLabel}
          </button>
          <button
            className={`confirm-modal__btn ${danger ? 'confirm-modal__btn--danger' : 'confirm-modal__btn--confirm'}`}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
