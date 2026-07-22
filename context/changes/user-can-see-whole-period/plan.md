# Full Habit History (Beyond 24 Months) Implementation Plan

## Overview

Users can only see the last 24 months of a habit's history: the detail page fetches one fixed 24-month window, and both the month navigation and the "View full history" sheet clamp to that window. This plan makes both surfaces reach the user's entire history via paged 24-month fetches from the existing calendar endpoint, and locks the (already correct) whole-history statistics behavior with a regression test. Backend endpoints and schema are unchanged.

## Current State Analysis

- **Fetch**: `HabitDetail` fetches exactly one window — the last `ALL_CAP_MONTHS = 24` months ending at the current month (`apps/web/src/features/habits/lib/calendarRange.ts:26`, `calendarQueryRange()` at :48). Query key: `['habits', habitId, 'calendar', from, to, today]` (`apps/web/src/features/habits/api/calendar.ts:19`).
- **Main calendar nav**: `HabitCalendar` slides a 1–3 month display window over the fetched data; the navigation floor is the oldest fetched month (`minIdx` at `HabitCalendar.tsx:73`), so the prev arrow dies at 24 months back.
- **"View full history" sheet**: `HistorySheet` renders only months derived from the same 24-month fetch (`allMonths` bounded by `historyFloor`, `HabitCalendar.tsx:88-93`). It never requests older data — this is the reported bug. It lazily *renders* in batches of 6 via an IntersectionObserver sentinel (`HistorySheet.tsx:7,32-43`) but the data underneath is capped.
- **Backend is ready for paging**: the calendar endpoint accepts arbitrary `from`/`to` (YYYY-MM), caps one request at 36 months (`apps/habits-api/src/marks/period.ts:44,77`), and the comment at `period.ts:65` says the SPA is expected to page with fixed-size windows. Every response carries `firstMarkDate` (the true global anchor, from an unbounded `findFirst` — `habits.service.ts:114-119`), so the client always knows how far back real history goes.
- **Mutation**: `useCycleMark` optimistically patches the single calendar query key and rolls back from a snapshot (`useCycleMark.ts:29,39-56`); `onSettled` invalidates calendar + list + metrics keys.
- **Statistics are already whole-history** (verified): `getMetrics` reads all marks unbounded (`habits.service.ts:179`, comment at :177), as does the list view's streak computation (`habits.service.ts:62-66`). The only windowed metric, `rollingConsistency` (last 30 days / 8 weeks / 6 months, `metrics.ts`), is a deliberate recent-trend display window applied in memory after an unbounded read — not a data-fetch limit. **No stats code change needed**; Phase 3 adds a regression test to keep it that way.

## Desired End State

- The main calendar's prev arrow steps back indefinitely (calendar-anchored — including before the first mark, for backfill); older 24-month pages are prefetched as the display window approaches the loaded edge, so stepping almost never waits.
- "View full history" auto-loads pages back to the month of the first mark, then offers a manual "Load earlier months" action to page further for pre-anchor backfill.
- Cycling a mark works in every visible month, however old, with the same optimistic behavior as today.
- A backend spec fails if `getMetrics` ever stops counting marks older than 24 months.

Verify by: creating a habit, inserting marks 3+ years old directly (Prisma Studio or SQL), and confirming (a) the sheet scrolls back to them, (b) the main nav reaches them, (c) metrics count them, (d) cycling one of them round-trips correctly.

### Key Discoveries:

- Backend needs no changes: 36-month per-request cap > 24-month page size (`period.ts:44`), and `markRange` already widens each query to whole ISO weeks so period computations at page edges are exact (`period.ts:89-91`).
- Page-merge is naturally idempotent: `buildMarksView` merges into a keyed record and `buildFailSet` unions days into a `Set` (`HabitCalendar.tsx:21-40`), so a weekly/monthly failed period reported by two adjacent pages (it straddles the boundary) collapses harmlessly.
- `firstMarkDate` arrives on every page response, so "have we loaded back to the anchor yet?" is answerable from page 0 alone.
- TanStack Query v5 (`useInfiniteQuery` with `initialPageParam`/`getNextPageParam`) is already the installed query layer (`@tanstack/react-query ^5.100.14`).
- `HabitDetail.test.tsx` exists and mocks the current single-window query — it must be updated alongside the hook change.

