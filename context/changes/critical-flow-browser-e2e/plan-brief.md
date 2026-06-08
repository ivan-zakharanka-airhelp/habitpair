# Critical-Flow Browser E2E — Plan Brief

> Full plan: `context/changes/critical-flow-browser-e2e/plan.md`
> Research: `context/changes/critical-flow-browser-e2e/research.md`

## What & Why

Phase 2 of the [test-plan](../../foundation/test-plan.md): stand up Playwright (net-new) and add browser E2E for the two risks Phase 1 deferred — **Risk #4** (the activation flow register → create → mark → see-status breaks at an integration seam) and **Risk #3** (session expiry / sign-out leaves stale state). These cross the SPA + both APIs + DB + token + cache seams that no unit or integration test reaches.

## Starting Point

No Playwright exists anywhere in the repo. Auth uses an in-memory access token (15m) + a localStorage refresh token (30d) with a boot-exchange; sign-out runs `authStore.clear()` then `queryClient.clear()`. The activation flow wiring is sound on the happy path (exact-match cache invalidation, optimistic mark). All user-visible controls are role/label-addressable (locators already harvested in research).

## Desired End State

`npm run test:e2e` against a live local stack runs a small risk-tied suite: a created habit + today's mark survive a reload (#4); an invalidated session redirects to `/login` and gates `/app` (#3a); and after sign-out a second user sees none of the first user's data (#3b). A `seed.spec.ts` + `E2E_RULES.md` shape future generated tests; re-running the suite twice passes both times.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Risks in scope | #3 + #4 only | Phase 1 explicitly handed these two to browser e2e. | Research |
| Force-expiry mechanism | Revoke refresh token + reload | Deterministic, genuinely server-invalidated, exercises the real boot→refresh-fail→redirect chain. | Plan |
| storageState | Wire it now (setup project) | Completes the lesson task + foundation for future authed-only tests. | Plan |
| Test-data isolation | Unique user per test + API teardown | Fresh user = clean slate, parallel-safe; mirrors Phase 1's cleanup discipline. | Plan |
| Timezone/midnight rule | Out of scope | Distinct concern needing clock control; deserves its own slice. | Plan |
| CI gating | Defer to test-plan Phase 3 | The test-plan separates "Quality-gates wiring" into its own phase. | Plan |
| Standalone auth tests | No | Register/login covered as steps in #4/#3; error paths cheaper at integration layer. | Plan |
| Playwright location | Repo root (`e2e/`) | Flows need the whole stack; `webServer` boots `make up`, a root concern. | Plan |
| Mocking | None | No external API in either flow — all boundaries stay real. | Research |

## Scope

**In scope:** Playwright config + `e2e/` at root; storageState setup project; `seed.spec.ts` + `E2E_RULES.md` levers; three risk-tied specs (#4, #3a, #3b); npm scripts; `.gitignore`; CLAUDE.md §6.3.

**Out of scope:** CI gating (Phase 3); local-tz/midnight assertion; standalone login/register specs; any production code change; multi-browser matrix.

## Architecture / Approach

Root-level Playwright drives Chromium against `http://localhost:5173` with the full stack live (`webServer: make up`, `reuseExistingServer` locally). Phase 1 (`/10x-implement`) scaffolds tooling + the two quality levers; Phases 2–3 (`/10x-e2e`) generate one risk per phase through PLAN → GENERATE → REVIEW (5 anti-patterns) → VERIFY (green + deliberate-break). All three phases share one `## Progress`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness + levers | Playwright config, storageState setup, seed + rules, scripts, gitignore, docs | `webServer` booting the multi-service stack reliably |
| 2. Activation E2E (#4) | One test: create+mark survives reload | Asserting durable status (post-reload), not the optimistic flash |
| 3. Session E2E (#3) | Two tests: expiry→login, sign-out cache-leak | The date-keyed shared cache; the deliberate-break must flip the leak red |

**Prerequisites:** local stack runnable (`make up`); Node 22; Postgres on 5434.
**Estimated effort:** ~3 sessions, one per phase.

## Open Risks & Assumptions

- `webServer: make up` must start cleanly under Playwright; if flaky, fall back to "require `make up` already running" + `reuseExistingServer`.
- storageState is foundation-only here — the #3/#4 specs deliberately do not consume it (they manage their own auth).
- The #3b leak test depends on the date-keyed `['habits', today]` cache; the deliberate-break (removing `queryClient.clear()`) is what proves the assertion bites.

## Success Criteria (Summary)

- A user can register, create a habit, mark it, and still see it marked after a reload (#4).
- An invalidated session lands on `/login` and cannot reach `/app` (#3a); a second user never sees the first user's habits (#3b).
- The suite passes twice in a row, and each test fails when its protected behavior is deliberately broken.
