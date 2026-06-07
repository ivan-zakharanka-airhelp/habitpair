import { useSyncExternalStore } from 'react';
import { themeStore, type EffTheme, type Theme } from '../lib/themeStore';

export interface UseTheme {
  theme: Theme;
  effTheme: EffTheme;
  setTheme: (theme: Theme) => void;
}

export function useTheme(): UseTheme {
  const snapshot = useSyncExternalStore(themeStore.subscribe, themeStore.getSnapshot);
  return {
    theme: snapshot.theme,
    effTheme: snapshot.effTheme,
    setTheme: themeStore.setTheme,
  };
}
