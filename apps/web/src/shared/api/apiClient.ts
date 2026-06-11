const authBaseUrl = import.meta.env.VITE_AUTH_API_URL;
if (!authBaseUrl) {
  throw new Error('VITE_AUTH_API_URL is not set. Define it in apps/web/.env (see .env.example).');
}

const habitsBaseUrl = import.meta.env.VITE_HABITS_API_URL;
if (!habitsBaseUrl) {
  throw new Error('VITE_HABITS_API_URL is not set. Define it in apps/web/.env (see .env.example).');
}

export type ApiClient = (path: string, init?: RequestInit) => Promise<Response>;

// Transport needs the current access token and a way to refresh on 401, but
// must not import the session store — that couples low-level transport to
// higher-level state and forms an import cycle. authStore injects these via
// configureAuth() when it loads (main.tsx imports it at boot). The default is a
// safe no-op for any code path that runs before the store is wired.
export interface AuthBridge {
  getAccessToken: () => string | null;
  refresh: () => Promise<boolean>;
}

let auth: AuthBridge = {
  getAccessToken: () => null,
  refresh: async () => false,
};

export function configureAuth(bridge: AuthBridge): void {
  auth = bridge;
}

// `refreshable` is false for the auth client: a 401 from /auth/* (bad
// credentials, expired refresh token) must never trigger a refresh-retry, or
// login failures would loop.
function makeClient(baseUrl: string, refreshable: boolean): ApiClient {
  const send = (path: string, init: RequestInit): Promise<Response> => {
    const headers = new Headers(init.headers);
    const token = auth.getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  };

  return async (path, init = {}) => {
    const response = await send(path, init);
    if (response.status !== 401 || !refreshable) {
      return response;
    }
    // A 401 on an authenticated request means the access token is no longer
    // accepted. Refresh once (single-flight) and replay on success. Every
    // unrecoverable case — no refresh token, or a failed refresh — clears the
    // session inside refresh() and fires onAuthCleared, which redirects to
    // /login so the 401 never surfaces as a page-level error.
    if (await auth.refresh()) {
      return send(path, init);
    }
    return response;
  };
}

export const authApi = makeClient(authBaseUrl, false);
export const habitsApi = makeClient(habitsBaseUrl, true);
