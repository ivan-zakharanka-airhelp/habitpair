# Habit Insight Metrics (S-03) — Plan Brief

> Full plan: `context/changes/habit-insight-metrics/plan.md`

## What & Why

Add the four habit-detail insight metrics from the PRD `## Business Logic` — current streak (FR-013), rolling-window consistency % (FR-014), an adaptive lifetime completion ratio (FR-016), and the top-10 best streaks (FR-015, upgraded on this branch to date-spanned runs). This is the slice that turns recorded marks into the behavioral signal the product exists to surface — "why do I fail when I fail?" — without AI, just honest counting.

## Starting Point

S-01 (data model + activation) and S-02 (detail page + multi-month calendar + retroactive marking) are merged. The detail page renders a calendar from a backend **read-model**; nothing is materialized. `apps/habits-api/src/marks/period.ts` is the single, DST-safe source of truth for all date/period math and already classifies daily/weekly/monthly failures the calendar colors. There is **no metrics endpoint, no streak/percentage computation, and no metrics UI** yet.

## Desired End State

Opening a habit's detail shows, under the title, a strip of three numbers — current streak (in days/weeks/months), rolling consistency %, and a recent-completion figure (raw "X of Y" for the first 14 days, a % after). Below the calendar, a collapsed **"Best streaks"** disclosure expands to up to ten dated rows (span + length), most-recent-first. Retroactively changing any past day updates all of them. A never-marked habit shows neutral empty states; no best streak is visible until the user expands the disclosure.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Frequency editing | **Forbidden in MVP** | Immutable frequency ⇒ one stable period structure per habit ⇒ pure compute-on-read streaks, no versioning, no reset seam, no migration. | Plan |
| Metrics transport | New `GET /habits/:id/metrics?today=` | Metrics are as-of-today + all-history; the calendar endpoint is range-based and re-fetches on every nav. | Plan |
| Best-streaks computation | Compute-on-read over all marks, no cap | Matches S-02's compute-on-read; correct after retroactive edits for free; "small" data scale. | Plan |
| Reset seam (FR-007) | None — frequency lock removes the hard case | `targetCount`/`modality` edits are S-04's problem; modality doesn't affect the math. | Plan |
| Rolling-% denominator | Successes ÷ evaluable periods since first mark, excl. in-progress | Young habits aren't punished; the still-winnable current period never drags it down. | Plan |
| Adaptive ratio (FR-016) | Anchor at first mark; lifetime (unbounded) denominator; ratio→% at 14 days | One consistent "tracking start"; distinct from the windowed rolling %. | Plan |
| Streak edge rule | Today/in-progress never penalizes (literal PRD reading) | Unmarked today neither breaks nor extends; current period counts once it meets target. | Plan |
| Best-streak length unit | Native period unit (day/week/month) + date span | "3 weeks" is meaningful where "21 days" implies daily granularity the data lacks. | Plan |
| Best-streaks view | Collapsed disclosure + dated list | Satisfies the non-prominence NFR with the least machinery (no route/modal). | Plan |
| Metrics layout | Strip under the title, above the calendar controls | Insight is the first thing seen — matches "pattern detection as first-class". | Plan |

## Scope

**In scope:** pure `metrics.ts` engine reusing `period.ts`; `MetricsQueryDto` + `HabitsService.getMetrics` + `GET …/metrics`; thorough backend unit + e2e; metrics query factory/hook, a `HabitMetrics` strip, and a `BestStreaks` disclosure on the detail page; metrics cache invalidation on mark mutations; PRD/roadmap reconciliation for frequency immutability.

**Out of scope:** any DB migration / materialization / caching; rule-versioning table; edit/delete UI (S-04); changes to the calendar/mark/list endpoints; bar-chart/modal/sub-page best-streaks; a frontend component-test suite.

## Architecture / Approach

A pure `metrics.ts` builds — once — the chronological period-classification sequence (`success`/`failure`/`pending`) from the anchor (first-mark date) to the current period, reusing `period.ts`'s UTC-getter boundary helpers. All four metrics derive from that one sequence (backward walk for the streak; run-collection + top-10 for best streaks; trailing-window and unbounded ratios for the percentages). `HabitsService.getMetrics` does the 404-on-miss ownership check + Prisma reads and delegates. The SPA mirrors the existing calendar query-factory pattern (key `['habits', habitId, 'metrics', today]`), renders a strip + a collapsed disclosure, and invalidates the metrics key when marks change. **Correctness invariant:** the metrics' success/failure classification must match what the S-02 calendar colors (daily via `computedMissedDates`, weekly/monthly via `closedPeriodFailures`).

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend engine + endpoint + spec reconciliation | `metrics.ts`, `MetricsQueryDto`, `getMetrics`, `GET …/metrics`, unit + e2e; PRD/roadmap frequency-immutability edits | Frequency-aware streak/window correctness, DST robustness, and the calendar-consistency invariant — the hard part |
| 2. Primary metrics UI | Types, query factory/hook, `HabitMetrics` strip under the title, metrics-key invalidation on mark mutations | Empty/`denominator==0` states; live refresh after retroactive marks |
| 3. Best-streaks secondary view | `BestStreaks` collapsed disclosure + dated list below the calendar | Non-prominence NFR; ongoing-run end-date clamp; keyboard operability |

**Prerequisites:** S-02 merged (done). No infra, no migration, no new access.
**Estimated effort:** ~3 sessions, one per phase (Phase 1 is the heaviest).

## Open Risks & Assumptions

- The streak engine pulls the full period-success logic into one module; its correctness rests on matching `period.ts`'s existing classification — guarded by an explicit consistency test.
- FR-016 is interpreted as a **lifetime** completion figure (unbounded since first mark) distinct from FR-014's trailing window, per the locked Q5 decision — the PRD's "recent-completion" wording is read accordingly; noted in the plan.
- Editing the PRD/roadmap to forbid frequency edits is a product decision made in this session; it is reversible and lives in the same branch already touching those docs.
- Frontend stays test-light by design; metric correctness is proven on the backend, UI is verified via preview.

## Success Criteria (Summary)

- A user with ≥7 days of marks opens a habit and sees an accurate streak, rolling %, and recent-completion figure that update live when they backfill a past day.
- The top-10 best streaks are correct (by length, most-recent-first, native unit + date span) and hidden until the user expands the disclosure.
- Backend unit + e2e prove the engine across daily/weekly/monthly including a DST window and the calendar-consistency invariant; frontend builds clean and is manually verified.
