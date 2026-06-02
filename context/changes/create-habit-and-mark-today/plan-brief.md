# Create a Habit and Mark Today (S-01) — Plan Brief

> Full plan: `context/changes/create-habit-and-mark-today/plan.md`
> Frame brief: `context/changes/create-habit-and-mark-today/frame.md`

## What & Why

S-01 is the product's north-star activation slice: a freshly-registered user creates their first habit, marks today, and sees it on their list within ~1 minute of signup. Per the frame, the real risk isn't performance — it's getting a few small, hard-to-reverse **modeling/date-semantics** decisions right so S-02 (calendar) and S-03 (metrics) build on solid ground.

## Starting Point

habits-api has a mock `Habit` table (id/userId/title, `cuid`) and a `GET`/`POST /habits` stub; the SPA's `/app` is a "No habits yet" placeholder. F-01 already wired real auth (JWT guard → `req.user.sub`), the global `ValidationPipe`, and the feature-based frontend structure (the `auth` feature is the worked example to copy). No `Mark` entity, no date library.

## Desired End State

On `/app`, a new user opens an inline form, creates a habit (name, modality, frequency, target for weekly/monthly), and sees it in a positive/negative-grouped list. Each row shows current-period progress and a done-toggle; tapping it marks today completed (or clears it) with the visible change under 300 ms, persisting across reloads and devices. Every endpoint is per-user scoped.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Mark grain | One `Mark` row per (habit, day); absence = unmarked | Durable, supports calendar + retroactive later | Frame |
| Mark date type | Postgres `DATE` (`@db.Date`), unique `(habitId, date)` | Models a local calendar day, no TZ in storage | Plan |
| "Today" / local date | **Client sends** its local `YYYY-MM-DD`; server never reads its own clock | Correct under travel/DST, no stored user TZ | Plan |
| Status model | enum `COMPLETED \| MISSED`; **never auto-write MISSED** | Honest data; "past unmarked = fail" is read-time S-03 math | Frame + Plan |
| Stats | Compute-on-read (S-03); **no materialization, no recompute seam** | Data is tiny; seam is migration-free to add later (YAGNI) | Frame + Plan |
| Target count | `Int?` (null = daily implicit 1); DTO cross-field validator for weekly/monthly | Mirrors PRD; validate at the boundary | Plan |
| Today control | **Done-toggle** (completed ↔ unmarked); explicit MISSED waits for S-02 | Matches "check it if I did it, else leave it" | Plan |
| Mark API | `PUT`/`DELETE /habits/:id/marks/:date` | REST-clean, idempotent, addressable for S-02 | Plan |
| Progress calc | **Server**, in `GET /habits?today=` | One round-trip; period logic centralized for reuse | Plan |
| Mark latency | Optimistic update (TanStack Query) | Meets 300 ms guardrail regardless of network | Plan |
| Create flow | **Inline on /app** | Fewest steps for the ~1-min activation target | Plan |
| Migration | Squash to a fresh init | Greenfield; clean single migration | Plan |
| IDs | `@default(uuid(7))` | Project preference (replaces mock `cuid`) | Plan |

## Scope

**In scope:** real `Habit` + `Mark` model; create habit; mark/unmark **today** from the list; modality-grouped list with current-period progress; per-user isolation; optimistic toggle.

**Out of scope:** calendar + any past-day/retroactive marking (S-02); streaks, rolling %, ratios, longest streak (S-03); edit/delete habit (S-04); recompute seam; explicit same-day "missed" on the list control; user-timezone field; file import (permanent non-goal).

## Architecture / Approach

Bottom-up: schema + migration → habits-api read/write endpoints → SPA feature. Four authenticated endpoints under the `habits` prefix: `POST /habits`, `GET /habits?today=`, `PUT|DELETE /habits/:id/marks/:date`. The browser computes its local date and passes it on every read/write; the server stores it verbatim as a `DATE`. The SPA's `habits` feature mirrors the `auth` feature's folder shape; the toggle uses an optimistic mutation for the 300 ms guardrail.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Data model + migration | Real `Habit` + `Mark`, enums, `uuid(7)`, `@db.Date`, squashed init | Migration squash needs local DB reset |
| 2. habits-api create + list | `POST /habits`, `GET /habits?today=` with progress | `@db.Date` UTC-midnight day-shift bug |
| 3. habits-api marks | `PUT`/`DELETE` mark today, ownership + upsert | Date-keying / idempotency / 404-not-403 |
| 4. web habits feature | Inline create, modality list, optimistic toggle | Local-date computation; optimistic count reconciliation |

**Prerequisites:** F-01 (auth & session) — merged. Local Postgres via `make up`.
**Estimated effort:** ~2–3 sessions across the 4 phases.

## Open Risks & Assumptions

- **`@db.Date` day-shift:** Prisma surfaces a DATE as UTC-midnight; all parse/format must stay UTC date-only (one shared helper owns this). The single biggest source of subtle bugs.
- **Client-trusted date:** the server trusts the client's `today`; acceptable (per-habit ownership enforced; FR-010 makes arbitrary dates legitimate in S-02 anyway).
- **No recompute seam:** diverges from the frame's suggestion; deliberate (compute-on-read). S-03's planner should add the hook then if a concrete need appears.
- **US-02 "missed on the daily control"** is partially deferred to S-02's calendar — within bounds, since the PRD left the control shape to design.

## Success Criteria (Summary)

- A new user completes register → create → mark-today → see-it-on-the-list, with the toggle responding under 300 ms and the mark surviving a reload.
- No authenticated request returns or mutates another user's data.
- Automated tests green for per-user isolation, the mark write contract (date verbatim, upsert/delete idempotency), and current-period progress math.
