# Habit Calendar and Backfill (S-02) Implementation Plan

## Overview

Add a **habit-detail page** with a **multi-month calendar** (Monday-first, ISO 8601) that renders each habit's *computed* success/failure pattern, and lets the user **retroactively change any past day's status**. The calendar is the product's pattern-view differentiator (PRD US-03, FR-010/011/012).

The slice deliberately pulls one piece of S-03 forward: the **per-day / per-period success-failure computation** (the primitive the calendar coloring needs). Streak *numbers and pills* remain S-03. The backend owns the computation (single source of truth for date/period/DST math); the SPA renders it via react-day-picker v10.

## Current State Analysis

S-01 (`create-habit-and-mark-today`, merged) shipped everything this slice builds on:

- **Data model is complete for this slice** — `Habit` (id, userId, name, modality, frequency, targetCount, createdAt) + `Mark` (id, habitId, `date @db.Date`, status, createdAt) with `@@unique([habitId, date])` and `onDelete: Cascade`. Enums `HabitModality {POSITIVE,NEGATIVE}`, `HabitFrequency {DAILY,WEEKLY,MONTHLY}`, `MarkStatus {COMPLETED,MISSED}`. No schema change is needed (`apps/habits-api/prisma/schema.prisma:13-55`).
- **The write path already accepts arbitrary dates.** `PUT /habits/:habitId/marks/:date` (idempotent upsert) and `DELETE …/:date` (idempotent `deleteMany`) take any `YYYY-MM-DD` — no today-only restriction. S-01 left `MISSED` accepted on the DTO specifically so this slice reuses the endpoint unchanged (`apps/habits-api/src/marks/marks.controller.ts:16-24`, `marks.service.ts:10-27`, `dto/update-mark.dto.ts`). **Retroactive marking needs no new write endpoint.**
- **Date math is centralized and UTC-only** — `parseDateOnly` (parses `YYYY-MM-DD` as `T00:00:00.000Z`, round-trip-validates), `formatDateOnly` (`toISOString().slice(0,10)`), `currentPeriodRange` (daily/weekly-ISO-Monday/monthly, all UTC getters) live in `apps/habits-api/src/marks/period.ts:11-41`. `HabitsService.findByUser` already uses them to compute `currentPeriod` (`habits.service.ts:24-59`).
- **Frontend feature is scaffolded** — `apps/web/src/features/habits/{api,components,hooks,lib}` + `types.ts`. `api/habits.ts` holds React-free transport + `putMark`/`deleteMark` + a query-option factory; `hooks/useToggleMark.ts` is the optimistic mutation precedent (cancel → snapshot → `setQueryData` → rollback `onError` → invalidate `onSettled`); query key is `['habits', today]`; `lib/today.ts` exposes `todayLocalISO()` built from **local** getters. There is **no habit-detail route yet** (`apps/web/src/routes/_authed/app.tsx` is the list).
- **No date library is installed.** This slice introduces one (react-day-picker bundles date-fns@4).

Decisions settled by `calendar-library-review.md` + `react-day-picker-v10-cheatsheet.md`: **react-day-picker v10**, driven by `modifiers` + `onDayClick` (not selection mode), `ISOWeek` for Monday-first, custom `DayButton` for ✓/✗, `disabled={{ after: today }}` for future days, and the date-only↔Date boundary built as **local-midnight** to avoid off-by-one.

## Desired End State

From the habit list, the user clicks a habit and lands on its detail page. A calendar shows **3 months by default** (selectable 3 / 6 / 12 / All), Monday-first, **navigable backward without limit** (prev/next plus a month-year jump, anchored to the calendar — not to existing marks — so months *before* the first mark are reachable for first-time backfill), with:

- **green ✓** on completed days, **red ✗** on missed days (explicit, plus *computed* past-unmarked days for **daily** habits only),
- a **period-level failure tint** on closed weeks/months that fell under target (weekly/monthly habits — never individual day crosses),
- nothing rendered as failure **before the habit's first recorded mark**, and never in an in-progress period,
- a **today** marker; future days non-interactive.

