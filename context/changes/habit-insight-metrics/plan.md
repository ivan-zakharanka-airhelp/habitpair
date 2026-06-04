# Habit Insight Metrics (S-03) Implementation Plan

## Overview

Add the four habit-detail insight metrics from the PRD `## Business Logic` — current streak (FR-013), rolling-window consistency % (FR-014), an adaptive lifetime completion ratio (FR-016), and the top-10 best streaks (FR-015, upgraded on this branch to date-spanned runs). All four are computed **on read** from the habit's stored marks and its (now-immutable) frequency/target, served from a new `GET /habits/:habitId/metrics?today=` endpoint, and rendered on the detail page as a primary metrics strip plus a collapsed best-streaks disclosure.

This is the roadmap's heaviest slice: it builds the frequency-aware period-success + streak + rolling-window engine and must honor the timezone/DST robustness NFR. It carries no database migration — a deliberate MVP decision to **forbid frequency edits** keeps every habit on a single, stable period structure, so streaks derive purely from marks without versioning or a reset seam.

## Current State Analysis

After S-01 (data model + activation) and S-02 (calendar + retroactive marking), both merged:

- **Compute-on-read is the house architecture.** Nothing is materialized. `apps/habits-api/src/marks/period.ts` is the single source of truth for all date/period/DST math, and `HabitsService.getCalendar` ([habits.service.ts:73](apps/habits-api/src/habits/habits.service.ts)) assembles a read-model the SPA renders without re-deriving period logic.
- **`period.ts` already exposes the primitives a metrics engine needs**: `parseDateOnly`/`formatDateOnly`, `startOfIsoWeek`/`startOfMonth`/`endOfIsoWeek`/`endOfMonth` (private but co-locatable), `addUtcDays`, `computedMissedDates` (daily failure classification), and `closedPeriodFailures` (weekly/monthly period classification). All use **UTC getters only** and are DST-tested in `period.spec.ts` (including a DST-window round-trip).
- **The "anchor" concept exists**: `getCalendar` treats the habit's earliest mark date as the anchor — nothing before the first mark is ever a failure. Metrics reuse this exact anchor.
- **Marks are the only state**: `Mark { habitId, date @db.Date, status }` with `@@unique([habitId, date])`. Daily success = an explicit `COMPLETED` mark; weekly/monthly success = `COMPLETED` count ≥ target within the period. `MISSED` marks never count toward completion.
- **Validation convention is settled**: global `ValidationPipe({ whitelist, transform, forbidNonWhitelisted })` ([main.ts:9](apps/habits-api/src/main.ts)) + class-validator DTOs (see `CalendarQueryDto`).
- **Frontend** is a feature module `apps/web/src/features/habits/`: detail route `routes/_authed/habits.$habitId.tsx` → `components/HabitDetail.tsx` (layout: back-link → title → frequency text → `[SpanControl + CalendarNav]` row → `HabitCalendar`). Data fetching uses a query-options factory pattern (`api/calendar.ts`, key `['habits', habitId, 'calendar', from, to, today]`) consumed by `hooks/useHabitCalendar.ts`. Response shapes live in `features/habits/types.ts`. Local-date helpers (`todayLocalISO`, `localKey`, `localDateFromISO`) are in `features/habits/lib/today.ts`; there is no date-fns in app code. Frontend tests are deliberately light — the habits feature has none.
- **PRD conflict to resolve**: FR-007 currently lists **frequency** as an editable field whose change resets the streak. This slice forbids frequency edits in the MVP, so FR-007 and the `## Business Logic` "Structural edit" edge case must be reconciled (and roadmap S-04 narrowed to name/modality/target).

## Desired End State

