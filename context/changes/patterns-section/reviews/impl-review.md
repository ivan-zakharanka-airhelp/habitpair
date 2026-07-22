<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Patterns section

- **Plan**: context/changes/patterns-section/plan.md
- **Scope**: Full plan (Phases 1–2 of 2)
- **Date**: 2026-07-22
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

- Drift scan: 8/8 planned changes MATCH (commits c8b8d65, ba62fdb, 4be0fa3). One EXTRA — `HabitDetail.test.tsx` fixture gained `patterns: null`, a required typecheck fix, not scope creep. All "NOT doing" guardrails honored.
- Automated criteria re-run at review time: web Vitest 50/50, habits-api Jest 100/100, `tsc -b` clean, `eslint .` clean.
- Manual criteria: all 5 checked in Progress, each backed by browser evidence gathered before the phase gate (placement between calendar and Best streaks, miss tinting, partial stripes, view persistence, empty-state absence, mobile light mode, zero console errors).
- One sub-agent WARNING dismissed after verification: claimed localStorage bleed between tests in `HabitPatterns.test.tsx`, but `apps/web/src/test/setup.ts:24-26` stubs a fresh in-memory localStorage before every test.

## Findings

### F1 — Unstated non-empty-marks invariant

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/habits-api/src/marks/patterns.ts:67
- **Detail**: Span derivation reads `marks[0].date` without a guard. Unreachable today — `computePatterns` returns null earlier when there are no marks — but the invariant is implicit, so a future refactor of the early return could break it silently.
- **Fix**: One-line comment at the read stating the non-empty invariant (or none — current code is correct).
- **Decision**: FIXED — invariant comment added at patterns.ts:67; habits-api tests 100/100.

### F2 — Inverted-span edge when anchor date equals today

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/habits-api/src/marks/patterns.ts (partial-flag span)
- **Detail**: When the first mark lands today, the covered span is a single day; partial flags resolve conservatively (everything partial), which is correct behavior. Noted only because the edge is untested.
- **Fix**: Optionally add a one-case test pinning the first-day behavior; no code change needed.
- **Decision**: FIXED — inverted-span test added to patterns.spec.ts; passed first run (15/15), behavior confirmed correct.

### F3 — Optional-prop gating differs from sibling components

- **Severity**: 👁 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/web/src/features/habits/components/HabitPatterns.tsx
- **Detail**: HabitPatterns accepts `metrics: HabitMetricsResponse | undefined` and gates rendering internally; siblings like BestStreaks take required props and let the parent gate. Minor stylistic divergence — the internal gate also encodes the "null before first mark" rule, arguably the component's own concern.
- **Fix**: Leave as-is, or move the gate into HabitDetail and make the prop required to match siblings.
- **Decision**: FIXED — gate moved to HabitDetail (`{metricsQuery.data ? <HabitPatterns …/> : null}`), prop made required; typecheck/tests/lint green, browser-verified identical rendering.
