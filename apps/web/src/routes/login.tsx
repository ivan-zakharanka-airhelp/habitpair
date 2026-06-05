import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LoginForm } from '../features/auth/components/LoginForm';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  return <LoginForm onSuccess={() => navigate({ to: '/app' })} />;
}
