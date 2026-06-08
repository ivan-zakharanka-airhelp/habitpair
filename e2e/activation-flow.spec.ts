import { test, expect } from '@playwright/test';

// Risk #4 (context/foundation/test-plan.md): the activation flow — register →
// create habit → mark today → see it with the correct status — breaks at an
// integration seam no unit test exercises (token wiring, API base URL, route
// guard, or a cache-invalidation gap). This drives the whole flow through the
// real stack and proves the marked status SURVIVES A REAL PAGE RELOAD — the
// point where the optimistic UI and a cache-invalidation/persistence seam would
// diverge. Modeled on e2e/seed.spec.ts; conventions in e2e/E2E_RULES.md.

// This spec manages its own user (the register → /app transition is the risk),
// so it must NOT reuse the shared storageState — start unauthenticated.
test.use({ storageState: { cookies: [], origins: [] } });

const AUTH_API_URL = process.env.VITE_AUTH_API_URL ?? 'http://localhost:3000';
const HABITS_API_URL = process.env.VITE_HABITS_API_URL ?? 'http://localhost:3001';

function todayISO(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

test("a new habit and today's mark persist after page reload", async ({ page, request }) => {
  const email = `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.local`;
  const habitName = `Habit ${Date.now()}`;

  // Register a fresh user — exercises the unauthenticated → authenticated
  // transition (token wiring + route guard).
  await page.goto('/register');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill('password123');
  await page.getByRole('button', { name: 'Create account' }).click();
  await page.waitForURL('**/app');

  // Create a habit (defaults: Build + Daily → markable today).
  await page.getByRole('button', { name: 'Add a habit' }).click();
  await page.getByRole('dialog').getByLabel('Name').fill(habitName);
  await page.getByRole('button', { name: 'Add habit' }).click();

  // The created (unmarked) habit appears — its daily mark control carries the
  // habit name, so it's a name-unique role locator (avoids the create toast).
  const markDone = page.getByRole('button', { name: `Mark ${habitName} done today` });
  await expect(markDone).toBeVisible();

  // Mark today done: the control flips to its "undo" name and aria-pressed.
  await markDone.click();
  const marked = page.getByRole('button', { name: `Mark ${habitName} not done today` });
  await expect(marked).toBeVisible();
  await expect(marked).toHaveAttribute('aria-pressed', 'true');

  // The risk materializes here if it isn't durable: a reload drops the in-memory
  // access token, re-bootstraps the session, and re-fetches the list from the
  // server — so this proves the COMPLETED mark persisted, not the optimistic
  // flash.
  await page.reload();
  await expect(marked).toBeVisible();
  await expect(marked).toHaveAttribute('aria-pressed', 'true');

  // Teardown: delete the habit via the API. The access token is in-memory only,
  // so exchange the persisted refresh token for one, then DELETE by id.
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
    await request.delete(`${HABITS_API_URL}/habits/${created.id}`, { headers: authHeader });
  }
});
