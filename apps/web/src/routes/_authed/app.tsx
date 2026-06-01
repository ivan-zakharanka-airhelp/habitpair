import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from '../../features/auth/hooks/useAuth';

export const Route = createFileRoute('/_authed/app')({
  component: App,
});

function App() {
  const { user } = useAuth();
  return (
    <main>
      <h1 className="text-2xl font-bold">Your habits</h1>
      <p className="mt-2 text-gray-600">Signed in as {user?.email}</p>
      <p className="mt-6 text-gray-600">No habits yet — this is where your habit list will live.</p>
    </main>
  );
}
