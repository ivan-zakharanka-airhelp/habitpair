import { useSyncExternalStore } from 'react';
import { authStore } from '../../../shared/lib/authStore';
import { useLogout } from './useLogout';
import type { User } from '../../../shared/types/auth';

export interface UseAuth {
  isAuthenticated: boolean;
  user: User | null;
  logout: () => void;
}

export function useAuth(): UseAuth {
  const snapshot = useSyncExternalStore(authStore.subscribe, authStore.getSnapshot);
  const logout = useLogout();
  return {
    isAuthenticated: snapshot.isAuthenticated,
    user: snapshot.user,
    // Clearing the store flips the router context, which re-runs the gate and
    // redirects to /login — no explicit navigation needed here.
    logout: () => logout.mutate(),
  };
}
