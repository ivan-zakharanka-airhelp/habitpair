import { StrictMode, useEffect, useSyncExternalStore } from 'react';
import { createRoot } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { RouterProvider } from '@tanstack/react-router';
import { router } from './router';
import { queryClient } from './shared/api/queryClient';
import { authStore } from './shared/lib/authStore';
import './styles.css';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element not found');
}

// Losing the session redirects to /login; the boot exchange rehydrates a stored
// session before any gated route renders.
authStore.onAuthCleared = () => {
  void router.navigate({ to: '/login' });
};
void authStore.bootstrap();

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
