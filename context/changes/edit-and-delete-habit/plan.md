# Edit and Delete Habit — Implementation Plan

## Overview

Let users edit a habit's **name** and **modality** and **hard-delete** a habit. Today `habits-api` exposes only create (`POST`) and read (`GET` list/calendar/metrics), and the web app has a create form but no way to change or remove a habit. This adds a `PATCH` and `DELETE` endpoint (mirroring the existing marks endpoints), the frontend data layer to call them, and an inline edit form + reusable confirm dialog on the habit detail page.

## Current State Analysis

- **Backend has no update/delete for habits.** [habits.controller.ts](apps/habits-api/src/habits/habits.controller.ts) is `@Controller()` + `@UseGuards(JwtGuard)` with `@Get()`, `@Post()`, `@Get(':habitId/calendar')`, `@Get(':habitId/metrics')`. User id comes from `@Req() req: AuthenticatedRequest` → `req.user.sub`.
- **A near-identical precedent exists in marks.** [marks.controller.ts](apps/habits-api/src/marks/marks.controller.ts) uses `@Put(':date')` and `@Delete(':date')` + `@HttpCode(204)`; [marks.service.ts](apps/habits-api/src/marks/marks.service.ts) has a private `assertOwned(userId, habitId)` that throws `NotFoundException` (404, not 403) so a habit's existence is never leaked across users.
- **Delete cascade is already configured.** The `Mark.habit` relation uses `onDelete: Cascade` ([schema.prisma:52](apps/habits-api/prisma/schema.prisma)). Insight metrics compute on-read purely from marks (no materialized table), so a hard delete needs no extra cleanup and leaves no orphans.
- **`frequency`/`targetCount` are immutable by design.** [habits.service.ts:137](apps/habits-api/src/habits/habits.service.ts) and :156 state all historical marks are interpreted against the habit's frequency/target. `modality` and `name` never enter period/metrics math (`computeMetrics` takes only `{frequency, target, anchor, today, marks}`), so they are safe to edit.
- **Validation is DTO + global `ValidationPipe`** (`whitelist: true, transform: true, forbidNonWhitelisted: true`). [create-habit.dto.ts](apps/habits-api/src/habits/dto/create-habit.dto.ts) trims `name` via `@Transform` before `@IsNotEmpty`. `forbidNonWhitelisted` means a `PATCH` body carrying `frequency`/`targetCount` is rejected with 400 — the immutability guard comes for free.
- **Frontend: feature-sliced.** [apps/web/CLAUDE.md] mandates `features/habits/{api,hooks,components}`, `types.ts`, and `shared/components/` for cross-feature UI. [api/habits.ts](apps/web/src/features/habits/api/habits.ts) holds React-free request fns (`createHabit`, `putMark`, `deleteHabit`) + an `errorMessage` helper and the `habitsApi` client. Hooks like `useCreateHabit` invalidate `['habits', today]`.
- **No modal/dialog/confirmation pattern exists** anywhere in the SPA — a confirm dialog is net-new. [HabitDetail.tsx](apps/web/src/features/habits/components/HabitDetail.tsx) header renders the habit name (`data.habit.name`), a `modality · frequency` line, and a "Back to habits" `Link`; it already holds `data.habit` (id, name, modality, frequency, targetCount) so the edit form can pre-fill with no extra fetch.

## Desired End State

A user viewing a habit's detail page can: (1) click **Edit**, change the name and/or Build/Break type inline, Save (header updates to reflect server truth) or Cancel; (2) click **Delete**, confirm in a dialog, and land back on `/app` with the habit (and all its marks) gone. The backend rejects edits to frequency/target and any cross-user access with the correct status codes, verified by unit + e2e tests.

### Key Discoveries:

- Mirror [marks.service.ts:30](apps/habits-api/src/marks/marks.service.ts) `assertOwned` → 404 pattern for both new service methods.
- `onDelete: Cascade` already handles mark cleanup ([schema.prisma:52](apps/habits-api/prisma/schema.prisma)) — no migration needed.
- `forbidNonWhitelisted: true` turns an `UpdateHabitDto` that omits `frequency`/`targetCount` into an automatic 400-on-attempt guard.
- `HabitDetail` already has `data.habit` to seed the edit form ([HabitDetail.tsx:47](apps/web/src/features/habits/components/HabitDetail.tsx)).
- The detail header's name is sourced from the calendar query payload, so the edit hook must invalidate that habit's calendar key (broad `['habits']` invalidation covers it).

## What We're NOT Doing

- **Not** editing `frequency` or `targetCount` — they are immutable (historical marks are interpreted against them).
- **No** soft delete, undo, trash, or recovery — delete is a hard, irreversible cascade.
- **No** edit/delete controls in the list row ([HabitRow.tsx](apps/web/src/features/habits/components/HabitRow.tsx)) — detail page only.
- **No** optimistic updates — simple invalidate-on-success (edit/delete are infrequent, not latency-sensitive like mark-toggling).
- **No** frontend component tests — matches current coverage (habit components have none today); the new `ConfirmDialog` and edit form are verified manually.
- **No** refactor of the inline ownership checks in `getCalendar`/`getMetrics` to use the new shared `assertOwned` — out of scope.
- **No** bulk/multi-select delete.

## Implementation Approach

Three phases, each independently verifiable: (1) backend endpoints + tests — fully testable on its own; (2) frontend transport + hooks — typechecks against the new endpoints; (3) detail-page UI wiring the hooks to an inline edit form and a reusable confirm dialog. Backend mirrors the marks precedent almost verbatim; the only genuinely new artifact is the `ConfirmDialog` component.

## Critical Implementation Details

- **`<dialog>` lifecycle (Phase 3).** A native `<dialog>` is opened/closed imperatively, not declaratively — `dialogRef.current.showModal()` / `.close()` must be driven from the `open` prop inside a `useEffect`, and the dialog's native `close` event (fired on Esc) must call `onCancel` so React state stays in sync. This is a legitimate effect (crossing into a non-React imperative API), not one the React Compiler removes.

```tsx
useEffect(() => {
  const el = dialogRef.current;
  if (!el) return;
  if (open && !el.open) el.showModal();
  else if (!open && el.open) el.close();
}, [open]);
```

## Phase 1: Backend — PATCH + DELETE endpoints

### Overview

Add `PATCH /habits/:habitId` (edit name/modality) and `DELETE /habits/:habitId` (hard delete, cascade marks), with ownership checks returning 404 on a miss, plus unit and e2e coverage.

### Changes Required:

#### 1. UpdateHabitDto

**File**: `apps/habits-api/src/habits/dto/update-habit.dto.ts` (new)

**Intent**: Define the editable surface — only `name` and `modality`, both optional (PATCH semantics). Omitting `frequency`/`targetCount` means a body containing them is rejected by the global `forbidNonWhitelisted` pipe, enforcing immutability at the boundary.

**Contract**: `name?: string` — `@IsOptional`, same `@Transform` trim + `@IsString` + `@IsNotEmpty` as [create-habit.dto.ts](apps/habits-api/src/habits/dto/create-habit.dto.ts) (so a whitespace-only name still 400s). `modality?: HabitModality` — `@IsOptional` + `@IsEnum(HabitModality)`. Import enums from `../../../generated/prisma`.

#### 2. HabitsService — update + remove + assertOwned

**File**: `apps/habits-api/src/habits/habits.service.ts`

**Intent**: Add `update` and `remove`, each guarded by a new private `assertOwned` helper (mirroring [marks.service.ts:30](apps/habits-api/src/marks/marks.service.ts)). `update` applies only the provided fields; `remove` hard-deletes (marks cascade).