## What We're NOT Doing

- No backend/API changes (no new endpoints, no cap change, no schema/migration).
- No change to statistics computation — it is already whole-history; we only add a regression test.
- No change to `rollingConsistency`'s deliberate trend window.
- No Playwright E2E in this change (unit + component tests only; E2E can be a follow-up via `/10x-e2e`).
- No virtualization rework of `HistorySheet` — the existing batch-render sentinel stays.
- No changes to the dashboard/list view (its 7-day strip and streaks are unaffected).

## Implementation Approach

Replace the single fixed-window calendar query with a paged (infinite) query: page *p* covers the 24-month window ending `24 × p` months before the current month (page 0 = today's window, identical to the current fetch). The query key drops `from`/`to` — `['habits', habitId, 'calendar', today]` — so navigation and paging never change the key (no churn; the `today` segment still rolls the cache at local midnight). Pages merge client-side into the same view shape components already consume. Both surfaces drive `fetchNextPage`: the main calendar prefetches near its loaded edge; the sheet's existing sentinel fetches automatically until the anchor month is loaded, then degrades to a manual button. `useCycleMark` is reworked to patch the page containing the edited date inside the `InfiniteData` structure.

## Critical Implementation Details

- **Invalidation refetches every loaded page.** `onSettled` in `useCycleMark` invalidates the calendar key; for an infinite query TanStack refetches all loaded pages sequentially. Acceptable here (typically 1–2 pages loaded; each response is small), but do not add per-page invalidation complexity — note it and move on. See Performance Considerations.
- **Optimistic patch must target the page whose window contains the date**, not all pages: each page's `marks` record only holds dates inside its own span (`habits.service.ts:132-137`), and the merged view is built by folding pages oldest→newest, so writing the date into the wrong page could be masked or double-represented. Compute the page index from the date's month: `pageIndex = floor((currentMonthIdx − monthIndex(date)) / 24)`.
- **`getNextPageParam` must always return the next index** (never `undefined`): history is calendar-anchored and unbounded backward (pre-anchor backfill is a feature, per the product's calendar-anchored navigation principle). The *consumers* decide when to stop calling `fetchNextPage` (sheet: manual button past the anchor), not the query layer.
- **Page 0 must remain byte-identical to today's fetch** (`calendarQueryRange()` result) so the initial render, skeleton, and `isPending` behavior don't shift.

## Phase 1: Paged Calendar Data Layer

### Overview

Swap the single-window query for an infinite paged query and rework the mutation cache-patch, without changing any visible behavior (only page 0 loads by default). All page math is pure and unit-tested.

### Changes Required:

#### 1. Page-range math

**File**: `apps/web/src/features/habits/lib/calendarRange.ts`

**Intent**: Generalize the existing single-window math to numbered pages so both the query layer and the mutation can map months ↔ pages.

**Contract**: Add `calendarPageRange(page: number): CalendarRange` where page 0 equals the current `calendarQueryRange()` output and page *p* spans the 24 months immediately before page *p−1*. Add `pageIndexForMonth(month: string): number` (inverse mapping, used by the mutation patch). `ALL_CAP_MONTHS` becomes the page size; update its comment. `calendarQueryRange()` can be reduced to `calendarPageRange(0)` or removed if all callers migrate.

#### 2. Infinite query options + merged view

**File**: `apps/web/src/features/habits/api/calendar.ts`

**Intent**: Replace the single-window query options with infinite-query options (React-free, per the feature-layout rule) and a pure page-merge function.

**Contract**: `habitCalendarInfiniteOptions(habitId, today)` — key `['habits', habitId, 'calendar', today]`, `initialPageParam: 0`, `getNextPageParam: (_last, pages) => pages.length` (always pageable), `queryFn` hits the existing `/habits/{id}/calendar?from&to&today` endpoint with the page's range. Export `mergeCalendarPages(pages: HabitCalendarResponse[])` returning the existing `HabitCalendarResponse` shape (habit + `firstMarkDate` from page 0; `marks` record union; `computedMissedDates` and `failedPeriods` concatenated — dedupe not required, downstream Set/record folding is idempotent).

#### 3. Hook swap

**File**: `apps/web/src/features/habits/hooks/useHabitCalendar.ts`

**Intent**: Expose the paged query to components.

**Contract**: `useHabitCalendar(habitId, today)` wraps `useInfiniteQuery(habitCalendarInfiniteOptions(...))`. Signature loses `from`/`to`.

#### 4. Mutation rework

**File**: `apps/web/src/features/habits/hooks/useCycleMark.ts`

**Intent**: Keep the optimistic cycle working against the paged cache — patch the page containing the edited date, snapshot/rollback the whole `InfiniteData`.

**Contract**: Signature becomes `useCycleMark(habitId, today)`. `onMutate` locates the page via `pageIndexForMonth(date.slice(0, 7))` and patches only that page's `marks` (if the page isn't loaded — impossible from the UI, which only shows loaded months — no-op). `onError` restores the snapshot; `onSettled` invalidations unchanged (calendar key is now the shorter paged key).

#### 5. Detail wiring

**File**: `apps/web/src/features/habits/components/HabitDetail.tsx`

**Intent**: Consume the paged query; derive the merged view once and keep passing the same `data` shape down.

**Contract**: `query.isPending` (first page) preserves the skeleton; `data = mergeCalendarPages(query.data.pages)`; `onCycle` reads stored status from the merged marks. Pass paging controls (`fetchNextPage`, `isFetchingNextPage`, loaded-page count) to `HabitCalendar` — Phase 2 consumes them; in Phase 1 `HabitCalendar` may keep computing its floor from `ALL_CAP_MONTHS` so behavior is unchanged.

#### 6. Tests

**Files**: `apps/web/src/features/habits/lib/calendarRange.test.ts` (new), `apps/web/src/features/habits/components/HabitDetail.test.tsx` (update)

**Intent**: Lock the page math (page 0 identity, adjacency across year boundaries, month↔page inverse) and update the detail test's query mocking to the paged shape.

**Contract**: Pure unit tests for `calendarPageRange`/`pageIndexForMonth`; `HabitDetail.test.tsx` mocks now return `InfiniteData`-shaped pages.

### Success Criteria:

#### Automated Verification:

- Frontend tests pass: `npm run test -w @habitpair/web`
- Frontend typecheck passes: `npm run typecheck -w @habitpair/web`
- Frontend lint passes: `npm run lint -w @habitpair/web`

#### Manual Verification:

- Detail page renders identically to before (skeleton, calendar, sheet with ≤24 months) — no visible behavior change yet
- Cycling a mark in any visible month still updates instantly and settles correctly

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Full-History Surfaces

### Overview

Wire both surfaces to the paged data: unbounded calendar-anchored month navigation with edge prefetch, and a sheet that auto-loads to the anchor then offers manual pre-anchor loading.

### Changes Required:

#### 1. Main calendar navigation

**File**: `apps/web/src/features/habits/components/HabitCalendar.tsx`

**Intent**: Remove the 24-month floor; let the prev arrow step back indefinitely, prefetching the next older page before the user reaches the loaded edge so stepping stays instant.

**Contract**: The navigation floor becomes the oldest *loaded* month (`currentMonthIdx − loadedPages × 24 + 1`) instead of the fixed `minIdx`. An effect (or the step handler) calls `fetchNextPage` when the display window's start is within ~6 months of that floor and no page fetch is in flight. The prev arrow is disabled only while the user sits at the loaded floor with the next page still loading; it re-enables when the page lands. `historyFloor`/`allMonths` for the sheet now derive from loaded pages (down to the loaded floor), and the sheet receives `{ anchorMonth, isFetchingNextPage, onLoadMore }` alongside the months.

#### 2. History sheet paging

**File**: `apps/web/src/features/habits/components/HistorySheet.tsx`

**Intent**: Make the sentinel actually load data: auto-fetch older pages until the first-mark month is shown, then switch to a manual "Load earlier months" button for pre-anchor backfill.

**Contract**: Two regimes keyed off `anchorMonth`: (a) while the oldest *shown* month is after the anchor month — sentinel behavior as today, but when rendered months are exhausted and more history remains, it triggers `onLoadMore` (showing the existing "Loading earlier months…" copy); (b) once every month back to the anchor is shown — the sentinel is replaced by a quiet button ("Load earlier months") that calls `onLoadMore` to append the next empty pre-anchor page for backfill. No new spinner UI; reuse existing classes (calm UI).

#### 3. Component tests

**Files**: `apps/web/src/features/habits/components/HabitCalendar.test.tsx` (new), `HistorySheet.test.tsx` (new)

**Intent**: Cover the behavior contracts that are easy to regress: prefetch trigger near the floor, arrow disable/enable across a fetch gap, sheet auto→manual regime switch at the anchor, and cycling a mark in a month older than 24 months.

**Contract**: Vitest + Testing Library with a mocked/paged query client; IntersectionObserver stubbed (existing pattern in repo tests or a local stub). Include one test that cycles a pre-window mark and asserts the optimistic patch lands in the correct page.

### Success Criteria:

#### Automated Verification:

- Frontend tests pass: `npm run test -w @habitpair/web`
- Frontend typecheck passes: `npm run typecheck -w @habitpair/web`
- Frontend lint passes: `npm run lint -w @habitpair/web`

#### Manual Verification:

- With seeded 3-year-old marks: sheet scrolls back past 24 months and reaches the first mark without manual action
- "Load earlier months" appears only after the anchor month is shown, and each press appends older empty months
- Main calendar prev arrow steps past 24 months without a visible loading stall (prefetch working); brief disable only on very fast repeated stepping
- Cycling a 3-year-old mark updates instantly, survives a refetch, and shifts metrics/list appropriately
- No regressions in the ≤24-month experience (new habit, empty habit, month nav near today)

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Statistics Regression Lock

### Overview

Statistics already span whole history; add the spec that fails if that ever changes.

### Changes Required:

#### 1. Metrics whole-history spec

**File**: `apps/habits-api/src/marks/metrics.spec.ts` (extend)

**Intent**: Assert `computeMetrics` counts marks far older than the calendar window: a dataset with an anchor 3+ years back must reflect old marks in `bestStreaks` and all-time `recentCompletion`, and a streak spanning the 24-month boundary must not be truncated.

**Contract**: Pure-function spec additions; no service mocking needed.

#### 2. Unbounded-read guard

**File**: `apps/habits-api/src/habits/habits.service.spec.ts` (extend)

**Intent**: Guard the service layer: `getMetrics` must issue its `mark.findMany` without a date filter (the "unbounded read" invariant documented at `habits.service.ts:177`).

**Contract**: Extend the existing Prisma-mocked spec: assert the `findMany` call's `where` clause for `getMetrics` contains no `date` constraint, and/or that metrics computed from a mocked 3-year dataset include the old marks.

### Success Criteria:

#### Automated Verification:

- Backend tests pass: `npm test -w @habitpair/habits-api`
- Backend build/typecheck passes: `make build`
- Backend lint passes: `make lint`

#### Manual Verification:

- None (test-only phase) — final end-to-end sanity pass happens with Phase 2's manual checklist if not already done

---

## Testing Strategy

### Unit Tests:

- `calendarRange`: page 0 ≡ current window; pages tile with no gap/overlap across year boundaries; `pageIndexForMonth` inverts `calendarPageRange` for boundary months
- `mergeCalendarPages`: marks union, page-0 precedence for habit/anchor fields, straddling failed-period duplication is harmless downstream
- `metrics.spec.ts`: >24-month datasets (old streaks counted, boundary-spanning streak not truncated)

### Integration Tests:

- Component: sheet auto-loads to anchor, manual-load regime past anchor, nav prefetch + arrow gating, optimistic cycle into an old page with rollback on error

### Manual Testing Steps:

1. Seed a habit with marks at −38, −25, −24, −12 months and this week (Prisma Studio against local Postgres)
2. Open detail → "View full history": scroll to the bottom; confirm the −38-month mark appears without any manual action
3. Confirm "Load earlier months" appears after the anchor and appends empty months
4. Step the main calendar back to the −38-month month with the prev arrow; watch for stalls
5. Cycle the −38-month mark through ✓/✗/clear; reload; confirm persistence and metrics shifts
6. Regression: brand-new habit (no marks) — no "View full history" button, calendar renders current window

## Performance Considerations

- Each mark-cycle settle refetches all loaded calendar pages (infinite-query invalidation semantics). With 24-month pages and typical 1–3 loaded pages this is a few small requests; revisit only if users routinely hold many pages open.
- The sheet's existing batch renderer (6 months per sentinel hit) already bounds DOM growth; pages arriving in 24-month chunks feed it faster than it renders, so no new virtualization is needed.
- Backend cost per page is one indexed range query (`habitId, date`) — same as today's single window.

## Migration Notes

None — no schema, API, or stored-data changes. The old calendar query key shape (`...['calendar', from, to, today]`) simply stops being used; stale entries expire from the cache naturally.

## References

- Change: `context/changes/user-can-see-whole-period/change.md`
- 24-month window: `apps/web/src/features/habits/lib/calendarRange.ts:26,48`
- Nav floor + sheet months: `apps/web/src/features/habits/components/HabitCalendar.tsx:73,88-93`
- Sheet sentinel: `apps/web/src/features/habits/components/HistorySheet.tsx:7,32-43`
- Backend paging contract: `apps/habits-api/src/marks/period.ts:44,65,89-91`
- Unbounded metrics read: `apps/habits-api/src/habits/habits.service.ts:169-192`
- Optimistic mutation: `apps/web/src/features/habits/hooks/useCycleMark.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Paged Calendar Data Layer

#### Automated

- [x] 1.1 Frontend tests pass: `npm run test -w @habitpair/web` — 0b9c0eb
- [x] 1.2 Frontend typecheck passes: `npm run typecheck -w @habitpair/web` — 0b9c0eb
- [x] 1.3 Frontend lint passes: `npm run lint -w @habitpair/web` — 0b9c0eb

#### Manual

- [x] 1.4 Detail page renders identically to before (no visible behavior change) — 0b9c0eb
- [x] 1.5 Cycling a mark in any visible month still updates instantly and settles correctly — 0b9c0eb

### Phase 2: Full-History Surfaces

#### Automated

- [x] 2.1 Frontend tests pass: `npm run test -w @habitpair/web` — b99e740
- [x] 2.2 Frontend typecheck passes: `npm run typecheck -w @habitpair/web` — b99e740
- [x] 2.3 Frontend lint passes: `npm run lint -w @habitpair/web` — b99e740

#### Manual

- [x] 2.4 Sheet auto-loads past 24 months to the first mark (seeded 3-year data) — b99e740
- [x] 2.5 "Load earlier months" appears only past the anchor and appends older months — b99e740
- [x] 2.6 Main nav steps past 24 months without visible stalls (prefetch) — b99e740
- [x] 2.7 Cycling a 3-year-old mark works optimistically and persists — b99e740
- [x] 2.8 No regressions in the ≤24-month experience — b99e740

### Phase 3: Statistics Regression Lock

#### Automated

- [x] 3.1 Backend tests pass: `npm test -w @habitpair/habits-api` — 0f6d9b2
- [x] 3.2 Backend build/typecheck passes: `make build` — 0f6d9b2
- [x] 3.3 Backend lint passes: `make lint` — 0f6d9b2
