# Critical-Flow Browser E2E Implementation Plan

## Overview

Stand up Playwright (net-new in this repo) and add browser-level E2E coverage for the two risks Phase 1 explicitly deferred to Phase 2 of the [test-plan](../../foundation/test-plan.md):

- **Risk #4** — the activation flow (register → create habit → mark today → see it with the correct status) breaks at an integration seam no unit test exercises.
- **Risk #3** — session expiry or sign-out leaves stale state (an expired session doesn't return the user to login, or sign-out doesn't clear cached data so the next user sees the previous user's habits).

All tests run against the **real local stack** (SPA + auth-api + habits-api + Postgres) — there is no external API in either flow, so nothing is mocked.

## Current State Analysis

- **No Playwright anywhere** — no `playwright.config.*`, no `@playwright/test` dependency, no `e2e/` dir, no spec importing it ([research.md](research.md) §C). The only e2e today is Jest+Supertest backend suites under `apps/*/test/`.
- **Auth/session machinery** ([research.md](research.md) §A): access token in-memory (HS256, 15m, `exp` claim), refresh token in `localStorage['habitpair.refreshToken']` (30d, rotating); boot-exchange rehydrates via `POST /auth/refresh`; a 401 on `habitsApi` triggers single-flight refresh→retry, and on refresh failure `authStore.clear()` + `onAuthCleared` → `queryClient.clear()` + navigate `/login`. Sign-out ([useLogout.ts](../../../apps/web/src/features/auth/hooks/useLogout.ts)) runs `authStore.clear()` **then** `queryClient.clear()`.
- **Activation wiring** ([research.md](research.md) §B): `apiClient` injects `Authorization: Bearer` from the in-memory token; create invalidates `['habits', today]` (exact match); mark is optimistic + `onSettled` invalidate. All user-visible controls are role/label-addressable (locators harvested in the [research.md Locators table](research.md)).
- **Run mechanics**: `make up` boots db + auth-api (`:3000`) + habits-api (`:3001`) + web (`:5173`); users are created via the real `POST /auth/register` (no seed script). Phase-1 isolation precedent: unique subjects + `prisma.*.deleteMany` cleanup ([apps/habits-api/test/isolation.e2e-spec.ts](../../../apps/habits-api/test/isolation.e2e-spec.ts)).

## Desired End State

Running `npm run test:e2e` against a live stack executes a small, risk-tied Playwright suite that:

