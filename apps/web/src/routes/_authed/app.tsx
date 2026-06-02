import { createFileRoute } from '@tanstack/react-router';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { HabitList } from '../../features/habits/components/HabitList';

export const Route = createFileRoute('/_authed/app')({
  component: App,
});

function App() {
  const { user } = useAuth();
  return (
    <main>
      <h1 className="text-2xl font-bold">Your habits</h1>
      <p className="mt-2 text-gray-600">Signed in as {user?.email}</p>
      <HabitList />
    </main>
  );
}
