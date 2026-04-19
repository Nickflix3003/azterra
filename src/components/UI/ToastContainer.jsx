import React from 'react';
import { useToast } from '../../context/ToastContext';
import './ToastContainer.css';

const ICONS = {
  success: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M6.5 10.5 9 13l4.5-5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  error: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M7 7l6 6M13 7l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  warn: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M10 2 1.5 17h17L10 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M10 8v4M10 14v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  ),
  info: (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10 9v5M10 6v.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  ),
};

export default function ToastContainer() {
  const { toasts, dismiss } = useToast();

  if (!toasts.length) return null;

  return (
    <div className="toast-container" role="region" aria-label="Notifications" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type}`} role="alert">
          <span className="toast__icon">{ICONS[t.type] ?? ICONS.info}</span>
          <span className="toast__message">{t.message}</span>
          <button
            type="button"
            className="toast__dismiss"
            onClick={() => dismiss(t.id)}
            aria-label="Dismiss notification"
          >
            <svg viewBox="0 0 16 16" fill="none" aria-hidden="true">
              <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
