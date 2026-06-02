# Create a Habit and Mark Today (S-01) Implementation Plan

## Overview

S-01 is the north-star activation slice: a freshly-registered user lands on `/app`, creates their first habit (name, modality, frequency, and — for weekly/monthly — a target count), toggles today's status, and sees the habit on a modality-grouped list showing the current period's progress against its target — all within ~1 minute of signup.

This slice introduces the **real** `Habit` + `Mark` data model (replacing the mock `Habit` table), four authenticated habits-api endpoints, and a `/app` habits feature on the SPA. It is deliberately **today-only**: marking is limited to the current day from the list. The monthly calendar and any-past-day (retroactive) marking are the next slice (S-02); streaks and rolling metrics are S-03.

## Current State Analysis

- **Data:** `apps/habits-api/prisma/schema.prisma` holds a mock `Habit` (`id` cuid, `userId`, `title`, `createdAt`) with one init migration `20260522100152_init`. The roadmap and frame explicitly treat this as throwaway scaffolding — S-01 builds the real model. No `Mark` entity exists. No date library is installed (confirmed: `apps/habits-api/package.json`, `apps/web/package.json`).
- **Backend conventions (set by F-01):** global `ValidationPipe` with `{ whitelist, transform, forbidNonWhitelisted }` is wired in [main.ts:9](apps/habits-api/src/main.ts); `CreateHabitDto` already uses `class-validator` ([create-habit.dto.ts](apps/habits-api/src/habits/dto/create-habit.dto.ts)). `JwtGuard` verifies HS256 bearer tokens and exposes `req.user.sub` as the userId ([jwt.guard.ts](apps/habits-api/src/auth/jwt.guard.ts), [jwt-payload.ts](apps/habits-api/src/auth/jwt-payload.ts)). The habits controller is `@Controller()` under the global prefix `habits`; `HabitsService` injects `PrismaService` and queries `this.prisma.habit`. `PrismaClient` is imported from `../../generated/prisma`.
- **Frontend conventions (set by F-01, documented in [apps/web/CLAUDE.md](apps/web/CLAUDE.md)):** feature-based folders — `features/<feature>/{components,hooks,api,types.ts}`; cross-cutting code in `shared/`. `api/` is React-free (request fns + query-option factories); `hooks/` holds all React hooks incl. TanStack Query wrappers. The `habitsApi` client ([apiClient.ts:45](apps/web/src/shared/api/apiClient.ts)) is the refreshable client for habits-api (auto-attaches the bearer token, refresh-retries on 401). `queryClient` defaults: `staleTime` 30s, `retry` 1. `register.tsx` navigates to `/app` on success; `/app` ([_authed/app.tsx](apps/web/src/routes/_authed/app.tsx)) is currently a "No habits yet" placeholder. The `_authed` pathless layout gates every authenticated route.
- **Versions:** Prisma 6 (supports `@default(uuid(7))` and `@db.Date`), `@nestjs/jwt` 11, class-validator 0.15 / class-transformer 0.5, TanStack Query 5.100 (optimistic `onMutate`/`onError`/`onSettled`), TanStack Router 1.170, React 19, Vitest 4.

## Desired End State

After this plan:

- A new user, immediately after registering, can on `/app`: open a "create habit" form, pick a name + modality (positive/negative) + frequency (daily/weekly/monthly) + target count (shown only for weekly/monthly), submit, and see the habit appear in its modality group.
- Each habit row shows the current period's progress against its target ("completed"/"not done" for daily; "X of N this week"/"this month" for weekly/monthly) and a done-toggle reflecting today's status.
- Tapping the toggle marks today completed (or clears it), with the visible state changing within 300 ms (optimistic update). The mark persists across reloads and across sign-out/sign-in on another device.
- All habits-api endpoints are authenticated and per-user scoped; no request returns or mutates another user's data.

**Verification:** automated tests for per-user isolation, the mark write contract (date kept verbatim, upsert/delete idempotency), and current-period progress math all pass; manual browser walkthrough of the full register→create→toggle→reload flow succeeds.

