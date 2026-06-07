import { useSyncExternalStore } from 'react';
import { Toast } from './Toast';
import { toastStore } from '../lib/toast';

// Renders the queue head only; when it dismisses, the next toast surfaces.
// Calm UX: one confirmation at a time, never a stack.
export function ToastHost() {
  const items = useSyncExternalStore(toastStore.subscribe, toastStore.getSnapshot);
  const current = items[0];
  if (!current) return null;
  return (
    <Toast
      key={current.id}
      message={current.message}
      duration={current.duration}
      onDone={() => toastStore.dismiss(current.id)}
    />
  );
}
