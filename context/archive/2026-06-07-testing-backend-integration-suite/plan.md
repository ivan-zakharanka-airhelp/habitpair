# Cross-user Isolation + Persisted-correctness Integration Suite — Implementation Plan

## Overview

Build a two-user, real-Postgres integration suite for `habits-api` that proves the four highest-impact backend properties from `test-plan.md` §2 at the cheapest new-signal layer (HTTP + real DB), extending the existing NestJS e2e harness. The suite covers:

- **#1** — cross-user isolation: a non-owning user gets **404 (not 403)** on every `habitId`-addressed route, with no existence leak and no side-effect on the owner's data.
- **#2** — persisted correctness + calendar↔metrics agreement: seeded marks read back **correct and mutually-agreeing** over a real database.
- **#5** — retroactive backfill into a **closed** period recomputes streak / rolling % / best-streaks and keeps the calendar coloring in agreement.
- **#6** — durable write → **independent** read-back (write → re-read via a second token, not the write response).

**No production code changes.** The implementation is already correct against all four risks at the unit/mock level (`marks.service.spec.ts`, `metrics.spec.ts`, `period.spec.ts`). What is missing is integration-level proof over a real Postgres — exactly the gap `test-plan.md` predicted.

## Current State Analysis

The habits-api e2e layer (Jest + Supertest, `apps/habits-api/test/`, `jest-e2e.json` → `testRegex: ".e2e-spec.ts$"`, `rootDir: "."`) already has a working harness and partial coverage:

- **Harness** ([helpers.ts:14](apps/habits-api/test/helpers.ts:14)): `createTestApp()` boots the real `AppModule`, mirrors `main.ts` (`setGlobalPrefix('habits')` + the same `ValidationPipe({ whitelist, transform, forbidNonWhitelisted })`), returns `{ app, prisma, jwt }`. Helpers: `createHabit` (POST→201→`id`), `putMark` (PUT→200).
- **Two-user pattern**: every stateful spec mints two random-UUID users + tokens via `jwt.signAsync({ sub })` (payload is `{ sub }` only — **no `exp`**); a wrong-secret `foreignToken` covers the 401 case ([habits.e2e-spec.ts:13-27](apps/habits-api/test/habits.e2e-spec.ts:13)).
- **DB reset**: no truncate/transaction — `prisma.habit.deleteMany({ where: { userId: { in: [userA, userB] } } })` in `beforeAll` **and** `afterAll`; marks cascade. State accumulates *within* a suite, isolated *across* suites by fresh UUIDs. Each `it` creates its own habit, so tests do not bleed. No Jest setup file. CI ([.github/workflows/habits-api-test.yaml](.github/workflows/habits-api-test.yaml)) runs `postgres:16-alpine`, `migrate:deploy`, then `test:e2e`.

Per-risk gaps (verified against source):

| Risk | Status | Specific missing case |
|---|---|---|
| **#1** | PARTIAL | Cross-user 404 exists on PATCH ([habits.e2e-spec.ts:176](apps/habits-api/test/habits.e2e-spec.ts:176)), DELETE habit (:211), GET metrics ([metrics.e2e-spec.ts:48](apps/habits-api/test/metrics.e2e-spec.ts:48)), GET calendar ([calendar.e2e-spec.ts:48](apps/habits-api/test/calendar.e2e-spec.ts:48)); list isolation as empty-list (:90-94). **Missing:** `PUT …/marks/:date` and `DELETE …/marks/:date` non-owner→404 (both routes have **zero** e2e); a consolidated all-route sweep; "A's row/mark unchanged after B's write attempt". |
| **#2** | MISSING | No e2e seeds one mark set and asserts `/metrics` **and** `/calendar` agree; the two existing suites even use **different** seed dates. The agreement invariant lives only in unit tests with hand-built fixtures. |
| **#5** | PARTIAL | Calendar-only backfill exists ([calendar.e2e-spec.ts:60-94](apps/habits-api/test/calendar.e2e-spec.ts:60)) but (a) never re-reads `/metrics`, (b) fills a gap in the **open/recent** window, not a **closed failing** period that flips. |
| **#6** | PARTIAL | Calendar backfill re-fetches via a separate GET but the `PUT` response body is never asserted; no minimal write→independent-read on `/metrics` or `/habits` `todayStatus`; the upsert (repeat-PUT → single row) is e2e-unproven. |

