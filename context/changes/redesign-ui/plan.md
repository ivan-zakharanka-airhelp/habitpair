# UI Redesign — Implement the Claude Design `Habitpair.html` Implementation Plan

## Overview

Re-skin the shipped habitpair SPA to match the Claude Design handoff (`context/changes/redesign-ui/design/Habitpair.html`), canonical look only: `soft` direction + `green` accent (`#2e7d5b`) + `muted` status + a real light/dark/system theme toggle. Per research, this is overwhelmingly a **frontend re-skin** — the domain model and every derived metric the design renders already exist server-side. The only backend touch in this change is a small, additive enrichment of `GET /habits`; the heavier cross-service work (data export, delete-account) is **split out** to a follow-up change.

The work is sequenced foundation-first: the token/theming layer and the shared primitive library must land before any screen can be recomposed, because we are porting the design's cohesive CSS component-class system wholesale (the single biggest architecture decision, per research).

## Current State Analysis

**Frontend** (`apps/web`, Vite 8 / React 19 / TanStack Router+Query / Tailwind v4, feature-sliced):
- `styles.css` is **9 lines**: `@import 'tailwindcss';`, `@import 'react-day-picker/style.css';`, and an `html { color-scheme: light; background-color: white }` pin. Zero tokens, no dark mode, no `@theme`.
- Shared UI = **two components only**: `Navbar.tsx`, `ConfirmDialog.tsx`. No Button/Field/Select/Dialog/Toast/Segmented/Skeleton/Card. The black-button pattern (`bg-black text-white`) is copy-pasted ~8 places. No toast system.
- Routes (`src/routes/`): `/` (placeholder landing, [index.tsx](apps/web/src/routes/index.tsx)), `/login`, `/register`, `/_authed` (gate), `/_authed/app` (dashboard), `/_authed/habits/$habitId` (detail). **No `/settings`.** Root layout = `<Navbar/>` + `<Outlet/>` ([__root.tsx:10](apps/web/src/routes/__root.tsx)).
- Habits feature: `HabitList`/`HabitRow` (list), `HabitDetail` (204 lines — edit/delete already on the detail page, S-04), `CreateHabitForm` (inline on list), `HabitCalendar` (react-day-picker v10 wrapper) + `CalendarNav` + `SpanControl`, `HabitMetrics`, `BestStreaks`. Hooks: `useToggleMark`/`useCycleMark` (optimistic + rollback + invalidate), `useCreateHabit`/`useUpdateHabit`/`useDeleteHabit`.
- Auth: `useAuth().user?.email` is populated on boot via the `/auth/refresh` response held in `authStore` (verified — **no `/auth/me` needed**).
- Tests: Vitest 4; only `metricsFormat`/`apiClient`/`authStore` unit + auth-form tests. **No component tests for any habits screen.**

**Backend** (`habits-api`, `auth-api`):
- `GET /habits?today=` ([habits.service.ts:34](apps/habits-api/src/habits/habits.service.ts)) returns each habit + `todayStatus` + `currentPeriod{kind,completedCount,target}`. It is **already per-habit N+1** (`habits.map(async …)` with 2 Prisma calls each). No `marks`/`streak`/`unit` in the list response today.
- `UpdateHabitDto` ([update-habit.dto.ts:9](apps/habits-api/src/habits/dto/update-habit.dto.ts)) whitelists **only `name` + `modality`**; `targetCount`/`frequency` are immutable (global `ValidationPipe({ forbidNonWhitelisted: true })`).
- Metrics engine ([metrics.ts](apps/habits-api/src/marks/metrics.ts)) is pure/Prisma-free and computes `currentStreak`, `currentRun`, `rollingConsistency`, `recentCompletion`, `bestStreaks`, `unit` — reusable for list enrichment.

**The design** (`Habitpair.html`, 3008 lines): single-file React UMD + Babel prototype with a `window.HP` localStorage mock engine and a "Tweaks" host protocol — **both dropped**. The CSS design system (lines 90–211 tokens + ~100 component classes) is the asset we port. A porting manifest (token list, class inventory, per-component props/structure, routing, landing sections) was produced during research and is the implementation reference.

## Desired End State

The SPA renders pixel-faithfully to the design's canonical look across all surfaces — landing, login/register, dashboard, detail, settings — in both light and dark themes (system-aware, no flash on reload), responsive from mobile to desktop. All shipped behavior is preserved: optimistic marking, immutable frequency, name+modality-only edit, hard confirm-dialog delete, demoted/collapsible best-streaks, and the calm/no-nudge PRD philosophy. Settings ships visually complete with a working theme toggle; Export and Delete-account render as visibly inert ("coming soon") placeholders pending the follow-up change.

Verify: `make lint`, `make test` (backend), `npm run typecheck -w @habitpair/web`, `npm run test -w @habitpair/web`, and `npm run build -w @habitpair/web` all pass; manual walkthrough of every screen in both themes at mobile + desktop widths matches the renders in `context/changes/redesign-ui/design/renders/`.

