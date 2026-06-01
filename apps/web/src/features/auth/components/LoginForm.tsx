import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useLogin } from '../hooks/useLogin';

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const login = useLogin();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <form
      className="mt-6 flex max-w-sm flex-col gap-3"
      aria-labelledby="login-heading"
      onSubmit={(event) => {
        event.preventDefault();
        login.mutate({ email, password }, { onSuccess });
      }}
    >
      <h2 id="login-heading" className="text-lg font-semibold">
        Sign in
      </h2>
      <label className="flex flex-col gap-1">
        Email
        <input
          type="email"
          name="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded border border-gray-300 p-2"
        />
      </label>
      <label className="flex flex-col gap-1">
        Password
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded border border-gray-300 p-2"
        />
      </label>
      {login.isError ? (
        <p role="alert" className="text-sm text-red-600">
          {login.error.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={login.isPending}
        className="rounded bg-black p-2 text-white disabled:opacity-50"
      >
        Sign in
      </button>
      <p className="text-sm">
        No account? <Link to="/register">Create one</Link>
      </p>
    </form>
  );
}
