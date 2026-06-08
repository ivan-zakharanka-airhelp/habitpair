# E2E Testing Rules (habitpair)

Read this before generating or editing any Playwright spec under `e2e/`. It is
one of the two quality levers (the other is `e2e/seed.spec.ts` — the worked
exemplar). Agents apply known patterns far more reliably than they invent new
ones, so these rules constrain output to be stable by default.

The canonical workflow (risk → seed + rules → generate → review → verify) and the
deeper rationale live in `.claude/skills/10x-e2e/` and its `references/`. Drive
new specs through the `/10x-e2e` skill.

## The rules block

- Use `getByRole`, `getByLabel`, `getByText` as primary locators. Fall back to
  `getByTestId` only when accessibility attributes are ambiguous. Never CSS
  selectors, XPath, or DOM structure.
- Each test must be independently runnable — no shared state between tests.
  Playwright runs in parallel, in random order.
- Never use `page.waitForTimeout()`. Wait for state: `toBeVisible()`,
  `waitForURL()`, `waitForResponse()`.
- Assert the business outcome (the user-visible result tied to the risk), not
  implementation details.
- Use unique identifiers (timestamp suffix) for test data so parallel runs and
  re-runs don't collide. Clean up via the API at the end of the test (or
  `afterEach`).
- Prefer `storageState` for authenticated tests — but the session-lifecycle
  specs deliberately manage their own auth (see "Authentication" below).

## Locators (harvested from the real UI)

The UI is built with accessible labels and ARIA, so everything below is
role/label/text-addressable. Use these; do not reach for CSS.

| Action | Locator |
|---|---|
| Email field | `getByLabel('Email')` |
| Password field | `getByLabel('Password')` |
| Log in (submit) | `getByRole('button', { name: 'Log in' })` |
| Create account (submit) | `getByRole('button', { name: 'Create account' })` |
| Open create-habit (empty state) | `getByRole('button', { name: 'Add a habit' })` |
| Open create-habit (section, has habits) | `getByRole('button', { name: 'Add a building habit' })` / `'Add a breaking habit'` |
| Create-habit dialog | `getByRole('dialog')` |
| Habit name field | `getByLabel('Name')` |
| Submit new habit | `getByRole('button', { name: 'Add habit' })` |
| Habit on the list (daily) | `getByRole('button', { name: 'Mark <name> done today' })` — name-unique, avoids the create toast |
| Mark today (positive, not yet done) | `getByRole('button', { name: 'Mark <name> done today' })` |
| Marked-done (positive) | same button → `'Mark <name> not done today'`, `aria-pressed="true"` |
| Mark today (negative habit) | `'Mark <name> clean today'` → `'Mark <name> not clean today'` |
| Account menu (open) | `getByRole('button', { name: 'Account menu' })` |
| Log out | `getByRole('menuitem', { name: 'Log out' })` |

Notes:
- The empty-state `Add a habit` button only renders when the user has **zero**
  habits; once a habit exists, use the per-section `Add a building habit` /
  `Add a breaking habit` buttons (a section is absent if it has no habits).
- The mark control's accessible name flips with state and modality
  (`done`/`clean`, `Mark …`/`Mark … not …`), so it is both the locator and a
  status assertion.

## Test data & isolation

- **Register a unique user per test** via the real flow — emails like
  `e2e-${Date.now()}-<rand>@test.local`. A fresh user is a clean slate
  (user-scoped data), which makes tests parallel-safe and re-runnable.
- **Tear down via the API** at the end of the test: `DELETE /habits/:id` with the
  user's access token. A fresh user already isolates; teardown just prevents DB
  bloat.
- The access token is **in-memory only** in the SPA. To get one for teardown,
  read the persisted refresh token and exchange it:
  ```ts
  const refreshToken = await page.evaluate(() =>
    localStorage.getItem('habitpair.refreshToken'));
  const res = await request.post(`${AUTH_API_URL}/auth/refresh`, { data: { refreshToken } });
  const { accessToken } = await res.json();
  ```
  API base URLs: `process.env.VITE_AUTH_API_URL ?? 'http://localhost:3000'`,
  `process.env.VITE_HABITS_API_URL ?? 'http://localhost:3001'`. See
  `e2e/seed.spec.ts` for the full pattern.

## Authentication (`storageState`)

- The `setup` project (`e2e/auth.setup.ts`) registers a unique user once per run
  and saves `playwright/.auth/user.json`; the `chromium` project loads it. Tests
  in that project land on `/app` already authenticated — **do not log in through
  the UI** in a storageState-backed test.
- **The session-lifecycle / activation specs (#3, #4) must NOT reuse the shared
  storageState.** They register their own users (and #3 revokes tokens / swaps
  users, which would corrupt a shared session). Opt out at the top of the file:
  ```ts
  test.use({ storageState: { cookies: [], origins: [] } }); // start unauthenticated
  ```
- **Refresh-token rotation caveat:** the refresh token rotates on every
  `/auth/refresh`, so a single saved `storageState` can only safely rehydrate
  **one** test context (the first consumer rotates the token; a second would
  401). Today only the seed relies on it. If you add multiple authed-only specs,
  give each its own session (a per-worker fixture that registers its own user) —
  do not naively share one rotating refresh token across parallel tests.

## Name the test after the risk

`test('an invalidated session redirects to login and gates /app', …)`, not
`test('test 1', …)`. The name must bind the spec to a risk in
`context/foundation/test-plan.md`.

## Review every generated spec against the five anti-patterns

Full detail (with target-pattern re-prompts) in
`.claude/skills/10x-e2e/references/e2e-anti-patterns.md`:

1. **Hallucinated assertion** — passes but wouldn't fail if the risk
   materialized. Control question: *would this assertion fail if the risk came
   true?*
2. **Brittle selector** — CSS/XPath/`nth-child` instead of role/label/text.
3. **Shared state between tests** — one test assumes another ran first.
4. **`waitForTimeout`** instead of waiting for a concrete state.
5. **No cleanup** — unique ids + API teardown (or teardown-before-setup).
