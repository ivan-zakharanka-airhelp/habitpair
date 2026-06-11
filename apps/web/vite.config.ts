import { defineConfig } from 'vitest/config';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import { TanStackRouterVite } from '@tanstack/router-plugin/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    TanStackRouterVite({ target: 'react', autoCodeSplitting: true }),
    react(),
    babel({ presets: [reactCompilerPreset()] }),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      injectRegister: null, // we call registerSW() ourselves in main.tsx (Phase 2)
      includeAssets: ['favicon.svg', 'favicon-32.png', 'favicon-180.png'],
      manifest: {
        name: 'Habitpair',
        short_name: 'Habitpair',
        description: 'The calm habit tracker that shows you why you slip.',
        theme_color: '#2e7d5b',
        background_color: '#faf8f4',
        display: 'standalone',
        start_url: '/app',
        scope: '/',
        icons: [
          { src: 'favicon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'favicon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        globIgnores: ['**/product/**'], // keep marketing screenshots out of the shell precache
        navigateFallback: '/index.html',
      },
      devOptions: { enabled: true }, // serve the SW under `vite dev` (make up) for Playwright + local testing
    }),
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
