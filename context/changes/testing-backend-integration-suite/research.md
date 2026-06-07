---
date: 2026-06-07T11:28:51+0200
researcher: Ivan Zakharanka
git_commit: b0ed3f2cb41954035789895aaa7041ba187bf303
branch: main
repository: habitpair
topic: "Cross-user isolation + persisted-correctness integration suite (test-plan Phase 1; risks #1, #2, #5, #6)"
tags: [research, codebase, habits-api, integration-tests, supertest, cross-user-isolation, metrics, calendar, date-seam]
status: complete
last_updated: 2026-06-07
last_updated_by: Ivan Zakharanka
---

# Research: Cross-user isolation + persisted-correctness integration suite

**Date**: 2026-06-07T11:28:51+0200
**Researcher**: Ivan Zakharanka
**Git Commit**: b0ed3f2cb41954035789895aaa7041ba187bf303
**Branch**: main
**Repository**: habitpair

## Research Question

Phase 1 of [test-plan.md](context/foundation/test-plan.md) §3: build the **cross-user isolation + persisted-correctness integration suite** (Supertest + real Postgres, extending the existing habits-api e2e harness). Produce the *oracle* — what each test must prove — for the four risks it covers, grounded in sources (PRD / test-plan / prior decisions), not in the implementation:

- **#1** — a non-owning user gets **404 (not 403)** on every habit / mark / metrics / calendar / PATCH / DELETE route for a resource they do not own (no existence leak).
- **#2** — seeded marks read back through `/metrics` and `/calendar` return **correct, mutually-agreeing** values over a real database (the stored-date↔UTC seam pure unit tests can't catch).
- **#5** — a retroactive **backfill into a closed period** recomputes streak / rolling % / best-streaks across the affected range and keeps the calendar coloring in agreement.
- **#6** — a mark written via the API is present on an **independent re-read** (write → read-back, not just the write response).

## Summary

The implementation is **already correct against all four risks** at the unit/mock level; what is missing is *integration-level proof over a real Postgres*. The cheapest new signal for every one of these four risks is HTTP integration with two users against the CI Postgres container — exactly as the test-plan predicted. Five load-bearing facts shape the suite:

1. **Ownership is uniformly 404, everywhere.** Every `habitId`-addressed route resolves ownership with one primitive — `prisma.habit.findFirst({ where: { id, userId } })` then `throw new NotFoundException` — and a repo-wide grep finds **zero** `ForbiddenException`/`403`. So #1's oracle (404-not-403) holds in code today; the gap is that the **two mark routes (`PUT`/`DELETE …/marks/:date`) have no cross-user e2e test**, and no test asserts the owner's resource is *unchanged* after a non-owner write attempt.

