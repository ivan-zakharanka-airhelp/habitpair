<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Cross-user Isolation + Persisted-correctness Integration Suite

- **Plan**: context/changes/testing-backend-integration-suite/plan.md
- **Scope**: Full plan (Phases 1–4 of 4)
- **Date**: 2026-06-07
- **Verdict**: APPROVED
- **Findings**: 0 critical  0 warnings  3 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | PASS |
| Scope Discipline | WARNING |
| Safety & Quality | PASS |
| Architecture | PASS |
| Pattern Consistency | PASS |
| Success Criteria | PASS |

Both sub-agents reported full MATCH: zero drift, zero missing items, oracle discipline intact (every `expectedFailures` is a literal hand-derived array), no `apps/habits-api/src/**` changes. Automated criteria re-verified: 44/44 e2e, lint clean, both specs present.

## Findings

### F1 — CLAUDE.md changed but not in the plan's Changes Required

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Scope Discipline
- **Location**: CLAUDE.md (+126/-32, committed in 0e06aef p1)
- **Detail**: The diff range includes a 126-line CLAUDE.md edit (the "10xDevs AI Toolkit — Module 3, Lesson 2" framing section) folded into the Phase-1 harness commit. Benign lesson-context documentation, not in the plan's Changes Required, unrelated to the test suite. No code impact.
- **Fix**: None required — accept as benign. For stricter commit hygiene, keep toolkit-doc edits in their own commit rather than folding them into a phase commit.
- **Decision**: SKIPPED

### F2 — Companion assertions beyond the literal plan contract

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Adherence
- **Location**: consistency.e2e-spec.ts:194, :212, :240, :260
- **Detail**: The specs add a few oracle-derived assertions the plan didn't name literally (`currentRun`, `bestStreaks`, `rollingConsistency.numerator`). All are hand-written values consistent with the rule — they strengthen signal and fall within plan intent. Not drift.
- **Fix**: None — keep them.
- **Decision**: SKIPPED

### F3 — The it.each 404 sweep is a one-sided assertion

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: isolation.e2e-spec.ts:97-104
- **Detail**: The sweep asserts non-owner → 404 but doesn't assert the owner gets a non-404 on the same route, so a route that 404s for everyone would pass silently. Net coverage is adequate — owner happy-paths for all six routes live in habits/calendar/metrics.e2e-spec.ts and the consistency spec — so this is a property of the sweep alone, not a coverage gap.
- **Fix**: None required. The existing sibling specs already prove owner success per route.
- **Decision**: SKIPPED
