import { test as setup, expect } from '@playwright/test';

// The `setup` project (playwright.config.ts) runs this once before the chromium
// project and persists a logged-in session to `playwright/.auth/user.json`,
// which the chromium project loads via `storageState`. This is FOUNDATION for
// future authed-only tests — the #3/#4 risk specs deliberately do NOT reuse it
// (they register/swap their own users), so do not couple risk specs to this
// account.
//
// A UNIQUE user is registered every run: a fresh account has zero habits, so any
// storageState-backed test starts from a known-clean slate, and the rotating
// refresh token captured here is never stale across runs (each run re-mints it).
const authFile = 'playwright/.auth/user.json';

setup('authenticate', async ({ page }) => {
  const email = `setup-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;

  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();

  // Wait for the authenticated landing + a stable authed signal (the account
  // menu only renders when the session is established) before snapshotting, so
  // the refresh token is in localStorage when storageState captures it.
  await page.waitForURL('**/app');
  await expect(page.getByRole('button', { name: 'Account menu' })).toBeVisible();

  await page.context().storageState({ path: authFile });
});
