// @vitest-environment jsdom
import type { ReactElement, ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RegisterForm } from './RegisterForm';
import { authStore } from '../../../shared/lib/authStore';

// These tests exercise form behavior, not navigation; stub Link to a plain
// anchor so the component renders without a full router context.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ to, children }: { to: string; children: ReactNode }) => <a href={to}>{children}</a>,
  };
});

function jsonResponse(status: number, body: unknown = {}): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { retry: false } },
  });
  return render(<QueryClientProvider client={client}>{ui}</QueryClientProvider>);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  authStore.clear();
});

describe('RegisterForm', () => {
  it('renders the server error message inline when the email is taken', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => jsonResponse(409, { message: 'Email already registered' })),
    );
    const onSuccess = vi.fn();
    renderWithClient(<RegisterForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'taken@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered');
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it('auto-signs-in by storing the session and calling onSuccess on register', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        jsonResponse(201, {
          accessToken: 'a',
          refreshToken: 'r',
          user: { id: 'u1', email: 'new@b.com' },
        }),
      ),
    );
    const onSuccess = vi.fn();
    renderWithClient(<RegisterForm onSuccess={onSuccess} />);

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@b.com' } });
    fireEvent.change(screen.getByLabelText('Password'), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: /create account/i }));

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1));
    expect(authStore.getAccessToken()).toBe('a');
  });
});
