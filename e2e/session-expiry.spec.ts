import { test, expect } from '@playwright/test';

// Risk #3a (context/foundation/test-plan.md): an expired/invalidated session must
// return the user to /login and must not be able to reach /app. The access token
// is a stateless 15m JWT, so "expiry" is forced deterministically by revoking the
// REFRESH token server-side, then reloading: on boot the in-memory access token
// is gone, the boot-exchange calls /auth/refresh with the now-revoked token, gets
// a 401, and the session is torn down → /login. Conventions in e2e/E2E_RULES.md.

// Manages its own user — do not reuse the shared storageState.
test.use({ storageState: { cookies: [], origins: [] } });

const AUTH_API_URL = process.env.VITE_AUTH_API_URL ?? 'http://localhost:3000';

test('an invalidated session redirects to login and gates /app', async ({ page, request }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;

  // Register a fresh user and land authenticated on /app.
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/app');

  // Revoke the session server-side: read the persisted refresh token and log it
  // out via the API while the page stays open. The in-memory access token is
  // untouched, but it's dropped on the next reload.
  const refreshToken = await page.evaluate(() =>
    localStorage.getItem('habitpair.refreshToken'),
  );
  expect(refreshToken).toBeTruthy();
  const logoutResponse = await request.post(`${AUTH_API_URL}/auth/logout`, {
    data: { refreshToken },
  });
  expect(logoutResponse.ok()).toBeTruthy();

  // Reload: boot-exchange refreshes with the revoked token → 401 → session
  // cleared → redirect to /login. This is the risk's first half.
  await page.reload();
  await page.waitForURL('**/login');

  // The risk's second half: /app must no longer be reachable. A direct
  // navigation re-bounces to /login (the route guard, with no valid session).
  await page.goto('/app');
  await page.waitForURL('**/login');
  await expect(page).toHaveURL(/\/login/);

  // No habits were created → no teardown needed (the user row is left revoked).
});
