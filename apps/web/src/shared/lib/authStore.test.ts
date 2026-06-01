import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authStore } from './authStore';
import type { AuthResponse } from '../types/auth';

const REFRESH_TOKEN_KEY = 'habitpair.refreshToken';

function jsonResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function authResponse(overrides: Partial<AuthResponse> = {}): AuthResponse {
  return {
    accessToken: 'access-1',
    refreshToken: 'refresh-1',
    user: { id: 'u1', email: 'a@b.com' },
    ...overrides,
  };
}

describe('authStore', () => {
  beforeEach(() => {
    authStore.clear();
    authStore.onAuthCleared = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists the refresh token to localStorage on setSession and removes it on clear', () => {
    authStore.setSession(authResponse({ accessToken: 'a', refreshToken: 'persist-me' }));

    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('persist-me');
    expect(authStore.getAccessToken()).toBe('a');
    expect(authStore.getSnapshot().isAuthenticated).toBe(true);

    authStore.clear();

    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(authStore.getAccessToken()).toBeNull();
    expect(authStore.getSnapshot().isAuthenticated).toBe(false);
  });

  it('shares a single in-flight request across concurrent refresh() callers', async () => {
    authStore.setSession(authResponse({ refreshToken: 'r0' }));

    let resolveFetch!: (response: Response) => void;
    const pending = new Promise<Response>((resolve) => {
      resolveFetch = resolve;
    });
    const fetchMock = vi.fn(() => pending);
    vi.stubGlobal('fetch', fetchMock);

    const first = authStore.refresh();
    const second = authStore.refresh();
    resolveFetch(jsonResponse(200, authResponse({ accessToken: 'access-2', refreshToken: 'r1' })));
    const [firstResult, secondResult] = await Promise.all([first, second]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(firstResult).toBe(true);
    expect(secondResult).toBe(true);
    expect(authStore.getAccessToken()).toBe('access-2');
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBe('r1');
  });

  it('clears the session and fires onAuthCleared when refresh fails', async () => {
    authStore.setSession(authResponse({ refreshToken: 'r0' }));
    const onAuthCleared = vi.fn();
    authStore.onAuthCleared = onAuthCleared;

    const fetchMock = vi.fn(async () => jsonResponse(401, { message: 'Invalid refresh token' }));
    vi.stubGlobal('fetch', fetchMock);

    const result = await authStore.refresh();

    expect(result).toBe(false);
    expect(authStore.getAccessToken()).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(onAuthCleared).toHaveBeenCalledTimes(1);
  });

  it('bootstrap with no stored token resolves to unauthenticated without a network call', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await authStore.bootstrap();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(authStore.getSnapshot().isResolving).toBe(false);
    expect(authStore.getSnapshot().isAuthenticated).toBe(false);
  });
});