### Key Discoveries:
- **Token cascade collapses to constants.** Fixing direction=soft/accent=green/status=muted means the `[data-direction]`/`[data-accent]`/`[data-status]` layers reduce to: `:root` (light base) + one `[data-theme=dark]` block (merge the theme override at lines 144–157 + dark-green accent at 193 + dark-muted status at 203–206). The `quiet`/`editorial`/`classic` rules (~18 scattered CSS blocks) are dead — delete them.
- **Anti-flash is two-part** ([Habitpair.html:794](context/changes/redesign-ui/design/Habitpair.html)): a pre-mount inline script sets only `documentElement.style.background` (`#262320` dark / `#faf8f4` light) to kill the white flash; `data-theme={effTheme}` lands on the `.app` root at React mount.
- **List enrichment fits the existing per-habit block** ([habits.service.ts:42](apps/habits-api/src/habits/habits.service.ts)) and reuses the pure metrics engine; no schema change, no migration.
- **`react-day-picker` is dropped** in favor of the design's hand-rolled `MonthView`/`HistorySheet` (Mon-first grid, failure tints, today-ring, lazy multi-month). Removes `HabitCalendar.tsx` (rdp wrapper), `CalendarNav.tsx`, `SpanControl.tsx`, and the `react-day-picker/style.css` import.
- **`--font-body` is referenced but never defined** ([Habitpair.html:387](context/changes/redesign-ui/design/Habitpair.html)) — define it as `var(--font-sans)` during the port.
- **Vestigial design props to omit**: `Navbar`'s `effTheme/onTheme/route`, `HabitDetailScreen`'s `span/setSpan`, the `Switch` primitive (theme uses a `Segmented`, not a `Switch`), and the legacy `.row*`/`.markbtn*` classes.

## What We're NOT Doing

