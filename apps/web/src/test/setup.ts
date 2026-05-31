import '@testing-library/jest-dom/vitest';
import { beforeEach, vi } from 'vitest';

// Minimal in-memory localStorage for the node test environment. A fresh
// instance per test keeps the refresh-token slot isolated.
function createMemoryStorage(): Storage {
  const store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
  } as Storage;
}

beforeEach(() => {
  vi.stubGlobal('localStorage', createMemoryStorage());
});
