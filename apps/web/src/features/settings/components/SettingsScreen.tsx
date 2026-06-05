import type { ReactNode } from 'react';
import { useCanGoBack, useNavigate, useRouter } from '@tanstack/react-router';
import { Button } from '../../../shared/components/Button';
import { Icon } from '../../../shared/components/Icon';
import { Segmented } from '../../../shared/components/Segmented';
import { useTheme } from '../../../shared/hooks/useTheme';
import type { Theme } from '../../../shared/lib/themeStore';
import { useAuth } from '../../auth/hooks/useAuth';

const THEME_OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] satisfies ReadonlyArray<{ value: Theme; label: string }>;

const actionStyle = { display: 'flex', alignItems: 'center', gap: 12, flex: 'none' } as const;
const soonStyle = { fontSize: '.78rem' } as const;

// Export + delete-account land in a follow-up change (cross-service: auth-api owns
// the user, habits-api owns the data). Until then these read as deliberately inert
// — a disabled control plus a "Coming soon" caption, not a broken-looking no-op.
function ComingSoon({ children }: { children: ReactNode }) {
  return (
    <div style={actionStyle}>
      <span className="muted" style={soonStyle}>
        Coming soon
      </span>
      {children}
    </div>
  );
}

export function SettingsScreen() {
  const { user } = useAuth();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const navigate = useNavigate();

  // Settings is reachable from the navbar on any authed screen, so return the user
  // to wherever they came from; fall back to the dashboard on a deep-link/reload.
  const onBack = () => {
    if (canGoBack) router.history.back();
    else navigate({ to: '/app' });
  };

  return (
    <main className="container container--narrow page fadein">
      <div className="detail__bar">
        <button type="button" className="backbtn" onClick={onBack}>
          <Icon name="arrowL" size={15} /> Back
        </button>
      </div>

      <h1 className="h1" style={{ marginTop: 18 }}>
        Settings
      </h1>
      <p className="muted" style={{ marginTop: 4 }}>
        {user?.email}
      </p>

      <section className="set__group">
        <h2 className="eyebrow" style={{ marginBottom: 4 }}>
          Appearance
        </h2>
        <div className="set__row">
          <div className="set__row-main">
            <div className="set__row-label">Theme</div>
            <div className="set__row-desc">Light, dark, or follow your system.</div>
          </div>
          <Segmented value={theme} onChange={setTheme} ariaLabel="Theme" options={THEME_OPTIONS} />
        </div>
      </section>

      <section className="set__group">
        <h2 className="eyebrow" style={{ marginBottom: 4 }}>
          Your data
        </h2>
        <div className="set__row">
          <div className="set__row-main">
            <div className="set__row-label">Export data</div>
            <div className="set__row-desc">Download all your habits and marks as a JSON file.</div>
          </div>
          <ComingSoon>
            <Button variant="ghost" size="sm" disabled>
              <Icon name="download" size={15} /> Export
            </Button>
          </ComingSoon>
        </div>
      </section>

      <section className="set__group">
        <h2 className="eyebrow" style={{ marginBottom: 4, color: 'var(--miss-ink)' }}>
          Danger zone
        </h2>
        <div className="set__row">
          <div className="set__row-main">
            <div className="set__row-label">Delete account</div>
            <div className="set__row-desc">
              Permanently remove your account and every habit. This can&rsquo;t be undone.
            </div>
          </div>
          <ComingSoon>
            <Button variant="danger" size="sm" disabled>
              <Icon name="trash" size={15} /> Delete
            </Button>
          </ComingSoon>
        </div>
      </section>
    </main>
  );
}
