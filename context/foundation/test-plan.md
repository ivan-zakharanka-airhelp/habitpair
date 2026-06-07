# Test Plan

> Phased test rollout for this project. Strategy is frozen at the top
> (§1–§5); cookbook patterns at the bottom (§6) fill in as phases ship.
> Read before writing any new test.
>
> Refresh: re-run `/10x-test-plan --refresh` when stale (see §8).
>
> Last updated: 2026-06-07

## 1. Strategy

Tests follow three non-negotiable principles for this project:

1. **Cost × signal.** The cheapest test that gives a real signal for the
   risk wins. Do not promote to e2e because e2e "feels safer." Do not put a
   vision model on top of a deterministic visual diff that already catches
   the regression. (For habitpair specifically: the period/metrics math is
   already thoroughly unit-tested — the cheapest *new* signal for most risks
   is integration over a real database, not more unit tests.)
2. **User concerns are first-class evidence.** Risks anchored in "the team
   is worried about X, and the failure would surface somewhere in <area>"
   carry the same weight as PRD lines or hot-spot data.
3. **Risks are scenarios, not code locations.** This plan documents *what
   could fail* and *why we believe it's likely* — drawn from documents,
   interview, and codebase *signal* (churn, structure, test base). It does
   NOT claim to know which line owns the failure. That knowledge is
   produced by `/10x-research` during each rollout phase. If the plan and
   research disagree about where the failure lives, research is the
   ground truth.

Hot-spot scope used for likelihood weighting: `apps/auth-api/src`, `apps/habits-api/src`, `apps/web/src` (excluding generated code, `routeTree.gen.ts`, build output).

## 2. Risk Map

