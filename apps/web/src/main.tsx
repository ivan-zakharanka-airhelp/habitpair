import { StrictMode, useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { registerSW } from 'virtual:pwa-register';
import { router } from './router';
import { queryClient } from './shared/api/queryClient';
import { authStore } from './shared/lib/authStore';
import { toast } from './shared/lib/toast';
// Side-effect import: attaches the `beforeinstallprompt` listener at startup so
// an event firing before React mounts is not missed.
import './shared/lib/pwaInstall';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

// Losing the session drops every cached query (so the next user never sees the
// previous user's data) and redirects to /login; the boot exchange rehydrates a
// stored session before any gated route renders.
authStore.onAuthCleared = () => {
  queryClient.clear();
  void router.navigate({ to: '/login' });
};
void authStore.bootstrap();

// Hybrid SW update strategy: an update surfacing within the cold-start grace
// window auto-applies (reload once — no in-progress work); one surfacing during
// an active session shows a non-intrusive "Reload" toast. The hourly check is
// what makes the active-session case fire, since the SW does not otherwise poll.
const APP_STARTED_AT = Date.now();
const COLD_START_GRACE_MS = 3_000;
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

const updateSW = registerSW({
  onNeedRefresh() {
    if (Date.now() - APP_STARTED_AT < COLD_START_GRACE_MS) {
      void updateSW(true);
    } else {
      toast('A new version is available.', 10_000, {
        label: 'Reload',
        onClick: () => void updateSW(true),
      });
    }
  },
  onOfflineReady() {
    toast('Ready to work offline.');
  },
  onRegisteredSW(_swUrl, registration) {
    if (registration) {
      setInterval(() => void registration.update(), UPDATE_CHECK_INTERVAL_MS);
    }
  },
});

function App() {
  const auth = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);

  useEffect(() => {
    // Re-run beforeLoad guards on every auth change (boot resolve, login,
    // logout) so the singleton router doesn't keep its stale boot context.
    void router.invalidate();
  }, [auth]);

  if (auth.isResolving) {
    return <div className="grid min-h-screen place-items-center">Loading…</div>;
  }

  return <RouterProvider router={router} context={{ auth }} />;
}

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>,
);
