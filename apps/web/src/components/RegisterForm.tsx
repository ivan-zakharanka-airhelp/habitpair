import { Link } from '@tanstack/react-router';
import { useState } from 'react';
import { useRegister } from '../lib/auth';

export function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const register = useRegister();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  return (
    <form
      className="mt-6 flex max-w-sm flex-col gap-3"
      aria-labelledby="register-heading"
      onSubmit={(event) => {
        event.preventDefault();
        register.mutate({ email, password }, { onSuccess });
      }}
    >
      <h2 id="register-heading" className="text-lg font-semibold">
        Create account
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
          autoComplete="new-password"
          required
          minLength={8}
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          className="rounded border border-gray-300 p-2"
        />
      </label>
      {register.isError ? (
        <p role="alert" className="text-sm text-red-600">
          {register.error.message}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={register.isPending}
        className="rounded bg-black p-2 text-white disabled:opacity-50"
      >
        Create account
      </button>
      <p className="text-sm">
        Have an account? <Link to="/login">Sign in</Link>
      </p>
    </form>
  );
}
