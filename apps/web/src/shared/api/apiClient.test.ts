import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { authApi, habitsApi } from './apiClient';
import { authStore } from '../lib/authStore';
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
    accessToken: 'access',
    refreshToken: 'refresh',
    user: { id: 'u1', email: 'a@b.com' },
    ...overrides,
  };
}

function authHeaderOf(call: unknown[] | undefined): string | null {
  const init = call?.[1] as RequestInit | undefined;
  const headers = init?.headers;
  return headers instanceof Headers ? headers.get('Authorization') : null;
}

describe('apiClient refresh-and-retry', () => {
  beforeEach(() => {
    authStore.clear();
    authStore.onAuthCleared = null;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('refreshes once on 401 and retries the request with the new access token', async () => {
    authStore.setSession(authResponse({ accessToken: 'old', refreshToken: 'r0' }));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(
        jsonResponse(200, authResponse({ accessToken: 'new', refreshToken: 'r1' })),
      )
      .mockResolvedValueOnce(jsonResponse(200, [{ id: 'h1' }]));
    vi.stubGlobal('fetch', fetchMock);

    const response = await habitsApi('/habits');

    expect(response.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(authStore.getAccessToken()).toBe('new');
    expect(authHeaderOf(fetchMock.mock.calls[0])).toBe('Bearer old');
    expect(authHeaderOf(fetchMock.mock.calls[2])).toBe('Bearer new');
  });

  it('surfaces the 401 and clears the session when the refresh itself fails', async () => {
    authStore.setSession(authResponse({ accessToken: 'old', refreshToken: 'r0' }));
    const onAuthCleared = vi.fn();
    authStore.onAuthCleared = onAuthCleared;

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401))
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid refresh token' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await habitsApi('/habits');

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(authStore.getAccessToken()).toBeNull();
    expect(localStorage.getItem(REFRESH_TOKEN_KEY)).toBeNull();
    expect(onAuthCleared).toHaveBeenCalledTimes(1);
  });

  it('tears down the session on a 401 when no refresh token is left to recover with', async () => {
    authStore.setSession(authResponse({ accessToken: 'old', refreshToken: 'r0' }));
    // The in-memory access token is still set, but the durable refresh
    // credential is gone (e.g. cleared in another tab) — the session can't be
    // recovered, so the 401 must clear it and trigger the redirect.
    localStorage.removeItem(REFRESH_TOKEN_KEY);
    const onAuthCleared = vi.fn();
    authStore.onAuthCleared = onAuthCleared;

    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(401));
    vi.stubGlobal('fetch', fetchMock);

    const response = await habitsApi('/habits');

    expect(response.status).toBe(401);
    // One call only: no refresh request fired and no retry, since there was
    // nothing to refresh with.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(authStore.getAccessToken()).toBeNull();
    expect(onAuthCleared).toHaveBeenCalledTimes(1);
  });

  it('never refresh-retries a 401 from the auth client', async () => {
    authStore.setSession(authResponse({ accessToken: 'old', refreshToken: 'r0' }));

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(401, { message: 'Invalid email or password' }));
    vi.stubGlobal('fetch', fetchMock);

    const response = await authApi('/auth/login', { method: 'POST', body: '{}' });

    expect(response.status).toBe(401);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