### Key Discoveries

- **Per-day discrete `Mark` rows, absence = unmarked** (frame, STRONG): one row per `(habit, day)`; a row exists only on an explicit mark; unmark = delete the row. `MISSED` is a real enum value but is **never auto-written** in S-01 — the "past unmarked day = failure" rule is a read-time S-03 computation, not stored data.
- **Local-calendar-date keying** (frame, "the real trap"): each mark is keyed by a local calendar date, never a UTC instant. The server has no stored user timezone (auth `User` is id+email only), so the **client supplies its local date**. The auth-api date precedent (token expiry as a UTC instant, `token.service.ts:28`) is the *right* shape for an instant but the *wrong* shape to copy for a calendar day.
- **Compute-on-read, no materialization** (frame, performance check): the data is tiny; statistics (S-03) are computed from `Mark` rows at request time. S-01 stores nothing derived. **No recompute seam is built in S-01** (user decision — pure compute-on-read; the seam is migration-free to add in S-03 if a concrete need appears).
- **Derive period success, don't store it** (frame, STRONG): weekly/monthly progress is a count of `COMPLETED` daily marks within the period — never a stored per-period success flag.

## What We're NOT Doing

- **No calendar, no retroactive / past-day marking** — that is S-02 (`habit-calendar-and-backfill`). S-01 marks today only from the list.
- **No streaks, rolling-window %, adaptive ratio, or longest streak** — S-03 (`habit-insight-metrics`).
- **No habit edit or delete** — S-04 (`edit-and-delete-habit`). (The `Mark.habit` relation uses `onDelete: Cascade` so S-04's delete is ready, but no delete endpoint ships here.)
- **No recompute seam / stats hook** — deliberately deferred (compute-on-read).
- **No file import** of historical data — permanent MVP non-goal (manual day-by-day calendar entry in S-02 is the supported path).
- **No explicit "missed" affordance on the daily list control** — the daily toggle is completed↔unmarked; explicit `MISSED` gets its UI on S-02's calendar.
- **No user-timezone field** — the client is the authority on the local day.

## Implementation Approach

Build bottom-up: data model → backend read/write endpoints → frontend. The SPA cannot be exercised without the API, so backend precedes frontend. The three hard-to-reverse decisions (per-day rows, local-date keying, derive-don't-store) all land in Phase 1–3 and are locked by tests before the UI is built on top of them.

The single most error-prone area is date handling — see Critical Implementation Details.

## Critical Implementation Details

- **`@db.Date` UTC-midnight gotcha.** Prisma maps `DateTime @db.Date` to a JS `Date` at **UTC midnight**. A mark date must be constructed and read as a date-only value: parse `"YYYY-MM-DD"` as `new Date(\`${s}T00:00:00.000Z\`)` (UTC), and format back with `date.toISOString().slice(0, 10)`. **Never** apply local-timezone conversion (`getDate()`, `toLocaleDateString()`, `new Date("2026-06-02")` without the explicit `Z`) — on a server whose TZ is behind UTC this shifts the stored/returned day by one. A single shared date util owns parse/format so the rule lives in one place.
- **Client local-date contract.** The browser must compute `"YYYY-MM-DD"` from **local** components (`getFullYear`/`getMonth`+1/`getDate`, zero-padded), NOT `new Date().toISOString()` (which is UTC and yields the wrong day near local midnight). This is the user's "open the app at 23:00 and it's still today" requirement.
- **Optimistic count reconciliation.** Toggling today on a weekly/monthly habit changes that period's `completedCount` by ±1. `onMutate` must update both `todayStatus` and `currentPeriod.completedCount` in the cached list; `onError` rolls back; `onSettled` invalidates `['habits', today]` to reconcile with the server.
- **Ownership check returns 404, not 403.** Mark endpoints first confirm the habit belongs to `req.user.sub`; on miss, throw `NotFoundException` (not `Forbidden`) so habit existence is not leaked across users.
- **Squash migration ⇒ local DB reset.** Replacing the init migration means any local dev DB that already applied the old init is out of sync; developers run `npm run migrate -w @habitpair/habits-api` against a reset DB (or `prisma migrate reset`). Safe — the mock table holds no real data. CI spins up a fresh Postgres and runs `migrate:deploy`, so it applies the single fresh init cleanly.

---

## Phase 1: Real data model + migration

### Overview

Replace the mock `Habit` with the real `Habit` + `Mark` schema and a fresh squashed init migration; regenerate the Prisma client.

### Changes Required:

#### 1. Prisma schema

**File**: `apps/habits-api/prisma/schema.prisma`

**Intent**: Define the real domain model carrying the three load-bearing decisions. Replace the mock `Habit` entirely.

**Contract**:
- `enum HabitModality { POSITIVE, NEGATIVE }`, `enum HabitFrequency { DAILY, WEEKLY, MONTHLY }`, `enum MarkStatus { COMPLETED, MISSED }`.
- `Habit`: `id String @id @default(uuid(7))`, `userId String`, `name String`, `modality HabitModality`, `frequency HabitFrequency`, `targetCount Int?` (null = daily implicit 1), `createdAt DateTime @default(now())`, `marks Mark[]`, `@@index([userId])`.
- `Mark`: `id String @id @default(uuid(7))`, `habitId String`, `date DateTime @db.Date`, `status MarkStatus`, `createdAt DateTime @default(now())`, `habit Habit @relation(fields: [habitId], references: [id], onDelete: Cascade)`, `@@unique([habitId, date])`.
- The `@@unique([habitId, date])` already provides the composite index that serves every access pattern — do **not** add a redundant `@@index([habitId, date])`.
- Keep the existing `datasource`/`generator` blocks unchanged (output stays `../generated/prisma`).

#### 2. Migration (squash to fresh init)

**File**: `apps/habits-api/prisma/migrations/`

**Intent**: One clean init migration for the real schema, per the chosen squash strategy.

**Contract**: Delete the `20260522100152_init/` directory, then run `npm run migrate -w @habitpair/habits-api` (`prisma migrate dev`) to generate a single fresh init containing both enums, both tables, the unique constraint, and the FK. Regenerate the client (`npm run generate -w @habitpair/habits-api`).

### Success Criteria:

#### Automated Verification:

- Fresh migration applies cleanly against a reset DB: `npm run migrate -w @habitpair/habits-api`
- Prisma client regenerates: `npm run generate -w @habitpair/habits-api`
- Backend compiles (typecheck via build): `npm run build -w @habitpair/habits-api`

#### Manual Verification:

- `npm run studio -w @habitpair/habits-api` shows `Habit` + `Mark` with the enums and the `(habitId, date)` unique constraint; the mock `title` column is gone.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: habits-api — create habit + list with current-period progress

### Overview

Expand habit creation to the full field set with cross-field target validation, and make `GET /habits` return each habit with its current-period progress computed from the client-supplied local date.

### Changes Required:

#### 1. Date + period helper

**File**: `apps/habits-api/src/marks/period.ts` (new; shared by habits + marks services)

**Intent**: Single home for the date-only parse/format rules and current-period boundary math, so the `@db.Date` gotcha is solved once.

**Contract**: Pure functions, no I/O —
- `parseDateOnly(s: string): Date` — validate `^\d{4}-\d{2}-\d{2}$` + real calendar date (throw `BadRequestException` otherwise), return `new Date(\`${s}T00:00:00.000Z\`)`.
- `formatDateOnly(d: Date): string` — `d.toISOString().slice(0, 10)`.
- `currentPeriodRange(frequency, today: Date): { start: Date; end: Date }` — daily: `[today, today]`; weekly: `[ISO-Monday-of-week, today]`; monthly: `[first-of-month, today]`. All computed with UTC getters on the date-only value (never local TZ). Covered by the progress-math tests.

#### 2. Create-habit DTO with cross-field target validation

**File**: `apps/habits-api/src/habits/dto/create-habit.dto.ts`

**Intent**: Replace the `title`-only DTO with the full creation contract; enforce "target required for weekly/monthly, absent for daily" at the validation boundary.

**Contract**: Fields `name` (trimmed, `@IsString` `@IsNotEmpty`), `modality` (`@IsEnum(HabitModality)`), `frequency` (`@IsEnum(HabitFrequency)`), `targetCount` (`@IsInt` `@Min(1)`, applied only when frequency is weekly/monthly via `@ValidateIf(o => o.frequency !== HabitFrequency.DAILY)`). Import the enums from `../../../generated/prisma`. The service normalizes `targetCount` to `null` for daily regardless of input.

#### 3. HabitsService — create + list-with-progress

**File**: `apps/habits-api/src/habits/habits.service.ts`

**Intent**: Persist the full habit; compute per-habit current-period progress for the list.

**Contract**:
- `create(userId, dto)`: write all fields; force `targetCount = null` when `frequency === DAILY`.
- `findByUser(userId, today: string)`: return each habit plus `todayStatus: MarkStatus | null` (the `(habitId, today)` mark's status or null) and `currentPeriod: { kind: HabitFrequency; completedCount: number; target: number }` where `completedCount` = count of `COMPLETED` marks in `currentPeriodRange`, and `target` = `targetCount ?? 1`. Scope every query by `userId`. Small data — a per-habit count query or a single batched marks query are both acceptable.

#### 4. HabitsController — POST + GET with `?today`

**File**: `apps/habits-api/src/habits/habits.controller.ts`

**Intent**: Wire the two endpoints; pass the client's local date into the list.

**Contract**: `POST /habits` → `create(req.user.sub, dto)`. `GET /habits?today=YYYY-MM-DD` → validate `today` (via `parseDateOnly`) and return `findByUser(req.user.sub, today)`. Both already gated by the controller-level `@UseGuards(JwtGuard)`. (Modality grouping is a frontend concern — the API returns a flat list including `modality`.)

#### 5. Tests

**File**: `apps/habits-api/src/habits/habits.service.spec.ts` (new)

**Intent**: Lock per-user isolation and progress math.

**Contract**: (a) `findByUser` returns only the caller's habits and never another user's; (b) daily/weekly/monthly `completedCount` vs `target` is correct for an in-progress period given marks fixtures around period boundaries (incl. the ISO-Monday boundary and month boundary); (c) creating a daily habit stores `targetCount = null`, weekly/monthly stores the provided value.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test -w @habitpair/habits-api -- habits.service`
- Lint passes: `npm run lint -w @habitpair/habits-api`
- Build/typecheck passes: `npm run build -w @habitpair/habits-api`

#### Manual Verification:

- `curl` with a valid bearer token: `POST /habits` creates daily and weekly habits; `GET /habits?today=<local-date>` returns them with correct `todayStatus: null` and `currentPeriod`.
- A weekly habit with no marks shows `completedCount: 0`; `targetCount` omitted on a weekly create is rejected with a 400.

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 3: habits-api — mark / unmark today

### Overview

Add the per-day mark write contract: upsert a mark for a given date, delete it to unmark, both scoped to a habit the caller owns.

### Changes Required:

#### 1. Marks module

**File**: `apps/habits-api/src/marks/marks.module.ts` (new), registered in `apps/habits-api/src/app.module.ts`

**Intent**: A cohesive feature module for the mark sub-resource, mirroring the habits module shape.

**Contract**: `MarksModule` declares `MarksController` + `MarksService`; `PrismaService` comes from the global `PrismaModule`. Add `MarksModule` to `AppModule.imports`.

#### 2. Update-mark DTO

**File**: `apps/habits-api/src/marks/dto/update-mark.dto.ts` (new)

**Intent**: Validate the PUT body.

**Contract**: `status` (`@IsEnum(MarkStatus)`). (S-01's UI only ever sends `COMPLETED`, but the endpoint accepts `MISSED` so S-02's calendar reuses it unchanged.)

#### 3. MarksService — upsert + remove with ownership

**File**: `apps/habits-api/src/marks/marks.service.ts` (new)

**Intent**: Enforce ownership, then write by `(habitId, date)`.

**Contract**:
- `upsert(userId, habitId, dateStr, status)`: confirm `habit` exists for `{ id: habitId, userId }` (else `NotFoundException`); `parseDateOnly(dateStr)`; `prisma.mark.upsert` keyed on the `habitId_date` compound unique (`create` with status, `update` status). Idempotent: a repeat PUT updates rather than duplicates.
- `remove(userId, habitId, dateStr)`: confirm ownership; `prisma.mark.deleteMany({ where: { habitId, date } })` so unmarking an already-absent day is a no-op (no throw).

#### 4. MarksController — PUT + DELETE

**File**: `apps/habits-api/src/marks/marks.controller.ts` (new)

**Intent**: Expose the addressable per-day resource nested under habits.

**Contract**: `@Controller(':habitId/marks')` (resolves to `/habits/:habitId/marks` under the global prefix), `@UseGuards(JwtGuard)`. `@Put(':date')` → `upsert(req.user.sub, habitId, date, dto.status)`. `@Delete(':date')` → `remove(...)`, returning 204. The `:date` param is validated via `parseDateOnly` (bad format → 400).

#### 5. Tests

**File**: `apps/habits-api/src/marks/marks.service.spec.ts` (new)

**Intent**: Lock the write contract and ownership isolation.

**Contract**: (a) PUT stores the date verbatim — the round-tripped `formatDateOnly` equals the input string (no TZ shift); (b) a repeat PUT on the same `(habit, date)` updates status without creating a second row (unique holds); (c) DELETE removes the row and a second DELETE is a no-op; (d) upsert/remove against a habit owned by another user throws `NotFoundException` and writes nothing.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test -w @habitpair/habits-api -- marks.service`
- Full backend suite passes: `npm test -w @habitpair/habits-api`
- Lint + build pass: `npm run lint -w @habitpair/habits-api` && `npm run build -w @habitpair/habits-api`

#### Manual Verification:

- `curl PUT /habits/:id/marks/<today> {"status":"COMPLETED"}` then `GET /habits?today=<today>` shows `todayStatus: "COMPLETED"` and the weekly/monthly `completedCount` incremented.
- `curl DELETE /habits/:id/marks/<today>` clears it (`todayStatus: null`).
- A PUT against another user's habit id returns 404.

**Implementation Note**: Pause for manual confirmation before proceeding.

---

## Phase 4: web — habits feature on /app

### Overview

Build the `habits` frontend feature (mirroring the `auth` worked example): inline create form, modality-grouped list, and a done-toggle with optimistic update. Replace the `/app` placeholder.

### Changes Required:

#### 1. Local-date helper

**File**: `apps/web/src/features/habits/lib/today.ts` (new)

**Intent**: Produce the browser's local `YYYY-MM-DD` for `?today` and mark writes.

**Contract**: `todayLocalISO(): string` built from local `getFullYear`/`getMonth`+1/`getDate`, zero-padded. Must not use `toISOString()`. (See Critical Implementation Details.)

#### 2. Types

**File**: `apps/web/src/features/habits/types.ts` (new)

**Intent**: Feature input + response shapes.

**Contract**: `Modality`/`Frequency`/`MarkStatus` string-literal unions; `CreateHabitInput { name; modality; frequency; targetCount?: number }`; `HabitListItem { id; name; modality; frequency; targetCount; todayStatus: MarkStatus | null; currentPeriod: { kind; completedCount; target } }`.

#### 3. API layer (React-free)

**File**: `apps/web/src/features/habits/api/habits.ts` (new)

**Intent**: Transport + query-option factory, following the `features/auth/api/auth.ts` request/error pattern using `habitsApi`.

**Contract**: `habitsQueryOptions(today)` → `{ queryKey: ['habits', today], queryFn }` hitting `GET /habits?today=`; `createHabit(input)` → `POST /habits`; `putMark(habitId, date, status)` → `PUT /habits/:id/marks/:date`; `deleteMark(habitId, date)` → `DELETE`. Reuse an `errorMessage(response)` helper mirroring auth's.

#### 4. Hooks

**File**: `apps/web/src/features/habits/hooks/` (new — `useHabits.ts`, `useCreateHabit.ts`, `useToggleMark.ts`)

**Intent**: TanStack Query wrappers; the toggle carries the optimistic update.

**Contract**:
- `useHabits()` → `useQuery(habitsQueryOptions(todayLocalISO()))`.
- `useCreateHabit()` → `useMutation(createHabit)` invalidating `['habits', today]` on success.
- `useToggleMark()` → `useMutation` that PUTs `COMPLETED` when currently unmarked and DELETEs when currently `COMPLETED`. `onMutate`: cancel queries, snapshot, optimistically flip `todayStatus` and adjust `currentPeriod.completedCount` by ±1 in the cached list. `onError`: restore snapshot. `onSettled`: invalidate `['habits', today]`. (See Critical Implementation Details — count reconciliation.)

#### 5. Components

**File**: `apps/web/src/features/habits/components/` (new — `CreateHabitForm.tsx`, `HabitList.tsx`, `HabitRow.tsx`)

**Intent**: The two screens. Mirror `RegisterForm` for form/markup/Tailwind/accessibility conventions.

**Contract**:
- `CreateHabitForm`: controlled inputs for name, modality, frequency; the target-count input renders only when frequency is weekly/monthly; submit calls `useCreateHabit`; shows pending/disabled + `role="alert"` error like `RegisterForm`.
- `HabitList`: reads `useHabits`; renders two labelled groups (positive / negative) by `modality`; shows a prominent empty state hosting `CreateHabitForm` when there are no habits, and the form (or an "Add habit" affordance opening it) alongside the list otherwise.
- `HabitRow`: shows name + current-period progress text (daily: "Done today"/"Not done"; weekly/monthly: "{completedCount} of {target} this week|month") and a done-toggle (`aria-pressed`, keyboard-activatable) calling `useToggleMark`. Toggle "on" ⇔ `todayStatus === 'COMPLETED'`.

#### 6. Route wiring

**File**: `apps/web/src/routes/_authed/app.tsx`

**Intent**: Replace the placeholder with the habits feature.

**Contract**: Render `<HabitList />` (keeping the existing "Signed in as {email}" affordance via `useAuth` if desired). Route stays thin per the frontend CLAUDE.md.

### Success Criteria:

#### Automated Verification:

- Frontend typecheck passes: `npm run typecheck -w @habitpair/web`
- Lint passes: `npm run lint -w @habitpair/web`
- Build passes: `npm run build -w @habitpair/web`
- Existing tests still pass: `npm run test -w @habitpair/web`

#### Manual Verification:

- Full activation flow against `make up`: register → land on `/app` → create a daily habit → toggle it → status flips in well under 300 ms (optimistic) → reload → status persists.
- Create a weekly habit (target shown; target 2): toggle today → row reads "1 of 2 this week".
- Positive and negative habits render in separate modality groups.
- Toggle, then simulate a failed request (e.g., offline) → the optimistic state rolls back.
- Keyboard-only: the create form and the toggle are reachable and activatable via Tab/Enter/Space.

**Implementation Note**: Verify in the browser (preview tools) and share proof; pause for manual confirmation.

---

## Testing Strategy

### Unit Tests (Jest, habits-api):

- **Per-user isolation:** `findByUser` and the mark service never read/write another user's data.
- **Progress math:** daily/weekly/monthly `completedCount` vs `target` across period boundaries (ISO Monday, month start).
- **Mark write contract:** date stored verbatim (no TZ shift), upsert idempotency, DELETE idempotency, ownership 404.

### Integration / Manual:

- `curl` walkthrough of all four endpoints with a real bearer token (Phases 2–3 manual steps).
- Browser walkthrough of the activation flow (Phase 4 manual steps).

### Frontend:

- No required automated tests this slice (user decision). Existing Vitest suite must remain green; manual browser verification covers the optimistic toggle and create UX.

## Performance Considerations

Per the frame's performance check, no concern at this scale. Reads are bounded index range scans on `(habitId, date)`; the mark write is a single-row upsert independent of history size. The 300 ms responsiveness guardrail is met on the client via optimistic update, not server latency.

## Migration Notes

Squash strategy (Phase 1): the old init migration is deleted and replaced by a single fresh init. Local dev DBs that applied the old init must be reset (`prisma migrate reset` / re-run `migrate`) — safe, the mock table has no real data. CI runs `migrate:deploy` against a fresh Postgres and applies the single init cleanly. Production has no habits data yet.

## References

- Frame brief: `context/changes/create-habit-and-mark-today/frame.md`
- PRD: `context/foundation/prd.md` (US-01, US-02, FR-004/005/006/009; `## Business Logic`; NFRs: 300 ms, durability, TZ/DST)
- Roadmap: `context/foundation/roadmap.md` (S-01; S-02/S-03 boundaries)
- Backend pattern to mirror: [apps/habits-api/src/habits/](apps/habits-api/src/habits/), [jwt.guard.ts](apps/habits-api/src/auth/jwt.guard.ts)
- Frontend pattern to mirror: `apps/web/src/features/auth/` + [apps/web/CLAUDE.md](apps/web/CLAUDE.md)
- ID convention: `@default(uuid(7))` (project preference; replaces mock `cuid()`)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Real data model + migration

#### Automated

- [x] 1.1 Fresh migration applies cleanly against a reset DB — 17aa9cf
- [x] 1.2 Prisma client regenerates — 17aa9cf
- [x] 1.3 Backend compiles (build/typecheck) — 17aa9cf

#### Manual

- [x] 1.4 Prisma Studio shows Habit + Mark with enums and (habitId, date) unique; mock `title` gone — 17aa9cf

### Phase 2: habits-api — create habit + list with current-period progress

#### Automated

- [x] 2.1 Unit tests pass (`habits.service`) — 17aa9cf
- [x] 2.2 Lint passes — 17aa9cf
- [x] 2.3 Build/typecheck passes — 17aa9cf

#### Manual

- [x] 2.4 curl: POST creates daily + weekly habits; GET returns them with correct todayStatus/currentPeriod — 17aa9cf
- [x] 2.5 Weekly habit with no marks shows completedCount 0; weekly create without targetCount is rejected 400 — 17aa9cf

### Phase 3: habits-api — mark / unmark today

#### Automated

- [x] 3.1 Unit tests pass (`marks.service`) — 7d4d23e
- [x] 3.2 Full backend suite passes — 7d4d23e
- [x] 3.3 Lint + build pass — 7d4d23e

#### Manual

- [x] 3.4 curl: PUT mark today → GET shows COMPLETED + incremented count — 7d4d23e
- [x] 3.5 curl: DELETE clears it (todayStatus null) — 7d4d23e
- [x] 3.6 PUT against another user's habit returns 404 — 7d4d23e

### Phase 4: web — habits feature on /app

#### Automated

- [x] 4.1 Frontend typecheck passes
- [x] 4.2 Lint passes
- [x] 4.3 Build passes
- [x] 4.4 Existing Vitest suite stays green

#### Manual

- [x] 4.5 Activation flow: register → /app → create daily → toggle (<300 ms) → reload persists
- [x] 4.6 Weekly habit (target 2): toggle today → "1 of 2 this week"
- [x] 4.7 Positive/negative habits render in separate modality groups
- [x] 4.8 Failed mark request rolls back the optimistic state
- [x] 4.9 Keyboard-only: create form + toggle reachable and activatable