## Desired End State

Two new spec files exist and pass against the CI Postgres harness:

- `apps/habits-api/test/isolation.e2e-spec.ts` — proves #1 (all-route 404 sweep incl. both mark routes + owner-unchanged) and #6 (durable write/read-back, upsert, unmark).
- `apps/habits-api/test/consistency.e2e-spec.ts` — proves #2 (round-trip + oracle + mutual agreement) and #5 (closed-period backfill flip, both directions).

`helpers.ts` gains a shared `TODAY` anchor, a `deleteMark` helper, and thin `getCalendar` / `getMetrics` / `getHabits` read wrappers. The test-plan cookbook (§6.2, §6.4, §6.6) is filled, §3 Phase-1 status is advanced, and the §5 gate row is noted as enforced.

**Verification of done**: `npm run test:e2e -w @habitpair/habits-api` passes locally (with local Postgres on 5434) and in CI; `npm run lint -w @habitpair/habits-api` passes; the two new files appear under `apps/habits-api/test/`.

### Key Discoveries

- **Ownership is uniformly 404, everywhere** — every `habitId`-addressed route resolves via `prisma.habit.findFirst({ where: { id, userId } })` → `NotFoundException`; a repo-wide grep finds **zero** `ForbiddenException`/`403` ([habits.service.ts:213-219](apps/habits-api/src/habits/habits.service.ts:213), [marks.service.ts:30-36](apps/habits-api/src/marks/marks.service.ts:30)).
- **Second-stage writes are unscoped** — `update({where:{id}})` ([habits.service.ts:202](apps/habits-api/src/habits/habits.service.ts:202)), `delete({where:{id}})` (:209), mark `upsert`/`deleteMany` keyed on `habitId` only ([marks.service.ts:15-26](apps/habits-api/src/marks/marks.service.ts:15)). Safe **only** because `assertOwned` runs first → the owner-unchanged assertion is the regression net.
- **`ValidationPipe` runs before the handler** — a malformed `from`/`to`/`today`/`status` yields a **400 from the pipe before ownership is evaluated** ([helpers.ts:22-24](apps/habits-api/test/helpers.ts:22)). The #1 sweep must use **well-formed** params or it asserts the wrong status.
- **Calendar and metrics duplicate the failure decision** — `/metrics` via `classifyPeriods` ([metrics.ts:124](apps/habits-api/src/marks/metrics.ts:124)); `/calendar` via `computedMissedDates` ([period.ts:96](apps/habits-api/src/marks/period.ts:96)) + `closedPeriodFailures` ([period.ts:121](apps/habits-api/src/marks/period.ts:121)). The header at [metrics.ts:18-21](apps/habits-api/src/marks/metrics.ts:18) names this the "calendar-consistency invariant" — the single most important #2/#5 target.
- **Compute-on-read** — every `GET` re-derives everything from the full mark set; the write path touches only the single `Mark` row ([habits.service.ts:166-192](apps/habits-api/src/habits/habits.service.ts:166)). So #5's "recompute" is an implicit re-read; there is no trigger/endpoint to drive.
- **"Closed" period boundary** — `isClosed = pEnd < today` ([metrics.ts:175](apps/habits-api/src/marks/metrics.ts:175)); calendar mirrors it (`if (pEnd >= today) break`, [period.ts:150](apps/habits-api/src/marks/period.ts:150)). To construct a closed failing period for #5, its end must be **strictly before** `today`.
- **Mark write is a single atomic `upsert`** — no non-atomic multi-operation sequence in this phase, so **no hermetic partial-failure stubs are warranted** (`test-plan.md` §3, research §Summary).

