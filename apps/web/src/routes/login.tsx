import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { LoginForm } from '../components/LoginForm';

export const Route = createFileRoute('/login')({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  return (
    <main>
      <LoginForm onSuccess={() => navigate({ to: '/app' })} />
    </main>
  );
}