**Contract**:
- `private async assertOwned(userId: string, habitId: string): Promise<void>` — `findFirst({ where: { id, userId }, select: { id: true } })`; throw `NotFoundException('Habit not found')` if absent.
- `async update(userId, habitId, dto: UpdateHabitDto)` — `await assertOwned(...)`, then `prisma.habit.update({ where: { id: habitId }, data })` where `data` includes only keys present in `dto` (`name`/`modality`). Returns the updated habit. An empty body is a no-op that returns the habit unchanged.
- `async remove(userId, habitId): Promise<void>` — `await assertOwned(...)`, then `prisma.habit.delete({ where: { id: habitId } })`.

#### 3. HabitsController — routes

**File**: `apps/habits-api/src/habits/habits.controller.ts`

**Intent**: Wire the two routes, following the marks controller's verb/decorator choices.

**Contract**: `@Patch(':habitId') update(@Req() req, @Param('habitId') habitId, @Body() dto: UpdateHabitDto)` → `habitsService.update(req.user.sub, habitId, dto)`. `@Delete(':habitId') @HttpCode(204) remove(@Req() req, @Param('habitId') habitId)` → `habitsService.remove(req.user.sub, habitId)`. Add `Patch`, `Delete`, `HttpCode` to the `@nestjs/common` import and import `UpdateHabitDto`.

#### 4. Unit tests

**File**: `apps/habits-api/src/habits/habits.service.spec.ts`

**Intent**: Cover the new methods with the existing mock-Prisma style.

**Contract**: `update` — applies name+modality for an owned habit; partial body (name only) leaves modality untouched; throws `NotFoundException` when `findFirst` returns null. `remove` — calls `habit.delete` for an owned habit; throws `NotFoundException` when not owned. Assert ownership query is scoped by `{ id, userId }`.

#### 5. E2E tests

**File**: `apps/habits-api/test/app.e2e-spec.ts`

**Intent**: Verify the HTTP contract and the cross-user isolation property that delete must preserve, mirroring the existing two-user supertest setup.

**Contract**: `PATCH /habits/:id` updates name+modality (200, returns updated row); `PATCH` with `frequency` or `targetCount` in the body → 400; `PATCH` with whitespace-only name → 400; `PATCH` another user's habit → 404. `DELETE /habits/:id` → 204 and the habit no longer appears in that user's `GET /habits`; `DELETE` another user's habit → 404.

### Success Criteria:

#### Automated Verification:

- Unit tests pass: `npm test -w @habitpair/habits-api`
- E2E tests pass: `npm run test:e2e -w @habitpair/habits-api`
- Build/typecheck passes: `npm run build -w @habitpair/habits-api`
- Lint passes: `npm run lint -w @habitpair/habits-api`

#### Manual Verification:

- `curl -X PATCH` with a valid token edits name/modality; with `frequency` in the body returns 400.
- `curl -X DELETE` returns 204; a follow-up `GET /habits` no longer lists the habit; its calendar endpoint now 404s.

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation before proceeding.

---

## Phase 2: Frontend data layer

### Overview

Add the React-free request functions, the input type, and the two mutation hooks that invalidate habit queries on success.

### Changes Required:

#### 1. UpdateHabitInput type

**File**: `apps/web/src/features/habits/types.ts`

**Intent**: Type the editable payload to match the backend DTO.

**Contract**: `export interface UpdateHabitInput { name?: string; modality?: Modality }`.

#### 2. API functions

**File**: `apps/web/src/features/habits/api/habits.ts`

**Intent**: Add `updateHabit` and `deleteHabit`, following the existing `createHabit`/`deleteMark` shape (throw `errorMessage(response)` on `!response.ok`).

**Contract**: `updateHabit(habitId: string, input: UpdateHabitInput): Promise<void>` — `PATCH /habits/${habitId}`, JSON body, `Content-Type: application/json`. `deleteHabit(habitId: string): Promise<void>` — `DELETE /habits/${habitId}` (204 is `ok`).

#### 3. Mutation hooks

