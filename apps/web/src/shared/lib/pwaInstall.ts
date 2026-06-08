// PWA install store — framework-agnostic singleton mirroring authStore/toast.
// Captures the deferred `beforeinstallprompt` event (which can fire before React
// mounts, so the listener attaches at module load) and exposes installability
// state + a trigger for the native prompt. Every browser-API access is guarded
// so the module is import-safe under the node-env test runner.

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export interface PwaInstallSnapshot {
  canInstall: boolean;
  isStandalone: boolean;
  isIOS: boolean;
}

let deferredPrompt: BeforeInstallPromptEvent | null = null;
const listeners = new Set<() => void>();

function detectStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  if (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches
  ) {
    return true;
  }
  // iOS Safari predates the display-mode media query and exposes its own flag.
  return (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
}

function detectIOS(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

function computeSnapshot(): PwaInstallSnapshot {
  return {
    canInstall: deferredPrompt !== null,
    isStandalone: detectStandalone(),
    isIOS: detectIOS(),
  };
}

// Cache so getSnapshot returns a stable reference between changes — required for
// useSyncExternalStore.
let snapshot: PwaInstallSnapshot = computeSnapshot();

function emitChange(): void {
  snapshot = computeSnapshot();
  for (const listener of listeners) listener();
}

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault(); // stash it; we trigger the prompt from our own UI
    deferredPrompt = event as BeforeInstallPromptEvent;
    emitChange();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    emitChange();
  });
}

async function promptInstall(): Promise<void> {
  if (!deferredPrompt) return;
  await deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  emitChange();
}

export const pwaInstall = {
  getSnapshot: (): PwaInstallSnapshot => snapshot,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  promptInstall,
};
