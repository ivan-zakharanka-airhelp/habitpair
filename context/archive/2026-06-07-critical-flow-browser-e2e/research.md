---
date: 2026-06-07T21:49:22+0200
researcher: Ivan Zakharanka
git_commit: db17ee6f4a6283096537d381a3a63d4d2f982636
branch: critical-flow-browser-e2e
repository: habitpair
topic: "Browser E2E for activation flow (#4) and session-expiry / sign-out-cache lifecycle (#3)"
tags: [research, codebase, e2e, playwright, auth, session, habits, activation-flow]
status: complete
last_updated: 2026-06-07
last_updated_by: Ivan Zakharanka
---

# Research: Browser E2E for the activation flow (#4) and the session-expiry / sign-out-cache lifecycle (#3)

**Date**: 2026-06-07T21:49:22+0200
**Researcher**: Ivan Zakharanka
**Git Commit**: db17ee6f4a6283096537d381a3a63d4d2f982636
**Branch**: critical-flow-browser-e2e
**Repository**: habitpair

## Research Question

This is Phase 2 of the [test-plan](../../foundation/test-plan.md) ("Critical-flow browser e2e"). Ground the code paths needed to write Playwright tests for the two browser-level risks Phase 1 explicitly deferred:

- **Risk #4** — the activation flow (register → create habit → mark today → see it on the list with the correct status) breaks at an integration seam (token wiring, API base URL, route guard, or cache-invalidation gap).
- **Risk #3** — session expiry or sign-out leaves stale state: an expired token doesn't cleanly return to login, or sign-out fails to clear cached data so the next user on a shared browser sees the previous user's habits/marks.

Scope was set to **focused on #3 + #4** (not a broad integration map). No external API is mocked — habitpair has no LLM/payment gateway, so all boundaries (SPA + auth-api + habits-api + Postgres) stay real.

## Summary

- **Playwright does not exist anywhere in the repo** — no `playwright.config.*`, no `@playwright/test` dependency, no `e2e/` dir, no spec importing it. This is net-new infra the `/10x-e2e` skill will *not* install for us; it must be scaffolded first (this is the natural Phase 1 of the plan, driven by `/10x-implement`).
- **`storageState` is viable.** The refresh token is persisted to `localStorage` under key `habitpair.refreshToken`; the access token is in-memory only and rehydrated by a boot-exchange against `POST /auth/refresh`. Playwright `storageState` captures localStorage, so a saved session rehydrates on a fresh context. *However*, neither of the two named risks actually needs `storageState` (see Open Questions): #4 starts from register, #3 deliberately drives the login UI twice.
- **All the user-visible locators needed are role/label-addressable** — the UI is built with accessible labels and `aria-pressed`/`aria-label` on the mark control, so tests can use `getByRole`/`getByLabel` throughout (no CSS selectors). See "Locators harvested."
- **Risk #4 wiring is sound on the happy path** (exact-match `['habits', today]` invalidation on create; optimistic update + `onSettled` invalidate on mark). The one flagged seam is a midnight/timezone edge in the `today` cache key — narrow, not a normal-run concern.
- **Risk #3's cross-user guard is `queryClient.clear()` on logout**, run in strict order *after* `authStore.clear()`. The expiry path funnels through `onAuthCleared` (= `queryClient.clear()` + navigate `/login`). One documented caveat: the **stateless access token stays valid for ≤15m after logout** (logout deletes the refresh row but cannot revoke an already-issued JWT) — so the durable guard the browser test must assert is the cache clear + in-memory-token loss, not server-side token invalidation.
- **Phase 1 explicitly handed #3 and #4 to this phase** — three direct quotes captured under Historical Context.

## Detailed Findings

### A. Auth & session lifecycle (Risk #3)

**Login / Register.** [login.tsx](../../../apps/web/src/routes/login.tsx) and [register.tsx](../../../apps/web/src/routes/register.tsx) are thin wrappers over a shared `AuthCard` ([AuthCard.tsx](../../../apps/web/src/features/auth/components/AuthCard.tsx)) with fields **Email** and **Password** and a submit button — **"Log in"** (login) / **"Create account"** (register). Hooks: [useLogin.ts](../../../apps/web/src/features/auth/hooks/useLogin.ts) → `POST /auth/login` (200); [useRegister.ts](../../../apps/web/src/features/auth/hooks/useRegister.ts) → `POST /auth/register` (201). Both return `{ accessToken, refreshToken, user: { id, email } }` ([auth.ts:33](../../../apps/web/src/features/auth/api/auth.ts:33), shape in [auth.ts (types):6-10](../../../apps/web/src/shared/types/auth.ts:6)). On success the hooks call `authStore.setSession(data)`.