The top failure scenarios this project must protect against, ordered by
risk = impact × likelihood. Risks are failure scenarios in user / business
terms, not test names. The Source column cites the *evidence that surfaced
this risk* — never a specific file as "where the failure lives" (that is
research's job, see §1 principle #3).

| # | Risk (failure scenario) | Impact | Likelihood | Source (evidence — not anchor) |
|---|-------------------------|--------|------------|--------------------------------|
| 1 | An authenticated request returns **another user's** habits, marks, or computed metrics because some route's ownership check is missing or inconsistent. | High | High | PRD `## Success Criteria` (per-user privacy guardrail — "product-killing"); PRD `## Non-Functional Requirements` (per-user data isolation); archive `2026-06-04-edit-and-delete-habit/plan.md` + `2026-06-04-habit-insight-metrics/plan.md` (404-not-403 ownership rule); hot-spot dir `apps/habits-api/src/habits` (23 commits/30d) |
| 2 | The **streak / rolling % / best-streaks figure the user sees is wrong** — a timezone/DST or stored-date↔UTC off-by-one, or the calendar and the metrics classify the same day differently. | High | High | interview Q1 (stated top fear); interview Q3 (engine changed often, low confidence); PRD `## Business Logic` + `## Non-Functional Requirements` (timezone/DST robustness); archive `2026-06-04-habit-insight-metrics/plan.md` (calendar-consistency invariant) |
| 3 | **Session expiry or sign-out leaves stale state**: an expired token does not cleanly return the user to login, or sign-out fails to clear cached data so the next user on a shared browser sees the previous user's habits/marks. | High | High | interview Q2 (confirmed recent burn); git history (commits 321e37f, b0ed3f2 — session-expiry redirect + logout cache clear); PRD `## Access Control` (gated route → sign-in screen); hot-spot dirs `apps/web/src/routes` (32), `apps/web/src/features` (105), `apps/auth-api/src/auth` (16) |
| 4 | The **activation flow breaks at an integration seam** no unit test exercises — register → create habit → mark today → see it on the list with the correct status — because of token wiring, API base URL, a route guard, or a cache-invalidation gap. | High | Medium | interview Q4 (stated top quiet worry — no browser e2e exists); PRD `## User Stories` US-01 + `## Success Criteria` (primary success criterion ≤ 60s); roadmap north-star S-01 |
| 5 | A **retroactive backfill into a closed period does not recompute** the streak / rolling % / best-streaks across the affected range, so the calendar coloring and the numbers disagree after the edit. | High | Medium | PRD `## Functional Requirements` FR-010 + `## Business Logic` ("Retroactive marks into closed periods"); archive `2026-06-04-habit-insight-metrics/plan.md`; interview Q3 |
| 6 | A **mark the product confirmed is not durable** — it is lost, overwritten, or absent after sign-out then sign-in on another device. | High | Medium | PRD `## Success Criteria` (data-integrity guardrail) + `## Non-Functional Requirements` (data durability); PRD `## User Stories` US-02 acceptance ("survives sign-out + sign-in on the same or another device") |

**Impact × Likelihood rubric** (coarse, for reproducible ordering):

| Rating | Impact | Likelihood |
|--------|--------|------------|
| High   | user loses access, data, or money; failure is publicly visible | area changes weekly, or we have already been burned here |
| Medium | feature degrades, a workaround exists, only some users affected | touched occasionally, has been a source of bugs |
| Low    | cosmetic, easily reverted, no data effect | stable code, rarely touched |

All six risks are High-impact because every PRD guardrail is a P0. Likelihood
is what differentiates them; the rollout protects the High × High rows
(#1, #2, #3) first.

### Risk Response Guidance

| Risk | What would prove protection | Must challenge | Context `/10x-research` must ground | Likely cheapest layer | Anti-pattern to avoid |
|------|-----------------------------|----------------|--------------------------------------|-----------------------|-----------------------|
| #1 | A second, non-owning user gets **404 on every** habit / mark / metrics / calendar / PATCH / DELETE route for a resource they do not own. | "Authenticated means authorized." | Every route's ownership check; that the miss returns 404 (not 403) uniformly so existence is not leaked. | integration (HTTP, two users, real DB) | Testing only the resource owner's happy path. |
| #2 | Seeded marks read back through `/metrics` and `/calendar` return the **correct, mutually-agreeing** values over a real database. | "Unit tests pass, therefore the user sees the right number." (Unit tests exercise pure functions, not the stored-date↔UTC-wired path.) | How `Mark.date` (a date-typed column) round-trips against the period engine's UTC math; whether calendar and metrics classify a shared day identically. | integration (real DB) — **not** more unit tests | Re-asserting pure math already covered by unit tests; lifting the expected value from the implementation under test (oracle problem). |
| #3 | An expired token redirects to login; after sign-out the client cache is cleared so a re-login as user B surfaces **none** of user A's data. | "Logout navigates away, so the in-memory cache does not matter." | The token-expiry detection path; the cache lifecycle on sign-out; what client state survives a login swap. | e2e (browser) | Asserting only the redirect while ignoring the cross-user cache-leak case. |
| #4 | A real browser completes register → create → mark → open detail and shows the correct status and number. | "Unit + integration green means the wired flow works for a user." | API base-URL config, bearer-token injection, route guards, and cache invalidation as they interact across the whole flow. | e2e (browser) | Snapshotting pages or asserting DOM structure instead of the user-visible outcome. |
| #5 | Backfilling a past day via the mark API, then re-reading, shows the streak / % / best-streaks **and** the calendar updated consistently. | "The calendar updated, so the streak updated too." (Separate endpoints / code paths can drift.) | The recompute trigger on a mark write; the classification shared between the calendar and the metrics read-models. | integration (write → re-read both read-models) | Asserting only one endpoint; brittle hard-coded date fixtures. |
| #6 | A mark written through the API is present on an independent re-read (a fresh fetch or a second session). | "A 200/204 response means it persisted." | Upsert semantics on the per-day uniqueness constraint; the read-back path. | integration (write → read-back) | Asserting the write response instead of an independent read. |

## 3. Phased Rollout

Each row is a discrete rollout phase that will open its own change folder
via `/10x-new`. Status moves left-to-right through the values below; the
orchestrator updates Status as artifacts appear on disk.

| # | Phase name | Goal (one line) | Risks covered | Test types | Status | Change folder |
|---|------------|-----------------|----------------|------------|--------|---------------|
| 1 | Cross-user isolation + persisted-correctness integration suite | Prove the highest-impact backend properties at the cheapest new-signal layer — HTTP integration over a real Postgres with two users — extending the existing e2e harness. | #1, #2, #5, #6 | integration (Supertest + real DB) | change opened | context/changes/testing-backend-integration-suite/ |
| 2 | Critical-flow browser e2e | Stand up a Playwright layer over the activation flow and the session-expiry / sign-out-cache lifecycle. | #3, #4 | e2e (browser) | not started | — |
| 3 | Quality-gates wiring | Make the Phase-1 and Phase-2 suites blocking checks in the existing path-filtered CI; confirm web lint + typecheck is an enforced gate. | cross-cutting | gates | not started | — |

**Status vocabulary** (fixed — parser literals): `not started` → `change opened` → `researched` → `planned` → `implementing` → `complete`.

Rationale for the order: integration first because it is the cheapest layer
that gives *new* signal (the pure period/metrics math is already unit-tested)
and it reuses CI's existing Postgres service container; browser e2e second
because it is the only layer that crosses the SPA + both APIs + token + cache
seams, and running it after integration means backend defects surface
cheaply first; gates last because a suite that is not a required check rots.
No dedicated AI-native rollout phase — the interview (Q5) steered budget
toward behavior-level coverage and away from snapshots and extra unit math,
which does not justify one. AI-native options are recorded as optional rows
in §4 and §5 instead.

## 4. Stack

The classic test base for this project. AI-native tools (if any) carry a
`checked:` date so future readers can see which lines need re-verification.

| Layer | Tool | Version | Notes |
|-------|------|---------|-------|
| unit + integration (backend) | Jest | 29 | `*.spec.ts`, `rootDir: src`, colocated next to source; reference `apps/habits-api/src/marks/metrics.spec.ts` |
| unit + integration (web) | Vitest | 4 | `*.test.ts(x)`, colocated; reference `apps/web/src/features/habits/lib/metricsFormat.test.ts` |
| integration (HTTP + DB) | Jest + Supertest (NestJS e2e) | 29 | `apps/*/test/app.e2e-spec.ts`; CI runs `migrate:deploy` against a real Postgres 16 service container. Phase 1 extends this. |
| API mocking (web) | none yet — see §3 Phase 2 | — | No MSW today; the e2e layer will exercise the real backend rather than mocks. |
| e2e (browser) | Playwright — none yet, see §3 Phase 2 | n/a (net-new) | No browser e2e exists anywhere in the repo today. |
| accessibility | none automated yet | — | PRD baseline is keyboard operability + semantic landmarks; an `axe-core` pass inside the Phase-2 e2e is optional, not required. |
| (optional) AI-native | multimodal visual review (Claude Preview / vision) — checked: 2026-06-07 | n/a | Selective: the calendar grid only. **When NOT to use:** any time a deterministic DOM/integration assertion already catches the regression. |

**Stack grounding tools (current session):**
- Docs: Context7 — available; exact test-API grounding (Vitest 4 browser/RTL, Playwright runner, NestJS e2e) deferred to per-phase `/10x-research`; checked: 2026-06-07
- Search: web search — available; not used for this strategy pass; checked: 2026-06-07
- Runtime/browser: Claude Preview — available; candidate in-session surface for e2e authoring / selective visual review in Phase 2; checked: 2026-06-07
- Provider/platform: Sentry MCP — available (error tracking; possible future observability gate, not wired); GitHub via `gh` CLI; checked: 2026-06-07

Use docs MCPs for current framework/library APIs and setup details during
each rollout phase. Do not use MCP docs/search to infer code failure anchors;
those belong in per-phase `/10x-research`.

## 5. Quality Gates

The full set of gates that must pass before a change reaches production.
"Required after §3 Phase <N>" means the gate is enforced once that rollout
phase lands; before that, the gate is planned.

| Gate | Where | Required? | Catches |
|------|-------|-----------|---------|
| lint + typecheck | local + CI | required | syntactic / type drift. Web has its own lint + typecheck gate (CI enforces it; `make lint` is backends-only) — backends typecheck via `nest build`. |
| unit + integration | local + CI | required (already enforced per-app) | logic regressions; backend e2e runs `migrate:deploy` so a broken migration fails CI, not prod |
| cross-user + persisted-correctness integration | CI on PR | required after §3 Phase 1 | cross-user data leakage (IDOR) and stored-number drift |
| e2e on critical flows | CI on PR | required after §3 Phase 2 | broken activation flow, broken session/expiry handling, sign-out cache leak |
| post-edit hook | local (agent loop) | recommended after §3 Phase 3 | regressions at edit time. Hook configuration is owned by a later module lesson, not authored here. |
| multimodal visual review | CI on PR | optional | calendar-grid rendering issues a deterministic diff misses; selective, 1 screen |

## 6. Cookbook Patterns

How to add new tests in this project. Each sub-section is filled in once
the relevant rollout phase ships; before that, it reads "TBD — see §3 Phase <N>."

### 6.1 Adding a unit test

- **Location**: colocated next to the unit under test.
- **Naming**: backends `<module>.spec.ts` (Jest, `testRegex: .*\.spec\.ts$`, `rootDir: src`); web `<module>.test.ts(x)` (Vitest).
- **Reference test**: `apps/habits-api/src/marks/metrics.spec.ts` (backend logic, thorough); `apps/web/src/features/habits/lib/metricsFormat.test.ts` (web pure helper).
- **Run locally**: `npm test -w @habitpair/<service> -- <pattern>` (backend) / `npm run test -w @habitpair/web -- <pattern>` (web).

### 6.2 Adding an integration test (HTTP + real DB)

- TBD — see §3 Phase 1. Will codify the two-user Supertest pattern over a real Postgres in `apps/*/test/app.e2e-spec.ts` (assert request → response shape AND the persisted side-effect; the non-owning user always gets 404).

### 6.3 Adding an e2e test (browser)

- TBD — see §3 Phase 2.

### 6.4 Adding a test for a new API endpoint

- TBD — see §3 Phase 1. Pattern to establish: every new route gets a non-owner 404 case alongside its happy path, and any write is verified by an independent read-back, not just the response.

### 6.5 Adding a frontend component / hook test

- **Stance**: behavior-level only, kept deliberately light; **no snapshot tests** (see §7).
- **Location / naming**: colocated `<Component>.test.tsx` (Vitest).
- **Reference test**: `apps/web/src/shared/components/Segmented.test.tsx`.
- **Run locally**: `npm run test -w @habitpair/web`.

### 6.6 Per-rollout-phase notes

(Empty. After each phase lands, `/10x-implement` appends a 2–3 line note here capturing anything surprising the phase taught.)

## 7. What We Deliberately Don't Test

Exclusions agreed during the rollout (Phase 2 interview, Q5). Future
contributors should respect these unless the underlying assumption changes.

- **Component snapshot / DOM-shape tests** — brittle, break on benign markup changes, and rarely catch a real defect; prefer behavior-level assertions. Re-evaluate if a component's exact visual output becomes a load-bearing contract. (Source: Phase 2 interview Q5.)
- **Additional pure-math unit tests on `period.ts` / `metrics.ts`** — already thorough, including a DST-window round-trip; further unit tests there have diminishing returns. Re-evaluate if a new frequency or a new metric is added. (Source: Phase 2 interview Q5.)
- **Generated code** — `routeTree.gen.ts` (TanStack Router) and the per-service Prisma clients under `generated/`. The generator is the test. (Source: Phase 2 interview Q5.)
- **Infrastructure / deploy pipeline** — Terraform, k3s manifests, CI YAML authoring, CloudFront. Owned by the infra modules; out of this quality contract's scope. (Source: Phase 2 interview Q5.)
- **Note (product decision, not a test target):** S-04 shipped a hard delete with **no ~5-second undo**, diverging from PRD FR-008. There is no undo affordance to test; confirm the product decision rather than writing a test for a feature that does not exist.

## 8. Freshness Ledger

- Strategy (§1–§5) last reviewed: 2026-06-07
- Stack versions last verified: 2026-06-07
- AI-native tool references last verified: 2026-06-07

Refresh (`/10x-test-plan --refresh`) when:

- a new top-3 risk surfaces from the roadmap or archive,
- a recommended tool's `checked:` date is older than three months,
- the project's tech stack changes (new framework, new test runner),
- §7 negative-space no longer matches what the team believes.
