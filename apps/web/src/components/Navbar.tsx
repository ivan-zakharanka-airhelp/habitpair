import { Link } from '@tanstack/react-router';
import { useAuth } from '../hooks/useAuth';

export function Navbar() {
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <nav className="flex items-center justify-between border-b border-gray-200 px-6 py-4">
      <Link to="/" className="text-xl font-bold">
        habitpair
      </Link>
      {isAuthenticated ? (
        <div className="flex items-center gap-4">
          <span className="text-sm text-gray-600">{user?.email}</span>
          <button type="button" onClick={logout} className="rounded bg-black p-2 text-white">
            Log out
          </button>
        </div>
      ) : (
        <Link to="/login" className="rounded bg-black p-2 text-white">
          Log in
        </Link>
      )}
    </nav>
  );
}
