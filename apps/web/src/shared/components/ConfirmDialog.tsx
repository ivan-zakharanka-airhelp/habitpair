import { useEffect, useRef } from 'react';

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isPending?: boolean;
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  onConfirm,
  onCancel,
  isPending = false,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  // A native <dialog> is opened/closed imperatively, so the `open` prop drives
  // showModal()/close() here. The native `close` event (Esc, backdrop) routes
  // back through onCancel so the parent's open state can never desync.
  useEffect(() => {
    const el = dialogRef.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onCancel}
      className="m-auto max-w-sm rounded-lg p-0 shadow-lg backdrop:bg-black/50"
    >
      <div className="flex flex-col gap-3 p-6">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-gray-600">{message}</p>
        <div className="mt-2 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="rounded border border-gray-300 p-2">
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="rounded bg-red-600 p-2 text-white disabled:opacity-50"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