## What We're NOT Doing

- **No production code changes.** The four behaviours are already correct; this phase only adds integration proof. (If an assertion fails, that is a real defect to file — not a license to "fix the test".)
- **No re-testing of pure period/metrics math or DST arithmetic** — exhaustively unit-covered (`period.spec.ts`, `metrics.spec.ts`), and `test-plan.md` §7 forbids it.
- **No hermetic / stub-client tests** — the write is atomic; there is no partial-failure branch to force.
- **No resolution of the PRD "local timezone" rule.** The backend is UTC-internally-consistent; the local-tz boundary lives in the SPA and belongs to Phase-2 browser e2e. The suite asserts server **round-trip** + **agreement** only — never an expected local-tz value (see Open Risks).
- **No auth-api changes.** All four risks are habits-api concerns; the harness mints its own tokens and never calls auth-api. Risk #3 (session/expiry/cache) is Phase 2.
- **No defense-in-depth `userId`-scoping of the second-stage writes.** That is a production change out of scope for a test phase; the owner-unchanged assertions are its future regression net.

## Implementation Approach

Scaffolding first (Phase 1), then the two risk suites that depend on it (Phases 2–3), then the cookbook/test-plan sync last (Phase 4) — the ordering `CLAUDE.md` prescribes. Both suites reuse the established two-user inline pattern and per-`it` habit seeding, and follow the existing `beforeAll`/`afterAll` `deleteMany` reset discipline. Every time-dependent read passes an explicit `today` derived from the shared `TODAY` anchor — never wall-clock.

The **oracle** for every assertion comes from the Business-Logic rule (PRD / `test-plan.md` §2 / the calendar-consistency invariant), **never** from the engine's output. For the agreement tests (#2) this is enforced structurally: the expected failure set is hand-derived from the seeded marks + `TODAY`, asserted against each endpoint independently, *and* the two endpoints are asserted mutually consistent — so a shared bug that makes both wrong cannot pass.

## Critical Implementation Details

