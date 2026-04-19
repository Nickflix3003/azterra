// eslint-disable-next-line react-refresh/only-export-components -- context files always export both provider + hook
import React, {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';

/**
 * ToastContext — lightweight notification system.
 *
 * Usage anywhere in the app:
 *   const { toast } = useToast();
 *   toast.success('Marker saved!');
 *   toast.error('Could not save — check your connection.');
 *   toast.info('You need editor access to make changes.');
 *
 * Each toast auto-dismisses after `duration` ms (default 4000).
 */

const ToastContext = createContext(null);

let nextId = 1;

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const timers = useRef({});

  const dismiss = useCallback((id) => {
    clearTimeout(timers.current[id]);
    delete timers.current[id];
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (message, type = 'info', duration = 4000) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type }]);
      timers.current[id] = setTimeout(() => dismiss(id), duration);
      return id;
    },
    [dismiss],
  );

  // Memoised so callers can safely include `toast` in useCallback/useEffect deps.
  const toast = useMemo(() => ({
    success: (msg, duration) => addToast(msg, 'success', duration),
    error:   (msg, duration) => addToast(msg, 'error',   duration ?? 6000),
    info:    (msg, duration) => addToast(msg, 'info',    duration),
    warn:    (msg, duration) => addToast(msg, 'warn',    duration),
  }), [addToast]);

  return (
    <ToastContext.Provider value={{ toast, toasts, dismiss }}>
      {children}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside <ToastProvider>');
  return ctx;
}
