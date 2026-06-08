import { test, expect } from '@playwright/test';

// SEED TEST — the exemplar every /10x-e2e-generated spec is modeled on.
// What you show is what you get: it uses role/label/text locators, waits for
// application state (never time), names test data with a unique suffix, and
// tears down through the API. See e2e/E2E_RULES.md for the rules these encode.
//
// It runs in the `chromium` project, which loads the storageState minted by
// e2e/auth.setup.ts — so it lands on /app already authenticated, with no UI
// login. The setup account is freshly registered each run, hence empty: the
// dashboard shows its zero-habit empty state and the "Add a habit" CTA.

const AUTH_API_URL = process.env.VITE_AUTH_API_URL ?? 'http://localhost:3000';
const HABITS_API_URL = process.env.VITE_HABITS_API_URL ?? 'http://localhost:3001';

// Browser-local date — the SPA keys today's habit list on the local date, so
// teardown lists against the same date the UI used.
function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

test('created habit persists after page reload', async ({ page, request }) => {
  const habitName = `Seed Habit ${Date.now()}`;

  // storageState rehydrates the session — no login step.
  await page.goto('/app');

  await page.getByRole('button', { name: 'Add a habit' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill(habitName);
  await page.getByRole('button', { name: 'Add habit' }).click();

  // The new daily habit's mark control carries the habit name in its accessible
  // name — a role locator unique to this habit (unlike getByText, which would
  // also match the transient "…added." toast). Wait for it to render once the
  // list refetches.
  const markButton = page.getByRole('button', { name: `Mark ${habitName} done today` });
  await expect(markButton).toBeVisible();

  // The risk: a created habit that does not survive a real fetch. A reload drops
  // the in-memory access token, re-bootstraps the session, and re-fetches the
  // list from the server — so this assertion fails if persistence is broken.
  await page.reload();
  await expect(markButton).toBeVisible();

  // Cleanup: delete the seeded habit via the API so the (shared) setup account
  // stays clean. The access token is in-memory only, so exchange the persisted
  // refresh token for one, then DELETE by id.
  const refreshToken = await page.evaluate(() =>
    localStorage.getItem('habitpair.refreshToken'),
  );
  expect(refreshToken).toBeTruthy();

  const refreshResponse = await request.post(`${AUTH_API_URL}/auth/refresh`, {
    data: { refreshToken },
  });
  expect(refreshResponse.ok()).toBeTruthy();
  const { accessToken } = (await refreshResponse.json()) as { accessToken: string };
  const authHeader = { Authorization: `Bearer ${accessToken}` };

  const listResponse = await request.get(`${HABITS_API_URL}/habits?today=${todayISO()}`, {
    headers: authHeader,
  });
  expect(listResponse.ok()).toBeTruthy();
  const habits = (await listResponse.json()) as Array<{ id: string; name: string }>;

  const created = habits.find((habit) => habit.name === habitName);
  if (created) {
    const deleteResponse = await request.delete(`${HABITS_API_URL}/habits/${created.id}`, {
      headers: authHeader,
    });
    expect(deleteResponse.ok()).toBeTruthy();
  }
});
