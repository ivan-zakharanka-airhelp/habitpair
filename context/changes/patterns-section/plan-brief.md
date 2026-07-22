# Patterns Section — Plan Brief

> Full plan: `context/changes/patterns-section/plan.md`
> Design: `context/changes/patterns-section/design.html` (decoded Claude design export)

## What & Why

Add the designed **Patterns** section to the Habit Detail screen: a bar chart of completion bucketed by Weekday / Month / Year with an auto-generated insight sentence ("Strongest on Monday (85%); you slip most on Wednesday (40%)."). This is the product's core promise — the app doesn't just count streaks, it shows *why* you slip.

## Starting Point

No patterns feature exists. Habit Detail already composes Metrics → Calendar → Best Streaks from server-computed data, and the metrics endpoint already reads the habit's full mark history on every request through a pure, well-tested engine (`computeMetrics` / `classifyPeriods`) that knows about computed misses.

## Desired End State

Between the calendar and Best Streaks, a habit shows a Patterns card: segmented Weekday/Month/Year switch (choice persists), proportional bars with value labels, the weakest slot tinted miss-red, partially-covered periods striped with a legend, and a one-line insight naming the strongest and weakest slots. Hidden until the habit has its first mark.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Where aggregation runs | Extend `GET /metrics` response | Metrics already does the unbounded full-history read — one request, one engine, no new endpoint | Plan |
| Miss semantics (daily) | Include server-computed misses | Users rarely mark MISSED explicitly; explicit-only math would show ~100% everywhere and kill the insight | Plan |
| Weekly/monthly habits | Session counts, as designed | The design fully specifies this mode; period-rate semantics for weekday buckets would be invented | Design |
| View persistence | Global localStorage key (`hp_pat_view`) | Matches the design and the "I like looking at weekdays" mental model; trivial | Design |
| Testing depth | Aggregation-heavy backend, light frontend | The risk lives in the date math, not the divs — mirrors how metrics is tested | Plan |
| Presentation split | Buckets on server, rendering/insight on client | Matches the app's existing semantic/presentation boundary (calendar, metrics) | Plan |

## Scope

**In scope:**
- Pure `computePatterns` engine in habits-api + `patterns` field on the metrics response
- `HabitPatterns` component, chart CSS, Habit Detail wiring
- Jest specs for aggregation semantics; one Vitest component test

**Out of scope:**
- New endpoints or client-side full-history fetches
- Period-success rates for weekly/monthly habits (`failedPeriods` stays unused here)
- Per-habit view persistence, chart libraries, changes to any other screen

## Architecture / Approach

Backend computes **bucket facts** — `{done, total, partial}` per weekday (7, Mon-first), month (12), and year — by aggregating the existing `classifyPeriods` output for daily habits (so pattern rates can never disagree with the calendar) and COMPLETED-mark counts for weekly/monthly. It rides the existing metrics request: same Prisma read, additive response field. The frontend ports the design's presentation (normalization, peak/miss tones, insight copy, CSS) into one new component.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend buckets | `patterns` on the metrics response + specs pinning semantics | Partial-flag boundary math (spans vs calendar instances) |
| 2. Frontend component | `HabitPatterns` rendered on Habit Detail, styled per design | CSS token drift between design and app `styles.css` |

**Prerequisites:** none — local `make up` stack suffices.
**Estimated effort:** ~2 sessions, one per phase.

## Open Risks & Assumptions

- The design's theme tokens (`--miss`, `--surface-2`, `--radius-sm`, …) are assumed to exist in the app's `styles.css`; Phase 2 verifies each and substitutes equivalents where names drift.
- COUNT-mode partial flags use the design's first→last-mark span, which can under-flag gaps in the middle of a habit's history — accepted as design-faithful.

## Success Criteria (Summary)

- A daily habit's weekday chart visibly reflects computed misses (an habitually-skipped weekday shows a lower, miss-tinted bar) and the insight sentence names it.
- View switching persists across reloads; weekly habits show session counts; habits with no marks show no section.
- All backend/frontend tests, lint, and typecheck gates pass (`npm test -w @habitpair/habits-api`, web test/lint/typecheck).
