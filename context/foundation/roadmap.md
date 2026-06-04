---
project: habitpair
version: 1
status: draft
created: 2026-05-28
updated: 2026-06-04
prd_version: 1
main_goal: low-complexity
top_blocker: time
---

# Roadmap: habitpair

> Derived from `context/foundation/prd.md` (v1) + auto-researched codebase baseline.
> Edit-in-place; archive when superseded.
> Slices below are listed in dependency order. The "At a glance" table is the index.

## Vision recap

habitpair is a free, deliberately simple habit tracker that treats behavioral pattern detection as a first-class outcome rather than a premium add-on. It tracks both positive habits (do X) and negative habits (avoid Y) in one model, and surfaces failure patterns through a day-of-week calendar grid — answering the question existing apps leave unanswered: *why do I fail when I fail?* The product bet is that a meaningful slice of users prefer restraint plus insight over feature bloat plus motivational noise.

## North star

**S-01 — `create-habit-and-mark-today`: a new user can register, create their first habit, mark today's status, and see it on their habit list within ~1 minute of signup.**

This is the *north star* — the smallest end-to-end slice whose successful delivery would prove the product's core bet (that users will adopt a free, deliberately simple tracker), placed as early as prerequisites allow because every later slice only matters if this activation flow works. It maps directly to the PRD's primary Success Criterion: elapsed time from the `account_created` event to the first `habit_status_marked` event ≤ 60 seconds. Its one prerequisite is the auth foundation (F-01).

## At a glance

| ID    | Change ID                   | Outcome (user can …)                                                              | Prerequisites | PRD refs                              | Status   |
| ----- | --------------------------- | --------------------------------------------------------------------------------- | ------------- | ------------------------------------- | -------- |
| F-01  | auth-and-session-contract   | (foundation) email+password auth issues + verifies tokens; SPA gates routes       | —             | FR-001, FR-002, FR-003                | done     |
| S-01  | create-habit-and-mark-today | create first habit + mark today + see it on the modality-grouped list (≤ ~1 min)  | F-01          | US-01, US-02, FR-004, FR-005, FR-006, FR-009 | done     |
| S-02  | habit-calendar-and-backfill | open a habit's detail, see the monthly calendar, change any past day retroactively | S-01          | US-03, FR-010, FR-011, FR-012         | done     |
| S-03  | habit-insight-metrics       | see current streak, rolling consistency %, adaptive ratio, and top-10 best streaks     | S-02          | US-03, FR-013, FR-014, FR-015, FR-016 | done     |
| S-04  | edit-and-delete-habit       | edit a habit's name, modality, and target count, and delete it with a brief undo  | S-03          | FR-007, FR-008                        | done     |

## Baseline

What's already in place in the codebase as of `2026-05-28` (auto-researched + user-confirmed).
Foundations below assume these are present and do NOT re-scaffold them. **Per the user: treat the existing `Habit` DB table and the JWT guard as mock scaffolding** — F-01 and S-01 build the real auth and data models rather than extending the mocks.

- **Frontend:** partial — React 19 + TanStack Router + Vite 8 + Tailwind 4 wired; `apps/web/src/lib/apiClient.ts` carries both API base URLs and `setBearerToken()`. Only `__root.tsx` + `index.tsx` (health page) exist; no auth/habit/calendar UI, no `components/`/`hooks/`/`types/`.
- **Backend / API:** partial — `apps/auth-api` is a health-check-only scaffold (no endpoints beyond `/auth/health`); `apps/habits-api` has auth-gated `GET /habits` + `POST /habits` only (`apps/habits-api/src/habits/habits.controller.ts`).
- **Data:** partial — Postgres 16 + Prisma 6 per service. `apps/habits-api` has a minimal mock `Habit` table (id, userId, title, createdAt), 1 migration; `apps/auth-api` schema is empty, 0 migrations.
- **Auth:** partial (mock) — `apps/habits-api/src/auth/jwt.guard.ts` verifies HS256 bearer tokens and gates routes, but `apps/auth-api` has no User model and no registration / sign-in / token-issuance. The verifying half is mock; the issuing half is absent.
- **Deploy / infra:** present — AWS EC2 + k3s + RDS + S3/CloudFront, Terraform-managed and operational; per-app path-filtered GitHub Actions CI/CD (per `infrastructure.md`).
- **Observability:** partial — `@nestjs/terminus` health probes per service; kubectl / GitHub Actions / RDS CloudWatch logs. No centralized aggregation, error tracking, or metrics dashboards (per `infrastructure.md`). PRD requires no more than this for MVP.

## Foundations

### F-01: Auth & session contract

