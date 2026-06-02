<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Create a Habit and Mark Today (S-01)

- **Plan**: context/changes/create-habit-and-mark-today/plan.md
- **Scope**: Phases 1–4 of 4 (all complete)
- **Date**: 2026-06-02
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 2 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated checks (run at review time)

- `habits-api`: lint PASS · test PASS (19 tests, 3 suites incl. `habits.service.spec`, `marks.service.spec`) · build PASS
- `web`: typecheck PASS · lint PASS · test PASS (11 tests, 4 files) · build PASS
- Phase-1 `npm run migrate` apply not run locally (requires live Postgres); covered by CI `migrate:deploy`. Passing build confirms the generated client matches the schema.

## Notes

- Highest-risk area (local-calendar-date handling) verified correct on both client and server: backend `period.ts` uses `T00:00:00.000Z` parsing + round-trip validation + UTC getters; ISO-Monday math `(getUTCDay()+6)%7` handles the Sunday edge; frontend `today.ts` uses local getters, not `toISOString()`.
- Ownership returns 404 (`NotFoundException`) not 403, per-user scoping enforced on every query.
- Plan adherence is full: 18/18 planned files match contract, zero drift, zero feature scope creep; every "What We're NOT Doing" boundary respected.

## Findings

### F1 — N+1 query in findByUser (plan-sanctioned)

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: apps/habits-api/src/habits/habits.service.ts:31-46
- **Detail**: `findByUser` does `findMany`, then `Promise.all(habits.map(...))` issuing 2 queries per habit (`findUnique` for todayStatus + `count` for the period) → 1 + 2N round-trips, no cap/pagination on habits. The Phase-2 contract explicitly permitted this ("a per-habit count query or a single batched marks query are both acceptable"), so it is a documented decision, not drift. Negligible at MVP scale; scales linearly with habit count.
- **Fix**: If habit counts grow, collapse to two set-based queries — one `findMany` of today's marks where `habitId IN (ids)`, one `groupBy(['habitId']) _count` over the period range — and stitch in memory. Safe to defer.
- **Decision**: SKIPPED — accepted as plan-sanctioned; fine at MVP scale.

### F2 — Unrelated CLAUDE.md change bundled into feature commits

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: CLAUDE.md (root)
- **Detail**: The 50-line CLAUDE.md diff is entirely inside the `@przeprogramowani/10x-cli` managed block — course content advancing Lesson 3 → Lesson 4. Tooling-generated, touches no Tripwires/Architecture guidance, unrelated to S-01. The actual feature scope was perfectly disciplined.
- **Fix**: None needed. For next time: keep tooling-managed doc updates in their own commit rather than folding them into feature commits.
- **Decision**: SKIPPED — accepted as a benign managed-block auto-update.