**Token storage** — [authStore.ts](../../../apps/web/src/shared/lib/authStore.ts): access token is module-level in-memory (`let accessToken`, line 14; read via `getAccessToken()` line 113) — cleared on any page reload. Refresh token persists to `localStorage` under key `habitpair.refreshToken` ([authStore.ts:4](../../../apps/web/src/shared/lib/authStore.ts:4), set at line 41). `setSession()` (38), `clear()` (46), `getRefreshToken()` (34).

**Boot-exchange / rehydration** — [main.tsx](../../../apps/web/src/main.tsx): registers `authStore.onAuthCleared = () => { queryClient.clear(); router.navigate({ to: '/login' }) }` (18-21), then calls `authStore.bootstrap()` (22). `bootstrap()` ([authStore.ts:99](../../../apps/web/src/shared/lib/authStore.ts:99)): no stored refresh token → resolve unauthenticated; token present → `refresh()` → `performRefresh()` (54-84) → `POST /auth/refresh` → on success `setSession` (rotates token), on failure `clear()` + `onAuthCleared`. `App` reads auth via `useSyncExternalStore`, shows a spinner while `auth.isResolving`. Route guard [_authed.tsx:7-9](../../../apps/web/src/routes/_authed.tsx:7) redirects to `/login` when `!isResolving && !isAuthenticated`.

**Expiry detection** — [apiClient.ts:28-43](../../../apps/web/src/shared/api/apiClient.ts:28): `habitsApi` is `refreshable: true`. A 401 triggers a single-flight `authStore.refresh()`; success → replay the original request; failure → `clear()` + `onAuthCleared` → `/login`. `authApi` is `refreshable: false` (line 45) so an auth 401 never loops.

**Sign-out** — trigger is the **"Log out"** item (`role="menuitem"`) in [AccountMenu.tsx:77-80](../../../apps/web/src/shared/components/AccountMenu.tsx:77) → `useAuth().logout` → [useLogout.ts](../../../apps/web/src/features/auth/hooks/useLogout.ts): `POST /auth/logout` (best-effort, errors swallowed), then `onSuccess` runs **in strict order**: `authStore.clear()` (token + localStorage gone) **then** `queryClient.clear()` (entire TanStack cache dropped). This ordering is the cross-user-leak guard.

**auth-api surface** — [auth.controller.ts](../../../apps/auth-api/src/auth/auth.controller.ts): `POST /auth/register` (201), `POST /auth/login` (200), `POST /auth/refresh` (200, body `{ refreshToken }`), `POST /auth/logout` (204, body `{ refreshToken }`). Access token: HS256, payload `{ sub }`, **TTL 15m** with an `exp` claim ([token.service.ts:6](../../../apps/auth-api/src/auth/token.service.ts:6)). Refresh token: opaque 32-byte random, SHA-256-hashed in the `RefreshToken` table, **30-day** TTL, **rotated on every refresh** (old deleted + new issued in one Prisma transaction).

