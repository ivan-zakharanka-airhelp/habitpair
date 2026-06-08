import { Link } from '@tanstack/react-router';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { AccountMenu } from './AccountMenu';
import { InstallButton } from './InstallButton';

export function Navbar() {
  const { isAuthenticated, user } = useAuth();

  return (
    <nav className="nav">
      <div className="nav__inner">
        <Link to={isAuthenticated ? '/app' : '/'} className="brand">
          <span className="brand__mark" /> habitpair
        </Link>
        <div className="nav__right">
          <InstallButton />
          {isAuthenticated && user ? (
            <AccountMenu email={user.email} />
          ) : (
            <Link to="/login" className="btn btn--ghost btn--sm">
              Log in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
