import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from '../../hooks/useAuth';

export const Route = createFileRoute('/_authed/')({
  component: Home,
});

function Home() {
  const { user, logout } = useAuth();
  return (
    <main className="mt-6">
      <p>Signed in as {user?.email}</p>
      <button type="button" onClick={logout} className="mt-3 rounded bg-black p-2 text-white">
        Sign out
      </button>
    </main>
  );
}
