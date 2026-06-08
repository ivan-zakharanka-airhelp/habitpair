import { useEffect } from 'react';
import type { ToastAction } from '../lib/toast';

interface ToastProps {
  message: string;
  duration?: number;
  onDone?: () => void;
  action?: ToastAction;
}

export function Toast({ message, duration = 2600, onDone, action }: ToastProps) {
  useEffect(() => {
    // An action toast persists until clicked so its CTA (e.g. "Reload") stays
    // reachable; only plain toasts auto-dismiss.
    if (action) return;
    const timer = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(timer);
  }, [duration, onDone, action]);

  return (
    <div className="toast" role={action ? 'alert' : 'status'}>
      <span>{message}</span>
      {action ? (
        <button type="button" className="btn btn--ghost btn--sm" onClick={action.onClick}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
