// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useLogout } from './useLogout';
import { authStore } from '../../../shared/lib/authStore';

function okResponse(): Response {
  return { ok: true, status: 200, json: async () => ({}) } as unknown as Response;
}

afterEach(() => {
  vi.restoreAllMocks();
  authStore.clear();
});

describe('useLogout', () => {
  it('clears the auth session and the whole query cache on sign-out', async () => {
    authStore.setSession({
      accessToken: 'a',
      refreshToken: 'r',
      user: { id: 'u1', email: 'a@b.com' },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => okResponse()),
    );

    const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
    // Seed the cache as if the signed-in user had loaded their data.
    client.setQueryData(['habits', '2026-06-06'], [{ id: 'h1' }]);
    client.setQueryData(['habits', 'h1', 'metrics', '2026-06-06'], { streak: 3 });

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useLogout(), { wrapper });

    result.current.mutate();

    await waitFor(() => expect(authStore.getAccessToken()).toBeNull());
    expect(client.getQueryCache().getAll()).toHaveLength(0);
  });
});
