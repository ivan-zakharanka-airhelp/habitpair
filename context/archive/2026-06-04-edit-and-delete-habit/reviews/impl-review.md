<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Edit and Delete Habit

- **Plan**: context/changes/edit-and-delete-habit/plan.md
- **Scope**: Full plan (Phases 1-3 of 3)
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

## Success Criteria (all re-run on review)

- habits-api unit: 83 passed (5 suites)
- habits-api e2e: 28 passed (incl. 6 PATCH + 2 DELETE cases — immutability 400s, whitespace 400, cross-user 404, delete cascade + list removal)
- habits-api build (`nest build`) + lint: clean
- web typecheck (`tsc -b`) + lint: clean
- web tests (Vitest): 21 passed
- Manual 3.4-3.8: verified in browser preview; observable in diff (no rubber-stamping)

## Notes

- **Benign extras (not scope creep):** an additional "trims the name on edit" e2e test; the in-form "frequency can't be changed" hint; the richer delete-confirm message ("…and all its marks"). All serve the planned feature; no "What We're NOT Doing" guardrail was violated.
- **Broad `['habits']` invalidation** in `useUpdateHabit`/`useDeleteHabit` (vs `useCreateHabit`'s exact `['habits', today]`) is intentional and more correct — it also drops the per-habit calendar/metrics caches. Not a finding.
- The three areas worth scrutiny — cross-user ownership (`assertOwned`, applied to both `update` and `remove`, 404-not-403), the `onDelete: Cascade` delete, and the native `<dialog>` open/close effect — are all correct.

## Findings

### F1 — Whitespace-only name relies on the server backstop

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/web/src/features/habits/components/HabitDetail.tsx:73-84
- **Detail**: HTML5 `required` blocks an empty name but not a whitespace-only one ("   "). It submits, the server trims to empty and returns 400, surfaced via `role="alert"`. Safe (server backstop is e2e-tested) and identical to `CreateHabitForm`'s existing behavior — parity, not a regression. Only cost is one avoidable round-trip.
- **Fix (optional)**: trim `editName` client-side before `mutate`, or accept parity with `CreateHabitForm` and leave as-is.
- **Decision**: SKIPPED (optional polish; user chose save-only)

### F2 — ConfirmDialog has no aria-labelledby tying it to its title

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/web/src/shared/components/ConfirmDialog.tsx
- **Detail**: Navbar/forms elsewhere use `aria-labelledby`/`aria-label`. The native modal is largely fine without it, but tying the `<dialog>` to its `<h2>` (and the message via `aria-describedby`) is the a11y-complete version.
- **Fix (optional)**: add an `id` to the `<h2>` and `aria-labelledby` on the `<dialog>`.
- **Decision**: SKIPPED (optional polish; user chose save-only)

### F3 — Local `updateHabit` mutation var shadows the transport fn name

- **Severity**: 🔵 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/web/src/features/habits/components/HabitDetail.tsx:39
- **Detail**: `const updateHabit = useUpdateHabit(...)` (a mutation object) shares a name with the imported `updateHabit` transport function (api/habits.ts:40). Different scopes, no collision — and it mirrors the existing `useCreateHabit`/`createHabit` shadow, so it's consistent either way.
- **Fix (optional)**: rename the locals to `updateMutation`/`deleteMutation`.
- **Decision**: SKIPPED (optional polish; user chose save-only)
