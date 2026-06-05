import { useLogin } from '../hooks/useLogin';
import { AuthCard } from './AuthCard';

export function LoginForm({ onSuccess }: { onSuccess: () => void }) {
  const login = useLogin();
  return (
    <AuthCard
      mode="login"
      pending={login.isPending}
      error={login.isError ? login.error.message : null}
      onSubmit={(credentials) => login.mutate(credentials, { onSuccess })}
    />
  );
}