- **Export + delete-account backend** — split out to a follow-up change; Settings renders these rows inert. (Cross-service: auth-api owns the user, habits-api owns the data, no cross-DB FK.)
- **`targetCount` editing** — stays immutable (matches the design's edit modal AND the shipped backend whitelist). No backend change to PATCH.
- **`GET /auth/me`** — email is already client-side after refresh-on-boot.
- **`startDate` field / any new metric** — `firstMarkDate` anchors start; all detail metrics are already served. No day-of-week inference engine (the calendar grid IS the insight; `DowInsight` is a static landing mock).
- **The Tweaks panel, multi-accent/direction/status switcher, and the `window.HP` mock engine** — dropped entirely.
- **The `Switch` primitive** and dead `quiet`/`editorial`/`classic` CSS — not ported.
- **Stale root docs cleanup** — root `CLAUDE.md`/`README.md` still describe a flat FE layout and a non-existent "inline validation" convention; out of scope here (worth a separate cleanup).

## Implementation Approach

Port the design's CSS system wholesale into `styles.css` (collapsed to the canonical look, light + dark), exposing the palette via Tailwind v4 `@theme` for one-off layout utilities while the ~100 semantic component classes (`.hcard`, `.statcard`, `.markdot`, …) come over largely verbatim. Build the shared primitive library against those classes, then recompose each screen as a thin renderer over the existing TanStack Query data layer — preserving the optimistic-marking hooks and never reintroducing the mock's client-side period math or artificial delays. The dashboard's new per-row week strip + streak chip is fed by a small additive enrichment of the list read-model. The calendar is hand-rolled per the design, dropping `react-day-picker`.

## Critical Implementation Details

- **Token collapse + dark merge.** Build `styles.css` as: `@import 'tailwindcss';` → `@theme` palette exposure → `:root` (light base tokens) → a single `[data-theme="dark"]` block merging the design's theme/accent/status dark overrides → the ported component classes (with `quiet`/`editorial`/`classic` branches removed). Keep `--radius` at `14px` (the design sets it inline; a fixed `:root` value is equivalent once the switcher is gone). Define `--font-body: var(--font-sans)`.
- **Theme boot ordering.** The `index.html` inline script (quoted in the manifest) reads `localStorage['hp_theme']` + `matchMedia('(prefers-color-scheme: dark)')` and sets `documentElement.style.background` **before** the module bundle — it does NOT set `data-theme`. The themed content paints when React mounts and the root layout applies `data-theme={effTheme}` to the `.app` wrapper. Remove the old `color-scheme: light` pin. The system-preference `matchMedia` `change` listener must update `effTheme` live while `hp_theme === 'system'`.
- **Preserve optimistic marking.** The new `HabitCard` markdot/logbtn and the calendar's `onCycle` must call the existing `useToggleMark`/`useCycleMark` hooks unchanged (optimistic update + rollback + invalidate). Do not port the mock's 200ms `markToday` / 420ms detail-load delays.
- **List `currentStreak` cost.** Computing `currentStreak` per habit on the list reuses the metrics engine, which reads that habit's mark history — extending the existing per-habit fan-out. Acceptable at this app's scale (a handful of habits); if it ever matters, bound the read. `unit` is derived from `frequency` with no query.
- **Calendar correctness.** `MonthView` is Monday-first with leading pad cells; day tint priority is done/miss from `marks`, then `--failtint` from the `failedPeriods`-derived set, then `--today` ring, with future days disabled. `HistorySheet` lazy-renders months in batches of 6 via `IntersectionObserver`; Escape closes. Reuse the app's `lib/today.ts`/`lib/calendarRange.ts` date helpers rather than the design's mock helpers.

---

## Phase 1: Design Foundation — Tokens, Theming, Anti-flash

### Overview
Establish the styling and theming substrate the whole re-skin sits on: the ported OKLCH token system + component classes, light/dark/system theming with no flash, and the web font. After this phase the app still renders the *old* component markup, but on the new base styling with a working theme — proving the foundation before any screen is recomposed.

### Changes Required:

#### 1. Stylesheet — port the design system
**File**: `apps/web/src/styles.css`
**Intent**: Replace the 9-line stub with the design's full CSS system, collapsed to the canonical look (soft/green/muted) and split into a light `:root` + a single `[data-theme="dark"]` block; port the ~100 component classes verbatim minus dead direction/status branches; expose the palette via `@theme` for layout utilities.
**Contract**: Defines every semantic token (`--bg`/`-2`, `--surface`/`-2`, `--ink`/`-2`/`-3`, `--line`/`-2`, `--accent` family, `--success` family, `--miss` family, `--ring`, radius vars, font vars incl. `--font-body: var(--font-sans)`, component tokens `--card-*`/`--field-bg`/weights) and the component classes listed in the manifest (`.app`, `.container`, `.nav*`, `.btn*`, `.seg*`, `.field*`, `.card*`, `.dialog*`/`.scrim`, `.toast*`, `.skel`, `.today*`/`.ring*`, `.sect*`, `.hcard*`/`.wkstrip*`/`.pips*`/`.streakc*`/`.markdot*`/`.logbtn`, `.detail*`/`.backbtn`/`.tag*`/`.hmenu*`, `.metrics`/`.statcard*`/`.statring*`, `.hist*`/`.monthcard*`/`.mv*`/`.cal-cell*`/`.histsheet*`, `.streaks*`/`.streakrow*`, `.set*`/`.acct*`/`.avatar`, and all `.lp-*` landing classes). Remove the `react-day-picker/style.css` import and the `color-scheme: light` pin. Keep slash-opacity convention; no PostCSS pipeline.

#### 2. Web font
**File**: `apps/web/index.html` (and/or `styles.css` `@import`)
**Intent**: Load Hanken Grotesk (the design's sans/display face). Newsreader is unused in the canonical look — skip it.
**Contract**: Hanken Grotesk available to `--font-sans`/`--font-display`. Prefer a `<link>` in `index.html` head (or `@import` in CSS) consistent with how Tailwind v4 expects fonts.

#### 3. Anti-flash boot script
**File**: `apps/web/index.html`
**Intent**: Add the pre-mount inline script that sets the html background to the dark/light `--bg` approximation before the bundle loads, preventing a light flash on dark reload; add `#root:empty { min-height: 100vh }`.
**Contract**: Script reads `localStorage['hp_theme']` (default `'system'`) + `matchMedia('(prefers-color-scheme: dark)')`, sets `document.documentElement.style.background` to `#262320` (dark) or `#faf8f4` (light). Verbatim from manifest. Also port the `<meta name="theme-color" content="#2e7d5b">`.

#### 4. Theme store + hook
**File**: `apps/web/src/shared/lib/themeStore.ts`, `apps/web/src/shared/hooks/useTheme.ts` (new)
**Intent**: A singleton store (mirroring `authStore`'s `useSyncExternalStore` pattern) holding `hp_theme` ∈ {light,dark,system}, persisting to localStorage, tracking system preference via a `matchMedia` `change` listener, and deriving `effTheme` ∈ {light,dark}.
**Contract**: `useTheme()` → `{ theme, setTheme, effTheme }`. Key `hp_theme`. `effTheme = theme === 'system' ? (sysDark ? 'dark' : 'light') : theme`. No React-Compiler-defeating patterns; the matchMedia subscription is an external store (acceptable to memoize per CLAUDE.md).

#### 5. Apply `data-theme` at the root
**File**: `apps/web/src/routes/__root.tsx`
**Intent**: Wrap the layout in the design's `.app` root and set `data-theme={effTheme}` so the ported dark block applies app-wide from first mount.
**Contract**: `<div className="app" data-theme={effTheme} style={{ '--radius': '14px' }}>` wrapping `<Navbar/>` + `<Outlet/>`. (Drop `data-direction/-accent/-status` — collapsed into CSS.)

### Success Criteria:

#### Automated Verification:
- Type checking passes: `npm run typecheck -w @habitpair/web`
- Linting passes: `make lint`
- Web build compiles (CSS + app): `npm run build -w @habitpair/web`
- Existing tests stay green: `npm run test -w @habitpair/web`

#### Manual Verification:
- Theme toggle via `hp_theme` (set in localStorage / devtools) switches light↔dark and `system` follows OS preference live.
- No light-flash on a hard reload while in dark mode.
- Base typography (Hanken Grotesk), colors, and radii match the design's warm light / warm charcoal dark palettes.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 2: Shared Primitives + Shell

### Overview
Build the reusable UI-primitive library every screen consumes, plus the redesigned navbar + account dropdown. This is the API surface the rest of the re-skin depends on, so the primitives get unit tests.

### Changes Required:

#### 1. Icon sprite
**File**: `apps/web/src/shared/components/Icon.tsx` (new)
**Intent**: Inline SVG sprite with the design's 20 glyphs.
**Contract**: `Icon({ name, size=18, fill=false, className, style })`; `name` ∈ {check,x,chevL,chevR,arrowL,plus,sun,gear,trash,edit,download,logout,sprout,spark,flame,target,cal,chevD,chevU,moon}. `viewBox="0 0 24 24"`, stroke=currentColor, width 2, round caps, `aria-hidden`.

#### 2. Core primitives
**File**: `apps/web/src/shared/components/{Button,Field,Input,Select,Textarea,Segmented,Dialog,Toast,Skeleton,Card}.tsx` (new)
**Intent**: Port the design's primitives to React 19 modules, backed by the Phase-1 classes. `Dialog` replaces ad-hoc modals; `ConfirmDialog` is re-expressed on top of `Dialog` (or kept and restyled) for the delete flow.
**Contract**:
- `Button` — `variant` ∈ {primary,ghost,soft,danger,danger-solid}, `size` ∈ {sm,md,lg}, `block?`; renders `.btn .btn--*`.
- `Segmented` — `{ value, options, onChange, ariaLabel }`; `role=group` of `.seg__btn[aria-pressed]`; options as string | `{value,label,disabled}`.
- `Field`/`Input`/`Select`/`Textarea` — label + control + `.field__hint`/`.field__err`.
- `Dialog` — `{ open, title, children, onCancel, footer }`; `.scrim` (mousedown-backdrop → cancel) + `.dialog[role=dialog][aria-modal]`; Escape closes via keydown effect.
- `Skeleton` — `{ w, h=16, r }` → `.skel`.
- `Card` — `.card`/`.card--pad`.

#### 3. Toast system
**File**: `apps/web/src/shared/components/Toast.tsx`, `apps/web/src/shared/lib/toast.tsx` (toast host/context) (new)
**Intent**: A lightweight toast host mounted once, fired on mutation success (create/save/delete; export later). Calm UX — success confirmation only, no nudges.
**Contract**: `Toast({ message, duration=2600, onDone })` → `.toast[role=status]`. A `useToast()` (or imperative `toast(message)`) enqueues; host renders bottom-center and auto-dismisses. Host mounted in `__root.tsx` (inside `.app`).

#### 4. Navbar + AccountMenu
**File**: `apps/web/src/shared/components/Navbar.tsx` (rewrite), `apps/web/src/shared/components/AccountMenu.tsx` (new)
**Intent**: Replace the current navbar with the design's `.nav`: brand (dot-in-square mark + "habitpair") linking to list/landing by auth state; right side = `AccountMenu` avatar dropdown when authed (monogram from email; items Settings + danger Log out, outside-click + Escape close), else a "Log in" button.
**Contract**: `Navbar` reads `useAuth()`; `AccountMenu({ email })` uses `acctInitials(email)`; Settings item routes to `/settings` (route added Phase 5 — link can exist before). Omit the design's vestigial `effTheme/onTheme/route` props.

### Success Criteria:

#### Automated Verification:
- Primitive unit tests pass: `npm run test -w @habitpair/web` (Button variants, Segmented aria-pressed/onChange, Dialog open/Escape/backdrop, Toast auto-dismiss)
- Type checking passes: `npm run typecheck -w @habitpair/web`
- Linting passes: `make lint`
- Web build compiles: `npm run build -w @habitpair/web`

#### Manual Verification:
- Each primitive renders correctly in both light and dark themes.
- Navbar brand + AccountMenu dropdown work (open/close via click-outside and Escape); avatar monogram derives from the logged-in email.
- Dialog focus/Escape/backdrop-dismiss behave; Toast appears and auto-dismisses.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 3: Dashboard Re-skin + List Enrichment

### Overview
Recompose the authed dashboard to the design: `TodayHero` with completion `Ring`, Building/Breaking `Section`s of rich `HabitCard`s (7-day `WeekStrip` + flame `StreakChip` + markdot/logbtn/pips), and create-habit as a modal `Dialog`. Enrich `GET /habits` so the card renders in one round-trip.

### Changes Required:

#### 1. Enrich the list read-model (backend)
**File**: `apps/habits-api/src/habits/habits.service.ts` (method `findByUser`)
**Intent**: Add `recentMarks` (last 7 days), `currentStreak`, and `unit` per habit, computed inside the existing per-habit `Promise.all` block, reusing the pure metrics engine. No schema change, no migration.
**Contract**: Each list item gains `recentMarks: Array<{ date: string; status: 'COMPLETED' | 'MISSED' }>` (marks within the trailing 7-day window ending `today`), `currentStreak: number`, `unit: 'DAY' | 'WEEK' | 'MONTH'`. `unit` derived from `frequency` (no query); `currentStreak` via the metrics engine; `recentMarks` via a bounded `mark.findMany` over the 7-day range.

#### 2. List DTO/serialization (backend, if a response DTO exists)
**File**: `apps/habits-api/src/habits/` (controller/serialization layer)
**Intent**: Ensure the three new fields are returned (and over-fetched `userId`/`updatedAt` remain harmless).
**Contract**: Response includes the new fields; existing fields unchanged.

#### 3. Backend test for enrichment
**File**: `apps/habits-api/src/habits/habits.service.spec.ts` (or controller spec)
**Intent**: Cover the enriched shape — `recentMarks` window, `currentStreak`, `unit` per frequency.
**Contract**: Asserts the new fields for DAILY + WEEKLY/MONTHLY fixtures.

#### 4. FE list type + query
**File**: `apps/web/src/features/habits/types.ts`, `apps/web/src/features/habits/api/habits.ts`
**Intent**: Extend `HabitListItem` with `recentMarks`/`currentStreak`/`unit` (reuse existing `StreakUnit`).
**Contract**: `HabitListItem` gains the three fields; `getHabits()` return type updated.

#### 5. Dashboard components
**File**: `apps/web/src/features/habits/components/{TodayHero,Ring,Section,HabitCard,WeekStrip,StreakChip}.tsx` (new), replacing `HabitList.tsx`/`HabitRow.tsx`
**Intent**: Port the design's dashboard. `TodayHero` = weekday + date + "N of M done today" `Ring` (dailies only). `Section` = Building/Breaking header (colored dot, count, "New" add) over a card stack; returns null when empty. `HabitCard` = name + meta, `WeekStrip` (daily) or `.pips`/"N of M" (weekly/monthly), markdot (daily) or `.logbtn` (weekly/monthly), `StreakChip` when streak>0; NEGATIVE flips aria to "clean".
**Contract**: `HabitCard({ habit, onOpen, onMark, pending })` calls `useToggleMark`/`useCycleMark` (optimistic, unchanged). `WeekStrip({ recentMarks })` renders 7 cells oldest→newest with done/miss/today. Dashboard route ([_authed/app.tsx](apps/web/src/routes/_authed/app.tsx)) renders `TodayHero` + POSITIVE `Section` + NEGATIVE `Section`.

#### 6. Create-habit as modal
**File**: `apps/web/src/features/habits/components/CreateHabitForm.tsx` (rewrite to modal)
**Intent**: Wrap the create form in `Dialog`, opened from the `Section`/empty-state "New" buttons (was inline on the list).
**Contract**: `CreateHabitForm({ open, onClose, onCreate, pending, initialModality })`; name input + modality `Segmented` + frequency `Segmented` + conditional "times per week/month" number (hidden for DAILY); submits `{name,modality,frequency,targetCount}` via `useCreateHabit`; success → toast.

### Success Criteria:

#### Automated Verification:
- Backend tests pass (incl. enrichment): `npm test -w @habitpair/habits-api`
- Backend lint/build: `make lint` and `npm run build -w @habitpair/habits-api`
- FE type checking passes: `npm run typecheck -w @habitpair/web`
- FE tests pass (incl. a marking smoke test preserving optimistic semantics): `npm run test -w @habitpair/web`
- Web build compiles: `npm run build -w @habitpair/web`

#### Manual Verification:
- Dashboard matches `renders/list.png`: TodayHero ring, Building/Breaking sections, week strips, streak chips, markdot/log controls.
- Marking a daily habit is instant (optimistic) with no artificial delay; weekly/monthly "Log one" increments pips/count.
- Create-habit modal opens, validates, creates, closes, and fires a success toast; new habit appears in the correct section.
- Responsive: cards/sections reflow cleanly at mobile widths.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 4: Detail Re-skin — Metrics, Hand-rolled Calendar, Best Streaks, Kebab Actions

### Overview
Recompose the habit detail page: metric rings, the design's hand-rolled multi-month calendar (dropping `react-day-picker`), the demoted/collapsible Best Streaks leaderboard, and a kebab actions menu driving the edit modal + delete confirm — replacing the current inline edit/delete UI while preserving all S-04 behavior.

### Changes Required:

#### 1. Metrics strip
**File**: `apps/web/src/features/habits/components/{HabitMetrics,MetricCard,StatRing,Ring}.tsx` (rewrite `HabitMetrics`; new `MetricCard`/`StatRing`; reuse `Ring` from Phase 3)
**Intent**: Three `MetricCard`s — Current streak (flame; sub = "Best · N days" personal-best logic), Consistency (spark; ring = rolling %), Completion (target; ring = all-time %). Use "—" not zeros for empty/`denominator===0` (S-03 rule).
**Contract**: `HabitMetrics({ metrics, firstMarkDate })` over `HabitMetricsResponse`; `MetricCard({ label, value, unit, sub, ico, ringPct, tone })`; `StatRing({ pct, tone })`. Reuse existing `lib/metricsFormat.ts`.

#### 2. Hand-rolled calendar
**File**: `apps/web/src/features/habits/components/{MonthView,CalLegend,HistorySheet,HabitCalendar}.tsx` (rewrite); **delete** `CalendarNav.tsx`, `SpanControl.tsx`, and the rdp-based internals
**Intent**: Port the design's calendar. `MonthView` = Mon-first grid with leading pad cells, day tint done/miss/failtint/today, future disabled, click → `onCycle(iso)`. `HabitCalendar` = responsive 1–3 month sliding window bounded by `firstMarkDate`..today, "View full history" → `HistorySheet` (modal, lazy months in batches of 6 via IntersectionObserver, Escape closes). `CalLegend` = Done/Missed/Today.
**Contract**: Consumes `HabitCalendarResponse` (`marks`, `computedMissedDates`/`failedPeriods`, `firstMarkDate`); `onCycle` → existing `useCycleMark` (daily cycles COMPLETED→MISSED→absent; weekly/monthly toggles COMPLETED). Reuse `lib/today.ts`/`lib/calendarRange.ts`. Remove the `react-day-picker` dependency from `package.json` (and re-run `npm install` at repo root per CLAUDE.md).

#### 3. Best streaks (demoted)
**File**: `apps/web/src/features/habits/components/{BestStreaks,StreakRow}.tsx` (rewrite)
**Intent**: Restyle the collapsible top-5 (expand to all) leaderboard with proportional full-width bars, longest-first, current run pinned-in-place or below a divider with a "N to crack the top N" nudge (S-03 + the user's proportional-viz/highlight-active preference). Stays demoted — never on the main surface.
**Contract**: `BestStreaks({ metrics })`; `StreakRow({ s, unit, maxLen, rank, current })` with `width = max(5, length/maxLen*100)%`; "Current" badge on the active run.

#### 4. Kebab actions + edit/delete
**File**: `apps/web/src/features/habits/components/{HabitActionsMenu}.tsx` (new); `HabitDetail.tsx` (rewrite to the design's `HabitDetailScreen` shape)
**Intent**: Replace the inline edit/delete with a kebab `HabitActionsMenu` (Edit + danger Delete). Edit opens a `Dialog` (name input + modality `Segmented` + "frequency can't be changed" hint — **no targetCount**). Delete opens a confirm `Dialog` (hard delete, no undo). Header = back button + modality `tag` + frequency + title.
**Contract**: `HabitActionsMenu({ onEdit, onDelete })` (outside-click + Escape close). Edit submits name+modality via `useUpdateHabit` → success toast; Delete via `useDeleteHabit` → navigate to dashboard. Omit vestigial `span/setSpan`.

### Success Criteria:

#### Automated Verification:
- FE type checking passes: `npm run typecheck -w @habitpair/web`
- FE tests pass (incl. smoke tests for edit, delete, and calendar cycle): `npm run test -w @habitpair/web`
- Web build compiles with `react-day-picker` removed: `npm run build -w @habitpair/web`
- Linting passes: `make lint`

#### Manual Verification:
- Detail matches `renders/detail.png`: three metric rings, multi-month calendar with failure tints + today ring, demoted Best Streaks with proportional bars.
- "View full history" opens the modal sheet; months lazy-load on scroll; Escape closes.
- Clicking a calendar day cycles its mark (daily COMPLETED→MISSED→absent); future days are disabled.
- Kebab → Edit modal saves name/modality (frequency shown immutable, no target field); Kebab → Delete confirms and removes the habit, returning to the dashboard.
- Empty-state (no marks) shows the calendar hint; metrics show "—" not zeros.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 5: Settings

### Overview
Add the net-new `/settings` route and screen: a working theme toggle plus inert Export and Delete-account placeholders (split-out backend). Wire the AccountMenu to it.

### Changes Required:

#### 1. Settings route
**File**: `apps/web/src/routes/_authed/settings.tsx` (new — authed, regenerates `routeTree.gen.ts`)
**Intent**: Add `/settings` under the `_authed` gate.
**Contract**: Renders `SettingsScreen`; reachable from `AccountMenu`. TanStack file-based — created by adding the file.

#### 2. Settings feature
**File**: `apps/web/src/features/settings/components/SettingsScreen.tsx` (new feature)
**Intent**: Port the design's settings: back button + "Settings" + email; **Appearance** (Theme `Segmented` light/dark/system, wired to the Phase-1 theme store); **Your data** (Export — visibly inert "coming soon"/disabled); **Danger zone** (Delete account — visibly inert).
**Contract**: `SettingsScreen` reads `useAuth().user?.email` and `useTheme()`. Export/Delete buttons are disabled with a "coming soon" affordance (no handlers wired). Theme change persists + applies immediately.

### Success Criteria:

#### Automated Verification:
- Route tree regenerates and type-checks: `npm run typecheck -w @habitpair/web`
- FE tests pass: `npm run test -w @habitpair/web`
- Web build compiles: `npm run build -w @habitpair/web`
- Linting passes: `make lint`

#### Manual Verification:
- `/settings` matches the settings render; AccountMenu → Settings navigates there; back returns to the prior screen.
- Theme `Segmented` switches light/dark/system, persists across reload, and applies app-wide (incl. the public surface).
- Export and Delete-account render as clearly inert ("coming soon") — not clickable no-ops that look broken.
- Email displays correctly (from `useAuth`).

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the manual testing was successful before proceeding to the next phase.

---

## Phase 6: Marketing Landing + Auth

### Overview
Re-skin the public surface: a full landing-page port (theme-aware) and the redesigned login/register `AuthCard`, plus SEO/head parity. This completes the re-skin across every route.

### Changes Required:

#### 1. Landing page
**File**: `apps/web/src/routes/index.tsx` (rewrite), `apps/web/src/features/marketing/components/{Landing,DowInsight,FaqItem}.tsx` + `apps/web/src/features/marketing/data.ts` (new feature)
**Intent**: Port the full `Landing`: hero (kicker + headline + sub + CTAs + trust row) with the static `DowInsight` calendar mock; "the difference" band; device/product showcase; "how it works" (3 steps); build/break duo; 6-feature grid; FAQ accordion; final CTA; footer. CTA label/route flips on auth state ("Go to your habits" vs "Start free").
**Contract**: `Landing({ authed })` (reads `useAuth()`); static arrays `LP_STEPS` (3), `LP_FEATS` (6), `LP_FAQ` (5) in `data.ts`; `DowInsight` reproduces the hardcoded March-2026 mock (`LEAD=6`, `DAYS=31`, missed `{2,4,8,11,13,18,25}`, Wednesdays in a column, "We" header highlighted). `FaqItem({ q, a })` accordion. The showcase uses `renders/list.png`/`detail.png` (or equivalents) as the product images. Renders under `.app` `data-theme` (theme-aware).

#### 2. Auth cards
**File**: `apps/web/src/features/auth/components/{LoginForm,RegisterForm}.tsx` (rewrite to the design's `AuthCard`)
**Intent**: Port the shared `AuthCard` look: narrow card, title/subtitle ("Welcome back / Pick up where you left off" vs register copy), email + password fields, full-width primary submit, footer link toggling login↔register; register keeps the client-side 8-char password check.
**Contract**: Built on Phase-2 `Field`/`Input`/`Button`; submits via existing `useLogin`/`useRegister`. Preserve current auth-form tests (update selectors as needed). No hardcoded prefilled email (drop the design's mock prefill).

#### 3. Head / SEO
**File**: `apps/web/index.html`
**Intent**: Port the design's SEO meta + the two JSON-LD blocks (`SoftwareApplication`, `FAQPage`) for parity.
**Contract**: Meta description/title + JSON-LD present in head; `theme-color` already added in Phase 1.

### Success Criteria:

#### Automated Verification:
- FE type checking passes: `npm run typecheck -w @habitpair/web`
- FE tests pass (auth-form tests updated/green): `npm run test -w @habitpair/web`
- Web build compiles: `npm run build -w @habitpair/web`
- Linting passes: `make lint`

#### Manual Verification:
- Landing matches the design across all sections in both light and dark; the `DowInsight` mock shows the intentional Wednesday column; FAQ items expand/collapse.
- Hero/final CTAs route correctly: unauthed → register/login; authed → dashboard.
- Login/register cards match the auth render; validation + submit + error states work; toggling login↔register works.
- Responsive: landing and auth cards reflow cleanly at mobile widths.
- SEO meta + JSON-LD present in the built `index.html`.

**Implementation Note**: After completing this phase and all automated verification passes, pause here for manual confirmation from the human that the full re-skin is complete and consistent across every screen and both themes.

---

## Testing Strategy

### Unit Tests:
- Primitives (Phase 2): Button variants, Segmented (aria-pressed + onChange), Dialog (open/Escape/backdrop), Toast (auto-dismiss).
- Backend (Phase 3): `findByUser` enrichment — `recentMarks` 7-day window, `currentStreak`, `unit` per frequency.
- Preserve existing unit tests: `metricsFormat`, `apiClient`, `authStore`, auth-form tests (update selectors after the AuthCard rewrite).

### Integration / Smoke Tests:
- Marking flow keeps optimistic semantics (Phase 3): toggle/cycle update immediately, roll back on error.
- Edit (name/modality), Delete (confirm), and calendar cycle (Phase 4).

### Manual Testing Steps:
1. Walk every screen (landing, login, register, dashboard, detail, settings) in **light** then **dark**, at mobile + desktop widths; compare to `context/changes/redesign-ui/design/renders/`.
2. Hard-reload in dark mode on each route — confirm no light flash.
3. Mark/unmark a daily habit and a weekly/monthly habit; confirm instant feedback + correct section/period updates.
4. Create, edit, and delete a habit end-to-end; confirm toasts and that frequency/target are not editable.
5. Open full-history sheet; scroll to lazy-load older months; cycle a day from the calendar.
6. Toggle theme in Settings; confirm it persists and applies to the public landing too.
7. Confirm Export + Delete-account read as inert "coming soon".

## Performance Considerations

- **List `currentStreak`** reuses the metrics engine's per-habit mark-history read, extending the existing N+1 fan-out. Acceptable at this app's scale; bound the read if habit counts ever grow.
- **Preserve the <300ms marking feel** — keep `useToggleMark`/`useCycleMark` optimistic; do not reintroduce the mock's 200ms/420ms delays.
- **React Compiler is on** — skip defensive `useMemo`/`useCallback` except for the theme `matchMedia` external subscription.
- **HistorySheet** lazy-renders months (batches of 6 via IntersectionObserver) to avoid rendering years of grid at once.

## Migration Notes

- **No database migration** — list enrichment adds computed read-model fields, not schema columns.
- **Dependency removal** — drop `react-day-picker` from `apps/web/package.json` and re-run `npm install` at the repo root (lockfile lives there per CLAUDE.md).
- **CI is path-filtered** — Phase 3 touches `apps/habits-api/**` (triggers habits-api test workflow with a real Postgres) and `apps/web/**`; all other phases are web-only.

## References

- Related research: `context/changes/redesign-ui/research.md`
- Design source: `context/changes/redesign-ui/design/Habitpair.html` (tokens :90–211, anti-flash :794, primitives :1574–1690, calendar :1692–1899, marketing/auth :1901–2186, dashboard :2188–2471, detail :2473–2726, settings :2732, app/nav :2791–3006)
- Final renders: `context/changes/redesign-ui/design/renders/{list,detail}.png` + screenshots
- List read-model: `apps/habits-api/src/habits/habits.service.ts:34`
- Update DTO (immutability): `apps/habits-api/src/habits/dto/update-habit.dto.ts:9`
- Metrics engine: `apps/habits-api/src/marks/metrics.ts`
- Auth email on boot: `apps/web/src/shared/lib/authStore.ts:54`, `apps/web/src/features/auth/hooks/useAuth.ts:12`
- Prior constraints: `context/archive/2026-06-04-habit-insight-metrics/`, `context/archive/2026-06-04-edit-and-delete-habit/`; PRD philosophy `context/foundation/prd.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles.

### Phase 1: Design Foundation — Tokens, Theming, Anti-flash

#### Automated
- [x] 1.1 Type checking passes: `npm run typecheck -w @habitpair/web`
- [x] 1.2 Linting passes: `make lint`
- [x] 1.3 Web build compiles (CSS + app): `npm run build -w @habitpair/web`
- [x] 1.4 Existing tests stay green: `npm run test -w @habitpair/web`

#### Manual
- [x] 1.5 Theme toggle switches light↔dark; `system` follows OS preference live
- [x] 1.6 No light-flash on a hard reload while in dark mode
- [x] 1.7 Base typography, colors, and radii match the design's light/dark palettes

### Phase 2: Shared Primitives + Shell

#### Automated
- [ ] 2.1 Primitive unit tests pass: `npm run test -w @habitpair/web`
- [ ] 2.2 Type checking passes: `npm run typecheck -w @habitpair/web`
- [ ] 2.3 Linting passes: `make lint`
- [ ] 2.4 Web build compiles: `npm run build -w @habitpair/web`

#### Manual
- [ ] 2.5 Each primitive renders correctly in both light and dark themes
- [ ] 2.6 Navbar brand + AccountMenu dropdown work (click-outside + Escape); avatar monogram from email
- [ ] 2.7 Dialog focus/Escape/backdrop and Toast auto-dismiss behave

### Phase 3: Dashboard Re-skin + List Enrichment

#### Automated
- [ ] 3.1 Backend tests pass (incl. enrichment): `npm test -w @habitpair/habits-api`
- [ ] 3.2 Backend lint/build: `make lint` + `npm run build -w @habitpair/habits-api`
- [ ] 3.3 FE type checking passes: `npm run typecheck -w @habitpair/web`
- [ ] 3.4 FE tests pass (incl. optimistic-marking smoke test): `npm run test -w @habitpair/web`
- [ ] 3.5 Web build compiles: `npm run build -w @habitpair/web`

#### Manual
- [ ] 3.6 Dashboard matches `renders/list.png` (TodayHero ring, Building/Breaking, week strips, streak chips, mark controls)
- [ ] 3.7 Daily marking is instant (optimistic, no artificial delay); weekly/monthly "Log one" increments correctly
- [ ] 3.8 Create-habit modal validates, creates, closes, fires a success toast; habit lands in the right section
- [ ] 3.9 Cards/sections reflow cleanly at mobile widths

### Phase 4: Detail Re-skin — Metrics, Hand-rolled Calendar, Best Streaks, Kebab Actions

#### Automated
- [ ] 4.1 FE type checking passes: `npm run typecheck -w @habitpair/web`
- [ ] 4.2 FE tests pass (edit/delete/calendar-cycle smoke tests): `npm run test -w @habitpair/web`
- [ ] 4.3 Web build compiles with `react-day-picker` removed: `npm run build -w @habitpair/web`
- [ ] 4.4 Linting passes: `make lint`

#### Manual
- [ ] 4.5 Detail matches `renders/detail.png` (metric rings, calendar failure tints + today ring, demoted Best Streaks proportional bars)
- [ ] 4.6 "View full history" opens; months lazy-load on scroll; Escape closes
- [ ] 4.7 Calendar day click cycles the mark; future days disabled
- [ ] 4.8 Kebab Edit saves name/modality (frequency immutable, no target field); Kebab Delete confirms + returns to dashboard
- [ ] 4.9 Empty-state shows the calendar hint; metrics show "—" not zeros

### Phase 5: Settings

#### Automated
- [ ] 5.1 Route tree regenerates + type-checks: `npm run typecheck -w @habitpair/web`
- [ ] 5.2 FE tests pass: `npm run test -w @habitpair/web`
- [ ] 5.3 Web build compiles: `npm run build -w @habitpair/web`
- [ ] 5.4 Linting passes: `make lint`

#### Manual
- [ ] 5.5 `/settings` matches the render; AccountMenu → Settings navigates; back returns to prior screen
- [ ] 5.6 Theme Segmented switches + persists across reload + applies app-wide (incl. public surface)
- [ ] 5.7 Export + Delete-account render as clearly inert ("coming soon")
- [ ] 5.8 Email displays correctly from `useAuth`

### Phase 6: Marketing Landing + Auth

#### Automated
- [ ] 6.1 FE type checking passes: `npm run typecheck -w @habitpair/web`
- [ ] 6.2 FE tests pass (auth-form tests updated/green): `npm run test -w @habitpair/web`
- [ ] 6.3 Web build compiles: `npm run build -w @habitpair/web`
- [ ] 6.4 Linting passes: `make lint`

#### Manual
- [ ] 6.5 Landing matches the design across all sections in both themes; DowInsight Wednesday column shows; FAQ expands/collapses
- [ ] 6.6 Hero/final CTAs route correctly (unauthed → register/login; authed → dashboard)
- [ ] 6.7 Login/register cards match; validation + submit + error states work; login↔register toggle works
- [ ] 6.8 Landing + auth reflow cleanly at mobile widths
- [ ] 6.9 SEO meta + JSON-LD present in the built `index.html`
