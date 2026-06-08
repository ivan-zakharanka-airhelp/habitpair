import { test, expect, type Page } from '@playwright/test';

// Risk #3b (context/foundation/test-plan.md): after sign-out, the client cache
// must be cleared so a different user on the same browser sees NONE of the
// previous user's data. The guard is queryClient.clear() on logout, sharpened by
// the date-keyed list query (['habits', today]) — not user-keyed — so two users
// on the same day share the entry. With staleTime 30s a leaked entry stays fresh
// (no race-clearing refetch), so without the clear, user B would render A's
// cached habits.
//
// IMPORTANT: B logs in via CLIENT-SIDE navigation (the on-page link), never a
// full page load. A full reload would recreate the QueryClient and wipe the
// cache regardless of the guard — masking the very leak under test. Conventions
// in e2e/E2E_RULES.md.

// Drives login twice (two users) — do not reuse the shared storageState.
test.use({ storageState: { cookies: [], origins: [] } });

const AUTH_API_URL = process.env.VITE_AUTH_API_URL ?? 'http://localhost:3000';
const HABITS_API_URL = process.env.VITE_HABITS_API_URL ?? 'http://localhost:3001';

function uniqueEmail(): string {
  return `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
}

function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

// Fill and submit the register form (assumes the page is already on /register).
async function submitRegister(page: Page, email: string): Promise<void> {
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/app');
}

test("after sign-out, a second user sees none of the first user's habits", async ({
  page,
  request,
}) => {
  const habitAName = `A-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  // User A registers (initial load) and creates a habit; A's dashboard now holds
  // it and seeds the shared ['habits', today] cache entry.
  await page.goto('/register');
  await submitRegister(page, uniqueEmail());
  await page.getByRole('button', { name: 'Add a habit' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(habitAName);
  await page.getByRole('button', { name: 'Add habit' }).click();
  await expect(page.getByRole('button', { name: `Mark ${habitAName} done today` })).toBeVisible();

  // Capture an access token for A BEFORE sign-out (the refresh token is revoked
  // on logout; the access JWT stays valid ~15m, enough for teardown) plus A's
  // habit id for the DELETE.
  const aRefreshToken = await page.evaluate(() =>
    localStorage.getItem('habitpair.refreshToken'),
  );
  expect(aRefreshToken).toBeTruthy();
  const aRefreshResponse = await request.post(`${AUTH_API_URL}/auth/refresh`, {
    data: { refreshToken: aRefreshToken },
  });
  expect(aRefreshResponse.ok()).toBeTruthy();
  const { accessToken: aAccessToken } = (await aRefreshResponse.json()) as { accessToken: string };
  const aAuthHeader = { Authorization: `Bearer ${aAccessToken}` };
  const aHabits = (await (
    await request.get(`${HABITS_API_URL}/habits?today=${todayISO()}`, { headers: aAuthHeader })
  ).json()) as Array<{ id: string; name: string }>;
  const aHabitId = aHabits.find((habit) => habit.name === habitAName)?.id;

  // Sign out via the account menu (client-side → /login; QueryClient persists).
  await page.getByRole('button', { name: 'Account menu' }).click();
  await page.getByRole('menuitem', { name: 'Log out' }).click();
  await page.waitForURL('**/login');

  // User B signs up on the SAME loaded SPA — navigate client-side via the on-page
  // link (NOT page.goto, which would reload and recreate the QueryClient).
  await page.getByRole('link', { name: 'Create one' }).click();
  await page.waitForURL('**/register');
  await submitRegister(page, uniqueEmail());

  // The risk: B must see B's own (empty) dashboard, not A's cached habits. The
  // empty-state CTA proves B's dashboard loaded with zero habits (if the cache
  // leaked, A's habit would render in a section and this CTA would be absent);
  // the count assertion is the direct cross-user check.
  await expect(page.getByRole('button', { name: 'Add a habit' })).toBeVisible();
  await expect(page.getByText(habitAName)).toHaveCount(0);

  // Teardown: delete A's habit with A's captured access token.
  if (aHabitId) {
    await request.delete(`${HABITS_API_URL}/habits/${aHabitId}`, { headers: aAuthHeader });
  }
});
