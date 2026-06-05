import { useEffect, useRef, type ReactNode } from 'react';

interface DialogProps {
  open: boolean;
  title: string;
  children?: ReactNode;
  onCancel?: () => void;
  footer?: ReactNode;
}

export function Dialog({ open, title, children, onCancel, footer }: DialogProps) {
  const dialogRef = useRef<HTMLDivElement>(null);

  // Escape-to-close is a window-level subscription, so it lives in an effect
  // (per the React-Compiler guidance: only external subscriptions need this).
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel?.();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  // Move focus into the dialog on open so keyboard users aren't left behind the
  // scrim on the trigger.
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onCancel?.();
      }}
    >
      <div
        className="dialog"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={dialogRef}
      >
        <h2 className="dialog__title">{title}</h2>
        <div className="dialog__body">{children}</div>
        {footer != null ? <div className="dialog__actions">{footer}</div> : null}
      </div>
    </div>
  );
}
