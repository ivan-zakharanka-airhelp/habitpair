<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Habit Calendar and Backfill (S-02)

- **Plan**: context/changes/habit-calendar-and-backfill/plan.md
- **Scope**: All 3 phases (complete)
- **Date**: 2026-06-04
- **Verdict**: APPROVED
- **Findings**: 0 critical · 0 warnings · 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS (3 observations: F1, F2, F3) |
| Scope Discipline | PASS |
| Safety & Quality | PASS (1 observation: F4) |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Automated verification (all green)

- habits-api: `lint` ✅ · 46 unit ✅ · 13 e2e (incl. 5 calendar) ✅ · `build` ✅
- web: `typecheck` ✅ · `lint` ✅ · 11 tests ✅ · `build` ✅
- All 17 manual Progress boxes checked with commit shas (428686f / 502823c / 438f118).
- Scope guardrails ("What We're NOT Doing") all respected: no streak numbers/pills, no recompute seam, no new write endpoint, no habit edit/delete, no new web Vitest specs.

## Findings

### F1 — calendarRange decomposed differently than the plan's contract

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: apps/web/src/features/habits/lib/calendarRange.ts:36-85
- **Detail**: Plan Phase 2 §3 specified a single `calendarWindow(span, endMonth, firstMarkDate)`. Shipped as three functions — `currentMonth()`, `calendarQueryRange(span, endMonth)`, `calendarDisplay(span, range, firstMarkDate)`. The split is deliberate: the fetch range excludes `firstMarkDate` so the query key never depends on server data. Behavior and the 24-month `'all'` cap match the plan's intent.
- **Fix**: No code change. Optionally document the 3-function decomposition in plan §2.3.
- **Decision**: ACCEPTED — no change (benign, behavior-preserving mechanism divergence).

### F2 — Read-only calendar styles a custom `Day`, not DayButton + modifiersClassNames

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: apps/web/src/features/habits/components/HabitCalendar.tsx:37-64,106
- **Detail**: Plan Phase 2 §5 specified `components={{ DayButton }}` + `modifiersClassNames`. Implementation uses a custom `Day` with inline className composition. Rationale documented in-code (lines 30-36): react-day-picker v10 renders `DayButton` only in interactive mode, so a read-only DayButton would be dead markup. The plan anticipated this ("confirm v10 spelling against the installed API"). Visual contract met and manually verified.
- **Fix**: No change — rationale documented in-code.
- **Decision**: ACCEPTED — no change (documented, justified adaptation; visual contract met).

### F3 — 'All' span ships as the label "2 yr"

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: apps/web/src/features/habits/components/SpanControl.tsx:7
- **Detail**: The plan and its manual criteria call the 4th span option "All". The shipped label is "2 yr" (underlying value still `'all'`), honest about the 24-month cap but divergent from the plan/PRD wording.
- **Fix**: Keep "2 yr" or rename to "All".
- **Decision**: ACCEPTED — keep "2 yr" (truthful about the 24-month cap; no code change).

### F4 — closedPeriodFailures re-filters all completed marks per period

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Performance)
- **Location**: apps/habits-api/src/marks/period.ts:141-153
- **Detail**: The weekly/monthly period loop calls `completed.filter(...)` once per period → O(periods × completed marks). Bounded today by the 36-month `monthSpan` cap (~157 weekly periods), so negligible. Latent: only matters if `MAX_SPAN_MONTHS` is raised.
- **Fix**: Add a code comment flagging the bucket-by-period optimization for a future cap raise.
- **Decision**: FIXED — added an explanatory comment at period.ts:151 (lint re-run green).