Opening a habit's detail page shows, directly under the title, a compact strip of three numbers: the **current streak** (in the habit's native unit — days/weeks/months), the **rolling consistency %** over the trailing window (30 days / 8 weeks / 6 months), and the **recent-completion** figure (a raw "X of Y" for the habit's first 14 days of tracking, a percentage afterward). Below the calendar, a **"Best streaks"** section sits collapsed by default; expanding it reveals up to ten dated rows — each a past streak's date span and length — ordered most-recent-first. Retroactively changing any past day (S-02) updates all of these numbers. No metric is ever visible for a never-marked habit, and no best-streak appears on the main surface until the user expands the disclosure.

Verify by: opening a habit with ≥7 days of marks and confirming the strip matches hand-computed values; backfilling a past day and watching the streak/percentage update; expanding best streaks and confirming the top-10-by-length, most-recent-first ordering; and the backend unit + e2e suites passing across daily/weekly/monthly including a DST window.

### Key Discoveries:

- `period.ts` already classifies failures the calendar renders: daily via `computedMissedDates` ([period.ts:96](apps/habits-api/src/marks/period.ts)), weekly/monthly via `closedPeriodFailures` ([period.ts:121](apps/habits-api/src/marks/period.ts)). The metrics engine must classify successes/failures **identically**, or the calendar and the streak would disagree.
- The calendar endpoint is range-based (`from`/`to`) and re-fetches with `keepPreviousData` on every month-nav/span change — the wrong carrier for "as-of-today" and all-history metrics, hence a separate endpoint.
- `closedPeriodFailures` already iterates periods forward with `break` on the open period ([period.ts:150](apps/habits-api/src/marks/period.ts)) — the same iteration shape the streak/best-streak scan needs.
- `HabitsService.getCalendar` is the reference for the per-habit read endpoint: ownership check returns **404 not 403** to avoid leaking habit existence across users ([habits.service.ts:76](apps/habits-api/src/habits/habits.service.ts)).

## What We're NOT Doing

- **No DB migration / no materialization / no caching.** Pure compute-on-read over all of a habit's marks, every request (target scale is "small").
- **No rule-versioning table and no streak-reset seam.** Frequency is immutable in the MVP, so there is exactly one period structure per habit for life. (The `targetCount`/`modality` edit semantics are S-04's problem; `modality` doesn't affect the math, and `targetCount` is a scalar within a fixed structure.)
- **No edit/delete UI** (S-04). This slice only forbids frequency edits in the spec; it does not build the edit form.
- **No changes to the calendar endpoint, the mark write endpoints, or the list endpoint** beyond frontend cache invalidation.
- **No best-streaks bar chart, modal, or sub-page** — a collapsed in-place disclosure with a dated list only.
- **No new frontend test framework or component-test suite** — backend carries the logic tests; frontend stays light (an optional pure formatter unit test only).

## Implementation Approach

A new pure module `apps/habits-api/src/marks/metrics.ts` builds, once, the chronological sequence of period classifications (`success` / `failure` / `pending`) from the anchor period to the current period, reusing `period.ts` boundary helpers. All four metrics derive from that one sequence:

- **Current streak** — walk backward from the current period (a `pending` current period is skipped, not counted; a `success` is counted; a `failure` breaks), counting consecutive successes.
- **Best streaks** — collect every maximal success-run, select the top 10 by length (ties broken by recency), then order those by start-date descending for display.
- **Rolling consistency** — over the trailing window (the N most recent *closed* periods since the anchor), `successes / evaluable-periods`.
- **Recent completion** — over *all* closed evaluable periods since the anchor (unbounded), rendered as a ratio while the habit is < 14 days old, as a percentage after.

`HabitsService.getMetrics` does the ownership check + Prisma reads (all marks for the habit, `{date, status}` ascending) and delegates to `metrics.ts`. A new `GET /habits/:habitId/metrics?today=` route on `HabitsController` returns the read-model. The SPA adds a metrics query factory + hook mirroring the calendar pattern, a `HabitMetrics` strip, and a `BestStreaks` disclosure; mark mutations invalidate the metrics key so retroactive edits refresh the numbers.

## Critical Implementation Details

- **Calendar-consistency invariant (correctness-critical).** A day or period the S-02 calendar colors as a failure MUST count as a failure in the streak, and vice versa. Concretely: daily failures = explicit `MISSED` ∪ `computedMissedDates`; daily successes = explicit `COMPLETED`. Weekly/monthly failures = `closedPeriodFailures`; successes = closed periods with `COMPLETED` count ≥ target. Build the classification on the same rules and add a test asserting agreement with `computedMissedDates` / `closedPeriodFailures` over a shared range.
- **"Today / in-progress never penalizes" (locked semantics).** Daily: today counts only if explicitly `COMPLETED`; an unmarked today neither breaks nor extends (the streak shows through yesterday); an explicit `MISSED` today or any unmarked past day breaks it. Weekly/monthly: the current period counts toward the streak only once it meets target, otherwise it is `pending` (never a failure while open — more completions can still arrive). The displayed streak can therefore tick up mid-period when the current week/month reaches target.
- **Denominators exclude the in-progress current period** and never extend before the anchor. Daily rolling window = the 30 days `[today-30, today-1]` intersected with `[anchor, ∞)`; weekly = the 8 ISO weeks immediately before the current week (≥ anchor week); monthly = the 6 months before the current month (≥ anchor month). Recent-completion uses the same rule but unbounded (all closed periods since the anchor).
- **`denominator == 0` edge.** A habit whose only mark is today (anchor == current period) has zero closed evaluable periods. Return `percent: null` and let the UI render a neutral "—"; do not divide by zero or show "0 of 0". The current streak can still be `1` in this state (today counts) — that combination is expected.
- **Best-streak date spans.** `start` = the first success period's start-of-period date; `end` = the last success period's end-of-period date, **clamped to `today`** so an ongoing run (whose current period boundary is in the future for weekly/monthly) never displays a future end date. `length` is the count of consecutive success periods in the habit's native unit.
- **Top-10 selection vs display order are different sorts.** Select by `(length desc, start desc)` and take 10; then re-sort those 10 by `start desc` for display (most recent first). The ongoing run is included as a normal run.
- **DST / timezone.** All boundary math goes through `period.ts`'s UTC-getter helpers — never `getDate()`/`new Date('YYYY-MM-DD')` without the explicit `Z`. Mirror `period.spec.ts`'s DST-window test in `metrics.spec.ts`.

## Phase 1: Backend metrics engine, endpoint, and spec reconciliation

### Overview

Build the pure metrics computation, expose it on a new endpoint, prove it with thorough unit + e2e tests, and reconcile the PRD/roadmap with the frequency-immutability decision.

### Changes Required:

#### 1. Spec reconciliation — frequency is immutable in MVP

**Files**: `context/foundation/prd.md`, `context/foundation/roadmap.md`

**Intent**: Record the decision that frequency cannot be edited after creation, so the streak engine is single-epoch and FR-007's reset-on-frequency-change no longer applies.

**Contract**: In `prd.md`, edit FR-007 to drop **frequency** from the editable structural fields (frequency is fixed at creation; only name, modality, target remain editable) and update the `## Business Logic` "Structural edit" edge case accordingly. In `roadmap.md`, narrow the S-04 outcome to "edit a habit's name, modality, and target count" (no frequency). Keep the historical-streak-preservation rationale where relevant. Prose-only change; no FR renumbering.

#### 2. Metrics computation module

**File**: `apps/habits-api/src/marks/metrics.ts` (new)

**Intent**: Pure functions that turn `(frequency, target, anchor, today, marks[])` into the four metrics, reusing `period.ts` boundary helpers. No Prisma, no Nest — mirrors `period.ts` so it is unit-testable in isolation.

**Contract**: Export a single `computeMetrics(input): HabitMetrics` plus the small internal building blocks it needs (kept in this file). It produces the chronological period-classification sequence once and derives streak, best streaks, rolling consistency, and recent completion from it, per the semantics in **Critical Implementation Details**. The returned shape is the endpoint contract Phase 2 depends on:

```ts
type StreakUnit = 'DAY' | 'WEEK' | 'MONTH';
interface HabitMetrics {
  unit: StreakUnit;                 // derived from frequency; unit for all streak lengths
  currentStreak: number;            // consecutive successful periods ending now (0 if none)
  rollingConsistency: { numerator: number; denominator: number; percent: number | null };
  recentCompletion:  { numerator: number; denominator: number; percent: number | null; phase: 'RATIO' | 'PERCENT' };
  bestStreaks: Array<{ start: string; end: string; length: number }>; // YYYY-MM-DD; top 10; most-recent-first
}
```

`percent` is `Math.round(100 * numerator / denominator)` or `null` when `denominator === 0`. `phase` is `RATIO` while `(today − anchor) < 14` days, else `PERCENT`. If `anchor` is null (no marks): `currentStreak: 0`, empty `bestStreaks`, both metric objects `{0, 0, null, …}`.

If `startOfIsoWeek`/`startOfMonth`/`endOfIsoWeek`/`endOfMonth`/`addUtcDays` need to be shared, export them from `period.ts` rather than duplicating — they are the DST-safe primitives.

#### 3. Metrics query DTO

**File**: `apps/habits-api/src/habits/dto/metrics-query.dto.ts` (new)

**Intent**: Validate the single `today` query param, consistent with `CalendarQueryDto`.

**Contract**: One `@Matches(/^\d{4}-\d{2}-\d{2}$/)` field `today`. The global `ValidationPipe` rejects malformed input; `parseDateOnly` re-checks it is a real date.

#### 4. Service method

**File**: `apps/habits-api/src/habits/habits.service.ts`

**Intent**: Owner-checked read that loads marks and delegates to `computeMetrics`.

**Contract**: `getMetrics(userId, habitId, today)` — `findFirst({ id, userId })` → **404** on miss (mirror `getCalendar`); read the anchor (earliest mark date) and all marks `{date, status}` ordered ascending; call `computeMetrics` with the habit's `frequency`/`targetCount` (target defaults to 1 for daily) and return its result.

#### 5. Controller route

**File**: `apps/habits-api/src/habits/habits.controller.ts`

**Intent**: Expose `GET /habits/:habitId/metrics`.

**Contract**: `@Get(':habitId/metrics')` guarded by `JwtGuard`, params `habitId` + `MetricsQueryDto`, returns `habitsService.getMetrics(req.user.sub, habitId, query.today)`. Sits alongside the existing `:habitId/calendar` route.

#### 6. Tests

**Files**: `apps/habits-api/src/marks/metrics.spec.ts` (new), `apps/habits-api/test/app.e2e-spec.ts` (extend)

**Intent**: Lock every semantic decision and the DST/consistency invariants.

**Contract**: Unit specs (mirroring `period.spec.ts` style) covering, per frequency: current-streak edges (today completed/unmarked/missed; in-progress weekly meeting vs not meeting target; break on a gap); rolling-consistency denominators (young habit shorter than window; in-progress excluded; window boundaries exact); recent-completion (ratio→percent transition at exactly 14 days; anchor at first mark; `denominator == 0` → null); best-streaks (enumerate all runs, top-10-by-length with tie-break, most-recent-first display, ongoing run included, end-date clamped to today, native unit); a DST-window round-trip; and a consistency check that classification agrees with `computedMissedDates`/`closedPeriodFailures`. E2e: `GET …/metrics` returns 200 + shape for an owned habit, **404** for another user's habit, **400** for a malformed `today`, **401** unauthenticated.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test -w @habitpair/habits-api -- metrics`
- Full backend unit suite passes: `npm test -w @habitpair/habits-api`
- E2e passes: `npm run test:e2e -w @habitpair/habits-api`
- Build + typecheck pass: `npm run build -w @habitpair/habits-api`
- Lint passes: `npm run lint -w @habitpair/habits-api`

#### Manual Verification:

- `curl`ing `GET /habits/:id/metrics?today=…` (with a valid bearer token) returns sane numbers for a daily, a weekly, and a monthly habit, matching hand-computed values for a small fixture.
- PRD FR-007 + `## Business Logic` edge case and roadmap S-04 no longer present frequency as editable.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 2.

---

## Phase 2: Primary metrics UI

### Overview

Fetch the metrics and render the three primary numbers as a strip under the title, and keep them fresh when marks change.

### Changes Required:

#### 1. Response type

**File**: `apps/web/src/features/habits/types.ts`

**Intent**: Mirror the Phase-1 `HabitMetrics` shape.

**Contract**: Add `StreakUnit` and `HabitMetricsResponse` matching the backend contract exactly (`unit`, `currentStreak`, `rollingConsistency`, `recentCompletion`, `bestStreaks`).

#### 2. Query factory + hook

**Files**: `apps/web/src/features/habits/api/metrics.ts` (new), `apps/web/src/features/habits/hooks/useHabitMetrics.ts` (new)

**Intent**: Fetch metrics, mirroring `api/calendar.ts` + `useHabitCalendar.ts`.

**Contract**: `habitMetricsQueryOptions(habitId, today)` with query key `['habits', habitId, 'metrics', today]`, fetching `GET /habits/${habitId}/metrics?today=${today}` via `habitsApi`, returning `HabitMetricsResponse`. `useHabitMetrics(habitId, today)` wraps it in `useQuery`. No `keepPreviousData` needed (the key only changes when the local day rolls over).

#### 3. Formatting helper

**File**: `apps/web/src/features/habits/lib/metricsFormat.ts` (new)

**Intent**: Map `unit` + counts to display strings, single source for labels.

**Contract**: Pure helpers — e.g. streak label (`"5 days"` / `"2 weeks"` / `"1 month"`, singular/plural), rolling-window label from `unit` (`"30 days"` / `"8 weeks"` / `"6 months"`), and a consistency/recent renderer that shows `"—"` when `percent === null`, `"X of Y"` when `recentCompletion.phase === 'RATIO'`, and `"Z%"` otherwise. No React.

#### 4. Metrics strip component

**File**: `apps/web/src/features/habits/components/HabitMetrics.tsx` (new)

**Intent**: Three compact stat cells (current streak, consistency %, recent completion).

**Contract**: Props `{ habitId: string; today: string }` (or accept the query result) — calls `useHabitMetrics`, renders three labelled cells via `metricsFormat`, handles loading (skeleton/placeholder) and the never-marked empty state gracefully. Tailwind v4 utilities only; follows the existing component style.

#### 5. Wire into the detail page

**File**: `apps/web/src/features/habits/components/HabitDetail.tsx`

**Intent**: Place the strip under the title/frequency text, above the `[SpanControl + CalendarNav]` row.

**Contract**: Insert `<HabitMetrics habitId={habitId} today={today} />` between the frequency-text paragraph and the controls row (`today` already computed via `todayLocalISO()`). No change to the calendar wiring.

#### 6. Cache invalidation on mark changes

**Files**: `apps/web/src/features/habits/hooks/useCycleMark.ts`, `apps/web/src/features/habits/hooks/useToggleMark.ts`

**Intent**: Retroactive/today mark changes alter streaks and percentages, so the metrics query must refetch.

**Contract**: In each mutation's `onSettled` (alongside the existing calendar/list invalidations), invalidate `['habits', habitId, 'metrics']` (prefix match across the `today` key).

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck -w @habitpair/web`
- Frontend tests pass: `npm run test -w @habitpair/web`
- Build passes: `npm run build -w @habitpair/web`
- Lint passes: `make lint`

#### Manual Verification:

- The strip renders under the title and shows correct streak / % / ratio for a daily, weekly, and monthly habit (verified against the same fixtures as Phase 1) using the dev server preview.
- Marking today and backfilling a past day both update the strip without a manual refresh.
- A brand-new habit (no marks) shows a neutral empty state (no "0 of 0", no NaN%).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding to Phase 3.

---

## Phase 3: Best-streaks secondary view

### Overview

Surface the top-10 best streaks in a collapsed, non-prominent disclosure below the calendar.

### Changes Required:

#### 1. Best-streaks component

**File**: `apps/web/src/features/habits/components/BestStreaks.tsx` (new)

**Intent**: A collapsed-by-default disclosure that expands to a dated list of up to ten past streaks.

**Contract**: Props take the `bestStreaks` array + `unit` (reuse the metrics query result already loaded for the strip — do not issue a second request). Collapsed state shows only a toggle labelled "Best streaks"; expanded, it lists each run as date-span + native-unit length (via `metricsFormat`), in the order returned (most-recent-first). Empty list → the disclosure shows nothing or a quiet "No streaks yet". Use a native `<details>`/`<summary>` or an accessible button-toggled region (keyboard-operable per the accessibility baseline). Satisfies the NFR: nothing best-streak-related is visible until the user expands it.

#### 2. Wire into the detail page

**File**: `apps/web/src/features/habits/components/HabitDetail.tsx`

**Intent**: Place the disclosure below the calendar.

**Contract**: Render `<BestStreaks …/>` after the `<HabitCalendar>` block, fed from the metrics data. If `HabitMetrics` owns the query, lift the query result (or share via the hook) so both consume one `useHabitMetrics` call.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck -w @habitpair/web`
- Frontend tests pass: `npm run test -w @habitpair/web`
- Build passes: `npm run build -w @habitpair/web`
- Lint passes: `make lint`

#### Manual Verification:

- The "Best streaks" section is collapsed on load and absent from the main surface until expanded (NFR check).
- Expanded, it shows the correct top-10-by-length runs, most-recent-first, with accurate date spans and unit-appropriate lengths for daily/weekly/monthly habits (preview).
- Keyboard-only: the disclosure is reachable and toggwleable via Tab + Enter/Space.
- The ongoing streak (if any) appears with an end date clamped to today, not a future date.

**Implementation Note**: After completing this phase and all automated verification passes, pause for final manual confirmation.

---

## Testing Strategy

### Unit Tests (backend, thorough — `metrics.spec.ts`):

- **Streak**: daily today completed/unmarked/missed; gap breaks; weekly/monthly current period meeting vs not meeting target; zero-mark habit → 0.
- **Rolling consistency**: window boundaries exact; habit younger than window; in-progress period excluded; `denominator == 0` → null.
- **Recent completion**: ratio while < 14 days, percent at/after 14 days (test the exact boundary); anchor at first mark; `denominator == 0` → null.
- **Best streaks**: enumerate all runs; top-10-by-length with tie-break by recency; display order most-recent-first; ongoing run included; end clamped to today; native unit (days/weeks/months).
- **DST**: a window straddling a DST transition produces no off-by-one (mirror `period.spec.ts`).
- **Consistency invariant**: metrics classification agrees with `computedMissedDates` / `closedPeriodFailures` over a shared range.

### Integration / E2e (backend — `app.e2e-spec.ts`):

- `GET …/metrics` → 200 + correct shape for an owned habit (daily/weekly/monthly fixtures).
- 404 for another user's habit; 400 for malformed `today`; 401 unauthenticated.

### Frontend (light, matches established stance):

- Optional: a pure unit test of `metricsFormat` (singular/plural, `—`, ratio vs percent). No component-test suite.
- Otherwise rely on typecheck + build + manual preview verification.

### Manual Testing Steps:

1. Seed a daily habit with a known pattern (e.g., 10 days, two gaps); open detail; confirm streak, rolling %, and ratio match hand calculation.
2. Backfill a gap day to `COMPLETED`; confirm the streak and % update live.
3. Repeat for a weekly (2×/week) and a monthly habit, including an in-progress current period that has/has-not met target.
4. Expand "Best streaks"; confirm top-10-by-length, most-recent-first, correct spans and units.
5. New habit with zero/one mark: confirm neutral empty states.
6. Keyboard-only pass over the strip and the disclosure.

## Performance Considerations

Each metrics request reads all of a habit's marks (`{date, status}`, ordered by the existing `@@unique([habitId, date])` index) and computes in one linear pass over periods. At the MVP's "small" data volume this is negligible. The per-period re-scan pattern inherited from `closedPeriodFailures` is O(periods × marks) in the worst case but bounded in practice; if a habit ever accrues multi-year daily history, bucket marks by period first (noted, not done now).

## Migration Notes

**None.** No schema change — metrics are computed on read from existing `Mark` rows. The only persisted-contract change is documentary (frequency immutability in the PRD/roadmap).

## References

- Roadmap slice S-03: `context/foundation/roadmap.md`
- PRD FR-013–FR-016, `## Business Logic`, `## Non-Functional Requirements` (timezone/DST): `context/foundation/prd.md`
- Prior slice (compute-on-read precedent, `period.ts`): `context/changes/habit-calendar-and-backfill/plan-brief.md`
- Date/period primitives: [period.ts](apps/habits-api/src/marks/period.ts), tests [period.spec.ts](apps/habits-api/src/marks/period.spec.ts)
- Read-endpoint reference: `HabitsService.getCalendar` [habits.service.ts:73](apps/habits-api/src/habits/habits.service.ts)
- Frontend query-factory pattern: `apps/web/src/features/habits/api/calendar.ts`, `hooks/useHabitCalendar.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend metrics engine, endpoint, and spec reconciliation

#### Automated

- [x] 1.1 Unit tests pass: `npm test -w @habitpair/habits-api -- metrics` — d0e6c6b
- [x] 1.2 Full backend unit suite passes: `npm test -w @habitpair/habits-api` — d0e6c6b
- [x] 1.3 E2e passes: `npm run test:e2e -w @habitpair/habits-api` — d0e6c6b
- [x] 1.4 Build + typecheck pass: `npm run build -w @habitpair/habits-api` — d0e6c6b
- [x] 1.5 Lint passes: `npm run lint -w @habitpair/habits-api` — d0e6c6b

#### Manual

- [x] 1.6 `curl` of `GET …/metrics` returns sane numbers for daily/weekly/monthly fixtures — d0e6c6b
- [x] 1.7 PRD FR-007 + Business Logic edge case and roadmap S-04 no longer present frequency as editable — d0e6c6b

### Phase 2: Primary metrics UI

#### Automated

- [x] 2.1 Typecheck passes: `npm run typecheck -w @habitpair/web`
- [x] 2.2 Frontend tests pass: `npm run test -w @habitpair/web`
- [x] 2.3 Build passes: `npm run build -w @habitpair/web`
- [x] 2.4 Lint passes: `make lint`

#### Manual

- [x] 2.5 Strip renders correct streak / % / ratio for daily/weekly/monthly (preview)
- [x] 2.6 Marking today and backfilling a past day update the strip live
- [x] 2.7 Brand-new habit shows a neutral empty state (no "0 of 0" / NaN%)

### Phase 3: Best-streaks secondary view

#### Automated

- [ ] 3.1 Typecheck passes: `npm run typecheck -w @habitpair/web`
- [ ] 3.2 Frontend tests pass: `npm run test -w @habitpair/web`
- [ ] 3.3 Build passes: `npm run build -w @habitpair/web`
- [ ] 3.4 Lint passes: `make lint`

#### Manual

- [ ] 3.5 "Best streaks" is collapsed on load and absent from the main surface until expanded (NFR)
- [ ] 3.6 Expanded list shows correct top-10-by-length, most-recent-first, accurate spans/units
- [ ] 3.7 Keyboard-only: disclosure reachable and toggleable via Tab + Enter/Space
- [ ] 3.8 Ongoing streak shows an end date clamped to today, not a future date