2. **The harness already mints two users locally — no auth-api dependency.** Tests sign their own JWTs with the shared secret via `jwt.signAsync({ sub: userId })`. Cross-user isolation and "another device/session" (#6) are both expressible by minting a second token for a second `sub` (or a fresh token for the same `sub`). The suite never needs to call auth-api.

3. **Metrics and calendar are computed-on-read, with no cached read-model.** The only tables are `Habit` and `Mark`; every `GET` re-derives everything from the full mark set. Therefore **#5's "recompute" is an implicit re-read** — backfill a past mark, then `GET` again; there is no recompute trigger/endpoint to drive. This makes #5 a pure write→re-read integration test.

4. **Calendar and metrics share primitives but DUPLICATE the success/failure decision logic** (`metrics.ts classifyPeriods` vs `period.ts computedMissedDates` + `closedPeriodFailures`). The header comment at [metrics.ts:18-21](apps/habits-api/src/marks/metrics.ts:18) explicitly names a **"calendar-consistency invariant"** that *must* be asserted because the two paths can drift. This is the single most important #2/#5 target — and it is currently asserted **only in unit tests with hand-built fixtures**, never across the two real endpoints.

5. **The PRD's "local timezone" rule is not enforceable on the backend** — there is no per-user timezone anywhere, and `Mark.date` is `@db.Date` written/read as UTC-midnight. The server is internally consistent (a mark for `2026-06-02` always reads back as `2026-06-02`), so #2's *integration* oracle is "server round-trips the date and the two read-models agree," **not** "the local-tz boundary is correct." The local-tz divergence is real but belongs to the SPA / Phase-2 e2e — recorded under Open Questions, not resolved here.

**Two-layer call (cost × signal):** all four risks land at the **integration** layer (real DB). The mark write is a single atomic `upsert` — there is no non-atomic multi-operation save sequence in this phase, so **no hermetic partial-failure stubs are warranted**; the existing `marks.service.spec.ts` already covers the mocked write contract. Do **not** re-test the pure period/metrics math or DST arithmetic — that is exhaustively unit-covered (and §7 of the test-plan forbids it).

## Oracle per risk (the deliverable for /10x-plan)

Grounded in PRD / test-plan §2 / archive decisions — **not** lifted from the implementation.

### Risk #1 — cross-user isolation, 404 not 403
- **Source:** PRD `## Success Criteria` ("Per-user privacy" guardrail — "no shape of authenticated request returns another user's data … cross-tenant leakage is product-killing") + `## Non-Functional Requirements` ("Per-user data isolation … binary property: zero observed cross-user reads"). 404-not-403 from [test-plan.md](context/foundation/test-plan.md) §2 Risk Response and archive plans ([edit-and-delete-habit/plan.md:10], [habit-insight-metrics/plan.md:32]).
- **Must prove:** for **every** `habitId`-addressed route — `GET /calendar`, `GET /metrics`, `PATCH /habits/:id`, `DELETE /habits/:id`, `PUT …/marks/:date`, `DELETE …/marks/:date` — a valid token for user B requesting user A's habit (with **well-formed** params) returns **404**, and `GET /habits` for B omits A's habits. Additionally, after B's failed **write** attempt, A's habit/mark is **unchanged** (catches a future ownership-ordering regression — see Test-design constraints).
- **Anti-pattern:** testing only the owner's happy path; asserting 404 without confirming the side-effect did not occur.

### Risk #2 — persisted correctness + calendar↔metrics agreement
- **Source:** PRD `## Non-Functional Requirements` ("Timezone/DST robustness … evaluated consistently") + `## Business Logic`; test-plan §2 #2; the calendar-consistency invariant from [habit-insight-metrics/plan.md:56].
- **Must prove:** over a real Postgres, a mark written for calendar date `D` reads back classified under `D` in **both** `/metrics` and `/calendar`; and for one shared seeded mark set + one `today`, the days/periods `/calendar` colors as failure (explicit `MISSED` ∪ `computedMissedDates`, or `failedPeriods`) are exactly those `/metrics` treats as failure feeding `currentStreak` / `bestStreaks` / denominators.
- **Anti-pattern:** re-asserting pure math already unit-covered; lifting the expected number from the engine (oracle problem). Assert agreement and round-trip, derive expected day-classifications from the Business-Logic rule.

### Risk #5 — retroactive backfill recompute, two read-models in agreement
- **Source:** PRD `## Functional Requirements` FR-010 + `## Business Logic` ("Retroactive marks into closed periods … the period transitions to 'succeeded', and streaks are recomputed across the affected range … symmetric for 'missed'"); test-plan §2 #5.
- **Must prove:** seed a **closed, failing** period (a daily streak broken by an unmarked-and-past day; or a closed under-target week/month), capture `/metrics` + `/calendar`; `PUT` the backfill mark that flips the period; on a fresh re-read, `currentStreak` / `rollingConsistency` / `bestStreaks` recompute across the affected range **and** the matching `computedMissedDates` / `failedPeriods` entry disappears — the two read-models move **together**. Symmetric case: marking `MISSED` into a previously-successful closed period breaks it in both.
- **Anti-pattern:** asserting only one endpoint; brittle hard-coded wall-clock fixtures (pass explicit `today`).

### Risk #6 — durable write → independent read-back
- **Source:** PRD `## Success Criteria` ("Data integrity" guardrail) + `## Non-Functional Requirements` ("Data durability … survives sign-out, sign-in on another device") + `## User Stories` US-02 acceptance; test-plan §2 #6.
- **Must prove:** a mark the API confirms (`200`) is present on an **independent** re-read — a separate `GET` (`/calendar`, `/metrics`, or `/habits` `todayStatus`), ideally via a **second token** for the same `sub` (modelling "another session/device"). A repeat `PUT` for the same `(habit, date)` **upserts** (single row, status updated) rather than duplicating — exercising the `@@unique([habitId, date])` constraint over the real DB.
- **Anti-pattern:** asserting the write *response* instead of an independent read.

## Detailed Findings

### Area 1 — Route surface & ownership (#1)

Auth: [jwt.guard.ts:7-24](apps/habits-api/src/auth/jwt.guard.ts:7). Every business controller is `@UseGuards(JwtGuard)`; health is unguarded. Missing token → **401** ([jwt.guard.ts:13](apps/habits-api/src/auth/jwt.guard.ts:13)); invalid/expired/wrong-secret/wrong-alg → **401** ([:20-22](apps/habits-api/src/auth/jwt.guard.ts:20)). On success `Object.assign(request, { user: payload })` ([:18](apps/habits-api/src/auth/jwt.guard.ts:18)); the acting user id is **`req.user.sub`**. JWT is HS256, secret `JWT_SECRET` via `JwtModule.registerAsync` ([app.module.ts:18-25](apps/habits-api/src/app.module.ts:18)); guard pins `algorithms: ['HS256']`.

`MarksController` is `@Controller(':habitId/marks')` under the global `habits` prefix, so its paths are `/habits/:habitId/marks/:date`.

| Method | Path | Ownership mechanism | Non-owner today | Refs |
|---|---|---|---|---|
| GET | `/habits` | `findMany where {userId}`, no habitId input | 200, own only | `habits.controller.ts:30`, `habits.service.ts:35-41` |
| POST | `/habits` | writes `userId` into row | n/a | `habits.controller.ts:35`, `habits.service.ts:22-33` |
| GET | `/habits/:id/calendar` | `findFirst {id,userId}`→NotFound | **404** | `habits.controller.ts:42`, `habits.service.ts:107-108` |
| GET | `/habits/:id/metrics` | `findFirst {id,userId}`→NotFound | **404** | `habits.controller.ts:54`, `habits.service.ts:172-173` |
| PATCH | `/habits/:id` | `assertOwned`→404, then `update where {id}` | **404** | `habits.controller.ts:65`, `habits.service.ts:197-203,213-219` |
| DELETE | `/habits/:id` | `assertOwned`→404, then `delete where {id}` | **404** | `habits.controller.ts:76`, `habits.service.ts:207-210,213-219` |
| PUT | `/habits/:id/marks/:date` | `assertOwned`→404, then `mark.upsert` | **404** | `marks.controller.ts:16`, `marks.service.ts:10-20,30-36` |
| DELETE | `/habits/:id/marks/:date` | `assertOwned`→404, then `mark.deleteMany` | **404** | `marks.controller.ts:26`, `marks.service.ts:22-27,30-36` |
| GET | `/habits/health`, `/health/ready` | unguarded (no user data) | 200/503 | `health.controller.ts` |

**No isolation gap and no 404/403 inconsistency in code today.** Two structural notes that become test requirements:
- The second-stage writes are **unscoped** — `update({where:{id}})` ([habits.service.ts:202](apps/habits-api/src/habits/habits.service.ts:202)), `delete({where:{id}})` ([:209](apps/habits-api/src/habits/habits.service.ts:209)), mark `upsert`/`deleteMany` keyed on `habitId` only ([marks.service.ts:15-19,26](apps/habits-api/src/marks/marks.service.ts:15)). They are safe *only* because `assertOwned` runs first. → assert the **side-effect did not occur**, not just the 404.
- For the mark routes, ownership is checked **before** `:date` is parsed, so ownership-404 precedes date-format errors *in the service*. **But** the global `ValidationPipe` (`forbidNonWhitelisted`) runs **before the handler**, so a malformed `:date` / `status` / `today` / `from` yields a **400 from the pipe before ownership is evaluated** — a non-owner sending a malformed param to A's habit gets 400, not 404 (leaks nothing, but not a literal uniform-404). → **use well-formed params** when asserting the #1 matrix.

### Area 2 — Engine & the stored-date↔UTC seam (#2, #5)

- **Storage:** `Mark.date` is `DateTime @db.Date` ([schema.prisma:49](apps/habits-api/prisma/schema.prisma:49)) — schema comment: "local calendar date supplied by the client, stored as `@db.Date` (UTC midnight) — never a UTC instant" ([:43-45](apps/habits-api/prisma/schema.prisma:43)). **No timezone field exists** anywhere; no `User` table (`userId` is the JWT `sub`).
- **Write normalization:** `parseDateOnly` ([period.ts:11-20](apps/habits-api/src/marks/period.ts:11)) regex-gates `YYYY-MM-DD`, builds `new Date(\`${s}T00:00:00.000Z\`)` (explicit `Z` = UTC midnight), round-trip-validates to reject impossible dates (`2026-02-30`). Written straight to the column ([marks.service.ts:12,15-19](apps/habits-api/src/marks/marks.service.ts:12)).
- **Read bucketing:** all day/week/month math uses **UTC getters** (`getUTC*`, `Date.UTC`) — `startOfIsoWeek` [period.ts:181](apps/habits-api/src/marks/period.ts:181), `startOfMonth` :186, `endOf*` :190-196, `addUtcDays` :198, `formatDateOnly` :22. `metrics.ts` imports the same helpers. Local==UTC is silently assumed (see Open Questions).
- **Computations** (all in [metrics.ts](apps/habits-api/src/marks/metrics.ts), via `computeMetrics` :77 → `classifyPeriods` :124-188):
  - `currentStreak` :192-201 — pending skipped, success++, first failure stops.
  - `rollingConsistency` :113 over the last `ROLLING_WINDOW` closed periods; `{DAILY:30, WEEKLY:8, MONTHLY:6}` :71-75 (matches PRD); `percent=null` when denominator 0.
  - `recentCompletion` :114-117 — separate all-history ratio, flips RATIO→PERCENT at `RATIO_PHASE_DAYS=14`.
  - `bestStreaks` :118 — `collectRuns` :206-224 (end clamped to today), top-10 by `length desc, start desc` :228-232.
  - "**period closed**": `isClosed = pEnd < today` ([metrics.ts:175](apps/habits-api/src/marks/metrics.ts:175)); the current period (end ≥ today) is always excluded from denominators (`closed = periods.slice(0, len-1)` :98). Calendar mirrors this: `if (pEnd >= today) break` ([period.ts:150](apps/habits-api/src/marks/period.ts:150)). → to construct a **closed** failing period for #5, its end must be strictly before `today`.
- **#5 = computed-on-read.** `getMetrics` re-queries **all** marks per request ([habits.service.ts:169-192](apps/habits-api/src/habits/habits.service.ts:169), comment "on read" :166-167, anchor `marks[0]?.date` :188); `getCalendar` likewise ([:104-164](apps/habits-api/src/habits/habits.service.ts:104)). The write path touches only the single `Mark` row. No cached model, no trigger.
- **Calendar vs metrics:** **duplicated** decision logic — `/metrics` via `classifyPeriods` ([metrics.ts:124-188](apps/habits-api/src/marks/metrics.ts:124)); `/calendar` via `computedMissedDates` ([period.ts:96-115](apps/habits-api/src/marks/period.ts:96)) + `closedPeriodFailures` ([period.ts:121-165](apps/habits-api/src/marks/period.ts:121)), wired at [habits.service.ts:149-163](apps/habits-api/src/habits/habits.service.ts:149). Shared *primitives*, separate *classifiers* → drift risk → assert agreement across the real endpoints.
- **Already unit-covered (do NOT duplicate):** `period.spec.ts` (incl. DST spring-forward round-trip :115-125), `metrics.spec.ts` (incl. exact 30-day boundary :184-194, DST block :355-369, and a pure-function calendar-consistency block :371-441), `marks.service.spec.ts` (mocked write contract: date round-trip :23-32, repeat-PUT updates :34-43, idempotent unmark :47-58, ownership 404 :61-89).

### Area 3 — Existing e2e harness & coverage gaps

- **Harness:** `createTestApp()` ([helpers.ts:14-28](apps/habits-api/test/helpers.ts:14)) boots the real `AppModule`, mirrors `main.ts` (`setGlobalPrefix('habits')` + the same `ValidationPipe`), returns `{ app, prisma, jwt }`. Helpers: `createHabit` :30 (POST→201→`id`), `putMark` :43 (PUT→200).
- **Tokens:** `jwt.signAsync({ sub: userId })` — payload is `{ sub }` only, **no `exp`** (tokens don't expire). Every stateful spec already mints **two** random-UUID users + tokens (e.g. [habits.e2e-spec.ts:13-27](apps/habits-api/test/habits.e2e-spec.ts:13)); a wrong-secret `foreignToken` for the 401 case at :18-21.
- **DB reset:** no truncate/transaction — `prisma.habit.deleteMany({ where: { userId: { in: [userA, userB] } } })` in `beforeAll` **and** `afterAll`; marks cascade. State accumulates *within* a suite (not per-`it`), isolated across suites via fresh UUIDs. DB URL via `DATABASE_URL` env; **no Jest setup file**. `jest-e2e.json`: `testRegex: ".e2e-spec.ts$"`, `rootDir: "."` (= `test/`). CI ([.github/workflows/habits-api-test.yaml](.github/workflows/habits-api-test.yaml)) runs `postgres:16-alpine`, `migrate:deploy`, then `test:e2e`.
- **Response shapes** the suite asserts against:
  - `POST /habits` → 201, `{ id, userId, name, modality, frequency, targetCount, createdAt }` (`targetCount` null for DAILY).
  - `PUT …/marks/:date` → **200**, `{ id, habitId, date, status, createdAt }`; request `{ status: 'COMPLETED' | 'MISSED' }`. `DELETE …/marks/:date` → **204** (no e2e coverage today).
  - `GET /metrics` → `{ unit, currentStreak, currentRun|null, rollingConsistency:{numerator,denominator,percent|null}, recentCompletion:{…,phase:'RATIO'|'PERCENT'}, bestStreaks:[{start,end,length}] }`.
  - `GET /calendar` → `{ habit:{…}, firstMarkDate|null, marks:{'YYYY-MM-DD':'COMPLETED'|'MISSED'}, computedMissedDates:[…] (DAILY only), failedPeriods:[{start,end,completedCount,target}] (WEEKLY/MONTHLY only) }`. No explicit "today" flag.
  - DTOs: `today`=`YYYY-MM-DD`, `from`/`to`=`YYYY-MM`; `GET /habits` requires `?today=`.

**Per-risk gap table:**

| Risk | Status | Specific missing case |
|---|---|---|
| **#1** | PARTIAL | Covered: cross-user 404 on PATCH ([habits.e2e-spec.ts:176]), DELETE (:211), GET metrics ([metrics.e2e-spec.ts:48]), GET calendar ([calendar.e2e-spec.ts:48]); list isolation as empty-list (:90-94). **Missing:** `PUT …/marks/:date` non-owner→404; `DELETE …/marks/:date` non-owner→404 (route has **zero** e2e); a consolidated all-route sweep; "A's row/mark unchanged after B's write attempt". |
| **#2** | MISSING | No e2e seeds marks and asserts `/metrics` **and** `/calendar` agree; the two suites even use **different seed dates**. The agreement invariant lives only in unit tests. |
| **#5** | PARTIAL | Calendar-only backfill exists ([calendar.e2e-spec.ts:60-94]) but (a) never re-reads `/metrics`, (b) fills a gap in the **open/recent** window, not a **closed failing** period that flips. Missing: closed-period flip proven across **both** read-models. |
| **#6** | PARTIAL | Calendar backfill re-fetches via a separate GET (:81-93), but the `PUT` response body is never asserted, there's no minimal write→independent-read on `/metrics` or `/habits` `todayStatus`, and the upsert (repeat-PUT → single row) is **e2e-unproven**. |

**Reusable utilities:** `createTestApp`, `createHabit`, `putMark`, the two-user inline pattern, `foreignToken`. **Likely needed:** a cross-route 404 sweep helper (incl. the two mark routes), a `assertCalendarAgreesWithMetrics` cross-check encoding [metrics.ts:18-21], thin `getCalendar`/`getMetrics` read-back wrappers, and a `deleteMark` helper.

### Area 4 — Schema constraints & historical decisions

| Constraint | Schema | Migration SQL |
|---|---|---|
| `@@unique([habitId, date])` (upsert key, #6) | [schema.prisma:54](apps/habits-api/prisma/schema.prisma:54) | `migration.sql:38` (`Mark_habitId_date_key`) |
| `Mark → Habit` FK `onDelete: Cascade` (FR-008) | [schema.prisma:52](apps/habits-api/prisma/schema.prisma:52) | `migration.sql:41` (`ON DELETE CASCADE`) |
| `Habit.userId String`, `@@index([userId])` | [schema.prisma:32,40](apps/habits-api/prisma/schema.prisma:32) | `migration.sql:13,35` |
| `Mark.status MarkStatus` enum `{COMPLETED, MISSED}` | [schema.prisma:24-27,50](apps/habits-api/prisma/schema.prisma:24) | `migration.sql:8,28` |

`userId` is a **bare scalar, not a FK; there is no `User` table** ("no FK across DBs by design", [schema.prisma:29]). The only migration is `prisma/migrations/20260602145428_init/migration.sql`. Tests seed habits with an arbitrary `userId` string (= the JWT `sub`).

## Code References

- [apps/habits-api/src/auth/jwt.guard.ts:7-24](apps/habits-api/src/auth/jwt.guard.ts:7) — auth: 401 on missing/invalid token; `req.user.sub`.
- [apps/habits-api/src/habits/habits.service.ts:213-219](apps/habits-api/src/habits/habits.service.ts:213) — `assertOwned` (404-not-403 primitive); `getCalendar` :104, `getMetrics` :169.
- [apps/habits-api/src/marks/marks.service.ts:10-36](apps/habits-api/src/marks/marks.service.ts:10) — `upsert` / `deleteMany` + `assertOwned`; ownership before `:date` parse.
- [apps/habits-api/src/marks/period.ts:11-20](apps/habits-api/src/marks/period.ts:11) — `parseDateOnly` (UTC-midnight, round-trip validation); classifiers `computedMissedDates` :96, `closedPeriodFailures` :121.
- [apps/habits-api/src/marks/metrics.ts:18-21](apps/habits-api/src/marks/metrics.ts:18) — the calendar-consistency invariant comment; `classifyPeriods` :124, "closed" rule :175.
- [apps/habits-api/prisma/schema.prisma:24-55](apps/habits-api/prisma/schema.prisma:24) — `Mark` (`@db.Date`, `@@unique`, cascade), `Habit` (`userId` index), `MarkStatus`.
- [apps/habits-api/test/helpers.ts:14-55](apps/habits-api/test/helpers.ts:14) — harness + `createHabit` / `putMark`.
- [apps/habits-api/test/calendar.e2e-spec.ts:60-94](apps/habits-api/test/calendar.e2e-spec.ts:60) — the existing (calendar-only) backfill test to extend.

## Architecture Insights

- **Isolation is enforced by query-scoping, not a policy layer.** Every read scopes on `{ id, userId }`; every write is preceded by `assertOwned`. There is no guard/interceptor that enforces ownership generically — it is per-handler discipline. This is why the suite should treat each route independently and assert side-effects, not assume a shared chokepoint.
- **Defense-in-depth gap (not a defect today):** the `update`/`delete`/`upsert`/`deleteMany` second stages are **not** scoped by `userId`; they rely entirely on `assertOwned` ordering. Adding `userId` to those `where` clauses would make a missing/reordered guard fail closed. Out of scope for a test phase, but the side-effect-unchanged assertions are the regression net for it.
- **Compute-on-read is the architecture, not an optimization gap.** It makes retroactive correctness (#5) "free" and means the integration suite proves a *property* (re-read reflects writes), not a recompute job.
- **The expensive seam is at the client, not the server.** The backend is UTC-internally-consistent; the PRD's "local timezone" semantics live entirely in whatever `YYYY-MM-DD` the SPA sends. Backend integration cannot test the local-tz rule; Phase-2 browser e2e is where that belongs.

## Historical Context (from prior changes)

- [context/archive/2026-06-04-edit-and-delete-habit/plan.md:10](context/archive/2026-06-04-edit-and-delete-habit/plan.md:10) — `assertOwned` throws `NotFoundException` "**so a habit's existence is never leaked across users**"; confirmed correct in [reviews/impl-review.md:34](context/archive/2026-06-04-edit-and-delete-habit/reviews/impl-review.md:34). Also :11 — metrics compute on-read, "a hard delete needs no extra cleanup and leaves no orphans".
- [context/archive/2026-06-04-habit-insight-metrics/plan.md:56](context/archive/2026-06-04-habit-insight-metrics/plan.md:56) — the calendar-consistency invariant: "A day or period the calendar colors as a failure MUST count as a failure in the streak, and vice versa … add a test asserting agreement with `computedMissedDates` / `closedPeriodFailures`." :32 — "404 not 403 to avoid leaking habit existence". :36 / [plan-brief.md:23](context/archive/2026-06-04-habit-insight-metrics/plan-brief.md:23) — "No materialization / no caching. Pure compute-on-read."
- Neither archive contains a `research.md` (only `change.md`, `plan-brief.md`, `plan.md`, `reviews/impl-review.md`).

## Related Research

- [context/changes/redesign-ui/research.md](context/changes/redesign-ui/research.md) — frontend-scoped (UI redesign); not relevant to this backend suite.

## Open Questions

1. **PRD local-timezone vs UTC implementation (surface, do not resolve in Phase 1).** The backend applies no per-user timezone and treats the stored `@db.Date` as the day verbatim (UTC math). The PRD requires local-midnight / local-Monday / local-1st boundaries. The reconciliation, if any, is client-side. **Phase-1 scope:** assert server round-trip + calendar↔metrics agreement only; do not pick an expected local-tz value. Whether the local-tz rule is actually honored end-to-end is a **Phase-2 (browser e2e) / SPA question** — flag for that phase.
2. **`DELETE /habits/:id/marks/:date` has zero coverage of any kind at the e2e level.** The suite should add at least the non-owner 404 and an owner unmark→idempotent-read-back; confirm whether unmark semantics (a 204 with no body, idempotent on an already-absent mark — see `marks.service.spec.ts:47-58`) are part of Phase-1 scope or deferred.
3. **`today` is always caller-supplied.** All time-dependent reads take `?today=`. The suite must pass explicit `today`/date fixtures (never wall-clock); confirm a fixed reference date convention for the new specs (e.g. a `TODAY = '2026-06-15'` constant) so the closed-period scenarios are stable.