Clicking any today-or-past day cycles its stored status **unmarked → completed → missed → unmarked**, persisting via the existing endpoints, recomputing the calendar, and keeping the habit list's current-period progress consistent.

**Verification:** backend unit + e2e prove the computation and endpoint; manual browser walkthrough proves rendering, navigation, and the retroactive cycle across all three frequencies.

### Key Discoveries:

- Write path is reusable as-is — `marks.controller.ts:16-24` accepts arbitrary dates and `MISSED`.
- Period/ISO-week/UTC helpers already exist to extend — `period.ts:11-41`; `findByUser` is the computation precedent (`habits.service.ts:24-59`).
- Optimistic-mutation + invalidation precedent — `hooks/useToggleMark.ts`.
- The date off-by-one trap is real and documented — backend stores UTC-midnight `@db.Date`; client must key by **local** getters (`lib/today.ts`), never `toISOString()`.
- Validation is DTO + global `ValidationPipe` (`main.ts`); date params are validated in-service via `parseDateOnly` (throws `BadRequestException`).

## What We're NOT Doing

- **No streak numbers, longest streak, rolling %, or connected streak pills** — all S-03. This slice computes per-day/per-period success-failure only.
- **No recompute seam and no materialized stats.** Continue S-01's pure compute-on-read. Nothing is cached, so the roadmap's "trigger downstream recompute" note is satisfied trivially — there is nothing to recompute. S-03 owns introducing any cache/seam if a concrete need appears. (Documented divergence from the roadmap S-02 note.)
- **No new write endpoint** — reuse `PUT`/`DELETE /habits/:habitId/marks/:date`.
- **No edit/delete of habits** — S-04.
- **No infinite scroll / virtualization** — unbounded back-reach comes from repositioning a fixed-size window (prev/next + month-year jump), not from mounting all history; responsive month-grid + a 24-month cap on the 'All' convenience view.
- **No new frontend Vitest specs** — keep S-01's stance (typecheck/lint/build + manual verification). Logic lives in the backend, which is thoroughly tested.
- **No habit creation/list changes** beyond making each row open the detail page.

## Implementation Approach

Three layered phases, each independently verifiable:

1. **Backend read-model** — extend `period.ts` with the computation, add one `GET /habits/:habitId/calendar` endpoint, test it hard (this is where the difficulty and the DST/timezone NFR live).
2. **Read-only calendar UI** — install react-day-picker, build the detail route + multi-month calendar that renders the backend's computed statuses, link the list row to it.
3. **Retroactive marking** — wire the 3-state click-cycle onto the existing write endpoints with optimistic updates and cross-cache invalidation.

