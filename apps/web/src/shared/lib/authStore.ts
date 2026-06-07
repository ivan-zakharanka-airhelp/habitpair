import { authApi } from '../api/apiClient';
import type { AuthResponse, User } from '../types/auth';

const REFRESH_TOKEN_KEY = 'habitpair.refreshToken';

export interface AuthSnapshot {
  isAuthenticated: boolean;
  isResolving: boolean;
  user: User | null;
}

// Access token lives in memory only (cleared on reload); the refresh token is
// the durable credential and is the single thing persisted to localStorage.
let accessToken: string | null = null;
let user: User | null = null;
let isResolving = true;

let snapshot: AuthSnapshot = computeSnapshot();
let refreshPromise: Promise<boolean> | null = null;

const listeners = new Set<() => void>();

function computeSnapshot(): AuthSnapshot {
  return { isAuthenticated: accessToken !== null, isResolving, user };
}

function emitChange(): void {
  // Recompute once so subscribers (router context) get a stable, cached
  // reference between changes — required for useSyncExternalStore.
  snapshot = computeSnapshot();
  for (const listener of listeners) listener();
}

function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_TOKEN_KEY);
}

function setSession(session: AuthResponse): void {
  accessToken = session.accessToken;
  user = session.user;
  localStorage.setItem(REFRESH_TOKEN_KEY, session.refreshToken);
  isResolving = false;
  emitChange();
}

function clear(): void {
  accessToken = null;
  user = null;
  localStorage.removeItem(REFRESH_TOKEN_KEY);
  isResolving = false;
  emitChange();
}

async function performRefresh(): Promise<boolean> {
  const refreshToken = getRefreshToken();
  if (!refreshToken) {
    // Reached when an authenticated request 401s but the refresh credential is
    // already gone (cleared in another tab, wiped storage). The session is
    // unrecoverable, so tear it down and fire onAuthCleared like a failed
    // refresh — otherwise the 401 surfaces as a page error with no redirect.
    clear();
    authStore.onAuthCleared?.();
    return false;
  }
  try {
    const response = await authApi('/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
    if (!response.ok) {
      clear();
      authStore.onAuthCleared?.();
      return false;
    }
    const data = (await response.json()) as AuthResponse;
    setSession(data);
    return true;
  } catch {
    clear();
    authStore.onAuthCleared?.();
    return false;
  }
}

// Single-flight: concurrent callers (e.g. several gated requests 401-ing at
// once) share one in-flight refresh. Parallel refreshes would rotate each
// other's token away and cascade to a forced logout.
function refresh(): Promise<boolean> {
  refreshPromise ??= performRefresh().finally(() => {
    refreshPromise = null;
  });
  return refreshPromise;
}

// On boot, exchange a stored refresh token for a fresh access token so a
// returning user is recognized before route guards run. Always resolves the
// `isResolving` flag so gating decisions can proceed.
async function bootstrap(): Promise<void> {
  if (!getRefreshToken()) {
    if (isResolving) {
      isResolving = false;
      emitChange();
    }
    return;
  }
  await refresh();
}

export const authStore = {
  // Set by the app shell to drive a redirect when the session is lost.
  onAuthCleared: null as (() => void) | null,
  getAccessToken: (): string | null => accessToken,
  getRefreshToken,
  getSnapshot: (): AuthSnapshot => snapshot,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setSession,
  clear,
  refresh,
  bootstrap,
};
