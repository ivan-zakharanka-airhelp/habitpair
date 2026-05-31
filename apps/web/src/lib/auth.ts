import { useMutation } from '@tanstack/react-query';
import { authApi } from './apiClient';
import { authStore } from './authStore';
import type { AuthResponse, Credentials } from '../types/auth';

async function errorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    const message = (data as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  } catch {
    // Non-JSON body — fall through to the generic message.
  }
  return 'Something went wrong. Please try again.';
}

async function postAuth(path: string, body: unknown): Promise<AuthResponse> {
  const response = await authApi(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
  return response.json() as Promise<AuthResponse>;
}

export function registerRequest(credentials: Credentials): Promise<AuthResponse> {
  return postAuth('/auth/register', credentials);
}

export function loginRequest(credentials: Credentials): Promise<AuthResponse> {
  return postAuth('/auth/login', credentials);
}

// Best-effort server-side revocation: a failed call must still clear the local
// session, so sign-out never throws.
export async function logoutRequest(refreshToken: string): Promise<void> {
  try {
    await authApi('/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    });
  } catch {
    // Ignore — the client clears its session regardless.
  }
}

export function useRegister() {
  return useMutation({
    mutationFn: registerRequest,
    onSuccess: (data) => authStore.setSession(data),
  });
}

export function useLogin() {
  return useMutation({
    mutationFn: loginRequest,
    onSuccess: (data) => authStore.setSession(data),
  });
}

export function useLogout() {
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const refreshToken = authStore.getRefreshToken();
      if (refreshToken) {
        await logoutRequest(refreshToken);
      }
    },
    onSuccess: () => authStore.clear(),
  });
}
