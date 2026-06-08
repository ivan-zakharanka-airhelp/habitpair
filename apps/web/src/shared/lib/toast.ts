// Toast queue store — framework-agnostic singleton mirroring authStore/themeStore.
// Fire a calm, success-style toast from anywhere via `toast(message)`; the
// ToastHost (mounted once in the app shell) subscribes and renders the queue
// head, dismissing it after its duration.

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastItem {
  id: number;
  message: string;
  duration: number;
  action?: ToastAction;
}

const DEFAULT_DURATION = 2600;

let queue: ToastItem[] = [];
let nextId = 1;
const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

export function toast(
  message: string,
  duration: number = DEFAULT_DURATION,
  action?: ToastAction,
): void {
  // Reassign (not mutate) so getSnapshot returns a stable reference between
  // changes — required for useSyncExternalStore.
  queue = [...queue, { id: nextId++, message, duration, action }];
  emitChange();
}

function dismiss(id: number): void {
  const next = queue.filter((item) => item.id !== id);
  if (next.length === queue.length) return;
  queue = next;
  emitChange();
}

export const toastStore = {
  getSnapshot: (): ToastItem[] => queue,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  dismiss,
};
