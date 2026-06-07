export type Theme = 'light' | 'dark' | 'system';
export type EffTheme = 'light' | 'dark';

const THEME_KEY = 'hp_theme';

export interface ThemeSnapshot {
  theme: Theme;
  effTheme: EffTheme;
}

function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    if (stored === 'light' || stored === 'dark' || stored === 'system') return stored;
  } catch {
    // localStorage can throw in private-mode / sandboxed contexts; fall back to default.
  }
  return 'system';
}

// The OS-preference query is the one external subscription this store owns; it
// only moves effTheme while the user has chosen 'system'.
const darkQuery =
  typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null;

let theme: Theme = readStoredTheme();
let sysDark = darkQuery?.matches ?? false;

function computeEffTheme(): EffTheme {
  if (theme === 'system') return sysDark ? 'dark' : 'light';
  return theme;
}

let snapshot: ThemeSnapshot = { theme, effTheme: computeEffTheme() };

const listeners = new Set<() => void>();

function emitChange(): void {
  // Recompute once so subscribers get a stable, cached reference between
  // changes — required for useSyncExternalStore.
  snapshot = { theme, effTheme: computeEffTheme() };
  for (const listener of listeners) listener();
}

darkQuery?.addEventListener('change', (event) => {
  sysDark = event.matches;
  emitChange();
});

function setTheme(next: Theme): void {
  theme = next;
  try {
    localStorage.setItem(THEME_KEY, next);
  } catch {
    // Persistence is best-effort; the in-memory value still drives this session.
  }
  emitChange();
}

export const themeStore = {
  getSnapshot: (): ThemeSnapshot => snapshot,
  subscribe(listener: () => void): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
  setTheme,
};