**File**: `apps/web/src/features/habits/hooks/useUpdateHabit.ts` and `useDeleteHabit.ts` (new)

**Intent**: Wrap the request fns; on success invalidate habit queries so the list and the detail header reflect server truth.

**Contract**: Both use `useMutation` + `useQueryClient`, and on `onSuccess` call `queryClient.invalidateQueries({ queryKey: ['habits'] })` (broad prefix — covers the list key plus the edited habit's calendar/metrics keys; the header name is sourced from the calendar payload). `useUpdateHabit(habitId)` → `mutationFn: (input: UpdateHabitInput) => updateHabit(habitId, input)`. `useDeleteHabit(habitId)` → `mutationFn: () => deleteHabit(habitId)`.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck -w @habitpair/web`
- Lint passes: `npm run lint -w @habitpair/web`
- Existing frontend tests pass: `npm run test -w @habitpair/web`

#### Manual Verification:

- (Deferred to Phase 3 — these hooks have no UI yet.)

**Implementation Note**: After automated verification passes, proceed to Phase 3 (no manual UI to confirm here).

---

## Phase 3: Detail-page UI

### Overview

Add a reusable `ConfirmDialog`, an inline edit toggle in the `HabitDetail` header, and a Delete button that confirms then navigates to `/app`.

### Changes Required:

#### 1. ConfirmDialog (reusable)

**File**: `apps/web/src/shared/components/ConfirmDialog.tsx` (new)

**Intent**: A presentational, accessible confirm dialog built on the native `<dialog>` element, reusable for any future destructive action.

**Contract**: Props `{ open: boolean; title: string; message: string; confirmLabel?: string; onConfirm: () => void; onCancel: () => void; isPending?: boolean }`. Drives `showModal()`/`close()` from `open` via the effect in **Critical Implementation Details**; wires the dialog's native `close` event to `onCancel`; danger-styled confirm button disabled while `isPending`; Tailwind v4 utilities only.

#### 2. HabitDetail — edit + delete wiring

**File**: `apps/web/src/features/habits/components/HabitDetail.tsx`

**Intent**: Add an inline edit mode and a delete flow to the header, seeded from the `data.habit` already in scope.

**Contract**:
- Local state: `editing` (bool), `confirmingDelete` (bool). `useNavigate` from `@tanstack/react-router`.
- View mode: render the existing name/modality/frequency header plus **Edit** and **Delete** buttons.
- Edit mode: inline form with a name `<input>` (pre-filled `data.habit.name`, HTML5 `required`) and a modality `<select>` (Build/Break, pre-filled), **Save** (submit) + **Cancel** (revert, `setEditing(false)`). Frequency is shown read-only or hidden — never editable. On `useUpdateHabit(habitId)` success → `setEditing(false)`; on error → `role="alert"` message (mirror [CreateHabitForm.tsx](apps/web/src/features/habits/components/CreateHabitForm.tsx)).
- Delete: **Delete** button → `setConfirmingDelete(true)`; `<ConfirmDialog open={confirmingDelete} … isPending={deleteMutation.isPending} />`; `onConfirm` → `useDeleteHabit(habitId).mutate()` → on success `navigate({ to: '/app' })`; `onCancel` → `setConfirmingDelete(false)`.

### Success Criteria:

#### Automated Verification:

- Typecheck passes: `npm run typecheck -w @habitpair/web`
- Lint passes: `npm run lint -w @habitpair/web`
- Frontend tests pass: `npm run test -w @habitpair/web`

#### Manual Verification:

- Editing a name and saving updates the detail header and the list (verified in the browser preview).
- Changing modality moves the habit between the Building/Breaking groups on `/app`.
- Cancel discards edits; the header reverts.
- Delete opens the confirm dialog; confirming removes the habit and navigates to `/app` where it no longer appears; Esc/Cancel aborts with no change.
- Empty name on edit is blocked (HTML5 `required`; backend 400 as a backstop).

**Implementation Note**: After completing this phase and all automated verification passes, pause for manual confirmation in the browser before considering the change done.

---

## Testing Strategy

### Unit Tests:

- `HabitsService.update`: applies provided fields only; 404 on non-owned.
- `HabitsService.remove`: deletes owned habit; 404 on non-owned.

### Integration Tests (e2e):

- `PATCH` happy path (name+modality), immutability guard (frequency/target → 400), invalid name → 400, cross-user → 404.
- `DELETE` → 204, removal reflected in list, cross-user → 404.

### Manual Testing Steps:

1. Open a habit's detail page, click Edit, change name + modality, Save → header + `/app` list update.
2. Click Edit, change something, Cancel → no change.
3. Click Delete → confirm dialog → Cancel (Esc) → no change.
4. Click Delete → Confirm → lands on `/app`, habit gone.

## Performance Considerations

None — both endpoints are single-row writes; the broad `['habits']` cache invalidation triggers at most a list + one calendar + one metrics refetch on an infrequent user action.

## Migration Notes

No schema change. The `onDelete: Cascade` on `Mark.habit` already exists; deleting a habit removes its marks transactionally in the database.

## References

- Backend precedent (verb/decorator/ownership): [marks.controller.ts](apps/habits-api/src/marks/marks.controller.ts), [marks.service.ts:30](apps/habits-api/src/marks/marks.service.ts)
- DTO/validation pattern: [create-habit.dto.ts](apps/habits-api/src/habits/dto/create-habit.dto.ts)
- Cascade: [schema.prisma:52](apps/habits-api/prisma/schema.prisma)
- Immutability rationale: [habits.service.ts:137](apps/habits-api/src/habits/habits.service.ts)
- Frontend transport/hook patterns: [api/habits.ts](apps/web/src/features/habits/api/habits.ts), [useCreateHabit.ts](apps/web/src/features/habits/hooks/useCreateHabit.ts)
- Edit form template: [CreateHabitForm.tsx](apps/web/src/features/habits/components/CreateHabitForm.tsx)
- Detail page: [HabitDetail.tsx](apps/web/src/features/habits/components/HabitDetail.tsx)
- Frontend structure rules: `apps/web/CLAUDE.md`

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Backend — PATCH + DELETE endpoints

#### Automated

- [x] 1.1 Unit tests pass: `npm test -w @habitpair/habits-api`
- [x] 1.2 E2E tests pass: `npm run test:e2e -w @habitpair/habits-api`
- [x] 1.3 Build/typecheck passes: `npm run build -w @habitpair/habits-api`
- [x] 1.4 Lint passes: `npm run lint -w @habitpair/habits-api`

#### Manual

- [x] 1.5 `curl PATCH` edits name/modality; `frequency` in body → 400
- [x] 1.6 `curl DELETE` → 204; habit gone from list; calendar 404s

### Phase 2: Frontend data layer

#### Automated

- [ ] 2.1 Typecheck passes: `npm run typecheck -w @habitpair/web`
- [ ] 2.2 Lint passes: `npm run lint -w @habitpair/web`
- [ ] 2.3 Existing frontend tests pass: `npm run test -w @habitpair/web`

### Phase 3: Detail-page UI

#### Automated

- [ ] 3.1 Typecheck passes: `npm run typecheck -w @habitpair/web`
- [ ] 3.2 Lint passes: `npm run lint -w @habitpair/web`
- [ ] 3.3 Frontend tests pass: `npm run test -w @habitpair/web`

#### Manual

- [ ] 3.4 Edit name + Save updates header and `/app` list
- [ ] 3.5 Changing modality moves the habit between Building/Breaking groups
- [ ] 3.6 Cancel discards edits; header reverts
- [ ] 3.7 Delete → confirm → navigates to `/app`, habit gone; Esc/Cancel aborts
- [ ] 3.8 Empty name on edit is blocked
