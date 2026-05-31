import { createRootRouteWithContext, Outlet } from '@tanstack/react-router';
import { TanStackRouterDevtools } from '@tanstack/react-router-devtools';
import type { AuthContext } from '../types/auth';

export const Route = createRootRouteWithContext<{ auth: AuthContext }>()({
  component: RootLayout,
});

function RootLayout() {
  return (
    <div className="min-h-screen p-6">
      <h1 className="text-2xl font-bold">habitpair</h1>
      <Outlet />
      {import.meta.env.DEV ? <TanStackRouterDevtools /> : null}
    </div>
  );
}
