import { createFileRoute, Link } from '@tanstack/react-router';
import { useAuth } from '../hooks/useAuth';

export const Route = createFileRoute('/')({
  component: LandingPage,
});

function LandingPage() {
  const { isAuthenticated } = useAuth();

  return (
    <main>
      <section className="mx-auto max-w-2xl py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">
          Welcome to Habit Tracker — Build Better Habits.
        </h1>
        <p className="mt-4 text-lg text-gray-600">
          Track your daily habits, stay accountable, and build momentum one day at a time.
        </p>
        {isAuthenticated ? (
          <Link to="/app" className="mt-8 inline-block rounded bg-black px-6 py-3 text-white">
            Go to app
          </Link>
        ) : (
          <Link to="/login" className="mt-8 inline-block rounded bg-black px-6 py-3 text-white">
            Get Started
          </Link>
        )}
      </section>
    </main>
  );
}
