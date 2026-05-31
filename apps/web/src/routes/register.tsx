import { createFileRoute, useNavigate } from '@tanstack/react-router';
import { RegisterForm } from '../components/RegisterForm';

export const Route = createFileRoute('/register')({
  component: RegisterPage,
});

function RegisterPage() {
  const navigate = useNavigate();
  return (
    <main>
      <RegisterForm onSuccess={() => navigate({ to: '/' })} />
    </main>
  );
}