- **Outcome:** (foundation) email+password auth works end-to-end — `auth-api` issues access + refresh tokens on register / sign-in / sign-out, `habits-api` verifies them via a real guard (replacing the mock), every authenticated request carries a per-user identity, and the SPA stores the token and gates protected routes.
- **Change ID:** auth-and-session-contract
- **PRD refs:** FR-001, FR-002, FR-003; `## Access Control`; `## Non-Functional Requirements` (per-user data isolation)
- **Unlocks:** S-01, S-02, S-03, S-04 (every gated route); establishes token-`sub` → userId once so the "no cross-user reads" guardrail can hold across all slices.
- **Prerequisites:** —
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Is a password-reset flow in MVP scope? — Owner: user. Block: no (PRD permits launching without it; resolve before user count crosses single digits).
- **Risk:** Auth is the cross-cutting gate every slice depends on, and per-user scoping (`sub` → userId on every query) is what makes cross-tenant leakage — a product-killing incident per the guardrails — impossible. The existing guard is mock, so this is a real build, not an extension. Sequenced first because nothing user-facing is plannable until a signed-in user with a stable identity exists.
- **Status:** ready

## Slices

### S-01: Create a habit and mark today

- **Outcome:** user can register, land directly on a screen to create their first habit (name, modality, frequency; target count required for weekly/monthly), mark today completed or missed, and see the habit on a modality-grouped list showing the current period's progress against its target — within ~1 minute of signup.
- **Change ID:** create-habit-and-mark-today
- **PRD refs:** US-01, US-02, FR-004, FR-005, FR-006, FR-009
- **Prerequisites:** F-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Mark-control interaction shape (cycle vs. picker) — Owner: design. Block: no (PRD leaves this to design time; not pinned).
- **Risk:** The largest slice and the activation flow — it introduces the real `Habit` + `Mark` data models (replacing the mock table) and must hit the <300 ms perceived-responsiveness guardrail on the mark interaction. Proving time-to-first-value here is the entire validation bet, so it leads.
- **Status:** proposed

### S-02: Habit detail — calendar and retroactive marking

- **Outcome:** user can open a habit's detail page, see a monthly day-of-week calendar (Monday-first, ISO 8601) with each cell rendering completed / missed / today / unmarked, and select any past day to change its status retroactively with no time-window restriction.
- **Change ID:** habit-calendar-and-backfill
- **PRD refs:** US-03, FR-010, FR-011, FR-012
- **Prerequisites:** S-01
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** The calendar grid is the pattern-view differentiator — the product's reason to exist beyond plain tracking — so it lands before the numeric metrics. Retroactive marks (FR-010) write into closed periods, so the write path must be built to trigger a downstream recompute even before the metrics engine (S-03) exists.
- **Status:** proposed

### S-03: Habit insight metrics

- **Outcome:** user can see, on a habit's detail page, the current streak, a rolling-window consistency percentage (30 days / 8 weeks / 6 months by frequency), an adaptive early-phase ratio that transitions to a percentage after 14 days of tracking, and — in a secondary, non-prominent view — the top 10 longest streaks ever achieved, each shown with its start date, end date, and length in days, ordered by length (longest first; ties broken toward recency), with the active streak highlighted in place or pinned below the leaderboard when it doesn't rank.
- **Change ID:** habit-insight-metrics
- **PRD refs:** US-03, FR-013, FR-014, FR-015, FR-016; `## Non-Functional Requirements` (timezone/DST robustness of period rules)
- **Prerequisites:** S-02
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:**
  - Visual treatment of the secondary best-streaks view — **resolved (S-03):** a collapsed disclosure expanding to a proportional bar chart (full-width bars, labelled above) ordered longest-first, with the active streak highlighted in place or pinned below (with a "to crack the top 10" nudge) when it doesn't rank. Owner: design. Block: no.
- **Risk:** The heaviest slice — it implements the frequency-aware period-success + streak + rolling-window engine from `## Business Logic`, including the timezone/DST boundary robustness NFR (a corrupted streak from a DST transition is a defect). Retroactive marks from S-02 must recompute correctly across affected ranges. The top-10 best-streaks view (FR-015) raises the bar further: it requires enumerating *every* historical streak run with its date span, not just the single maximum — a superset of the current-streak computation.
- **Status:** done

### S-04: Edit and delete a habit