**FLAG (Risk #3 caveat):** logout deletes the refresh row but the already-issued stateless access token remains valid until its 15m expiry. The browser-observable guard is therefore the cache clear + in-memory token loss on reload — not server-side invalidation. Document this when designing the deliberate-break.

### B. Activation-flow wiring (Risk #4)

**API client** — [apiClient.ts](../../../apps/web/src/shared/api/apiClient.ts) (note: moved from the stale `src/lib/` path CLAUDE.md still cites). Base URLs from `VITE_AUTH_API_URL` / `VITE_HABITS_API_URL` (lines 3, 8, validated at load). Token injection: every request reads `authStore.getAccessToken()` and sets `Authorization: Bearer <token>` when present (21-24). 401 handling on `habitsApi` as in A.

**Dashboard** — [_authed/app.tsx:4](../../../apps/web/src/routes/_authed/app.tsx:4) renders `<Dashboard />`. List data: `useHabits` ([useHabits.ts:5](../../../apps/web/src/features/habits/hooks/useHabits.ts:5)) → `GET /habits?today=YYYY-MM-DD` ([habits.ts:20](../../../apps/web/src/features/habits/api/habits.ts:20)), query key `['habits', today]` where `today` is the browser-local date.

**Create habit** — empty-state button **"Add a habit"** ([Dashboard.tsx:69](../../../apps/web/src/features/habits/components/Dashboard.tsx:69)) opens a `role="dialog"` with `aria-label="Add a habit"`. Form field label **"Name"** ([CreateHabitForm.tsx:71](../../../apps/web/src/features/habits/components/CreateHabitForm.tsx:71)); submit button **"Add habit"** (pending "Adding…", line 65). Hook [useCreateHabit.ts](../../../apps/web/src/features/habits/hooks/useCreateHabit.ts) → `POST /habits` body `{ name, modality, frequency, targetCount? }`, then `invalidateQueries({ queryKey: ['habits', today] })` (line 10, exact match — correct, refetches the list).

**Mark today** — daily-habit markdot button ([HabitCard.tsx:52-66](../../../apps/web/src/features/habits/components/HabitCard.tsx:52)) with dynamic `aria-label`: **"Mark &lt;name&gt; done today"** → after marking **"Mark &lt;name&gt; not done today"**; `aria-pressed` reflects state. Hook [useToggleMark.ts](../../../apps/web/src/features/habits/hooks/useToggleMark.ts) → `PUT /habits/:habitId/marks/:date` body `{ status: 'COMPLETED' }` (or `DELETE` when already done). Optimistic update in `onMutate` (20-37) flips `todayStatus` instantly; `onSettled` (44-49) invalidates `['habits', today]` + `['habits', habit.id, 'metrics']`. Status values: `COMPLETED` | `MISSED`.

**Status display** — card is "done" when `todayStatus === 'COMPLETED'` ([HabitCard.tsx:16](../../../apps/web/src/features/habits/components/HabitCard.tsx:16)); CSS class `hcard--done`; markdot `aria-pressed="true"`. The `TodayHero` ring shows **"All done"** when every daily habit is complete ([TodayHero.tsx:15](../../../apps/web/src/features/habits/components/TodayHero.tsx:15)).

**habits-api surface** — all routes behind the JWT guard ([jwt.guard.ts:15](../../../apps/habits-api/src/auth/jwt.guard.ts:15)), `userId = req.user.sub`: `GET /habits?today=` (returns `HabitListItem[]` enriched with `todayStatus`, `currentPeriod`, `currentStreak`), `POST /habits`, `PUT/DELETE /habits/:habitId/marks/:date`.

**FLAG (Risk #4 seam):** `useCreateHabit` captures `today = todayLocalISO()` at hook-instantiation; `useHabits` recomputes it for its key. If the local clock crosses midnight between the two, the invalidate targets a stale key and the new habit won't appear until the next natural refetch. Narrow midnight/timezone edge — not a concern for normal test runs, but exactly the kind of seam only E2E surfaces. (Ties into the Phase-1 "local-tz rule lives in the SPA" hand-off.)

### C. Test infrastructure & run mechanics

**Playwright absent** — confirmed: no `playwright.config.*`, no `playwright`/`@playwright/test` in any `package.json`, no `e2e/` dir, no spec importing `@playwright/test`. Only existing e2e infra is Jest+Supertest under `apps/habits-api/test/` and `apps/auth-api/test/`.

**Run** — `make up` ([Makefile:19](../../../Makefile:19)) = `db-up` + `npm run dev`; root `npm run dev` runs three processes via `concurrently`: auth-api (`:3000`), habits-api (`:3001`), web (`:5173`). A Playwright `webServer` targets `http://localhost:5173`; the activation/session flows need **both backends + Postgres** up. Simplest: `webServer.command = "npm run dev"`, `url = "http://localhost:5173"` (Postgres via `make db-up` beforehand, or extend the command).

**Env** — [apps/web/.env.example](../../../apps/web/.env.example): `VITE_AUTH_API_URL=http://localhost:3000`, `VITE_HABITS_API_URL=http://localhost:3001`. Services: `DATABASE_URL=postgresql://dev:dev@localhost:5434/<db>`, `JWT_SECRET=dev-jwt-secret-change-me-in-production`.

**User creation** — no seed script; use the real `POST /auth/register` (auto-signs in, returns tokens). For tests, register a unique email per run, e.g. `e2e-${Date.now()}@test.local`.

**Reusable isolation/cleanup discipline (from Phase 1)** — [isolation.e2e-spec.ts](../../../apps/habits-api/test/isolation.e2e-spec.ts) + [helpers.ts](../../../apps/habits-api/test/helpers.ts): two users via `randomUUID()` + `jwt.signAsync({ sub })` (bypasses auth-api — *not* what browser E2E does; we register real users); DB reset via `prisma.habit.deleteMany({ where: { userId: { in: [...] } } })` in `beforeAll` **and** `afterAll` (marks cascade); deterministic `TODAY = '2026-06-15'` ([helpers.ts:18](../../../apps/habits-api/test/helpers.ts:18)) passed as `?today=`, never wall-clock. **Translation to Playwright:** unique email per test → register in setup → capture access token → in teardown `DELETE /habits/:id` (or prisma) + `POST /auth/logout`. A fresh unique user already yields a clean slate; explicit cleanup just prevents DB bloat. For SPA date display, `page.clock.setFixedTime()` if a deterministic "today" is needed.

**Single-spec invocation** — backend today: `npm run test:e2e -w @habitpair/habits-api -- --testPathPattern <name>`. Playwright (once configured): `npx playwright test <file>` / `--grep "<name>"`.

### Locators harvested (for the seed test + both risk tests)

| Action | Locator |
|---|---|
| Email field | `getByLabel('Email')` |
| Password field | `getByLabel('Password')` |
| Log in | `getByRole('button', { name: 'Log in' })` |
| Create account (register) | `getByRole('button', { name: 'Create account' })` |
| Open create-habit (empty state) | `getByRole('button', { name: 'Add a habit' })` |
| Create-habit dialog | `getByRole('dialog')` (aria-label "Add a habit") |
| Habit name field | `getByLabel('Name')` |
| Submit new habit | `getByRole('button', { name: 'Add habit' })` |
| Mark today (not yet done) | `getByRole('button', { name: /Mark .+ done today/ })` |
| Marked-done assertion | same button → name flips to `Mark <name> not done today`, `aria-pressed="true"` |
| All-daily-done indicator | `getByText('All done')` |
| Log out | `getByRole('menuitem', { name: 'Log out' })` (inside the account menu) |

## Code References

- `apps/web/src/shared/lib/authStore.ts:4,14,34,38,41,46,54-84,99-108,113` — token storage, boot-exchange, refresh, clear.
- `apps/web/src/main.tsx:18-22,24-38` — `onAuthCleared` (queryClient.clear + navigate), bootstrap, auth-driven router invalidate.
- `apps/web/src/shared/api/apiClient.ts:3,8,21-24,28-43,45-46` — base URLs, bearer injection, 401-refresh-retry, refreshable flags.
- `apps/web/src/routes/_authed.tsx:7-10` — route guard (redirect to /login).
- `apps/web/src/features/auth/hooks/useLogout.ts` — logout: authStore.clear() then queryClient.clear().
- `apps/web/src/shared/components/AccountMenu.tsx:77-80` — "Log out" menuitem.
- `apps/web/src/features/habits/hooks/useCreateHabit.ts:7,10` — POST /habits + invalidate ['habits', today].
- `apps/web/src/features/habits/hooks/useToggleMark.ts:20-37,44-49` — optimistic mark + onSettled invalidate.
- `apps/web/src/features/habits/components/Dashboard.tsx:69` — "Add a habit" button.
- `apps/web/src/features/habits/components/CreateHabitForm.tsx:65,71` — "Name" field, "Add habit" submit.
- `apps/web/src/features/habits/components/HabitCard.tsx:16,20,52-66` — markdot aria-label / aria-pressed, done state.
- `apps/auth-api/src/auth/auth.controller.ts` — register/login/refresh/logout routes.
- `apps/auth-api/src/auth/token.service.ts:6` — ACCESS_TOKEN_TTL '15m'; refresh 30d rotation.
- `apps/habits-api/src/auth/jwt.guard.ts:15` — JWT verify, userId = sub.
- `apps/habits-api/test/helpers.ts:18`, `apps/habits-api/test/isolation.e2e-spec.ts:26-40` — two-user + deleteMany cleanup + TODAY anchor pattern.
- `Makefile:19-20`, root `package.json` `dev` script — three-process run on 5173/3000/3001.

## Architecture Insights

- **The token model makes `storageState` work but also defines the #3 test boundary.** Access token in-memory (15m, stateless) + refresh token in localStorage (30d, rotating) + boot-exchange. A browser reload always drops the access token and re-derives it from the refresh token. So "expired session" is best forced by invalidating the *refresh* path (tamper/clear the localStorage token, or revoke server-side), not by trying to age out the in-memory JWT.
- **Risk #3 has two genuinely distinct sub-scenarios**, both worth one test each: (a) an unusable session lands the user on `/login` and cannot reach `/app`; (b) sign-out → login as a different user shows none of the first user's data (the `queryClient.clear()` guard).
- **Risk #4's correctness rests on cache invalidation, and the right assertion is the user-visible status, not DOM shape.** Assert the markdot's flipped accessible name / `aria-pressed`, and that the habit survives a `page.reload()` (the browser-reload durability angle that distinguishes #4's UI seam from #6's backend persistence, already covered at the integration layer).
- **Everything internal stays real; nothing to mock.** Confirmed — there is no external API in the activation or session flows.

## Historical Context (from prior changes)

- **`context/archive/2026-05-31-auth-and-session-contract/`** — established the token model ("Stateless HS256 access + rotating, hashed refresh row"), the 401→single-flight-refresh→retry path, and sign-out semantics. Explicit caveat: *"sign-out deletes the refresh row and clears the client, so no new access tokens are minted, but the already-issued stateless access token stays valid until it expires (≤15m)."* Manual-verify line 4.7: *"Sign out → redirect to /login; localStorage refresh cleared; navigating back to / re-bounces to /login."*
- **`context/archive/2026-06-02-create-habit-and-mark-today/`** — the activation flow: `habitsApi` auto-attaches the bearer + refresh-retries; register navigates to `/app`; `useCreateHabit` invalidates `['habits', today]`; `useToggleMark` is optimistic (`onMutate` snapshot/rollback) + `onSettled` invalidate; the local date comes from `todayLocalISO()` (built from `getFullYear/Month/Date`, never `toISOString()`).
- **`context/archive/2026-06-07-testing-backend-integration-suite/` (Phase 1)** — covered #1/#2/#5/#6 at the Supertest + real-Postgres layer; ownership is uniform 404 (zero 403 in the repo); calendar↔metrics agreement uses a hand-derived oracle. **Explicit hand-off to this phase:**
  - `research.md` Open Questions §1: *"Whether the local-tz rule is actually honored end-to-end is a Phase-2 (browser e2e) / SPA question — flag for that phase."*
  - `plan.md` "What We're NOT Doing": *"the local-tz boundary lives in the SPA and belongs to Phase-2 browser e2e."*
  - `plan.md` "What We're NOT Doing": *"Risk #3 (session/expiry/cache) is Phase 2."*
- **`context/archive/2026-06-04-edit-and-delete-habit/` & `2026-06-04-habit-insight-metrics/`** — edit uses broad `['habits']` invalidation (detail-page name comes from the calendar payload); mark writes also invalidate the metrics key `['habits', habitId, 'metrics', today]`; the calendar-consistency invariant (a day the calendar colors as failure must count as a failure in the streak) is enforced at the integration layer by Phase 1.

## Related Research

- `context/archive/2026-06-07-testing-backend-integration-suite/research.md` — Phase-1 backend integration research; the source of the #3/#4 browser-e2e hand-off and the two-user/ownership-404 model.
- `context/foundation/test-plan.md` §2 (Risk Map + Risk Response Guidance), §3 (Phase 2 row), §4 (Stack — "Playwright — none yet").

## Open Questions

These are for `/10x-plan` to resolve:

1. **How to deterministically force "session expired" in the browser (Risk #3a)?** Candidates: (a) overwrite the localStorage `habitpair.refreshToken` with an invalid value, then `reload()` → `bootstrap()`→`performRefresh()` 401 → `clear()`+`onAuthCleared` → `/login`; (b) revoke the refresh token server-side (`POST /auth/logout` from an API call) while the page is open, then trigger a habits request → 401 → refresh fails → `/login`. NOT viable: advancing `page.clock` — the server validates the JWT `exp`, and the in-memory access token is re-derived on reload anyway. Pick one and make it the test's "expiry" trigger.
2. **Does either test need `storageState`?** #4 starts from register (no storageState — it tests the unauthenticated→authenticated transition); #3b deliberately drives login twice. So `storageState` may be *optional* for these two risks — but the lesson asks to set it up, and it's needed for any future authed-only test. Decide: wire `storageState` now (a `setup` project) as foundation, or defer.
3. **Cleanup strategy.** Unique email per test already isolates (user-scoped data). Decide whether to add explicit `DELETE /habits/:id` (+ logout) teardown, or rely on per-run unique users + a periodic DB reset. Phase 1's `deleteMany` precedent suggests explicit cleanup.
4. **Is the local-tz / midnight rule in scope here?** It's the broader Phase-1 hand-off and overlaps the create-invalidation midnight seam. Decide whether to fold a timezone assertion into the #4 test or keep this change strictly to the two named risks (#3, #4) and leave tz for a later slice.
