export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: User;
}

// Auth slice of the TanStack Router context. `isResolving` is true during the
// boot refresh exchange so guards don't bounce a returning user before the
// stored session resolves.
export interface AuthContext {
  isAuthenticated: boolean;
  isResolving: boolean;
  user: User | null;
}
