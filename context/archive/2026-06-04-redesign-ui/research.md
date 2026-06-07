---
date: 2026-06-05T13:36:03+0200
researcher: Ivan Zakharanka
git_commit: 2b5a0c8d62666376c8ef85880033ea312be8ceed
branch: edit-and-delete-habit
repository: habitpair
topic: "UI redesign — implement the Claude Design `Habitpair.html` over the shipped app"
tags: [research, codebase, frontend, design-system, theming, habits-api, redesign]
status: complete
last_updated: 2026-06-05
last_updated_by: Ivan Zakharanka
---

# Research: UI redesign — implement the Claude Design `Habitpair.html`

**Date**: 2026-06-05T13:36:03+0200
**Researcher**: Ivan Zakharanka
**Git Commit**: 2b5a0c8d62666376c8ef85880033ea312be8ceed
**Branch**: edit-and-delete-habit
**Repository**: habitpair

## Research Question

Implement the relevant aspects of the Claude Design handoff (`Habitpair.html`, fetched from `api.anthropic.com/v1/design/h/Gsazf69XZRHBPtb1xQIUQg`) over the existing habitpair app (all roadmap slices F-01–S-04 shipped). Determine, full-stack, what the design needs that the codebase doesn't yet provide.

**Scope (confirmed with user):**
- **Full-stack gap analysis** — assess both frontend and `habits-api`/`auth-api`.
- **Include the marketing landing page.**
- **Target the canonical look only** — `soft` direction + `green` accent (`#2e7d5b`) + `muted` status + the real light/dark/system toggle. The 4-accent × 3-direction × status *switcher* and the floating "Tweaks" panel are design-tool scaffolding to drop.

## Summary

**This is overwhelmingly a frontend re-skin, not a feature build.** The hard part — the domain model and every derived metric the design renders on the habit-detail surface — already exists and is computed server-side. The design's data model is a near-exact match for the shipped Prisma schema and the SPA's existing TypeScript types, because they descend from the same PRD.

Five headline conclusions:

1. **The "day-of-week insight" differentiator needs NO new backend metric.** The design's `DowInsight` is a *static, hardcoded marketing illustration on the landing page* ([Habitpair.html:1909](context/changes/redesign-ui/design/Habitpair.html)) — a calendar grid with missed Wednesdays pre-baked to line up in a column. The real "see why you slip" view is the **existing** Mon-first calendar grid (shipped S-02), backed by `GET /habits/:id/calendar`. There is no "you slip on Wednesdays" inference engine in the design, and the PRD explicitly forbids one. **Do not build a weekday-miss-rate metric.**

2. **The detail page's metrics are all already served.** `currentStreak`, `currentRun`, `rollingConsistency` (30/8/6 window), `recentCompletion` (RATIO→PERCENT at 14 periods), `bestStreaks` (top-10), and `unit` all come from `GET /habits/:id/metrics`, computed by a pure engine at [apps/habits-api/src/marks/metrics.ts:77](apps/habits-api/src/marks/metrics.ts). The SPA already consumes them.

3. **Genuine backend gaps are small and all belong to the NEW Settings screen:** data **export** (JSON of all habits+marks) and **delete account** (cross-service: auth-api owns the user, habits-api owns the data, no cross-DB FK). `GET /auth/me` is *probably not needed* (email survives boot via the refresh response). `startDate` is *not needed* (the first-mark anchor already serves it, exposed as `firstMarkDate`).

4. **One frontend-contract gap needs a decision:** the redesigned dashboard `HabitCard` renders a **7-day week strip** (`WeekStrip marks={habit.marks}`) and a **streak chip** (`metrics.currentStreak`) *per row* ([Habitpair.html:2253](context/changes/redesign-ui/design/Habitpair.html)), but `GET /habits?today=` returns only `todayStatus` + `currentPeriod` — no per-habit marks or streak. Either enrich the list endpoint, fetch per-habit metrics N times, or trim the card.

5. **Three net-new frontend capabilities:** (a) a **design-token + theming layer** (`styles.css` is 9 lines, light-only-pinned, no tokens today), (b) **light/dark/system** support (entirely net-new — the PRD never promised dark mode), and (c) a **shared UI-primitive library** (only `Navbar` + `ConfirmDialog` exist today; the design implies Button/Field/Select/Segmented/Switch/Dialog/Toast/Card/Ring/Skeleton/etc.). Plus two net-new screens: a real **landing page** and a **Settings** route.

