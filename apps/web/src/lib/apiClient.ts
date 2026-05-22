const baseUrl = import.meta.env.VITE_API_URL;
if (!baseUrl) {
  throw new Error('VITE_API_URL is not set. Define it in apps/web/.env (see .env.example).');
}

let bearerToken: string | null = null;

export function setBearerToken(token: string | null): void {
  bearerToken = token;
}

export async function apiClient(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);

  if (bearerToken) {
    headers.set('Authorization', `Bearer ${bearerToken}`);
  }

  return fetch(`${baseUrl}${path}`, {
    ...init,
    headers,
  });
}