- **Outcome:** user can edit an existing habit's name, modality, and target count — frequency is fixed at creation and cannot be edited, so the period structure is stable and no edit resets the streak — and can permanently delete a habit (removing all its marks) with a brief (~5 s) opportunity to undo.
- **Change ID:** edit-and-delete-habit
- **PRD refs:** FR-007, FR-008
- **Prerequisites:** S-03
- **Parallel with:** —
- **Blockers:** —
- **Unknowns:** —
- **Risk:** Sequenced last because habit management (edit/delete) sits off the core activation → insight validation path, so it lands after the insight slice (S-03) proves the product's value. With frequency immutable (FR-007), edit carries no streak-reset seam; the main hazard is delete, which is destructive but bounded by the ~5 s undo affordance.
- **Status:** done

## Backlog Handoff

| Roadmap ID | Change ID                   | Suggested issue title                                                   | Ready for `/10x-plan` | Notes                                  |
| ---------- | --------------------------- | ----------------------------------------------------------------------- | --------------------- | -------------------------------------- |
| F-01       | auth-and-session-contract   | Auth & session contract: register / sign-in / sign-out + token issue+verify | yes                   | Run `/10x-plan auth-and-session-contract` |
| S-01       | create-habit-and-mark-today | Activation: create first habit and mark today (north star)              | no                    | Plan after F-01 lands                  |
| S-02       | habit-calendar-and-backfill | Habit detail: calendar grid + retroactive marking                       | no                    | Plan after S-01                        |
| S-03       | habit-insight-metrics       | Habit insight: streaks, rolling %, top-10 best streaks, adaptive ratio              | no                    | Plan after S-02                        |
| S-04       | edit-and-delete-habit       | Edit and delete a habit (name, modality, target; frequency fixed; undo)         | no                    | Plan after S-03                        |

## Open Roadmap Questions

1. **Is a password-reset flow in MVP scope?** — Owner: user. Block: F-01 scope (non-blocking for launch — PRD permits shipping without it; recommended to resolve before user count crosses single digits).
2. **What is the precise shape of the "secondary view" for the top-10 best streaks (FR-015)?** — **resolved (S-03):** a collapsed "Best streaks" disclosure expanding to a proportional bar chart (full-width bars), ordered longest-first, with the active streak highlighted in place or pinned below when it doesn't rank. Owner: design. Block: none (resolved).
3. **Email-verification policy as the user base grows.** — Owner: user, with input from operations. Block: roadmap-wide (post-MVP; non-blocking — MVP ships with immediate-access signup).

## Parked

- **AI / ML pattern-detection, habit analyzer, coaching** — Why parked: PRD `## Non-Goals`; the visual calendar is the v1 differentiator and AI is the natural v2 axis.
- **Notifications, reminders, motivational messages** — Why parked: PRD `## Non-Goals`; "no motivational noise" is half the vision.
- **Social features (sharing, friends, leaderboards, accountability partners)** — Why parked: PRD `## Non-Goals`; major v2 scope expansion.
- **Manual import of historical data** — Why parked: PRD `## Non-Goals`; day-1 users start from zero (cut as the largest scope cost on the MVP path).
- **Third-party / OAuth sign-in** — Why parked: PRD `## Non-Goals`; email + password only in v1.
- **Shared habits / accountability-partner features** — Why parked: PRD `## Non-Goals`; strict single-tenant ownership of each habit's data.
- **Native mobile apps (iOS / Android)** — Why parked: PRD `## Non-Goals`; mobile is supported via responsive web only.
- **Offline-first / on-device-only storage** — Why parked: PRD `## Non-Goals`; backend-backed multi-device sync is the chosen shape.
- **Full WCAG 2.1 AA certification** — Why parked: PRD `## Non-Goals`; v1 commits to keyboard navigability + semantic landmarks only.
- **Internationalization** — Why parked: PRD `## Non-Goals`; English-only UI in v1.

## Done

- **S-03: user can see, on a habit's detail page, the current streak, a rolling-window consistency percentage (30 days / 8 weeks / 6 months by frequency), an adaptive early-phase ratio that transitions to a percentage after 14 days of tracking, and — in a secondary, non-prominent view — the top 10 longest streaks ever achieved, each shown with its start date, end date, and length in days, ordered by length (longest first; ties broken toward recency), with the active streak highlighted in place or pinned below the leaderboard when it doesn't rank.** — Archived 2026-06-04 → `context/archive/2026-06-04-habit-insight-metrics/`. Lesson: —.
- **S-04: user can edit an existing habit's name, modality, and target count — frequency is fixed at creation and cannot be edited, so the period structure is stable and no edit resets the streak — and can permanently delete a habit (removing all its marks) with a brief (~5 s) opportunity to undo.** — Archived 2026-06-04 → `context/archive/2026-06-04-edit-and-delete-habit/`. Lesson: —.
