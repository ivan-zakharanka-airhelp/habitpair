# Habit Calendar and Backfill (S-02) — Plan Brief

> Full plan: `context/changes/habit-calendar-and-backfill/plan.md`
> Research inputs: `calendar-library-review.md`, `react-day-picker-v10-cheatsheet.md` (same folder)

## What & Why

Add a habit-detail page with a **multi-month calendar** that shows each habit's **success/failure pattern** and lets the user **retroactively change any past day** (PRD US-03, FR-010/011/012). This calendar is the product's core differentiator — answering "why do I fail when I fail?" — so it lands before the numeric metrics (S-03).

## Starting Point

S-01 (merged) already ships the full data model (`Habit` + `Mark` with `@@unique([habitId, date])`), the centralized UTC date helpers (`apps/habits-api/src/marks/period.ts`), and — critically — a write path (`PUT`/`DELETE /habits/:habitId/marks/:date`) that already accepts **arbitrary dates** and `MISSED`. The frontend habits feature exists, but there is **no detail route** and **no date library**.

## Desired End State

From the list, clicking a habit opens its detail page. A calendar shows 3 months by default (selectable 3 / 6 / 12 / All), Monday-first ISO, navigable backward without limit (prev/next + a month-year jump, anchored to the calendar so months *before* the first mark are reachable), with green ✓ completed days, red ✗ missed days (explicit + *computed* past-unmarked for daily habits), a period-level tint on closed weeks/months that fell under target, a today marker, and nothing flagged as failure before the habit's first mark. Clicking any past day cycles unmarked → completed → missed → unmarked.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Calendar library | react-day-picker v10 | Best turnkey fit; `modifiers`/`ISOWeek`/`numberOfMonths` map onto the requirements; bundles date-fns@4. | Research |
| "Missed" rendering | Computed pattern, not just stored | User wants the failure pattern visible, anchored at the first mark, with backfill counting from the backfilled day. | Plan |
| Anchor | Habit's first recorded mark | No "sea of red" before tracking began; backfilling moves the anchor back. | Plan |
| Non-daily failure | Period-level indicator, never day crosses | A 2×/week habit done Sat+Sun must not cross the other weekdays; only a closed under-target period is flagged. | Plan |
| Streak numbers/pills | Deferred to S-03 | This slice builds only the per-day/period success primitive S-03 reuses. | Plan |
| Recompute seam | None (compute-on-read) | S-01 materializes nothing, so there is nothing to recompute; documented divergence from the roadmap note. | Plan |
| Compute site | Backend read-model endpoint | Keeps all date/period/DST math in `period.ts` (single source of truth); avoids client period logic. | Plan |
| Read API | Single `GET …/calendar?from=&to=` (range) | One request serves the multi-month view; meta + computed read-model in one payload. | Plan |
| View span | Presets 3 / 6 / 12 / All, default 3 | User wants several months at once, up to a year+, in one screen. | Plan |
| Window navigation | Prev/next + month-year jump, calendar-anchored, unbounded back | Backfilling a day older than the window (or before the first mark) must be reachable — FR-010 "no time-window restriction." | Plan |
| Large spans | Fixed-size window (only N months mount) + Set lookup; 24mo cap on "All" | Unbounded back-reach without virtualization; React Compiler covers memoization. | Plan |
| Retroactive interaction | Click-cycle (3 states) | Matches the cheatsheet's `onDayClick` pattern and extends S-01's toggle idiom. | Plan |
| Open detail from list | Row info links; mark-button stays | Preserves S-01's one-tap daily check-in. | Plan |
| Tests | Backend thorough; frontend light | Logic lives in the backend; matches S-01's frontend stance. | Plan |

## Scope

**In scope:** detail route; range calendar endpoint + computation in `period.ts`; multi-month react-day-picker UI with span control; per-day + period coloring; 3-state retroactive cycle reusing existing writes; list-row link; backend unit + e2e tests.

**Out of scope:** streak numbers/pills + metrics (S-03); recompute seam / materialized stats; any new write endpoint; edit/delete (S-04); infinite scroll / virtualization; new frontend Vitest specs.

## Architecture / Approach

Backend computes a read-model — stored marks (cycle source + ✓/explicit-✗ coloring) kept **separate** from computed coloring (daily computed-missed dates; failed closed-period ranges) — so the SPA never re-derives period logic. `GET /habits/:habitId/calendar?from=&to=` returns it for the visible range. The SPA renders via react-day-picker (`ISOWeek`, `numberOfMonths`, `disabled={{ after: today }}`, modifiers from `Set`s keyed by **local** `YYYY-MM-DD`, custom `DayButton` for ✓/✗). Retroactive clicks cycle the **stored** mark through the existing `PUT`/`DELETE` endpoints with optimistic cache updates. The view renders a fixed-size month window positioned by a calendar-anchored navigator (prev/next + month-year jump, unbounded back), so only N months mount no matter how far back the user goes.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend read-model | `period.ts` computation + `GET …/calendar` + unit & e2e tests | Frequency-aware period rules + UTC/DST correctness (the hard part) |
| 2. Read-only calendar UI | Detail route, multi-month calendar, span + window-nav controls, list link | Date off-by-one (local vs UTC keys); navigation must be calendar-anchored (reach before first mark); multi-month layout |
| 3. Retroactive marking | 3-state cycle on existing writes + optimistic updates | Cycle must key off stored mark, not displayed color; cross-cache invalidation |

**Prerequisites:** S-01 merged (done). No infra/access needed.
**Estimated effort:** ~3 sessions, one per phase.

## Open Risks & Assumptions

- Pulling S-03's period-success computation forward into S-02 brings the timezone/DST NFR into this slice — mitigated by keeping all date math in `period.ts` and testing the round-trip.
- The period-level failure indicator on a day grid is custom (beyond per-cell modifiers) — a small bespoke rendering touch in Phase 2.
- "All" is soft-capped at 24 months for rendering; reaching further back uses prev/next + the month-year jump (a fixed-size window), so reach is unbounded even though simultaneous rendering is capped.
- Diverges from the roadmap's "trigger downstream recompute" note by design — documented so S-03 owns any future seam.

## Success Criteria (Summary)

- User opens a habit's detail and sees an accurate, multi-month success/failure pattern, Monday-first, anchored at first mark.
- User changes any past day's status retroactively and it persists, recomputes, and keeps the list consistent.
- Backend unit + e2e prove the computation and endpoint across daily/weekly/monthly; frontend builds clean and is manually verified.
