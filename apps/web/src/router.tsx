import { createRouter } from '@tanstack/react-router';
import { routeTree } from './routeTree.gen';

export const router = createRouter({
  routeTree,
  // Default boot context: auth is still resolving, so guards hold off. main.tsx
  // feeds the live snapshot via RouterProvider and invalidates on every change.
  context: {
    auth: { isAuthenticated: false, isResolving: true, user: null },
  },
});

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
