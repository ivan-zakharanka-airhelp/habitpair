import type { CSSProperties } from 'react';
import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Navbar } from '../shared/components/Navbar';
import { ToastHost } from '../shared/components/ToastHost';
import { useTheme } from '../shared/hooks/useTheme';
import type { AuthContext } from '../shared/types/auth';

export const Route = createRootRouteWithContext<{ auth: AuthContext }>()({
  component: RootLayout,
});

// The switcher is gone, so radius is fixed; the inline var mirrors the design's
// app root and keeps the radius scale anchored even outside :root.
const appStyle = { '--radius': '14px' } as CSSProperties;

function RootLayout() {
  const { effTheme } = useTheme();
  return (
    <div className="app" data-theme={effTheme} style={appStyle}>
      <Navbar />
      <div className="p-6">
        <Outlet />
      </div>
      <ToastHost />
      {import.meta.env.DEV ? <TanStackRouterDevtools /> : null}
    </div>
  );
}
