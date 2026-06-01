import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import { Navbar } from '../shared/components/Navbar';
import type { AuthContext } from '../shared/types/auth';

export const Route = createRootRouteWithContext<{ auth: AuthContext }>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen">
      <Navbar />
      <div className="p-6">
        <Outlet />
      </div>
      {import.meta.env.DEV ? <TanStackRouterDevtools /> : null}
    </div>
  );
}