The design bundle has been persisted to [context/changes/redesign-ui/design/](context/changes/redesign-ui/design/) (the `/tmp` extraction is ephemeral): `Habitpair.html` (the canonical file, 3008 lines), `CLAUDE-DESIGN-README.md` (the handoff instructions), and `renders/{list,detail}.png` (the two final product renders).

---

## Detailed Findings

### A. The design (external input — `Habitpair.html`)

A single-file React 18 (UMD) + Babel-standalone prototype with a `localStorage` mock-data engine. The README ([CLAUDE-DESIGN-README.md](context/changes/redesign-ui/design/CLAUDE-DESIGN-README.md)) says: recreate **pixel-perfectly** in the target stack (React); match visual output, don't copy the prototype's internal structure; don't render/screenshot it — read the source.

**Canonical theme** ([Habitpair.html:2795](context/changes/redesign-ui/design/Habitpair.html), and the hardcoded root at [:2989](context/changes/redesign-ui/design/Habitpair.html)):
```
direction: "soft", accent: "green", status: "muted", radius: 14
<div className="app" data-theme={effTheme} data-direction="soft" data-accent="green" data-status="muted" style={{'--radius':'14px'}}>
```
`effTheme` = `light` | `dark`, derived from `hp_theme` (`light`/`dark`/`system`) + system preference. **Theme mode IS a real product feature; direction/accent/status are NOT** (they're fixed to soft/green/muted).

**Design tokens** ([Habitpair.html:90–211](context/changes/redesign-ui/design/Habitpair.html)) — OKLCH, layered `base (warm light) → [data-theme=dark] → [data-direction] → [data-accent] → [data-status]`:
- Fonts: **Hanken Grotesk** (sans, Google Fonts). `Newsreader` (serif) loads but is used **only** in the `editorial` direction, which we drop → serif effectively unused in the canonical look. `--font-display = --font-sans`.
- Accent green: light `oklch(0.52 0.10 162)` / dark `oklch(0.76 0.11 162)`; meta theme-color & hex `#2e7d5b`.
- Semantic vars: `--bg/-2`, `--surface/-2`, `--ink/-2/-3`, `--line/-2`, `--accent/-2/-soft/-ink`, `--success/-soft/-ink`, `--miss/-soft/-ink`, `--ring`.
- Radius: `--radius:14px`, `--radius-sm: calc(×0.55)`, `--radius-lg: calc(×1.5)`, `--radius-pill:999px`.
- Component tokens (`--card-bg/-border/-shadow`, `--field-bg`, weights) re-bound per direction; in `soft` = gentle elevated cards.
- Warm light base (`oklch(0.985 0.006 83)` bg), warm charcoal dark (`oklch(0.205 0.008 75)` bg). A pre-mount inline script ([:794](context/changes/redesign-ui/design/Habitpair.html)) sets the html bg to `#262320`/`#faf8f4` to avoid a flash — relevant to porting the anti-flash.

**Screens & routes** (`App` router at [Habitpair.html:2878–3002](context/changes/redesign-ui/design/Habitpair.html); routes `landing`/`login`/`register`/`list`/`detail`/`settings`/`logout`). These map 1:1 onto the existing TanStack routes (§B) plus the net-new `settings`.

**Component inventory** (design → where it belongs in the FE):
| Design component (line) | Purpose | Target |
|---|---|---|
| token system `<style>` ([:90](context/changes/redesign-ui/design/Habitpair.html)) | OKLCH vars + every component class | `apps/web/src/styles.css` |
| `Icon` ([:1601](context/changes/redesign-ui/design/Habitpair.html)) | inline SVG sprite | `shared/components/Icon` |
| `Segmented`, `Switch`, `Dialog`, `Toast`, `Skel` ([:1616–1718](context/changes/redesign-ui/design/Habitpair.html)) | primitives | `shared/components/*` |
| `Ring`, `StatRing`, `MetricCard`, `HabitMetrics` ([:2207–2583](context/changes/redesign-ui/design/Habitpair.html)) | metrics strip + rings | `features/habits/components/*` |
| `WeekStrip`, `StreakChip`, `HabitCard`, `Section`, `TodayHero` ([:2237–2419](context/changes/redesign-ui/design/Habitpair.html)) | dashboard | `features/habits/components/*` |
| `MonthView`, `CalLegend`, `HistorySheet`, `HabitCalendar` ([:1719–1908](context/changes/redesign-ui/design/Habitpair.html)) | calendar + multi-month sheet | `features/habits/components/*` |
| `BestStreaks`, `StreakRow` ([:2584–2648](context/changes/redesign-ui/design/Habitpair.html)) | leaderboard (collapsible) | `features/habits/components/*` |
| `HabitActionsMenu` ([:2477](context/changes/redesign-ui/design/Habitpair.html)) | **kebab menu** (replaces Edit/Delete button pair) | `features/habits/components/*` |
| `CreateHabitForm` ([:2329](context/changes/redesign-ui/design/Habitpair.html)) | now a **modal `Dialog`** (was inline) | `features/habits/components/*` |
| `Landing`, `FaqItem`, `DowInsight`, `LP_*` data ([:1909–2139](context/changes/redesign-ui/design/Habitpair.html)) | marketing page | `routes/index.tsx` + `features/marketing/*` |
| `AuthCard` ([:2140](context/changes/redesign-ui/design/Habitpair.html)) | login/register card | `features/auth/components/*` |
| `SettingsScreen` ([:2732](context/changes/redesign-ui/design/Habitpair.html)) | net-new settings | new `features/settings/*` |
| `AccountMenu`, `Navbar` ([:2822–2876](context/changes/redesign-ui/design/Habitpair.html)) | nav + avatar dropdown | `shared/components/Navbar` |

**Drop from the prototype:** the `TweaksPanel` + `useTweaks` + `__edit_mode_*` host protocol ([:1029–1599](context/changes/redesign-ui/design/Habitpair.html)), the multi-accent/direction/status switching, the `window.HP` mock engine ([:813–1025](context/changes/redesign-ui/design/Habitpair.html)), the hardcoded `EMAIL` ([:2805](context/changes/redesign-ui/design/Habitpair.html)), and the React UMD/Babel runtime. Wire real React 19 + Vite + TanStack Query mutations instead. Note the mock's `markToday` adds an artificial 200ms delay ([:2932](context/changes/redesign-ui/design/Habitpair.html)) — drop it; the real app already does optimistic marking.

### B. Current frontend (`apps/web`)

**Structure is feature-sliced** (`apps/web/CLAUDE.md`) — *not* the flat `components/hooks/types/lib` that root `CLAUDE.md`/`README.md` still describe (that note is **stale**). Real layout: `src/features/<feature>/{components,hooks,api,types.ts}` + `src/shared/{api,components,lib,types}` + thin `src/routes/`.

**Routes** (`apps/web/src/routes/`, TanStack file-based):
- `/` → minimal placeholder landing, single hero + one CTA ([routes/index.tsx:8](apps/web/src/routes/index.tsx)).
- `/login`, `/register` → `LoginForm`/`RegisterForm`.
- `/_authed` → pathless gate; `beforeLoad` redirects to `/login` when not authed ([routes/_authed.tsx:7](apps/web/src/routes/_authed.tsx)).
- `/app` → habits dashboard (`HabitList`) ([routes/_authed/app.tsx:9](apps/web/src/routes/_authed/app.tsx)).
- `/habits/$habitId` → `HabitDetail`.
- **No `/settings`.** Root layout = `<Navbar/>` + `<Outlet/>` ([routes/__root.tsx:10](apps/web/src/routes/__root.tsx)).

**Shared UI today = two components only:** `Navbar.tsx` and `ConfirmDialog.tsx` (native `<dialog>` + `showModal()`, `bg-black/50` backdrop) ([apps/web/src/shared/components/](apps/web/src/shared/components/)). No `Button`/`Input`/`Select`/`Card`/`Badge`/`Toast`/`Spinner`/`Skeleton`. The black-button pattern (`bg-black text-white`) is copy-pasted ~8 places. **No toast/notification system.**

**API + data layer** (`apps/web/src/shared/api/`, `features/*/api/`):
- Two clients `authApi`/`habitsApi` from `makeClient(baseUrl, refreshable)`; base URLs from `VITE_AUTH_API_URL`/`VITE_HABITS_API_URL`, throw if unset ([apiClient.ts:3](apps/web/src/shared/api/apiClient.ts)).
- JWT: access token in **memory**, refresh token in `localStorage[habitpair.refreshToken]`; single-flight refresh-and-retry on 401 ([authStore.ts](apps/web/src/shared/lib/authStore.ts), [apiClient.ts:28](apps/web/src/shared/api/apiClient.ts)). `authStore` is a singleton consumed via `useSyncExternalStore`.
- Query keys / mutations: `habitsQueryOptions` `GET /habits?today=`; `habitCalendarQueryOptions` `GET /habits/:id/calendar`; `habitMetricsQueryOptions` `GET /habits/:id/metrics`; `useCreateHabit`/`useUpdateHabit`/`useDeleteHabit`; `useToggleMark`/`useCycleMark` (`PUT`/`DELETE /habits/:id/marks/:date`) — both do **optimistic update + rollback + invalidate** ([useToggleMark.ts:20](apps/web/src/features/habits/hooks/useToggleMark.ts), [useCycleMark.ts:39](apps/web/src/features/habits/hooks/useCycleMark.ts)). `queryClient`: `staleTime 30s`, `retry 1`.
- **The SPA's existing types already match the design's model**: `Modality`, `Frequency`, `MarkStatus` `'COMPLETED'|'MISSED'`, `HabitListItem`, `HabitMetricsResponse` (currentStreak, rollingConsistency, recentCompletion w/ RATIO|PERCENT, bestStreaks, currentRun, unit), `HabitCalendarResponse` (marks, computedMissedDates, failedPeriods, firstMarkDate) ([features/habits/types.ts:1](apps/web/src/features/habits/types.ts)).

**Styling** ([apps/web/src/styles.css:1](apps/web/src/styles.css)) — **9 lines**: `@import 'tailwindcss';`, `@import 'react-day-picker/style.css';`, and an `html { color-scheme: light; background-color: white }` pin. **Zero `@theme`/`@utility`/`@source`**, no custom palette/font/radius/shadow, **no dark mode**, no CSS vars. Pure stock Tailwind utilities; no hardcoded hex anywhere.

**Calendar** is a `react-day-picker` v10 wrapper with a custom `Day` cell ([HabitCalendar.tsx:37](apps/web/src/features/habits/components/HabitCalendar.tsx)). A cheatsheet exists at `context/changes/habit-calendar-and-backfill/react-day-picker-v10-cheatsheet.md`.

**Tests** (Vitest 4, `environment: 'node'` with stubbed DOM; jsdom available as devDep): auth form tests, `metricsFormat.test.ts`, `apiClient.test.ts`, `authStore.test.ts`. **No component tests for any habits screen or route.**

### C. Current backend (`habits-api`, `auth-api`)

**The CLAUDE.md "inline validation" tripwire is STALE.** Both services use `class-validator` DTOs + a global `ValidationPipe({ whitelist, transform, forbidNonWhitelisted })` ([apps/habits-api/src/main.ts:9](apps/habits-api/src/main.ts)).

**habits-api Prisma** ([apps/habits-api/prisma/schema.prisma](apps/habits-api/prisma/schema.prisma)):
- Enums: `HabitModality {POSITIVE,NEGATIVE}`, `HabitFrequency {DAILY,WEEKLY,MONTHLY}`, `MarkStatus {COMPLETED,MISSED}` (explicit MISSED is first-class).
- `Habit { id uuid(7), userId (indexed, no cross-DB FK), name, modality, frequency, targetCount Int?, createdAt, marks Mark[] }`. **No `startDate`** — start = earliest mark, computed at read time ([habits.service.ts:90,159](apps/habits-api/src/habits/habits.service.ts)).
- `Mark { id, habitId, date @db.Date, status, createdAt, @@unique([habitId,date]) }` — one row per habit-day, cascade-deletes with habit.

**habits-api endpoints** ([habits.controller.ts](apps/habits-api/src/habits/habits.controller.ts), JwtGuard-protected):
- `GET /habits?today=` → habits + `todayStatus` + `currentPeriod{kind,completedCount,target}` ([habits.service.ts:58](apps/habits-api/src/habits/habits.service.ts)).
- `POST /habits` (forces `targetCount=null` for DAILY); `PATCH /habits/:id` (**name/modality only**; frequency/targetCount immutable via `forbidNonWhitelisted`); `DELETE /habits/:id` (204, cascade).
- `GET /habits/:id/calendar?from&to&today` → `{habit, firstMarkDate, marks, computedMissedDates, failedPeriods}` ([habits.service.ts:75](apps/habits-api/src/habits/habits.service.ts)), range capped 36 months.
- `GET /habits/:id/metrics?today` → full derived metrics ([habits.service.ts:140](apps/habits-api/src/habits/habits.service.ts)).
- Marks: `PUT /habits/:id/marks/:date` (body `{status}`, upsert on unique key; **MISSED accepted**) / `DELETE` (idempotent unmark) ([marks.controller.ts:16](apps/habits-api/src/marks/marks.controller.ts)).

**Derived-metrics engine** (pure, Prisma-free) [apps/habits-api/src/marks/metrics.ts:77](apps/habits-api/src/marks/metrics.ts): `currentStreak`+`currentRun` (:108,:192), `rollingConsistency` over `ROLLING_WINDOW {DAY:30,WEEK:8,MONTH:6}` (:71), `recentCompletion` w/ `RATIO_PHASE_DAYS=14` (:114), `bestStreaks` top-10 by (length desc, start desc) (:228), `unit` (:241). Today/in-progress never penalizes (:139). Weekly/monthly count COMPLETED toward target within ISO-Mon weeks / calendar months (:154).

**auth-api** ([auth.controller.ts](apps/auth-api/src/auth/auth.controller.ts)): `POST /auth/{register,login,refresh,logout}`. `AuthResult = {accessToken, refreshToken, user:{id,email}}`. **JWT payload = `{sub}` only** ([token.service.ts:19](apps/auth-api/src/auth/token.service.ts)); HS256, 15-min access. **No `/auth/me`, no export, no delete-account anywhere.**

---

## Gap analysis (the actionable core)

### Backend gaps
| Design need | Status | Evidence / note |
|---|---|---|
| modality / frequency / targetCount / explicit MISSED | ✅ supported | `schema.prisma` enums + fields |
| current streak, current run, rolling consistency, recent completion, best streaks, unit | ✅ supported | `metrics.ts`, `GET /habits/:id/metrics` |
| calendar marks + per-period failure tint | ✅ supported | `getCalendar`, `failedPeriods`, `computedMissedDates` |
| mark / unmark a date (incl. MISSED) | ✅ supported | `PUT`/`DELETE /habits/:id/marks/:date` |
| **day-of-week "insight"** | ✅ **already covered by the calendar grid** | `DowInsight` is a static landing mock ([:1909](context/changes/redesign-ui/design/Habitpair.html)); **build NO new metric** |
| `startDate` field | ➖ not needed | first-mark anchor = `firstMarkDate`; add only if a *declared* start is required |
| `GET /auth/me` | ➖ probably not needed | email arrives via login/register/refresh `AuthResult.user`; verify it survives `bootstrap()` before adding |
| **Export data (JSON of all habits+marks)** | ❌ **absent** | new habits-api route to dump `{habits, marks}` for `userId`; client-side export possible only if SPA bulk-fetches marks (it doesn't today) |
| **Delete account** | ❌ **absent** | cross-service: delete user in auth-api + purge that user's habits in habits-api (no cross-DB FK → coordinate over HTTP, order for idempotency) |

### Frontend-contract gap (needs a decision)
- **Dashboard `HabitCard` wants per-row `marks` (≥7 days) + `metrics.currentStreak`** ([:2253,:2266,:2281](context/changes/redesign-ui/design/Habitpair.html)), but `GET /habits?today=` returns neither. Options: **(a)** enrich the list response with `recentMarks` (last 7) + `currentStreak`/`unit` per habit (one query, server already loads marks for `currentPeriod`); **(b)** fire N `metrics`/`calendar` queries from the list (simple, but N requests + violates the <300ms feel at scale); **(c)** trim the card (drop the week strip/streak chip on the list). (a) is the cleanest and keeps the dashboard one round-trip.

### Net-new frontend work
- **Design-token + theming layer** in `styles.css` (today: 9 lines, no tokens). Port the OKLCH vars + component classes; keep only `soft`+`green`+`muted`; add `[data-theme=dark]`; **remove the `color-scheme: light` pin** and replace with the design's anti-flash inline script.
- **Light/dark/system toggle** — net-new: `hp_theme` store, system-pref `matchMedia` listener, `data-theme` on root. (Unstated in the PRD; in scope per user.)
- **Shared primitives** — `Icon`, `Button` (primary/ghost/soft/danger/danger-solid + sizes), `Field`/`Input`/`Select`/`Textarea`, `Segmented`, `Switch`, `Dialog` (generic modal), `Toast` + toast host, `Skeleton`, `Card`. Put in `shared/components/`.
- **Two screens:** real **landing page** (hero w/ static `DowInsight` mock, 3 steps, build/break duo, 6-feature grid, FAQ, final CTA, footer, device showcase) and **Settings** (`/settings`: theme segmented + export + danger-zone delete-account).
- **Flow changes:** create-habit becomes a **modal `Dialog`** (was inline on `/app`); Edit/Delete button pair becomes a **kebab `HabitActionsMenu`**; list rows become rich **`HabitCard`s** inside `Building`/`Breaking` `Section`s under a `TodayHero` (weekday + "X of Y done today" ring); add an **`AccountMenu`** avatar dropdown in the nav (Settings / Log out).

---

## Code References

- [context/changes/redesign-ui/design/Habitpair.html](context/changes/redesign-ui/design/Habitpair.html) — canonical design (tokens :90–211, mock engine :813, components :1601–2876, App/routing :2878).
- [context/changes/redesign-ui/design/CLAUDE-DESIGN-README.md](context/changes/redesign-ui/design/CLAUDE-DESIGN-README.md) — handoff instructions (pixel-perfect, don't screenshot).
- [context/changes/redesign-ui/design/renders/](context/changes/redesign-ui/design/renders/) — `list.png`, `detail.png` final renders.
- `apps/web/src/styles.css:1` — 9-line, light-only, token-less stylesheet (the re-skin's anchor).
- `apps/web/src/routes/` — `index.tsx` (placeholder landing), `_authed.tsx` (gate), `_authed/app.tsx`, `_authed/habits.$habitId.tsx`.
- `apps/web/src/shared/components/{Navbar,ConfirmDialog}.tsx` — the only shared UI today.
- `apps/web/src/shared/api/apiClient.ts`, `shared/lib/authStore.ts` — API clients + JWT/refresh.
- `apps/web/src/features/habits/{types.ts,api/*,hooks/*,components/*}` — list/detail/calendar/metrics/streaks, optimistic marking.
- `apps/habits-api/src/habits/habits.service.ts:58,75,140` — list/calendar/metrics read-models.
- `apps/habits-api/src/marks/metrics.ts:71,108,228` — pure metrics engine.
- `apps/habits-api/prisma/schema.prisma` — Habit/Mark + enums.
- `apps/auth-api/src/auth/{auth.controller.ts,auth.service.ts,token.service.ts}` — auth endpoints + `{sub}` JWT.

## Architecture Insights

- **Token-system port vs Tailwind-utility re-expression.** The design is already a complete, cohesive CSS system (OKLCH vars + ~100 semantic component classes like `.hcard`, `.statcard`, `.markdot`). Porting it wholesale into `styles.css` (vars + classes, pruned to soft/green/muted) is the fastest path to pixel-perfect and keeps the design's semantics intact. Re-deriving everything as Tailwind utility soup would be lossy and slow. Tailwind v4 `@theme` can still expose the palette as utilities for one-off layout, but the component classes should largely come over verbatim. **This is the single biggest architecture decision for `/10x-plan`.**
- **Calendar: restyle `react-day-picker` vs hand-roll the design's grid.** The design hand-rolls `MonthView` (7-col grid) + a multi-month `HistorySheet`. The shipped app fights `react-day-picker` CSS. Given the design's bespoke multi-month sheet, failure tints, and today-ring, hand-rolling per the design may be *less* effort than bending rdp — but that drops a dependency the app already styles. Decision for the plan.
- **Metrics already server-computed** → the SPA stays a thin renderer. Don't reintroduce client-side period math (the mock's `window.HP` is a prototype crutch).
- **Optimistic marking + <300ms guardrail** already implemented; the re-skin must preserve `useToggleMark`/`useCycleMark` semantics and not add the mock's artificial delays.
- **Theming touches the boot path:** the `color-scheme: light` pin + `index.html` must adopt the design's pre-mount anti-flash script, and `data-theme` must be on the app root before first paint.

## Historical Context (from prior changes)

- **PRD design philosophy is binding** ([context/foundation/prd.md:22,137,157,167,215](context/foundation/prd.md)): "calm/quiet," *no* nudges/confetti/motivational copy ("the rule classifies and counts; the user interprets"); the **day-of-week × week-of-month calendar grid IS the differentiator**; **best/longest streaks must stay demoted** (collapsed/secondary, never on the main surface — a verifiable NFR); no paywall. The design honors all of these (best streaks is a collapsible `BestStreaks`; the "insight" is the grid; landing copy is restraint-themed). **Keep them.**
- **S-04 `edit-and-delete-habit`** (archived `context/archive/2026-06-04-edit-and-delete-habit/`): edit/delete live **on the detail page, not list rows**; **frequency is immutable** (edit = name/modality only); delete is **hard, confirm-dialog, no undo**. The design matches all three (kebab → edit modal with "frequency can't be changed" hint at [:2709](context/changes/redesign-ui/design/Habitpair.html); delete confirm `Dialog` at [:2713](context/changes/redesign-ui/design/Habitpair.html)). Note the design's edit modal omits `targetCount` editing — confirm whether to keep target editable.
- **S-03 `habit-insight-metrics`** (archived `context/archive/2026-06-04-habit-insight-metrics/`): best-streaks must be **longest-first**, **proportional full-width bars**, **active run highlighted-in-place or pinned** with a "N to crack the top 10" nudge; metrics use **"—" not zeros** for empty/`denominator===0`. The design's `BestStreaks`/`StreakRow` ([:2584](context/changes/redesign-ui/design/Habitpair.html)) must preserve this (and it aligns with the user's stored *proportional-viz + highlight-active-item* preference).
- **Roadmap** ([context/foundation/roadmap.md](context/foundation/roadmap.md)): F-01–S-04 all shipped (the "at a glance" table marking S-03/S-04 "proposed" is stale per git log + archives). Settings, export, dark mode, and a real landing page were **never on the roadmap** — they are net-new surface introduced by this redesign.
- **PRD vs shipped divergence to carry forward:** PRD FR-008 specifies a ~5s **undo toast** on delete, but S-04 shipped a **confirm dialog, no undo**. The design also uses a **confirm dialog** (no undo) → stays consistent with shipped; toasts in the design are success feedback (create/save/delete/export), not undo.

## Related Research

- None prior for `redesign-ui` (this is the first artifact). Adjacent: `context/archive/2026-06-04-habit-insight-metrics/` and `context/archive/2026-06-04-edit-and-delete-habit/` (plans + impl-reviews) directly constrain the detail-page re-skin.

## Open Questions

1. **List enrichment (decision required):** enrich `GET /habits` with `recentMarks`+`currentStreak` per habit (recommended), fire N per-habit queries, or trim the dashboard card? Drives both a backend change and the `HabitCard` contract.
2. **Export & delete-account are real backend work** — are they in scope for *this* change, or split out (so the FE re-skin can ship first with the Settings buttons stubbed/hidden)? They're the only non-trivial backend tasks and span both services.
3. **Calendar:** restyle `react-day-picker` or hand-roll the design's `MonthView`/`HistorySheet`? Affects effort and a dependency.
4. **Token delivery:** port the design's CSS component classes wholesale into `styles.css`, or re-express as Tailwind v4 `@theme` + utilities? (Recommendation: port the classes; expose palette via `@theme` for layout.)
5. **Dark mode depth:** full light/dark/system parity (design supports it) — confirm dark is a launch requirement, not a later slice, given it's net-new and unstated in the PRD.
6. **`/auth/me`:** verify email survives a refresh-token `bootstrap()` (via `AuthResult.user` on `/auth/refresh`); if it doesn't, a small `GET /auth/me` is the fix. Otherwise skip.
7. **Edit target:** the design's edit modal edits name+modality only (no `targetCount`); the shipped edit and PRD allow target. Keep target editable or follow the design and drop it?
8. **Stale docs:** root `CLAUDE.md`/`README.md` describe the abandoned flat FE layout and a non-existent "inline validation" convention. Worth a separate cleanup (out of scope here).
