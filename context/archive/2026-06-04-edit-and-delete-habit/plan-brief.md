# Edit and Delete Habit — Plan Brief

> Full plan: `context/changes/edit-and-delete-habit/plan.md`

## What & Why

Users can create and track habits but can't change or remove one once made. This adds **edit** (name + Build/Break modality) and **hard delete** (cascade marks) for habits — closing the gap so a habit created with a typo or the wrong type isn't permanent.

## Starting Point

`habits-api` has only `POST`/`GET` for habits; the marks feature already implements the exact `@Put`/`@Delete` + ownership-check (404-on-miss) pattern to mirror. The `Mark.habit` FK is `onDelete: Cascade`, and metrics compute on-read from marks — so delete needs no migration or cleanup. The web app's `HabitDetail` header shows the habit and already holds its data; there is no edit/delete UI and no dialog pattern anywhere yet.

## Desired End State

On a habit's detail page, **Edit** turns the header into an inline form (name + modality, Save/Cancel) that updates to server truth on save; **Delete** opens a confirm dialog and, on confirm, removes the habit (and its marks) and returns the user to `/app`. The backend rejects edits to frequency/target and any cross-user access with correct status codes, covered by unit + e2e tests.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Editable fields | Name + modality only | Both are display-only; frequency/target are immutable (historical marks are interpreted against them). | Plan |
| Delete strategy | Hard delete (cascade) | Cascade is already configured and metrics compute on-read, so deleted habits vanish cleanly. | Plan |
| Delete confirmation | Reusable `<dialog>` ConfirmDialog | Accessible, testable, styled, and reusable — no decent dialog exists yet. | Plan |
| Control placement | Detail page only | Room for the edit form; keeps the list row uncluttered. | Plan |
| Edit form UX | Inline toggle in header | No new route/modal; reuses the create-form field patterns. | Plan |
| Cache sync | Simple invalidate | Edit/delete are infrequent and not latency-sensitive; optimistic is overkill. | Plan |
| HTTP verb | `PATCH`, partial DTO | Correct for partial edits; omitting frequency/target makes the pipe reject them (400). | Plan |
| Test depth | Backend unit + e2e | Matches existing backend rigor and current (zero) frontend habit-component coverage. | Plan |

## Scope

**In scope:** `PATCH`/`DELETE` habit endpoints + DTO + ownership checks; backend unit + e2e tests; frontend `updateHabit`/`deleteHabit` fns + hooks; reusable `ConfirmDialog`; inline edit + delete on `HabitDetail`.

**Out of scope:** editing frequency/targetCount; soft delete/undo; list-row controls; optimistic updates; frontend component tests; refactoring existing inline ownership checks; bulk delete.

## Architecture / Approach

Backend mirrors `marks` almost verbatim: a private `assertOwned` (404-on-miss) guards `update` (applies only provided fields) and `remove` (`prisma.habit.delete`, marks cascade); the global `ValidationPipe` (`forbidNonWhitelisted`) enforces field immutability for free. Frontend follows the feature-slice rules: React-free request fns in `api/`, `useUpdateHabit`/`useDeleteHabit` hooks invalidating the broad `['habits']` key, and UI confined to `HabitDetail` + a shared `ConfirmDialog`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Backend endpoints | `PATCH`/`DELETE` + DTO + unit/e2e tests | Ownership/immutability must return correct codes (404/400) |
| 2. Frontend data layer | types, request fns, mutation hooks | Right query-key invalidation so the header reflects edits |
| 3. Detail-page UI | ConfirmDialog + inline edit + delete wiring | `<dialog>` imperative lifecycle synced to React state |

**Prerequisites:** local dev env (`make up`), valid auth token for curling the API.
**Estimated effort:** ~2–3 sessions across the 3 phases.

## Open Risks & Assumptions

- Editing modality re-groups the habit (Building↔Breaking) on `/app` — expected, verify after invalidation.
- The `<dialog>` element needs an imperative effect (`showModal`/`close`) synced to the `open` prop and its native `close` event — the one genuinely new pattern.
- Deleting from detail navigates to `/app`; revisiting the stale detail URL would 404 (acceptable).

## Success Criteria (Summary)

- A user can rename a habit and change its type from the detail page, with the list reflecting the change.
- A user can delete a habit behind a confirmation and is returned to the list with it (and its marks) gone.
- The backend refuses frequency/target edits and cross-user edit/delete with the correct status codes (proven by e2e).
