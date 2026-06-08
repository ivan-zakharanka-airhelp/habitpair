import { test, expect } from '@playwright/test';

// PWA install smoke — guards the app-shell installability against regressions.
// Risk (plan pwa-app, Phase 5): a future caching/deploy change silently breaks
// the service worker or manifest, so the app stops being installable without
// anyone noticing. This spec fails the moment the manifest link disappears, the
// manifest stops serving valid JSON with its install icons, or the SW no longer
// registers + activates. Models e2e/seed.spec.ts; rules in e2e/E2E_RULES.md.
//
// Runs against the dev server, where vite-plugin-pwa's `devOptions` serve the SW
// + manifest. Public landing page only — no auth — so it opts out of the shared
// storageState (which the seed consumes and whose refresh token rotates). It
// creates no data, so there is nothing to tear down.
test.use({ storageState: { cookies: [], origins: [] } });

test('the app is installable: manifest is linked + valid and the service worker registers', async ({
  page,
  request,
}) => {
  await page.goto('/');

  // The manifest <link> lives in <head> (not in the accessibility tree, so no
  // role/label locator applies); read it via a one-shot DOM query for its href.
  const manifestHref = await page.evaluate(
    () => document.querySelector('link[rel="manifest"]')?.getAttribute('href') ?? null,
  );
  expect(manifestHref).toBeTruthy();

  // Fetching the manifest must return valid JSON carrying the install metadata
  // the browser needs — a broken content-type or missing icons fails install.
  const manifestUrl = new URL(manifestHref!, page.url()).toString();
  const manifestResponse = await request.get(manifestUrl);
  expect(manifestResponse.ok()).toBeTruthy();
  const manifest = (await manifestResponse.json()) as {
    name: string;
    icons: Array<{ sizes: string }>;
  };
  expect(manifest.name).toBe('Habitpair');
  expect(manifest.icons.map((icon) => icon.sizes)).toEqual(
    expect.arrayContaining(['192x192', '512x512']),
  );

  // The service worker registers and becomes active. navigator.serviceWorker.ready
  // resolves only once an active worker controls the registration — waiting on
  // state, never a timeout.
  const swActive = await page.evaluate(async () => {
    if (!('serviceWorker' in navigator)) return false;
    const registration = await navigator.serviceWorker.ready;
    return registration.active !== null;
  });
  expect(swActive).toBe(true);
});
