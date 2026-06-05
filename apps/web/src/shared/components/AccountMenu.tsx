import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../../features/auth/hooks/useAuth';
import { Icon } from './Icon';

// We never collect a name, so derive a neutral single-letter monogram from the
// email rather than faking "First Last" (which would imply profile data we
// don't have).
function acctInitials(email: string): string {
  const local = (email.split('@')[0] || 'u').replace(/[^a-z0-9]/gi, '');
  return (local[0] || 'u').toUpperCase();
}

interface AccountMenuProps {
  email: string;
}

export function AccountMenu({ email }: AccountMenuProps) {
  const { logout } = useAuth();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const initials = acctInitials(email);

  return (
    <div className="acct" ref={ref}>
      <button
        type="button"
        className="avatar"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
      >
        {initials}
      </button>
      {open ? (
        <div className="acct__menu" role="menu">
          <div className="acct__id">
            <span className="avatar">{initials}</span>
            <div className="acct__id-main">
              <div className="acct__id-name" title={email}>
                {email}
              </div>
              <div className="acct__id-email">Signed in</div>
            </div>
          </div>
          {/* /settings route lands in Phase 5; a plain anchor keeps this honest
              (and typed-Link-safe) until then, when it upgrades to a router Link. */}
          <a className="acct__item" role="menuitem" href="/settings" onClick={() => setOpen(false)}>
            <Icon name="gear" size={17} /> Settings
          </a>
          <div className="acct__sep" />
          <button
            type="button"
            className="acct__item acct__item--danger"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              logout();
            }}
          >
            <Icon name="logout" size={17} /> Log out
          </button>
        </div>
      ) : null}
    </div>
  );
}