The endpoint is **range-based** (`?from=YYYY-MM&to=YYYY-MM`) to serve the multi-month view in one request. The response cleanly separates **stored marks** (the cycle's source of truth and the basis for ✓/explicit-✗ coloring) from **computed coloring** (daily computed-missed dates; failed closed-period ranges), so the client never re-derives period logic.

## Critical Implementation Details

- **Date off-by-one.** Backend computes and emits `YYYY-MM-DD` strings in UTC (`period.ts` rule). The SPA must build every react-day-picker `Date` and every status-lookup key from **local** getters (extend `lib/today.ts`), never `new Date(iso)`/`toISOString()`. A cell keyed off UTC will render one day off near the user's midnight. Symmetrically, the **client supplies its local `today`** to the calendar endpoint (as the list endpoint already does) so "past day"/"closed period" are evaluated against the user's calendar day, never the server clock.
- **The cycle is driven by the *stored* mark, not the displayed color.** A daily computed-missed day (red, but no stored mark) must cycle as if absent → first click sets COMPLETED. So the calendar response exposes stored marks separately from computed coloring, and `useCycleMark` keys off the stored mark only.
- **In-progress periods never fail.** Weekly/monthly period outcomes are computed **only for periods whose end is strictly before today** (closed). An unmet current week/month is not a failure. Daily "computed missed" applies only to days strictly before today and on/after the anchor.
- **Anchor = the habit's first recorded mark (any status).** Days before the earliest mark are always neutral — no "sea of red" before tracking began, and backfilling an old mark moves the anchor back. If a habit has zero marks, the whole calendar is neutral. (Forward note: S-03's streak engine must reuse this same first-mark anchor, or the calendar's neutral-before-anchor coloring and the streak count will disagree.)
- **Navigation is calendar-anchored, not mark-anchored.** Prev/next and the month-year jump move the window relative to *today*, with no lower bound and independent of where marks exist — otherwise a day older than the window (or older than the first mark) is unreachable, violating FR-010's "no time-window restriction." The first-mark anchor governs *coloring*, never *reach*.
- **Perceived responsiveness (<300 ms).** The retroactive cycle updates the calendar cache optimistically (mirroring `useToggleMark`); server latency is off the interaction path.

## Phase 1: Backend calendar read-model

### Overview

Add the per-day/per-period computation to `period.ts` and expose it through one new authenticated, ownership-scoped endpoint. No schema or write-path changes.

### Changes Required:

#### 1. Computation helpers

**File**: `apps/habits-api/src/marks/period.ts`

**Intent**: Add pure, unit-testable functions that turn a habit's frequency/target + its marks + an anchor into (a) computed-missed dates for daily habits and (b) closed-period failure ranges for weekly/monthly habits, plus a helper to expand a month range into a date span. All UTC, reusing the existing ISO-Monday math.

**Contract**:
- `monthSpan(fromMonth: string, toMonth: string): { start: Date; end: Date }` — validates `^\d{4}-\d{2}$`, `to >= from`, and a max span (36 months → `BadRequestException`); returns first-day-of-`from` … last-day-of-`to` (UTC).
- `computedMissedDates(marks, anchor, start, end, today): string[]` — **daily only**; every day in `[max(anchor,start) … min(end, today-1)]` with no `COMPLETED`/`MISSED` mark. Returns `YYYY-MM-DD[]`.
- `closedPeriodFailures(frequency, target, marks, anchor, start, end, today): { start: string; end: string; completedCount: number; target: number }[]` — **weekly/monthly only**; for each period (ISO-Mon week / calendar month) fully before today and on/after the anchor's period, where `count(COMPLETED) < target`.
- Existing `parseDateOnly`/`formatDateOnly`/`currentPeriodRange` are reused, not changed.

#### 2. Calendar endpoint

**File**: `apps/habits-api/src/habits/habits.controller.ts`

**Intent**: Add `GET /habits/:habitId/calendar?from=&to=&today=` returning the habit meta + the computed read-model for the range. Ownership-scoped via the existing `req.user.sub`. `today` is the client's **local** calendar day (mirrors the list endpoint's `@Query('today')`) so "past day"/"closed period" are evaluated against the user's day, not the server clock.

**Contract**: `@Get(':habitId/calendar')` handler reading `@Param('habitId')`, `@Query('from')`, `@Query('to')`, `@Query('today')`, delegating to `habitsService.getCalendar(req.user.sub, habitId, from, to, today)`. Guarded by the module-level `JwtGuard`.

#### 3. Calendar service method

**File**: `apps/habits-api/src/habits/habits.service.ts`

