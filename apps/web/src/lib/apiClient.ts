const authBaseUrl = import.meta.env.VITE_AUTH_API_URL;
if (!authBaseUrl) {
  throw new Error('VITE_AUTH_API_URL is not set. Define it in apps/web/.env (see .env.example).');
}

const habitsBaseUrl = import.meta.env.VITE_HABITS_API_URL;
if (!habitsBaseUrl) {
  throw new Error('VITE_HABITS_API_URL is not set. Define it in apps/web/.env (see .env.example).');
}

let bearerToken: string | null = null;

export function setBearerToken(token: string | null): void {
  bearerToken = token;
}

function makeClient(baseUrl: string) {
  return async (path: string, init: RequestInit = {}): Promise<Response> => {
    const headers = new Headers(init.headers);

    if (bearerToken) {
      headers.set('Authorization', `Bearer ${bearerToken}`);
    }

    return fetch(`${baseUrl}${path}`, {
      ...init,
      headers,
    });
  };
}

export const authApi = makeClient(authBaseUrl);
export const habitsApi = makeClient(habitsBaseUrl);
