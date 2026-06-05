import { useState, type CSSProperties } from 'react';
import { Link } from '@tanstack/react-router';
import { Button } from '../../../shared/components/Button';
import { Field } from '../../../shared/components/Field';
import { Icon } from '../../../shared/components/Icon';
import { Input } from '../../../shared/components/Input';
import type { Credentials } from '../types';

interface AuthCardProps {
  mode: 'login' | 'register';
  pending: boolean;
  error: string | null;
  onSubmit: (credentials: Credentials) => void;
}

const mainStyle = { paddingTop: 'clamp(36px, 8vh, 80px)', paddingBottom: 60 } as const;
const formStyle = { display: 'flex', flexDirection: 'column', gap: 16 } as CSSProperties;
const footStyle = { marginTop: 20, fontSize: '.9rem', textAlign: 'center' } as CSSProperties;

export function AuthCard({ mode, pending, error, onSubmit }: AuthCardProps) {
  const isRegister = mode === 'register';
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [touched, setTouched] = useState(false);
  const passwordTooShort = isRegister && touched && password.length > 0 && password.length < 8;

  return (
    <main className="container container--narrow fadein" style={mainStyle}>
      <div className="card card--pad">
        <h1 className="h1" style={{ fontSize: '1.7rem' }}>
          {isRegister ? 'Create your account' : 'Welcome back'}
        </h1>
        <p className="sub" style={{ marginTop: 6, marginBottom: 22 }}>
          {isRegister ? 'Two habits, one honest grid.' : 'Pick up where you left off.'}
        </p>
        <form
          style={formStyle}
          onSubmit={(event) => {
            event.preventDefault();
            setTouched(true);
            if (isRegister && password.length < 8) return;
            onSubmit({ email, password });
          }}
        >
          <Field label="Email">
            <Input
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              placeholder="you@example.com"
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>
          <Field
            label="Password"
            hint={isRegister && !passwordTooShort ? 'Minimum 8 characters.' : undefined}
            error={
              passwordTooShort ? (
                <>
                  <Icon name="x" size={13} /> Password must be at least 8 characters.
                </>
              ) : undefined
            }
          >
            <Input
              type="password"
              name="password"
              autoComplete={isRegister ? 'new-password' : 'current-password'}
              required
              value={password}
              placeholder={isRegister ? 'At least 8 characters' : '••••••••'}
              onChange={(event) => setPassword(event.target.value)}
              onBlur={() => setTouched(true)}
            />
          </Field>
          {error ? (
            <div className="form-err" role="alert">
              <Icon name="x" size={14} /> {error}
            </div>
          ) : null}
          <Button type="submit" variant="primary" size="lg" block disabled={pending}>
            {pending ? 'One moment…' : isRegister ? 'Create account' : 'Log in'}
          </Button>
        </form>
        <p className="muted" style={footStyle}>
          {isRegister ? 'Already have an account? ' : 'New to habitpair? '}
          <Link to={isRegister ? '/login' : '/register'}>
            {isRegister ? 'Log in' : 'Create one'}
          </Link>
        </p>
      </div>
    </main>
  );
}
