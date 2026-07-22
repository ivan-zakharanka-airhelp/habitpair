# Full Habit History (Beyond 24 Months) — Plan Brief

> Full plan: `context/changes/user-can-see-whole-period/plan.md`

## What & Why

Users reported that habit history shows only the last 2 years — even after clicking "View full history" — and asked whether statistics cover whole history. Investigation confirmed the history bug (a frontend-only fixed 24-month fetch window) and cleared the stats concern (metrics already read all marks unbounded). This change makes both history surfaces reach the entire habit history and adds a regression test locking the whole-history stats behavior.

## Starting Point

The detail page fetches one fixed 24-month window; month navigation and the "View full history" sheet both clamp to it, so older marks are unreachable. The backend already supports paging (arbitrary `from`/`to`, 36-month per-request cap, `firstMarkDate` anchor in every response) — the SPA just never pages. Statistics (`getMetrics`) read all marks with no date filter; only "rolling consistency" is windowed, by design, as a recent-trend metric.

## Desired End State

The main calendar's prev arrow steps back through all of history (and before the first mark, for backfill), with older pages prefetched so navigation stays instant. The full-history sheet auto-scrolls back to the very first mark, then offers "Load earlier months" for pre-anchor backfill. Marks in any month, however old, can be cycled with the same instant optimistic feedback as today. A backend spec fails if metrics ever stop counting old marks.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) |
| --- | --- | --- |
| Which surfaces reach full history | Sheet + main calendar nav | No surface should ever truncate history (user override of sheet-only recommendation). |
| Fetch strategy | Paged infinite fetch, 24-month pages | Matches the backend's designed paging contract and loads only what's viewed. |
| Old months interactivity | Fully interactive everywhere | Consistent UX; old data stays correctable (calendar-anchored backfill principle). |
| Nav loading behavior | Prefetch near the loaded edge | Stepping almost never waits; calm, no new loading UI. |
| History floor | Auto-load to first mark, manual "Load earlier months" beyond | Preserves pre-anchor backfill without unbounded empty auto-scroll. |
| Statistics | No code change + regression test | Verified already whole-history; the test prevents silent future windowing. |
| Testing depth | Vitest unit + component only | Fast and colocated; browser E2E deferred to a possible `/10x-e2e` follow-up. |

## Scope

**In scope:**
- Paged (infinite) calendar query + page math + merged view (frontend)
- Main calendar unbounded nav with edge prefetch
- Sheet auto-paging to anchor + manual pre-anchor loading
- `useCycleMark` rework for the paged cache
- Backend specs locking unbounded metrics reads

**Out of scope:**
- Any backend/API/schema change
- Changes to statistics computation or the rolling-consistency window
- Playwright E2E; sheet virtualization; dashboard/list view changes

## Architecture / Approach

One infinite query per habit keyed `['habits', habitId, 'calendar', today]`; page *p* covers the 24 months ending 24×p months before now (page 0 ≡ today's fetch). Pages merge client-side into the exact response shape components already consume (record/Set unions are idempotent at page seams). Both surfaces call `fetchNextPage`: the calendar prefetches ~6 months before its loaded edge; the sheet's existing IntersectionObserver sentinel fetches until the anchor month renders, then becomes a manual button. The cycle mutation patches the page containing the edited date inside `InfiniteData`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Paged data layer | Infinite query + merge + mutation rework, zero visible change | Optimistic patch targeting the wrong page |
| 2. Full-history surfaces | Unbounded nav + auto/manual sheet paging + component tests | Prefetch/arrow gating edge cases near the loaded floor |
| 3. Stats regression lock | Backend specs guarding unbounded metrics reads | None (test-only) |

**Prerequisites:** local stack (`make up`) and a way to seed old marks (Prisma Studio).
**Estimated effort:** ~2 sessions; Phase 1 is the bulk, Phase 3 is small.

## Open Risks & Assumptions

- Invalidation after each mark-cycle refetches all loaded pages — fine at 1–3 pages; revisit if users hold many pages.
- Assumes `HabitDetail.test.tsx` mocking migrates cleanly to the paged query shape.
- Pre-anchor months render empty by design (backfill affordance) — confirm this reads as intentional, not broken, during manual review.

## Success Criteria (Summary)

- A habit with 3-year-old marks shows them in both the sheet and main navigation, and they can be cycled.
- No visible change to the ≤24-month experience.
- Backend specs fail if metrics reads ever become date-windowed.
