import { createFileRoute, redirect, Outlet } from '@tanstack/react-router';

// Pathless layout gate for every authenticated route — the precedent for
// S-01–S-04. Skips the redirect while the boot exchange is still resolving so a
// returning user isn't bounced before their stored session rehydrates.
export const Route = createFileRoute('/_authed')({
  beforeLoad: ({ context }) => {
    if (!context.auth.isResolving && !context.auth.isAuthenticated) {
      throw redirect({ to: '/login' });
    }
  },
  component: AuthedLayout,
});

function AuthedLayout() {
  return <Outlet />;
}
