import { useRegister } from '../hooks/useRegister';
import { AuthCard } from './AuthCard';

export function RegisterForm({ onSuccess }: { onSuccess: () => void }) {
  const register = useRegister();
  return (
    <AuthCard
      mode="register"
      pending={register.isPending}
      error={register.isError ? register.error.message : null}
      onSubmit={(credentials) => register.mutate(credentials, { onSuccess })}
    />
  );
}
