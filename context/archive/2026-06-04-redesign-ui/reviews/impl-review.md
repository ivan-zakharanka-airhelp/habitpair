<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: UI Redesign — Claude Design re-skin

- **Plan**: context/changes/redesign-ui/plan.md
- **Scope**: All 6 phases (full plan)
- **Date**: 2026-06-05
- **Verdict**: APPROVED
- **Findings**: 0 critical, 0 warnings, 4 observations

All six automated gates were independently re-run and pass: web typecheck, web tests
(40/40, now 41/41 after the F3 fix), habits-api tests (86/86), `make lint`, web build,
habits-api build. All "What We're NOT Doing" guardrails held (no export/delete backend,
targetCount immutable, no `/auth/me`, no Switch/Tweaks/`window.HP` mock). Optimistic
marking hooks unchanged vs main.

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | PASS |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

## Findings

### F1 — List enrichment reads full mark history per habit (unbounded)

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Performance
- **Location**: apps/habits-api/src/habits/habits.service.ts:62-66
- **Detail**: The plan's Contract (plan.md:173) said `recentMarks` comes from "a bounded `mark.findMany` over the 7-day range." The code instead runs one unbounded `findMany({ where: { habitId } })` (full history) and filters the 7-day strip in memory. This is deliberate and documented in a code comment: the streak engine needs full history anyway, so the same rows feed both, keeping the per-habit query count unchanged (no new N+1). The plan's own Performance Considerations (plan.md:59, 363) explicitly sanction the full read. Query is user-scoped; zero-mark habits handled; covered by the new spec. Diverges from one plan line, consistent with another, and is the more efficient option.
- **Fix**: Reword plan.md:173 to describe the full-history-reuse approach (the streak genuinely needs full history, so a 7-day bound can't serve it without a second query or a denormalized streak — both worse at this scale).
- **Decision**: FIXED — reworded plan.md:173 to describe a single full-history read reused for both streak and strip, citing Performance Considerations.

### F2 — Two benign files not named in the plan

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: apps/web/src/features/habits/components/Dashboard.tsx, apps/web/src/shared/lib/toast.ts + ToastHost.tsx
- **Detail**: Plan said `_authed/app.tsx` renders TodayHero + Sections directly; impl extracts a thin `Dashboard.tsx` (route is a 6-line shim) — keeps the route thin per apps/web/CLAUDE.md. Plan named one `toast.tsx`; impl split it into `toast.ts` (store) + `ToastHost.tsx` (host). Both are cleaner factorings, functionally equivalent, no scope/product surface added. (Favicon assets from side commit 8aac431 are likewise benign.)
- **Fix**: Accept — optionally update the plan's file list as an addendum.
- **Decision**: SKIPPED — accepted as-is; benign file factoring, no scope change.

### F3 — Minor ARIA polish on Segmented + negative HabitCard control

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency / Accessibility
- **Location**: apps/web/src/shared/components/Segmented.tsx:23-32, apps/web/src/features/habits/components/HabitCard.tsx:74
- **Detail**: Segmented modeled mutually-exclusive options as an `aria-pressed` button group rather than `role="radio"`/`aria-checked` — a valid pattern, just less precise. The NEGATIVE non-daily HabitCard logbtn aria-label ("Log a {name} session") didn't carry the clean/negative distinction the daily markdot path does.
- **Fix**: Give Segmented radiogroup semantics + mirror the negative wording on the logbtn label.
- **Decision**: FIXED — Segmented converted to `role="radiogroup"`/`role="radio"` with `aria-checked`, roving tabindex, and Arrow/Home/End keyboard navigation; CSS selector updated `aria-pressed`→`aria-checked`; Segmented.test.tsx updated to radio semantics + a new arrow-key test. HabitCard logbtn aria-label now reads "Log {name} clean/done this week/month".

### F4 — Dead CalendarSpan type members after the calendar rewrite

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency / Dead code
- **Location**: apps/web/src/features/habits/types.ts:66
- **Detail**: `CalendarSpan = '3' | '6' | '12' | 'all'`, but the deleted SpanControl was the only user of 3/6/12; the rewritten calendar only ever passes `'all'` (HabitDetail.tsx:55). The numeric members were dead.
- **Fix**: Drop CalendarSpan and simplify calendarQueryRange.
- **Decision**: FIXED — removed the `CalendarSpan` type, simplified `calendarQueryRange()` to take no args (it always returned the all-range), and updated both call sites (HabitDetail.tsx + HabitDetail.test.tsx), dropping the now-unused `currentMonth` import.
