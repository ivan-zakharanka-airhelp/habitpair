<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Habit Insight Metrics (S-03)

- **Plan**: context/changes/habit-insight-metrics/plan.md
- **Scope**: Phases 1–3 of 3 (full plan)
- **Date**: 2026-06-04
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Evidence

- **Automated criteria (all re-run during review):** backend unit 78✓, e2e 20✓ (was 18; +2 added during triage), web tests 21✓, web typecheck✓, backend build✓, web build✓, lint✓ (backends + web eslint).
- **Manual criteria:** all `[x]` in Progress; `change.md` epilogue documents the preview-driven refinements (proportional bars, mobile relayout), evidencing the manual passes were real.
- **Two parallel sub-agents** (plan-drift + safety/quality/pattern) independently found zero drift, zero missing items, and no CRITICAL/WARNING issues.
- **Correctness-critical invariants are genuinely tested**, not just asserted: classification agreement with `computedMissedDates`/`closedPeriodFailures`; `denominator===0 → null` end-to-end; the 14-day RATIO→PERCENT flip; a spring-forward DST round-trip; 404-not-403 ownership.
- **Both approved post-plan refinements** (longest-first ordering; `currentRun` pinning + proportional bars) correctly incorporated as the new contract.

## Findings

### F1 — Monthly e2e fixture omitted

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Success Criteria
- **Location**: apps/habits-api/test/app.e2e-spec.ts (metrics describe block)
- **Detail**: Plan Testing Strategy (plan.md:287) names daily/weekly/monthly e2e fixtures; implementation had daily + weekly only (no monthly, no never-marked 200/all-null case). Monthly + empty case ARE thoroughly unit-tested in metrics.spec.ts, so this was e2e shape-depth, not a correctness gap.
- **Fix**: Add a monthly habit fixture (and a zero-mark habit) to the metrics e2e block, mirroring daily/weekly.
- **Decision**: FIXED — added "computes the monthly metrics read-model (closed under-target month breaks the streak)" and "returns a neutral all-null read-model for a never-marked habit" to the metrics e2e block; e2e now 20/20.

### F2 — Rolling-window sizes duplicated frontend↔backend, unenforced

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/web/src/features/habits/lib/metricsFormat.ts:10-16
- **Detail**: WINDOW_SIZE {DAY:30, WEEK:8, MONTH:6} hand-copied from backend ROLLING_WINDOW (metrics.ts:71-75); "keep in sync" comments but no enforcement. Drives only the descriptive label ("last 30 days") — drift would mislabel, never miscompute.
- **Fix**: Accept the documented coupling (constants are stable), or have the backend return the window size so the label has one source.
- **Decision**: SKIPPED — constants are very stable; the risk is cosmetic-only; the single-source fix would expand the response contract for a label. Documented coupling accepted.

### F3 — Redundant anchor query in getMetrics

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (performance)
- **Location**: apps/habits-api/src/habits/habits.service.ts:147-157
- **Detail**: getMetrics fired a separate findFirst for the anchor and then a findMany for ALL marks ascending. Since the findMany is unbounded here, marks[0].date already is the anchor — the extra round-trip is redundant. Mirrors getCalendar, but there the separate query is necessary because getCalendar's findMany is windowed; getMetrics has no window, so that justification doesn't carry over.
- **Fix**: Derive anchor from marks[0]?.date and drop the findFirst (one query instead of two); keep the empty-marks null path.
- **Decision**: FIXED — dropped the findFirst; anchor now derived from marks[0]?.date with a comment noting the unbounded-read contrast with getCalendar. Unit 78✓, e2e 20✓, build✓, lint✓.

## Triage summary

- Fixed: F1, F3
- Skipped: F2