- **Ownership vs. validation ordering (the #1 sweep gotcha).** The global `ValidationPipe` (`forbidNonWhitelisted`) runs before any handler, so a malformed query/body param returns **400 before** ownership is checked. For the mark routes specifically, `:date` is a raw path param (no DTO) and `assertOwned` runs before `parseDateOnly`, so ownership-404 precedes a bad-date 400 *there* — but `status` in the `PUT` body **is** DTO-validated. **Therefore every request in the 404 sweep must carry well-formed params** (`from`/`to` = `YYYY-MM`, `today` = `YYYY-MM-DD`, `:date` = `YYYY-MM-DD`, `status` ∈ `{COMPLETED, MISSED}`), otherwise the test asserts a pipe-400 instead of an ownership-404.
- **Constructing a closed failing period (#5).** A period only counts toward streaks/denominators once closed (`pEnd < today`); the current period (end ≥ today) is always excluded and never fails. Fixtures must place the failing period strictly before `TODAY`: for daily, an unmarked day in `[anchor … today-1]`; for weekly/monthly, a closed period with fewer than `target` COMPLETED marks.
- **Oracle rule (anti-mirror).** Derive every expected value from the documented rule, not from calling the engine. A test that recomputes the expected value with the implementation's own logic passes against the bug it should catch (`CLAUDE.md` "Vibe-testing anti-patterns").
- **DB isolation.** New specs mint fresh random-UUID users and clean `deleteMany({ where: { userId: { in: [A, B] } } })` in `beforeAll`/`afterAll`; each `it` creates its own habit so state never bleeds between tests within a suite.

---

## Phase 1: Harness Extensions

### Overview

Add the shared scaffolding both new specs depend on: a stable date anchor, a `deleteMark` helper, and read wrappers that return the response body for round-trip / agreement / owner-unchanged assertions. Pure additions to `helpers.ts` — no new behaviour, no existing test changed.

### Changes Required:

#### 1. Shared date anchor + mark/read helpers

**File**: `apps/habits-api/test/helpers.ts`

**Intent**: Give the new specs one deterministic "now" and the read/delete primitives the existing harness lacks, so closed-vs-open period scenarios are unambiguous and write→read-back assertions read cleanly.

**Contract**:
- `export const TODAY = '2026-06-15';` — the canonical reference day; all new-spec scenarios are expressed relative to it. (Chosen so June periods are open and earlier months/weeks are closed.)
- `deleteMark(app, token, habitId, date)` → issues `DELETE /habits/:habitId/marks/:date`, expects **204**. Mirrors `putMark`'s shape.
- `getCalendar(app, token, habitId, { from, to, today })` → `GET …/calendar`, expects 200, resolves `res.body`.
- `getMetrics(app, token, habitId, today)` → `GET …/metrics`, expects 200, resolves `res.body`.
- `getHabits(app, token, today)` → `GET /habits?today=`, expects 200, resolves `res.body` (array).

These are thin Supertest wrappers returning typed bodies; no assertions beyond the success status (callers assert content). `request`/`INestApplication` imports already present.

### Success Criteria:

#### Automated Verification:

- Type checking / build passes: `npm run build -w @habitpair/habits-api`
- Linting passes: `npm run lint -w @habitpair/habits-api`
- Existing e2e suite still passes (no regression from harness edits): `npm run test:e2e -w @habitpair/habits-api`

#### Manual Verification:

- New helpers are exported and importable from `./helpers` (confirmed when Phases 2–3 import them with no resolution error).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 2: Cross-user Isolation + Durability Suite (#1, #6)

### Overview

Create `apps/habits-api/test/isolation.e2e-spec.ts`. Prove that a non-owning user cannot read, mutate, or even detect another user's resource on **any** route (404, no side-effect), and that a confirmed write is durable on an independent read-back (incl. upsert and unmark semantics over the real DB).

### Changes Required:

#### 1. The all-route non-owner 404 sweep (#1)

**File**: `apps/habits-api/test/isolation.e2e-spec.ts` (new)

**Intent**: Prove uniform 404 (not 403, not 200, not a leak) for user B against a habit owned by user A, across every `habitId`-addressed route — closing the two mark-route gaps and consolidating the scattered per-spec cases into one sweep.

**Contract**: For a habit created by A, user B (valid shared-secret token) hits each route below with **well-formed** params and gets **404**; `GET /habits` for B does not contain A's habit. Routes covered:

| Method | Path | Well-formed params |
|---|---|---|
| GET | `/habits/:id/calendar` | `?from=2026-06&to=2026-06&today=${TODAY}` |
| GET | `/habits/:id/metrics` | `?today=${TODAY}` |
| PATCH | `/habits/:id` | body `{ name: 'hijack' }` |
| DELETE | `/habits/:id` | — |
| PUT | `/habits/:id/marks/:date` | `:date=2026-06-10`, body `{ status: 'COMPLETED' }` |
| DELETE | `/habits/:id/marks/:date` | `:date=2026-06-10` |

A parameterised `it.each` over the route table is the intended shape (one assertion per route, each catching a different missing/reordered ownership check).

#### 2. Owner-unchanged after a non-owner write attempt (#1)

**File**: `apps/habits-api/test/isolation.e2e-spec.ts`

**Intent**: The second-stage writes are unscoped, so a 404 alone does not prove B's write did nothing. Assert A's data is byte-for-byte unchanged after each failed B mutation — the regression net for a future ownership-ordering bug.

**Contract**: A seeds a habit (and a mark for the `PUT`/`DELETE`-mark cases). B attempts `PATCH` (→404), `DELETE` habit (→404), `PUT` mark (→404), `DELETE` mark (→404). After each, A re-reads (`getHabits` / `getCalendar`) and observes: the habit still exists with unchanged `name`/`modality`; the seeded mark is still present (for the failed `PUT`/`DELETE`-mark attempts on a marked day).

#### 3. Durable write → independent read-back via a second token (#6)

**File**: `apps/habits-api/test/isolation.e2e-spec.ts`

**Intent**: Prove persistence on an *independent* read, modelling US-02's "another device/session", not the write response.

**Contract**: A `PUT`s a mark with `tokenA`; assert the **200 response body** shape (`{ id, habitId, date, status, createdAt }`, `date` echoes the input calendar date, `status` echoes the request). Mint a **second** token for the **same** `sub` (`jwt.signAsync({ sub: userA })`); read back via `getCalendar`/`getMetrics`/`getHabits` `todayStatus` with the second token and observe the mark present and classified under its date.

#### 4. Upsert (repeat-PUT → single row) (#6)

**File**: `apps/habits-api/test/isolation.e2e-spec.ts`

**Intent**: Prove the `@@unique([habitId, date])` upsert semantics over the real DB — a repeat `PUT` updates the existing row rather than duplicating.

**Contract**: `PUT` `(habit, D, COMPLETED)` then `PUT` `(habit, D, MISSED)`. Read back: exactly one mark for `D`, `status === 'MISSED'`. (A direct `prisma.mark.count({ where: { habitId, date } })` === 1 makes the single-row claim explicit over the response shape.)

#### 5. Unmark → read-back + idempotent re-DELETE (#6, DELETE-marks owner side)

**File**: `apps/habits-api/test/isolation.e2e-spec.ts`

**Intent**: Close the DELETE-marks route's total e2e absence on the owner side; prove the `deleteMany`-not-`delete` idempotency over real Postgres.

**Contract**: A marks day `D`, then `deleteMark` (→204); read back shows `D` absent from `marks`. A second `deleteMark` on the now-absent `D` is a no-op **204** (not 404/500). 

### Success Criteria:

#### Automated Verification:

- New suite passes: `npm run test:e2e -w @habitpair/habits-api -- isolation`
- Full e2e suite still green: `npm run test:e2e -w @habitpair/habits-api`
- Linting passes: `npm run lint -w @habitpair/habits-api`

#### Manual Verification:

- Temporarily commenting out one `assertOwned` call (e.g. in `marks.service.ts`) makes the corresponding sweep row **fail** — confirms the test exerts real pressure on ownership, not a tautology. (Revert immediately.)
- The sweep visibly covers all six routes incl. both mark routes (read the `it.each` table).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 3: Persisted Correctness + Agreement + Backfill (#2, #5)

### Overview

Create `apps/habits-api/test/consistency.e2e-spec.ts`. Prove that one seeded mark set reads back **correct and mutually-agreeing** across `/calendar` and `/metrics` over a real DB (#2), and that a retroactive backfill into a **closed** period recomputes both read-models together (#5). This is the highest-value, easiest-to-get-wrong part of the phase — the oracle discipline is mandatory.

### Changes Required:

#### 1. Calendar↔metrics agreement cross-check helper

**File**: `apps/habits-api/test/consistency.e2e-spec.ts` (new) — helper local to this spec (or added to `helpers.ts` if reused)

**Intent**: Encode the calendar-consistency invariant ([metrics.ts:18-21](apps/habits-api/src/marks/metrics.ts:18)) as a reusable assertion: the set of days/periods the calendar colors as failure equals the set metrics treats as failure.

**Contract**: `assertCalendarAgreesWithMetrics({ calendar, metrics, frequency, expectedFailures })` asserts two things: (a) **mutual** — the calendar's failure set (daily: explicit `MISSED` ∪ `computedMissedDates`; weekly/monthly: `failedPeriods`) is consistent with the periods that depress `metrics.currentStreak` / `rollingConsistency.denominator − numerator`; (b) **oracle** — both equal `expectedFailures`, the set hand-derived by the caller from the Business-Logic rule + `TODAY`. The helper never recomputes expected from engine output.

#### 2. Round-trip + agreement, daily (#2)

**File**: `apps/habits-api/test/consistency.e2e-spec.ts`

**Intent**: Prove a mark written for calendar date `D` reads back classified under `D` in **both** endpoints, and that the daily failure set agrees and matches the oracle.

**Contract**: Seed a daily habit with a known mix (e.g. some COMPLETED, one explicit MISSED, one unmarked closed day before `TODAY`). `getCalendar` + `getMetrics` with `today=${TODAY}`. Hand-derive `expectedFailures` (the explicit MISSED day ∪ the unmarked closed days from anchor to `TODAY-1`), then `assertCalendarAgreesWithMetrics`. Separately assert each seeded `D` appears under `D` in `calendar.marks` and is reflected in `metrics` (round-trip, no off-by-one).

#### 3. Round-trip + agreement, weekly/monthly (#2)

**File**: `apps/habits-api/test/consistency.e2e-spec.ts`

**Intent**: Same agreement proof for the period-based classifier path (`closedPeriodFailures` vs `classifyPeriods`), which is a separate code path from daily.

**Contract**: Seed a weekly habit (`targetCount: 2`) with one satisfied closed week and one under-target closed week (mirroring the shapes at [calendar.e2e-spec.ts:96](apps/habits-api/test/calendar.e2e-spec.ts:96) / [metrics.e2e-spec.ts:88](apps/habits-api/test/metrics.e2e-spec.ts:88) but read through **both** endpoints with the **same** seed + `today`). Hand-derive the failed-period as the oracle; `assertCalendarAgreesWithMetrics`. (Monthly is unit-covered for math; one weekly period-path agreement case is sufficient new signal here.)

#### 4. Backfill flips a closed failing period — both read-models (#5)

**File**: `apps/habits-api/test/consistency.e2e-spec.ts`

**Intent**: Prove the compute-on-read recompute: backfilling the day/marks that satisfy a **closed** failing period makes the streak/%/best-streaks recompute **and** the calendar failure entry disappear — together.

**Contract**: *Daily*: seed a streak broken by one unmarked closed day before `TODAY`; capture `/calendar` (`computedMissedDates` contains that day) + `/metrics` (`currentStreak` stops at the break). `PUT` COMPLETED into that day. Re-read: `computedMissedDates` no longer contains it, `currentStreak`/`bestStreaks` extend across the now-joined range, and the two read-models agree (`assertCalendarAgreesWithMetrics`). *Weekly*: seed a closed under-target week (`failedPeriods` has it); backfill enough COMPLETED to hit `target`; re-read: that `failedPeriods` entry is gone and `rollingConsistency.numerator` rises — both move together.

#### 5. Symmetric break — MISSED into a successful closed period (#5)

**File**: `apps/habits-api/test/consistency.e2e-spec.ts`

**Intent**: Prove the inverse transition (FR-010 "symmetric for 'missed'") — turning a satisfied closed day into a failure breaks it in both read-models.

**Contract**: *Daily*: seed a contiguous closed run (all COMPLETED, ending before `TODAY`); capture both endpoints (no failures, streak spans the run). `PUT` MISSED onto one closed day inside the run. Re-read: that day is now a failure in the calendar (explicit `MISSED`) and the metrics streak/denominators reflect the broken run — agreement holds via `assertCalendarAgreesWithMetrics`.

### Success Criteria:

#### Automated Verification:

- New suite passes: `npm run test:e2e -w @habitpair/habits-api -- consistency`
- Full e2e suite still green: `npm run test:e2e -w @habitpair/habits-api`
- Linting passes: `npm run lint -w @habitpair/habits-api`

#### Manual Verification:

- The `expectedFailures` set in each agreement test is hand-written from the seeded marks + `TODAY` (read the test source) — **not** read from either endpoint's output. (Oracle-rule audit.)
- Optional mutation check: `npx stryker run --mutate "apps/habits-api/src/marks/metrics.ts"` (or `period.ts`) after this phase; confirm the agreement/backfill tests kill mutants in the failure-classification branches, and consciously ignore equivalent/cosmetic survivors (do not chase 100%).
- Spot-check one backfill scenario by hand against the PRD Business-Logic rule to confirm the expected recompute is correct.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation before proceeding.

---

## Phase 4: Cookbook + Test-plan Sync

### Overview

Make the test-plan reflect reality: fill the integration cookbook patterns this phase was placeholdered to fill, advance the rollout status, and note the now-enforced gate. Documentation only.

### Changes Required:

#### 1. Fill the integration cookbook patterns

**File**: `context/foundation/test-plan.md`

**Intent**: Replace the "TBD — see §3 Phase 1" placeholders with the concrete, established pattern so the next contributor can add an integration test without re-deriving it.

**Contract**:
- **§6.2** (Adding an integration test): codify the two-user Supertest pattern over real Postgres — `createTestApp()`, two random-UUID users + `jwt.signAsync({ sub })`, per-`it` `createHabit`, `beforeAll`/`afterAll` `deleteMany`, explicit `today` from `TODAY`, assert request→response shape **and** the persisted side-effect, non-owner always 404. Reference `isolation.e2e-spec.ts` + `consistency.e2e-spec.ts`.
- **§6.4** (New API endpoint): the rule — every new route gets a non-owner 404 case alongside its happy path; any write is verified by an **independent** read-back, not the response.
- **§6.6** (Per-phase note): a 2–3 line note capturing what Phase 1 taught (e.g. the ValidationPipe-before-ownership ordering forcing well-formed params in the 404 sweep; the oracle+mutual agreement shape).

#### 2. Advance rollout status + gate

**File**: `context/foundation/test-plan.md`

**Intent**: Keep the living strategy doc honest about where the rollout stands.

**Contract**: §3 Phase-1 `Status` → `complete` (or `implementing` until merged — set by `/10x-implement` on landing). §5 row "cross-user + persisted-correctness integration" — note it is enforced on PR after this phase. Do not touch Phase 2/3 rows.

#### 3. Advance change identity

**File**: `context/changes/testing-backend-integration-suite/change.md`

**Intent**: Reflect plan→implementation transition.

**Contract**: `status` → `implementing` when Phase 2 starts (handled by the executor); `updated` stamped to the current date.

### Success Criteria:

#### Automated Verification:

- Markdown has no broken intra-repo links: the referenced spec files exist (`ls apps/habits-api/test/isolation.e2e-spec.ts apps/habits-api/test/consistency.e2e-spec.ts`).

#### Manual Verification:

- §6.2/§6.4 read as actionable instructions (a contributor could add a new integration test from them alone).
- §3 Phase-1 status and §5 gate match the merged reality.

**Implementation Note**: Documentation phase — no app behaviour to verify beyond link/file existence.

---

## Testing Strategy

This phase *is* the test work; the "strategy" is how the suite itself is structured and kept honest.

### Integration Tests (the deliverable):

- **#1** — `it.each` route sweep (6 routes) → 404 for a non-owner with well-formed params; `GET /habits` omits A's habits; owner-unchanged re-reads after each failed B mutation.
- **#2** — daily and weekly round-trip + oracle-derived `expectedFailures` matched by both endpoints + mutual agreement.
- **#5** — daily and weekly closed-period backfill flip (failing→succeeded) across both read-models; daily symmetric break (succeeded→failed).
- **#6** — write→second-token read-back with response-body assertion; repeat-PUT upsert (single row); unmark→read-back + idempotent re-DELETE.

### What is deliberately not added (already covered / out of scope):

- Pure period/metrics/DST math (unit-covered; §7 forbids).
- Hermetic partial-failure stubs (atomic write; none warranted).
- Local-tz boundary correctness (SPA / Phase-2 e2e).

### Manual / one-off checks:

1. Comment out an `assertOwned` → a sweep row fails (anti-tautology check), then revert.
2. Audit that every `expectedFailures` is hand-derived from the rule, not from endpoint output.
3. Optional selective Stryker run on `metrics.ts` / `period.ts` after Phase 3.

## Performance Considerations

Negligible. The suite adds two spec files of small, sequential Supertest requests against the existing CI Postgres service container; no new infra. State reset stays `deleteMany`-based (no truncate). E2E runtime grows by a few seconds.

## Migration Notes

None — no schema, no data, no production code changes.

## References

- Research (oracle source): `context/changes/testing-backend-integration-suite/research.md`
- Risk strategy: `context/foundation/test-plan.md` §2 (risks #1, #2, #5, #6), §6 (cookbook), §7 (exclusions)
- Existing harness to extend: [apps/habits-api/test/helpers.ts](apps/habits-api/test/helpers.ts), [habits.e2e-spec.ts](apps/habits-api/test/habits.e2e-spec.ts), [calendar.e2e-spec.ts:60-94](apps/habits-api/test/calendar.e2e-spec.ts:60), [metrics.e2e-spec.ts](apps/habits-api/test/metrics.e2e-spec.ts)
- Calendar-consistency invariant: [apps/habits-api/src/marks/metrics.ts:18-21](apps/habits-api/src/marks/metrics.ts:18)
- Ownership primitives: [habits.service.ts:213-219](apps/habits-api/src/habits/habits.service.ts:213), [marks.service.ts:30-36](apps/habits-api/src/marks/marks.service.ts:30)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Harness Extensions

#### Automated

- [x] 1.1 Type checking / build passes: `npm run build -w @habitpair/habits-api` — 0e06aef
- [x] 1.2 Linting passes: `npm run lint -w @habitpair/habits-api` — 0e06aef
- [x] 1.3 Existing e2e suite still passes: `npm run test:e2e -w @habitpair/habits-api` — 0e06aef

#### Manual

- [x] 1.4 New helpers (`TODAY`, `deleteMark`, `getCalendar`, `getMetrics`, `getHabits`) export and import cleanly — 0e06aef

### Phase 2: Cross-user Isolation + Durability Suite (#1, #6)

#### Automated

- [x] 2.1 New suite passes: `npm run test:e2e -w @habitpair/habits-api -- isolation` — 30bd1b5
- [x] 2.2 Full e2e suite still green: `npm run test:e2e -w @habitpair/habits-api` — 30bd1b5
- [x] 2.3 Linting passes: `npm run lint -w @habitpair/habits-api` — 30bd1b5

#### Manual

- [x] 2.4 Commenting out an `assertOwned` makes the corresponding sweep row fail (anti-tautology), then revert — 30bd1b5
- [x] 2.5 The `it.each` sweep visibly covers all six routes incl. both mark routes — 30bd1b5

### Phase 3: Persisted Correctness + Agreement + Backfill (#2, #5)

#### Automated

- [x] 3.1 New suite passes: `npm run test:e2e -w @habitpair/habits-api -- consistency` — 45d0ecd
- [x] 3.2 Full e2e suite still green: `npm run test:e2e -w @habitpair/habits-api` — 45d0ecd
- [x] 3.3 Linting passes: `npm run lint -w @habitpair/habits-api` — 45d0ecd

#### Manual

- [x] 3.4 Every `expectedFailures` set is hand-derived from the rule, not read from endpoint output (oracle audit) — 45d0ecd
- [x] 3.5 Optional Stryker run on `metrics.ts`/`period.ts` kills failure-classification mutants; equivalent survivors ignored consciously — 45d0ecd
- [x] 3.6 One backfill scenario hand-checked against the PRD Business-Logic rule — 45d0ecd

### Phase 4: Cookbook + Test-plan Sync

#### Automated

- [x] 4.1 Referenced spec files exist: `ls apps/habits-api/test/isolation.e2e-spec.ts apps/habits-api/test/consistency.e2e-spec.ts` — 6f883ce

#### Manual

- [x] 4.2 §6.2/§6.4 read as actionable, self-sufficient instructions — 6f883ce
- [x] 4.3 §3 Phase-1 status and §5 gate match the merged reality — 6f883ce
