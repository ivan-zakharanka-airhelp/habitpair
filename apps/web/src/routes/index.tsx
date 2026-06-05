import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from '../features/auth/hooks/useAuth';
import { Landing } from '../features/marketing/components/Landing';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

function LandingPage() {
  const { isAuthenticated } = useAuth();
  return <Landing authed={isAuthenticated} />;
}
