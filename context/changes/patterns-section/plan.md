# Patterns Section Implementation Plan

## Overview

Add the designed **Patterns** section to the Habit Detail screen: a bar chart of habit completion bucketed by **Weekday / Month / Year** (segmented control, choice persisted), with an auto-generated insight sentence ("Strongest on Monday (85%); you slip most on Wednesday (40%)."), partial-period striping, weakest-slot highlighting, and a caption/legend. The section delivers the product's core promise — *see the pattern behind your misses* — beyond the calendar grid.

Design source of truth: `context/changes/patterns-section/design.html` (decoded export of the Claude design). Relevant regions:
- CSS: lines 779–813 (`.patterns` / `.pat__*` block)
- Logic + component: lines 2235–2430 (`computePatterns`, `buildPatView`, `patInsight`, `HabitPatterns`)
- Placement: line 3226 (`HabitDetailScreen` renders it between `HabitCalendar` and `BestStreaks`)

## Current State Analysis

- **No patterns feature exists** anywhere — no routes, endpoints, or components.
- **Habit Detail** ([HabitDetail.tsx:134](apps/web/src/features/habits/components/HabitDetail.tsx)) composes `HabitMetrics` → `HabitCalendar` → `BestStreaks`, each receiving server-computed data.
- **The metrics endpoint** (`GET /habits/:habitId/metrics?today=`) already does an **unbounded full-history read** of marks ([habits.service.ts:169-192](apps/habits-api/src/habits/habits.service.ts)) and delegates to the pure engine `computeMetrics` ([metrics.ts:77](apps/habits-api/src/marks/metrics.ts)).
- **`classifyPeriods`** ([metrics.ts:124](apps/habits-api/src/marks/metrics.ts), exported) already classifies every day since the anchor as success/failure/pending for DAILY habits — computed misses (unmarked closed days) are failures, unmarked today is pending. This is exactly the semantic base the pattern rates need.
- **The design's client-side `computePatterns`** counts only explicit `COMPLETED`/`MISSED` marks. That diverges from the real app in two ways: (a) the calendar endpoint is windowed, so the client never holds full history; (b) real users rarely mark `MISSED` explicitly — misses are computed server-side. Following the design's code literally would show inflated ~100% rates.
- **UI building blocks exist**: `Segmented` (radiogroup with `{value,label}` options, [Segmented.tsx](apps/web/src/shared/components/Segmented.tsx)), `spark` icon ([Icon.tsx:48](apps/web/src/shared/components/Icon.tsx)), section-header pattern in `BestStreaks`, single-file `styles.css` (Tailwind v4 + BEM-like custom classes; the design's chart is pure CSS grid + divs — no chart library needed or wanted).
- **Testing conventions**: backend pure-engine specs colocate in `marks/` (`metrics.spec.ts`, `period.spec.ts`, Jest); frontend component tests colocate as `*.test.tsx` (Vitest + Testing Library).

## Desired End State

A habit's detail page shows a Patterns section between the calendar and Best Streaks:

- Header: spark icon + "Patterns" title + Weekday/Month/Year segmented control.
- Card: insight sentence, proportional bar chart with value labels, axis labels, caption with metric label and a "Partial" legend swatch when applicable.
- Daily habits show **completion rates** (computed misses count as misses, unmarked today excluded); weekly/monthly habits show **session counts**.
- Weakest complete weekday/month bucket is tinted miss-red (rate mode only, when a strict min exists); the peak bucket's label is emphasized; partially-covered month/year buckets are striped.
- View choice persists globally in localStorage (`hp_pat_view`); the section is hidden until the habit has its first mark.

Verify by: automated tests below + loading a seeded habit's detail page locally.

### Key Discoveries:

- `classifyPeriods` is exported and already encodes the calendar-consistency invariant (daily failures = explicit MISSED ∪ computed-missed) — pattern buckets for daily habits should aggregate its output, not re-derive mark logic ([metrics.ts:124-152](apps/habits-api/src/marks/metrics.ts)).
- `getMetrics`' unbounded read means patterns ride the same request and Prisma query — zero new I/O ([habits.service.ts:177-183](apps/habits-api/src/habits/habits.service.ts)).
- The design's `buildPatView` / `patInsight` (design.html:2274–2374) are pure presentation (normalization, peak/miss tones, sentence copy) — they stay client-side, ported nearly verbatim.
- `HabitMetricsResponse` is mirrored by hand in [types.ts:82](apps/web/src/features/habits/types.ts) — extend both sides in lockstep.
- React Compiler is on — port the design's `useMemoCal` calls as plain inline computation, no `useMemo`.

## What We're NOT Doing

- No new endpoint and no client-side full-history marks fetch (decided: extend `GET /metrics`).
- No period-success-rate mode for weekly/monthly habits (`failedPeriods` stays unused here); they get session counts as designed.
- No per-habit view persistence — one global localStorage key.
- No changes to the Dashboard, habit list, calendar, or metrics cards.
- No chart library.
- No exhaustive frontend tests of every insight-copy variant (decided: aggregation-heavy backend tests, light component test).

## Implementation Approach

Split along the app's existing semantic/presentation boundary: the backend computes **bucket facts** (done/total per weekday/month/year, partial flags, mode) inside the existing metrics read, reusing `classifyPeriods` so pattern rates can never disagree with the calendar or consistency metrics. The frontend ports the design's presentation layer (normalization, tones, insight sentence, chart markup, CSS) into a new `HabitPatterns` component wired into Habit Detail.

## Critical Implementation Details

- **Evaluated span for partial flags.** RATE mode (daily): the evaluable span is `[anchor, today − 1]` — today is pending and never counts. COUNT mode (weekly/monthly): the design uses `[first mark, last mark]` (design.html:2280-2289); keep that. A month bucket is *partial* unless at least one full calendar instance of that month is covered by the span; a year bucket is partial unless the whole year is covered. Weekday buckets are never partial.
- **Pending exclusion.** For daily habits, aggregate only non-`pending` classified periods. An unmarked today must not appear in any bucket (mirrors the "in-progress never penalizes" rule at [metrics.ts:94-98](apps/habits-api/src/marks/metrics.ts)).
- **Weekday indexing is Monday-first** (`(getUTCDay() + 6) % 7`), matching the design's `dowMon` and the app's ISO-week convention. All date math uses the UTC getters from `period.ts` helpers — no `new Date(string)` on date-only values.

## Phase 1: Backend — Pattern Buckets in the Metrics Response

### Overview

Add a pure `computePatterns` engine beside `computeMetrics`, merge its output into the `GET /habits/:habitId/metrics` response, and pin the semantics with Jest specs.

### Changes Required:

#### 1. Pattern aggregation engine

**File**: `apps/habits-api/src/marks/patterns.ts` (new)

**Intent**: Pure module (no Prisma, no Nest — mirrors `metrics.ts`) that buckets a habit's history by weekday, month-of-year, and year. Daily habits: aggregate `classifyPeriods` output (excluding `pending`) so computed misses count; `done` = successes, `total` = closed periods in the bucket. Weekly/monthly habits: count `COMPLETED` marks by the mark's date (`done` = sessions; `total` = `done`). Compute partial flags per the Critical Implementation Details.

**Contract**: `computePatterns(input: MetricsInput): HabitPatterns | null` — returns `null` when there is no anchor. This payload shape is the cross-phase contract the frontend mirrors:

```ts
export interface PatternBucket {
  done: number;
  total: number;
  partial: boolean;
}
export interface HabitPatterns {
  mode: 'RATE' | 'COUNT';           // RATE for DAILY, COUNT for WEEKLY/MONTHLY
  weekday: PatternBucket[];         // length 7, Monday-first; partial always false
  month: PatternBucket[];           // length 12, January-first
  year: Array<{ year: number } & PatternBucket>; // ascending, only years with history span
}
```

#### 2. Merge into the metrics read

**File**: `apps/habits-api/src/habits/habits.service.ts`

**Intent**: `getMetrics` returns `{ ...computeMetrics(input), patterns: computePatterns(input) }` — same `MetricsInput`, same single Prisma read, no controller/DTO changes (the route and query validation are untouched).

**Contract**: Response gains a `patterns` field; all existing fields are unchanged (additive, non-breaking).

#### 3. Aggregation specs

**File**: `apps/habits-api/src/marks/patterns.spec.ts` (new)

**Intent**: Mirror the style of `metrics.spec.ts` (fixture marks → assertions on the pure function). Cover: computed misses lower the weekday rate (unmarked closed days are failures); unmarked today is excluded from every bucket; explicit MISSED counts as a miss; month/year partial flags (habit anchored mid-month/mid-year → partial; a fully covered instance → not partial); COUNT mode for weekly/monthly (sessions bucketed by mark date, partial from first→last mark span); no-anchor → `null`; year list ascending and spanning only tracked years.

**Contract**: `computePatterns` behavior is pinned; the calendar-consistency invariant extends to patterns (a day the calendar colors as a miss lowers its weekday's rate).

### Success Criteria:

#### Automated Verification:

- Backend tests pass: `npm test -w @habitpair/habits-api`
- Lint passes: `make lint`
- Backends build (typecheck): `make build`

#### Manual Verification:

- `curl 'localhost:3001/habits/<id>/metrics?today=YYYY-MM-DD' -H 'Authorization: Bearer <jwt>'` returns a `patterns` object with plausible buckets for a seeded daily habit (note: local URLs have no `/api` prefix).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Frontend — HabitPatterns Component

### Overview

Mirror the new payload in the SPA types, port the design's presentation into a `HabitPatterns` component + CSS, wire it into Habit Detail, and cover it with a light component test.

### Changes Required:

#### 1. Mirror the payload type

**File**: `apps/web/src/features/habits/types.ts`

**Intent**: Add `PatternBucket` / `HabitPatterns` interfaces (matching the Phase 1 contract verbatim) and a `patterns: HabitPatterns | null` field on `HabitMetricsResponse`, with the usual "mirrors habits-api" comment style.

**Contract**: `HabitMetricsResponse.patterns` — same shape as the backend `HabitPatterns` export.

#### 2. Patterns component

**File**: `apps/web/src/features/habits/components/HabitPatterns.tsx` (new)

**Intent**: Port the design's `HabitPatterns` + `buildPatView` + `patInsight` (design.html:2274–2430) onto the server-computed buckets: normalization to bar fractions, peak emphasis, weakest-solid-bucket miss tone (rate mode, weekday/month views only, only when a strict min < max exists), display strings (`85%` / counts / `–` for empty buckets), tooltips, insight sentence copy, metric-label caption, and the "Partial" legend swatch. Header uses the `BestStreaks` section-header pattern (spark `Icon` + title) with `Segmented` for Weekday/Month/Year. View choice reads/writes localStorage key `hp_pat_view` (try/catch-wrapped like the design's `patLs`, validated against the three values). Returns `null` when `firstMarkDate` is null, metrics are still loading, or `patterns` is null. No `useMemo` — React Compiler covers it.

**Contract**: `<HabitPatterns metrics={HabitMetricsResponse | undefined} firstMarkDate={string | null} />` — same prop style as `HabitMetrics` / `BestStreaks`.

#### 3. Chart styles

**File**: `apps/web/src/styles.css`

**Intent**: Port the `.patterns` / `.pat__*` CSS block from design.html:779–813 (chart grid, bar variants `--miss`/`--empty`/`--partial` stripes, value/axis labels, caption, swatch), adapted to the app's existing theme tokens. The design was built against the same token names — verify each `var(--…)` used exists in `styles.css` and substitute the app's equivalent where names differ.

**Contract**: New class block only; no existing selectors change.

#### 4. Wire into Habit Detail

**File**: `apps/web/src/features/habits/components/HabitDetail.tsx`

**Intent**: Render `<HabitPatterns metrics={metricsQuery.data} firstMarkDate={firstMarkDate} />` between `<HabitCalendar …>` and `<BestStreaks …>`, matching the design's placement (design.html:3226).

**Contract**: Composition order becomes Metrics → Calendar → Patterns → BestStreaks.

#### 5. Component test

**File**: `apps/web/src/features/habits/components/HabitPatterns.test.tsx` (new)

**Intent**: Light coverage per the testing decision: renders bars and an insight for a fixture `HabitMetricsResponse` with `patterns`; switching the segmented control to Month re-renders month labels and persists `hp_pat_view` (the test setup already gives each test an in-memory localStorage); renders nothing when `firstMarkDate` is null. Query via roles/text (radiogroup, headings), mirroring existing colocated tests.

**Contract**: New colocated Vitest file; no shared test infra changes.

### Success Criteria:

#### Automated Verification:

- Frontend tests pass: `npm run test -w @habitpair/web`
- Frontend lint passes: `npm run lint -w @habitpair/web`
- Frontend typecheck passes: `npm run typecheck -w @habitpair/web`

#### Manual Verification:

- Patterns section renders on a seeded daily habit's detail page between the calendar and Best Streaks, matching the design (insight, bars, labels, caption).
- Weekday/Month/Year switch works; the choice survives a page reload.
- Daily habit rates reflect computed misses (an unmarked past day lowers its weekday); a weekly habit shows session counts.
- Section is absent for a habit with no marks.
- Dark mode and narrow viewport render correctly (bars shrink via the grid, labels stay legible).

---

## Testing Strategy

### Unit Tests:

- `patterns.spec.ts` (Jest) carries the semantic weight: computed-miss inclusion, pending-today exclusion, partial-flag boundaries (anchored Jan 1 vs mid-year; month covered in a later year), COUNT-mode bucketing, null on no anchor.
- Existing `metrics.spec.ts` / `habits.service.spec.ts` must stay green (additive change).

### Integration Tests:

- None new — the metrics route is already exercised; the response gains one field.

### Manual Testing Steps:

1. `make up`, register/login, create a daily habit, mark a spread of days completed across several weeks (leave some weekdays consistently unmarked).
2. Open the habit detail — verify the insight names the strongest and weakest weekdays and the weakest bar is miss-tinted.
3. Switch to Month and Year — verify partial striping on the current (incomplete) month/year and the legend swatch appears.
4. Create a weekly habit with a few marks — verify session-count mode (counts, not percentages).
5. Reload — view choice persists. Toggle dark mode — chart follows tokens.

## Performance Considerations

`computePatterns` is O(days since anchor) for daily habits — the same order as `classifyPeriods`, which already runs in this request. No added queries, no payload concerns (≤ 21 small bucket objects + one per tracked year).

## Migration Notes

None. The response change is additive; no schema, DTO, or route changes.

## References

- Design: `context/changes/patterns-section/design.html` (CSS 779–813; logic 2235–2430; placement 3226)
- Metrics engine: [apps/habits-api/src/marks/metrics.ts](apps/habits-api/src/marks/metrics.ts)
- Metrics read: [apps/habits-api/src/habits/habits.service.ts:169](apps/habits-api/src/habits/habits.service.ts)
- Sibling section component: [apps/web/src/features/habits/components/BestStreaks.tsx](apps/web/src/features/habits/components/BestStreaks.tsx)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend — Pattern Buckets in the Metrics Response

#### Automated

- [x] 1.1 Backend tests pass: `npm test -w @habitpair/habits-api` — c8b8d65
- [x] 1.2 Lint passes: `make lint` — c8b8d65
- [x] 1.3 Backends build (typecheck): `make build` — c8b8d65

#### Manual

- [x] 1.4 Metrics endpoint returns plausible `patterns` buckets for a seeded daily habit — c8b8d65

### Phase 2: Frontend — HabitPatterns Component

#### Automated

- [x] 2.1 Frontend tests pass: `npm run test -w @habitpair/web`
- [x] 2.2 Frontend lint passes: `npm run lint -w @habitpair/web`
- [x] 2.3 Frontend typecheck passes: `npm run typecheck -w @habitpair/web`

#### Manual

- [x] 2.4 Patterns section renders per design between calendar and Best Streaks
- [x] 2.5 View switch works and persists across reload
- [x] 2.6 Daily rates include computed misses; weekly habit shows session counts
- [x] 2.7 Section absent for a habit with no marks
- [x] 2.8 Dark mode and narrow viewport render correctly
