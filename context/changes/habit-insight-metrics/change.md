---
change_id: habit-insight-metrics
title: Habit insight metrics
status: implemented
created: 2026-06-04
updated: 2026-06-04
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

### 2026-06-04 — Best-streaks view refinement (post-plan, user-directed)

During Phase 3 manual review the user changed two best-streaks decisions from the original plan/PRD:

- **Display order: longest-first, not most-recent-first.** The top 10 now sort by `(length desc, start desc)` for both selection and display — a single sort. Ties break toward the more recent streak (confirmed with the user). FR-015 + roadmap S-03 updated (both previously said "ordered chronologically (most recent first)").
- **Active-streak pinning + proportional bars.** The view renders proportional centered bars (width ∝ length). The active streak is highlighted in place when it ranks in the top 10, or **pinned distinctly below** the leaderboard (dashed, with a "N <unit> to crack the top 10" nudge) when it's too short to rank — so current progress stays visible without distorting the all-time leaderboard.

Backend impact: `computeMetrics` now returns `currentRun: {start,end,length} | null` (the active run regardless of top-10 rank) alongside `bestStreaks`, so the SPA can pin it. This reopened the Phase-1 metrics contract (additive field + tests).

### 2026-06-04 — Best-streaks layout fix (mobile + true proportionality)

Follow-up after preview review: the first cut wedged the bar between flanking dates and used `min-w-fit`, which on a narrow mobile track floored every bar near its label width — and the active run's "Current" badge inflated its floor so the 4-day current bar rendered *wider* than longer runs. Reworked to a **stacked** layout: a label line (date range · length · "Current" badge) above a **full-width track with a proportional fill** (`width = length / maxLength`). Fill width is now exactly proportional at every screen size; the bar is purely visual (no in-bar text), so it never floors. Date ranges share the year when both ends match ("Apr 21 – Apr 30, 2026"). Not centered anymore — full-width bars read better on mobile.