**Intent**: Load the owned habit (404 on miss, not 403 — replicating `MarksService`'s private `assertOwned` pattern, `findFirst({ where: { id, userId } })`; a 5-line check, not worth a shared module), find the anchor (earliest mark), load marks in range, parse the client `today` via `parseDateOnly`, and assemble the response using the new `period.ts` helpers (passing `today` into `computedMissedDates`/`closedPeriodFailures`). Daily habits produce `computedMissedDates` and empty `failedPeriods`; weekly/monthly produce the inverse.

**Contract**: response shape (other phases depend on this):

```ts
{
  habit: { id: string; name: string; modality: HabitModality; frequency: HabitFrequency; targetCount: number | null };
  firstMarkDate: string | null;                       // YYYY-MM-DD, the anchor
  marks: Record<string, 'COMPLETED' | 'MISSED'>;      // stored marks in range, keyed YYYY-MM-DD
  computedMissedDates: string[];                       // daily only; coloring only
  failedPeriods: { start: string; end: string; completedCount: number; target: number }[]; // weekly/monthly only
}
```
Anchor query: `prisma.mark.findFirst({ where: { habitId }, orderBy: { date: 'asc' }, select: { date: true } })`. Marks query scoped to `[span.start, span.end]`.

#### 4. Optional query DTO

**File**: `apps/habits-api/src/habits/dto/calendar-query.dto.ts` (new)

**Intent**: Validate `from`/`to` as `YYYY-MM` and `today` as `YYYY-MM-DD` via class-validator so the global `ValidationPipe` rejects malformed queries consistently (rather than only failing inside `monthSpan`/`parseDateOnly`). Use `@Matches(/^\d{4}-\d{2}$/)` for `from`/`to`, `@Matches(/^\d{4}-\d{2}-\d{2}$/)` for `today`.

**Contract**: `CalendarQueryDto { from: string; to: string; today: string }`; controller binds it with `@Query()`. `today` is required — no server-clock fallback — so period/closed-day math always keys off the user's local day.

### Success Criteria:

#### Automated Verification:

- [ ] Lint passes: `npm run lint -w @habitpair/habits-api`
- [ ] Unit specs pass: `npm test -w @habitpair/habits-api` — covering: daily computed-missed (gaps before today, on/after anchor); nothing before anchor; today and future never missed; weekly/monthly closed-period failure vs in-progress not-failed; target met → no failure; UTC/DST round-trip via `formatDateOnly`; `monthSpan` validation + max-span guard.
- [ ] e2e passes (real Postgres): `npm test -w @habitpair/habits-api` (jest-e2e) — calendar endpoint returns correct read-model for each frequency; ownership miss → 404; malformed/missing `from`/`to`/`today` → 400; a retroactive `PUT` then `GET /calendar` reflects the change.
- [ ] Build passes: `npm run build -w @habitpair/habits-api`

#### Manual Verification:

- [ ] `curl` the endpoint with a valid JWT for a daily habit with gaps → `computedMissedDates` matches the gaps, none before `firstMarkDate`.
- [ ] `curl` for a 2×/week habit with a Sat+Sun-only week → that closed week is NOT in `failedPeriods`; a closed week with 1 completed IS.

**Implementation Note**: After this phase and all automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: Detail page + multi-month calendar (read-only)

### Overview

Install react-day-picker, add the detail route, and render the backend's computed read-model as a multi-month calendar with a span control. No marking yet — verify rendering against the backend first. Link the list row to the detail page.

### Changes Required:

#### 1. Dependency

**File**: `apps/web/package.json` (+ root lockfile)

**Intent**: Add `react-day-picker` v10 (bundles date-fns@4). Re-run `npm install` at the repo root so the root lockfile updates (per CLAUDE.md). Confirm v10 spelling of `ISOWeek` / `disabled` / `numberOfMonths` against the installed API.

**Contract**: `react-day-picker` in `dependencies`; `import "react-day-picker/style.css"` once.

#### 2. Calendar transport + query options

**File**: `apps/web/src/features/habits/api/calendar.ts` (new)

**Intent**: React-free fetch + query-option factory for the calendar endpoint, following `api/habits.ts` conventions (uses `habitsApi`, `errorMessage`).

**Contract**: `habitCalendarQueryOptions(habitId: string, from: string, to: string, today: string)` → `queryKey: ['habits', habitId, 'calendar', from, to, today] as const`; `queryFn` GETs `/habits/${habitId}/calendar?from=${from}&to=${to}&today=${today}`. `today` is `todayLocalISO()`; keying on it refreshes the view across a local midnight. Response typed per Phase 1 §3.

#### 3. Range/span math

**File**: `apps/web/src/features/habits/lib/calendarRange.ts` (new)

**Intent**: Convert a span choice + a navigable window anchor + `firstMarkDate` into the month window and react-day-picker props, using **local** getters only.

**Contract**: `calendarWindow(span: '3'|'6'|'12'|'all', endMonth: string /* YYYY-MM */, firstMarkDate: string | null): { fromMonth: string; toMonth: string; numberOfMonths: number; startMonth: Date }`. `endMonth` is the navigable window anchor (the latest month shown), defaulting to the current month. For `3|6|12` the window is that many months ending at `endMonth`; backward movement is **unbounded** and independent of any mark, forward is clamped at the current month. `'all'` spans `firstMarkDate`'s month … current month, capped to 24 months — a rendering convenience; unbounded reach comes from navigating the fixed spans. When `firstMarkDate` is null (zero-mark habit), `'all'` has no anchor: it is not selectable (§6) and `calendarWindow` falls back to the default 3-month span.

#### 4. Calendar query hook

**File**: `apps/web/src/features/habits/hooks/useHabitCalendar.ts` (new)

**Intent**: `useQuery` wrapper over the calendar query options for the active window.

**Contract**: `useHabitCalendar(habitId, from, to, today)` → `useQuery(habitCalendarQueryOptions(habitId, from, to, today))`.

#### 5. Calendar component

**File**: `apps/web/src/features/habits/components/HabitCalendar.tsx` (new)

**Intent**: Render `<DayPicker>` from the read-model. Build a `Set` of completed (stored COMPLETED) / missed (stored MISSED ∪ (computedMissed **minus** any date already present in `marks`)) / failed-period dates keyed by **local** `YYYY-MM-DD`; pass matcher functions as modifiers; style via `modifiersClassNames` (Tailwind). **Stored marks always win over computed coloring** — excluding `keys(marks)` from the computed-missed set means a Phase-3 optimistic write to `marks` recolors the cell on its own, with no need to mutate the computed sets (avoids a transient green+red double-class on a clicked computed-missed day). Custom `DayButton` renders ✓/✗ from modifiers, falling back to the day number. Future days disabled. Read-only this phase (no `onDayClick` wiring yet).

**Contract**: props `{ data: HabitCalendarResponse; numberOfMonths: number; startMonth: Date }`. `<DayPicker ISOWeek numberOfMonths={…} startMonth={…} disabled={{ after: today }} modifiers={…} modifiersClassNames={…} components={{ DayButton: HabitDayButton }} />`. Status lookup is `Set`-based (cheatsheet perf guidance). Months wrap in a responsive grid (1 col mobile → multiple wide); page scrolls.

#### 6. Calendar controls — span + window navigation

**File**: `apps/web/src/features/habits/components/SpanControl.tsx` (new), `apps/web/src/features/habits/components/CalendarNav.tsx` (new)

**Intent**: Two sibling controls in the calendar's toolbar. `SpanControl` is a segmented control (3 / 6 / 12 / All, default 3) setting *how many* months render. `CalendarNav` sets *where* the window sits: prev/next buttons that shift the window anchor (backward **unbounded**, forward clamped at the current month) plus a compact **month-year jump** picker to reach a far-back month directly. Navigation is anchored to the calendar, not to marks, so a month before the first mark is reachable for first-time backfill. For span `'all'`, prev/next/jump are hidden (the window already spans the capped history).

**Contract**: `SpanControl { value: CalendarSpan; onChange: (s: CalendarSpan) => void; allEnabled: boolean }`; accessible button group — the **All** option is disabled when `allEnabled` is false (habit has zero marks / `firstMarkDate == null`), so the span can never resolve to an undefined window. `HabitDetail` passes `allEnabled={firstMarkDate != null}`. `CalendarNav { endMonth: string /* YYYY-MM */; onChange: (month: string) => void; max: string /* current month */ }` — prev/next buttons (next disabled at `max`, prev never disabled) + labelled month/year selects.

#### 7. Detail page shell

**File**: `apps/web/src/features/habits/components/HabitDetail.tsx` (new)

**Intent**: Compose header (name, modality badge, frequency + target text) + the calendar controls (`SpanControl`, `CalendarNav`) + `HabitCalendar`, with loading/error/empty states. Owns both the `span` state and the `endMonth` window-anchor state (default = current month, local), and derives the render window via `calendarWindow(span, endMonth, firstMarkDate)`.

**Contract**: `{ habitId: string }`. Reads `useHabitCalendar` for the active (navigated) window, passing `todayLocalISO()` as `today`; changing span or `endMonth` refetches the new range. Renders the header from `data.habit`.

#### 8. Route

**File**: `apps/web/src/routes/_authed/habits.$habitId.tsx` (new)

**Intent**: Thin route — auth `beforeLoad` guard mirroring `_authed.tsx`; renders `<HabitDetail habitId={…} />` from `useParams`. `routeTree.gen.ts` regenerates on save (never hand-edit).

**Contract**: `createFileRoute('/_authed/habits/$habitId')` → path `/habits/$habitId`.

#### 9. List → detail link

**File**: `apps/web/src/features/habits/components/HabitRow.tsx`

**Intent**: Wrap the name/info area in `<Link to="/habits/$habitId" params={{ habitId: habit.id }}>`; keep the existing mark-today toggle button as a sibling (not nested in the Link) so the two click targets stay independent.

**Contract**: row opens detail on info-area click; the toggle button continues to mark today.

#### 10. Types + styles

**File**: `apps/web/src/features/habits/types.ts`, `apps/web/src/styles.css`

**Intent**: Add `HabitCalendarResponse`, `FailedPeriod`, `CalendarSpan` (reuse `Modality`/`Frequency`/`MarkStatus`). Add any status utility classes needed for `modifiersClassNames` (green/red/today/period-tint); import react-day-picker base styles.

**Contract**: types mirror the Phase 1 §3 response; Tailwind v4 only (slash opacity, no config file).

### Success Criteria:

#### Automated Verification:

- [ ] Typecheck passes: `npm run typecheck -w @habitpair/web`
- [ ] Lint passes: `npm run lint -w @habitpair/web`
- [ ] Existing tests stay green: `npm run test -w @habitpair/web`
- [ ] Build passes: `npm run build -w @habitpair/web`

#### Manual Verification:

- [ ] Clicking a habit's info area on the list opens its detail page; the mark-today button on the row still works and does not navigate.
- [ ] Calendar shows 3 months by default; SpanControl switches to 6 / 12 / All; All spans first-mark → today (capped 24 months).
- [ ] Prev/next and the month-year jump page the window back without limit; a month **before the first mark** is reachable (so a first-time backfill years ago is possible); forward stops at the current month.
- [ ] Columns are Monday-first (ISO); 5–6 week rows per month.
- [ ] Coloring matches the backend: green ✓ completed, red ✗ for explicit-missed and daily computed-missed, period tint on failed closed weeks/months, today marker, neutral before the anchor and in in-progress periods.
- [ ] Future days are visually disabled; responsive at mobile width (single column).

**Implementation Note**: Pause for manual confirmation before Phase 3.

---

## Phase 3: Retroactive marking (3-state cycle)

### Overview

Wire clicking a day to cycle its **stored** status via the existing write endpoints, with optimistic calendar updates and invalidation of the habit list's current-period cache.

### Changes Required:

#### 1. Cycle mutation

**File**: `apps/web/src/features/habits/hooks/useCycleMark.ts` (new)

**Intent**: Mutation that advances a day's **stored** status: absent → `PUT COMPLETED` → `PUT MISSED` → `DELETE` (absent). Optimistically update the active calendar query cache; on settle, invalidate the calendar key and the list key `['habits', todayLocalISO()]` (a retroactive change can alter the current period shown on the list). Mirrors `useToggleMark`'s cancel/snapshot/rollback/invalidate structure. The optimistic write touches `marks` only: daily ✓/✗ recolors instantly because stored marks win (Phase 2 §5), while weekly/monthly **period-tint reconciles on the settle refetch** (computed period outcomes are not re-derived client-side) — acceptable, since the clicked cell itself is optimistic.

**Contract**: `useCycleMark(habitId, from, to, today)` returning a mutation taking `{ date: string; storedStatus: MarkStatus | null }`. Optimistic update + invalidation target the calendar key `['habits', habitId, 'calendar', from, to, today]`. Next-status function is pure and unit-reasoned: `null→COMPLETED`, `COMPLETED→MISSED`, `MISSED→null`. Reuses `putMark`/`deleteMark` from `api/habits.ts`.

#### 2. Wire clicks into the calendar

**File**: `apps/web/src/features/habits/components/HabitCalendar.tsx`

**Intent**: Add `onDayClick(date, modifiers)` → ignore if `modifiers.disabled` (future); otherwise look up the **stored** mark for that local date key and call the cycle mutation. Disable interaction while a mutation is pending for that cell.

**Contract**: `onDayClick` keys off `data.marks[localKey(date)] ?? null` (stored), never the computed color. `HabitDetail` passes the mutation in (or the component reads `useCycleMark` with the active window).

### Success Criteria:

#### Automated Verification:

- [ ] Typecheck passes: `npm run typecheck -w @habitpair/web`
- [ ] Lint passes: `npm run lint -w @habitpair/web`
- [ ] Existing tests stay green: `npm run test -w @habitpair/web`
- [ ] Build passes: `npm run build -w @habitpair/web`

#### Manual Verification:

- [ ] Clicking a past day cycles unmarked → completed → missed → unmarked; the change persists across a page reload.
- [ ] A daily computed-missed (red, unmarked) day becomes completed on the first click (cycle uses stored state, not the color).
- [ ] Marking a day inside the current period updates the habit list's progress (list cache invalidated).
- [ ] The cell updates feel instant (optimistic), and a simulated network failure rolls the cell back.
- [ ] Future days remain non-interactive.

**Implementation Note**: Final phase — confirm the full walkthrough across daily, weekly, and monthly habits.

---

## Testing Strategy

### Unit Tests (habits-api, Jest, mock Prisma):

- `period.ts`: daily computed-missed (gaps, anchor boundary, today/future excluded); weekly/monthly closed-period failure vs in-progress (not failed) vs target-met (not failed); `monthSpan` validation + max-span guard; UTC/DST round-trip asserted via `formatDateOnly` (mirrors S-01's date-contract tests).
- `habits.service.getCalendar`: ownership 404; anchor selection; correct assembly per frequency; marks-in-range query bounds.

### Integration / e2e (habits-api, real Postgres):

- `GET /habits/:habitId/calendar` for each frequency; 401 (no/foreign token); 404 (other user's habit); 400 (bad `from`/`to`); retroactive `PUT` then `GET` reflects the new status. Extend `apps/habits-api/test/app.e2e-spec.ts` in its existing style (two synthetic users, real JWTs).

### Manual Testing Steps:

1. Create one habit per frequency; backfill a few past marks (incl. an old one to move the anchor).
2. Open each detail page; verify coloring rules, anchor neutrality, Monday-first grid, span switching, future-disabled.
3. Cycle several past days; reload; confirm persistence and list-progress consistency.
4. Resize to mobile width; confirm single-column month-grid.

## Performance Considerations

- Status lookups via `Set`/`Record` keyed by `YYYY-MM-DD` (not large `Date[]`), per the cheatsheet.
- Only the window's `numberOfMonths` ever mount; prev/next/jump reposition the window without increasing mounted months, so unbounded back-reach stays cheap (no virtualization needed). `'All'` is soft-capped at 24 months client-side; backend `monthSpan` rejects > 36 months per request.
- React Compiler 1.0 handles memoization — no manual `useMemo`/`useCallback` unless a value crosses into a non-React API.
- Retroactive cycle is optimistic, keeping perceived response < 300 ms (NFR) independent of server latency.

## Migration Notes

None — no schema change. The `Mark` model, `@@unique([habitId, date])`, and write endpoints are reused as-is.

## References

- Library choice & rationale: `context/changes/habit-calendar-and-backfill/calendar-library-review.md`
- API how-to: `context/changes/habit-calendar-and-backfill/react-day-picker-v10-cheatsheet.md`
- Prior slice (conventions inherited): `context/changes/create-habit-and-mark-today/plan.md`
- Backend date/period helpers to extend: `apps/habits-api/src/marks/period.ts:11-41`
- Computation precedent: `apps/habits-api/src/habits/habits.service.ts:24-59`
- Write path reused: `apps/habits-api/src/marks/marks.controller.ts:16-24`
- Optimistic-mutation precedent: `apps/web/src/features/habits/hooks/useToggleMark.ts`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Backend calendar read-model

#### Automated

- [x] 1.1 Lint passes: `npm run lint -w @habitpair/habits-api` — 428686f
- [x] 1.2 Unit specs pass (daily computed-missed, anchor boundary, today/future excluded, weekly/monthly closed vs in-progress, target-met, UTC/DST round-trip, monthSpan guard) — 428686f
- [x] 1.3 e2e passes (calendar endpoint per frequency, 404 ownership, 400 bad range, retroactive write reflected) — 428686f
- [x] 1.4 Build passes: `npm run build -w @habitpair/habits-api` — 428686f

#### Manual

- [x] 1.5 `curl` daily habit with gaps → computedMissedDates correct, none before firstMarkDate — 428686f
- [x] 1.6 `curl` 2×/week habit → satisfied week absent from failedPeriods, under-target closed week present — 428686f

### Phase 2: Detail page + multi-month calendar (read-only)

#### Automated

- [x] 2.1 Typecheck passes: `npm run typecheck -w @habitpair/web`
- [x] 2.2 Lint passes: `npm run lint -w @habitpair/web`
- [x] 2.3 Existing tests stay green: `npm run test -w @habitpair/web`
- [x] 2.4 Build passes: `npm run build -w @habitpair/web`

#### Manual

- [x] 2.5 List row info-area opens detail; mark-today button still works and does not navigate
- [x] 2.6 Default 3 months; SpanControl switches 6 / 12 / All; All spans first-mark → today (capped 24mo)
- [x] 2.7 Prev/next + month-year jump page back without limit; a month before the first mark is reachable; forward stops at current month
- [x] 2.8 Monday-first ISO columns; 5–6 rows per month
- [x] 2.9 Coloring matches backend (✓ completed, ✗ explicit + daily computed, period tint, today marker, neutral before anchor / in-progress)
- [x] 2.10 Future days disabled; responsive single-column on mobile

### Phase 3: Retroactive marking (3-state cycle)

#### Automated

- [ ] 3.1 Typecheck passes: `npm run typecheck -w @habitpair/web`
- [ ] 3.2 Lint passes: `npm run lint -w @habitpair/web`
- [ ] 3.3 Existing tests stay green: `npm run test -w @habitpair/web`
- [ ] 3.4 Build passes: `npm run build -w @habitpair/web`

#### Manual

- [ ] 3.5 Click cycles unmarked → completed → missed → unmarked; persists across reload
- [ ] 3.6 Daily computed-missed day becomes completed on first click (cycle uses stored state)
- [ ] 3.7 Marking inside the current period updates list progress (cache invalidated)
- [ ] 3.8 Optimistic update feels instant; simulated failure rolls back
- [ ] 3.9 Future days remain non-interactive
