import { authStore } from '../lib/authStore';

const authBaseUrl = import.meta.env.VITE_AUTH_API_URL;
if (!authBaseUrl) {
  throw new Error('VITE_AUTH_API_URL is not set. Define it in apps/web/.env (see .env.example).');
}

const habitsBaseUrl = import.meta.env.VITE_HABITS_API_URL;
if (!habitsBaseUrl) {
  throw new Error('VITE_HABITS_API_URL is not set. Define it in apps/web/.env (see .env.example).');
}

export type ApiClient = (path: string, init?: RequestInit) => Promise<Response>;

// `refreshable` is false for the auth client: a 401 from /auth/* (bad
// credentials, expired refresh token) must never trigger a refresh-retry, or
// login failures would loop.
function makeClient(baseUrl: string, refreshable: boolean): ApiClient {
  const send = (path: string, init: RequestInit): Promise<Response> => {
    const headers = new Headers(init.headers);
    const token = authStore.getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return fetch(`${baseUrl}${path}`, { ...init, headers });
  };

  return async (path, init = {}) => {
    const response = await send(path, init);
    if (response.status !== 401 || !refreshable || !authStore.getRefreshToken()) {
      return response;
    }
    // Access token likely expired: refresh once (single-flight) and retry. On
    // refresh failure the store is already cleared and onAuthCleared drives the
    // redirect, so surface the original 401.
    const refreshed = await authStore.refresh();
    if (!refreshed) {
      return response;
    }
    return send(path, init);
  };
}

export const authApi = makeClient(authBaseUrl, false);
export const habitsApi = makeClient(habitsBaseUrl, true);