1. Registers a fresh user, creates a habit, marks it today, and confirms the marked status **survives a page reload** (Risk #4).
2. Revokes a session's refresh token + reloads and confirms the user is **redirected to `/login`** and cannot reach `/app` (Risk #3a).
3. Signs out user A (who has a habit), logs in user B, and confirms B sees **none of A's data** (Risk #3b — the `queryClient.clear()` cross-user guard).

Each test uses role/label locators, waits for state (never time), registers its own unique user, and tears down via API. A `seed.spec.ts` exemplar and an `e2e/E2E_RULES.md` rules file are in place so `/10x-e2e` generates tests that match these conventions. Re-running the suite twice in a row passes both times (isolation proven).

### Key Discoveries

- **The stateless access token survives logout for ≤15m** ([token.service.ts:6](../../../apps/auth-api/src/auth/token.service.ts:6)) — so "expired session" must be forced by revoking the **refresh** token + reloading (the boot-exchange path), not by aging the in-memory JWT. The sign-out guard under test is the cache clear, not server-side token revocation.
- **The `['habits', today]` query key is date-keyed, not user-keyed** ([useHabits.ts:6](../../../apps/web/src/features/habits/hooks/useHabits.ts:6)) — two users on the same day share the key, which is exactly why `queryClient.clear()` on logout is the cross-user guard and why the #3b test (same-day A→B) bites.
- **`useToggleMark` is optimistic** ([useToggleMark.ts:20](../../../apps/web/src/features/habits/hooks/useToggleMark.ts:20)) — the status flips instantly before the server round-trip; only the assertion **after `page.reload()`** (a fresh fetch) proves durability.
- **Phase 1 handed #3 + #4 here explicitly** — e.g. *"Risk #3 (session/expiry/cache) is Phase 2."* ([research.md](research.md) §Historical Context).

## What We're NOT Doing

- **No local-timezone / midnight assertion** (the Phase-1 local-tz hand-off + the create-invalidation midnight seam) — out of scope; deserves its own focused, clock-controlled slice.
- **No CI gating** — delivering local, runnable, green tests + npm scripts; making them a blocking PR check is the test-plan's separate **Phase 3 (Quality-gates wiring)**.
- **No standalone login/register specs** — register/login are covered as steps inside #4/#3; error-path validation (bad password, duplicate email) is cheaper at the integration/unit layer (auth-api already covers it).
- **No production code changes** — this change is additive tooling + tests. Deliberate-break edits are temporary verification, reverted, never committed.
- **No multi-browser matrix** — Chromium only, to keep the slowest test layer fast.

## Implementation Approach

Three phases. Phase 1 stands up the tooling and the two quality levers (driven by `/10x-implement`, since scaffolding is not browser-testable — `/10x-e2e`'s eligibility gate would redirect it here anyway). Phases 2 and 3 are driven by `/10x-e2e`, one risk per phase, each looping PLAN → GENERATE → REVIEW (five anti-patterns) → VERIFY (green + deliberate-break). All three phases share the `## Progress` section below.

Playwright lives at the **repo root** (`playwright.config.ts` + `e2e/`) because the flows require the whole stack; the `webServer` boots `make up` and reuses an already-running stack locally.

## Critical Implementation Details

- **Forcing "session expired" (Risk #3a).** Log in as a fresh user, read the refresh token from `localStorage['habitpair.refreshToken']`, revoke it server-side via `POST {VITE_AUTH_API_URL}/auth/logout` with that token, then `page.reload()`. On boot the in-memory access token is gone, `bootstrap()` calls `/auth/refresh` with the now-revoked token, gets a 401, and `onAuthCleared` redirects to `/login`. This is deterministic (no 15m wait) and a genuine server-side invalidation.
- **storageState is foundation-only for this change.** The `setup` project creates a logged-in `playwright/.auth/user.json` for *future* authed-only tests. The #3/#4 tests must **not** reuse it — they register their own users (the #3 tests revoke tokens / swap users, which would corrupt a shared session). Do not add `storageState` to the #3/#4 specs.
- **webServer reuse.** Set `reuseExistingServer: !process.env.CI` so a developer's already-running `make up` is reused; otherwise Playwright would spawn a duplicate stack and collide on ports 5173/3000/3001/5434.
- **The #3b leak assertion must check A's data is absent on B's view**, asserted right after B's dashboard renders — because the shared date-keyed cache means that without `queryClient.clear()`, A's cached habits surface under B. That absence is what the deliberate-break (removing the cache clear) must flip to red.

## Phase 1: Playwright harness + quality levers

### Overview

Install and configure Playwright at the repo root, wire a `storageState` setup project, author the two quality levers (`seed.spec.ts` + `e2e/E2E_RULES.md`), add scripts and gitignore entries, and document the convention in CLAUDE.md §6.3.

### Changes Required:

#### 1. Root Playwright dependency + scripts

**File**: `package.json` (root)

**Intent**: Make Playwright installable and runnable from the repo root with a single-spec invocation; the lockfile lives at root (per CLAUDE.md).

**Contract**: add `@playwright/test` to root `devDependencies`; add scripts `"test:e2e": "playwright test"` (and optionally `"test:e2e:ui": "playwright test --ui"`); re-run `npm install` at root. Single-spec: `npm run test:e2e -- e2e/<file>.spec.ts` or `--grep "<name>"`. Run `npx playwright install chromium` to fetch the browser.

#### 2. Playwright config

**File**: `playwright.config.ts` (root)

**Intent**: Define the Chromium project, the `storageState` setup dependency, and how the stack boots/reuses.

**Contract**: `testDir: 'e2e'`, `baseURL: 'http://localhost:5173'`, the two projects + webServer below (this is the contract Phases 2/3 depend on, so it is spelled out):

```ts
projects: [
  { name: 'setup', testMatch: /auth\.setup\.ts/ },
  { name: 'chromium',
    use: { ...devices['Desktop Chrome'], storageState: 'playwright/.auth/user.json' },
    dependencies: ['setup'] },
],
webServer: {
  command: 'make up',
  url: 'http://localhost:5173',
  reuseExistingServer: !process.env.CI,
  timeout: 120_000,
},
```

#### 3. storageState setup project

**File**: `e2e/auth.setup.ts`

**Intent**: Log in once as a dedicated setup user and persist its storage state for future authed-only tests.

**Contract**: a `setup('authenticate', …)` test that registers/logs in a unique setup user at `baseURL` (UI or `POST /auth/register`) and calls `page.context().storageState({ path: 'playwright/.auth/user.json' })`. This user is foundation — not consumed by the #3/#4 specs.

#### 4. Seed test (lever 1)

**File**: `e2e/seed.spec.ts`

**Intent**: The exemplar every `/10x-e2e`-generated test is modeled on — *what you show is what you get*.

**Contract**: one self-contained test named for a real habitpair risk (suggested: `'created habit persists after page reload'`) that demonstrates the four patterns — role/label locators (from the [research.md Locators table](research.md)), wait-for-state (`toBeVisible`/`waitForURL`), a unique id (`` `Seed Habit ${Date.now()}` ``), and cleanup. Source the structure from [.claude/skills/10x-e2e/references/seed-test-pattern.md](../../../.claude/skills/10x-e2e/references/seed-test-pattern.md), adapted to habitpair's routes/roles.

#### 5. E2E rules file (lever 2)

**File**: `e2e/E2E_RULES.md`

**Intent**: The rules the generator reads automatically before producing a test — encodes locator hierarchy, no-`waitForTimeout`, test independence, risk-tied assertions, the unique-user+teardown isolation discipline, and the storageState auth pattern.

**Contract**: create from [.claude/skills/10x-e2e/references/e2e-quality-rules.md](../../../.claude/skills/10x-e2e/references/e2e-quality-rules.md), adapted to habitpair (Playwright idioms; the harvested role labels; `e2e-${Date.now()}@test.local` users + API teardown). Reference it from CLAUDE.md §6.3 so it's discoverable.

#### 6. Gitignore

**File**: `.gitignore`

**Intent**: Keep auth state and Playwright reports out of git.

**Contract**: add `playwright/.auth/`, `test-results/`, `playwright-report/`, `blob-report/`, `.playwright/`.

#### 7. Cookbook documentation

**File**: `CLAUDE.md` (§6.3 of the embedded test-plan reference is in [context/foundation/test-plan.md](../../foundation/test-plan.md); the CLAUDE.md M3L4 section already points at `/10x-e2e`)

**Intent**: Replace the §6.3 "TBD" with the now-established e2e convention.

**Contract**: document the e2e location (`e2e/`), the single-spec run command, the seed + rules levers, and the unique-user+teardown isolation pattern. Optionally flip the test-plan §4 stack row from "Playwright — none yet" to the landed version.

### Success Criteria:

#### Automated Verification:

- [ ] Root `npm install` succeeds with `@playwright/test` added and `npx playwright install chromium` completes.
- [ ] `npm run test:e2e -- e2e/seed.spec.ts` passes green against a running stack.
- [ ] The `setup` project produces `playwright/.auth/user.json`.
- [ ] The new e2e TypeScript compiles and lints (Playwright compiles specs; add an `e2e/tsconfig.json` if the typecheck needs it).

#### Manual Verification:

- [ ] The seed test exercises a real habitpair flow and demonstrates all four patterns (role locators, wait-for-state, unique id, cleanup).
- [ ] A `chromium`-project test lands on `/app` without logging in (storageState rehydrates a session).
- [ ] `e2e/E2E_RULES.md`, the `.gitignore` entries, and the §6.3 cookbook read accurately.

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Activation-flow E2E (Risk #4)

### Overview

One browser test proving the wired register → create → mark → status flow survives a real page reload. Driven by `/10x-e2e`.

### Changes Required:

#### 1. Activation-flow spec

**File**: `e2e/activation-flow.spec.ts`

**Intent**: Prove the activation seam (#4) end-to-end through the real stack: a freshly registered user can create a habit, mark it today, and the marked status persists across a reload.

**Contract**: one test named to bind it to the risk (e.g. `'a new habit and today\'s mark persist after page reload'`). Flow, using the harvested locators: register a unique user at `/register` (`getByLabel('Email')`/`getByLabel('Password')`, `getByRole('button', { name: 'Create account' })`) → assert `waitForURL(**/app)` → `getByRole('button', { name: 'Add a habit' })` → `getByLabel('Name')` fill `` `Habit ${Date.now()}` `` → `getByRole('button', { name: 'Add habit' })` → assert the habit heading visible → mark via `getByRole('button', { name: /Mark .+ done today/ })` → assert `aria-pressed="true"` / name flips to `Mark <name> not done today` → `page.reload()` → assert the habit is still present **and** still marked. Teardown: API `DELETE /habits/:id` with the user's token. No mocking. Review against the five anti-patterns before VERIFY.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test:e2e -- e2e/activation-flow.spec.ts` passes green.

#### Manual Verification:

- [ ] Deliberate-break: invert a protected behavior (remove the `['habits', today]` invalidation in [useCreateHabit.ts:10](../../../apps/web/src/features/habits/hooks/useCreateHabit.ts:10), or break Bearer injection in [apiClient.ts:21](../../../apps/web/src/shared/api/apiClient.ts:21)) and confirm the test goes red; then revert.
- [ ] Five-anti-pattern review passed (role locators, independent, waits-for-state, cleanup, risk-tied name).

**Implementation Note**: After automated verification passes, pause for manual confirmation (including the deliberate-break result) before Phase 3.

---

## Phase 3: Session-lifecycle E2E (Risk #3)

### Overview

Two browser tests: (a) an invalidated session redirects to login and gates `/app`; (b) sign-out clears the client cache so a second user sees none of the first user's data. Driven by `/10x-e2e`.

### Changes Required:

#### 1. Session-expiry spec (#3a)

**File**: `e2e/session-expiry.spec.ts`

**Intent**: Prove that an invalidated session returns the user to `/login` and that `/app` is no longer reachable.

**Contract**: test name binds to the risk (e.g. `'an invalidated session redirects to login and gates /app'`). Register/login a unique user; read `localStorage['habitpair.refreshToken']` via `page.evaluate`; revoke it with `POST {VITE_AUTH_API_URL}/auth/logout` (body `{ refreshToken }`); `page.reload()`; assert `waitForURL(**/login)`; then navigate to `/app` and assert it re-redirects to `/login`. No habits created → minimal teardown.

#### 2. Sign-out cache-leak spec (#3b)

**File**: `e2e/signout-cache-leak.spec.ts`

**Intent**: Prove sign-out clears the TanStack Query cache so a different user cannot see the previous user's habits (the cross-user guard, sharpened by the date-keyed cache).

**Contract**: test name binds to the risk (e.g. `'after sign-out, a second user sees none of the first user\'s habits'`). Register user A (unique); create habit `` `A-${Date.now()}` ``; sign out via the account menu `getByRole('menuitem', { name: 'Log out' })` → assert `waitForURL(**/login)`; register/login user B (unique); on B's dashboard assert A's habit name is **not** visible (`expect(getByText(habitAName)).toHaveCount(0)` / empty-state visible). Teardown: API `DELETE` A's habit with A's token. Review against the five anti-patterns before VERIFY.

### Success Criteria:

#### Automated Verification:

- [ ] `npm run test:e2e -- e2e/session-expiry.spec.ts` passes green.
- [ ] `npm run test:e2e -- e2e/signout-cache-leak.spec.ts` passes green.

#### Manual Verification:

- [ ] Deliberate-break (3a): break the redirect (the `onAuthCleared` navigate in [main.tsx:18](../../../apps/web/src/main.tsx:18) or the `_authed` guard) and confirm the expiry test goes red; revert.
- [ ] Deliberate-break (3b): remove `queryClient.clear()` from [useLogout.ts](../../../apps/web/src/features/auth/hooks/useLogout.ts) and confirm A's habit leaks to B (test red); revert.
- [ ] Five-anti-pattern review passed for both specs.
- [ ] The full e2e suite runs green **twice in a row** (isolation/double-run confirmed).

**Implementation Note**: After automated verification passes, pause for manual confirmation before closing the change.

---

## Testing Strategy

### Unit Tests

- None added — this change is the E2E layer itself; pure logic is already unit-tested (test-plan §7).

### Integration Tests

- None added — cross-user isolation and persisted-correctness are covered by Phase 1's Supertest suite ([apps/habits-api/test/](../../../apps/habits-api/test/)).

### E2E (browser) Tests

- `e2e/activation-flow.spec.ts` (#4), `e2e/session-expiry.spec.ts` (#3a), `e2e/signout-cache-leak.spec.ts` (#3b), plus `e2e/seed.spec.ts` (exemplar). Each: own unique user, role/label locators, wait-for-state, API teardown.

### Manual Testing Steps

1. With `make up` running, `npm run test:e2e` → all specs green.
2. Run `npm run test:e2e` a second time → still green (isolation).
3. For each risk test, perform the deliberate-break listed in its phase and confirm the test fails, then revert.

## Performance Considerations

E2E is the slowest, most flake-prone layer — the suite is deliberately capped at the risk-tied tests (no test-per-page). `webServer` reuse avoids re-booting the stack per run; Chromium-only avoids a browser matrix.

## Migration Notes

None — additive tooling + tests; no schema, data, or production-code changes.

## References

- Research: [context/changes/critical-flow-browser-e2e/research.md](research.md)
- Test plan: [context/foundation/test-plan.md](../../foundation/test-plan.md) §2 (risks #3/#4), §3 (Phase 2), §4 (stack)
- E2E workflow + levers: [.claude/skills/10x-e2e/SKILL.md](../../../.claude/skills/10x-e2e/SKILL.md) and its `references/`
- Isolation precedent: [apps/habits-api/test/isolation.e2e-spec.ts](../../../apps/habits-api/test/isolation.e2e-spec.ts), [helpers.ts](../../../apps/habits-api/test/helpers.ts)
- Key code: [authStore.ts](../../../apps/web/src/shared/lib/authStore.ts), [apiClient.ts](../../../apps/web/src/shared/api/apiClient.ts), [useLogout.ts](../../../apps/web/src/features/auth/hooks/useLogout.ts), [useCreateHabit.ts](../../../apps/web/src/features/habits/hooks/useCreateHabit.ts), [useToggleMark.ts](../../../apps/web/src/features/habits/hooks/useToggleMark.ts), [HabitCard.tsx](../../../apps/web/src/features/habits/components/HabitCard.tsx)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Playwright harness + quality levers

#### Automated

- [x] 1.1 Root npm install + `@playwright/test` + `playwright install chromium` — e72319d
- [x] 1.2 `e2e/seed.spec.ts` passes green — e72319d
- [x] 1.3 `setup` project produces `playwright/.auth/user.json` — e72319d
- [x] 1.4 New e2e TypeScript compiles + lints — e72319d

#### Manual

- [x] 1.5 Seed test demonstrates all four patterns on a real flow — e72319d
- [x] 1.6 A chromium-project test lands on `/app` without logging in (storageState rehydrates) — e72319d
- [x] 1.7 `E2E_RULES.md` + `.gitignore` entries + §6.3 cookbook accurate — e72319d

### Phase 2: Activation-flow E2E (Risk #4)

#### Automated

- [x] 2.1 `e2e/activation-flow.spec.ts` passes green — 47eb518

#### Manual

- [x] 2.2 Deliberate-break (invalidation/Bearer) → test red, then reverted — 47eb518
- [x] 2.3 Five-anti-pattern review passed — 47eb518

### Phase 3: Session-lifecycle E2E (Risk #3)

#### Automated

- [x] 3.1 `e2e/session-expiry.spec.ts` passes green
- [x] 3.2 `e2e/signout-cache-leak.spec.ts` passes green

#### Manual

- [x] 3.3 Deliberate-break (3a redirect) → test red, then reverted
- [x] 3.4 Deliberate-break (3b remove `queryClient.clear()`) → leak caught, then reverted
- [x] 3.5 Five-anti-pattern review passed for both specs
- [x] 3.6 Full e2e suite runs green twice in a row (isolation)
