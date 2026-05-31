import { defineConfig } from 'vitest/config';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
  ],
  test: {
    // The auth plumbing exercises localStorage + fetch only; the DOM is stubbed
    // in setup.ts, so the lighter node environment is enough for this phase.
    environment: 'node',
    setupFiles: ['./src/test/setup.ts'],
    // apiClient reads these at import time and throws if absent; provide them so
    // tests run without a local .env (which is gitignored and absent in CI).
    env: {
      VITE_AUTH_API_URL: 'http://localhost:3000',
      VITE_HABITS_API_URL: 'http://localhost:3001',
    },
  },
});
