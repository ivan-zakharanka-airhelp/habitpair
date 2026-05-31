---
project: habitpair
context_type: greenfield
created: 2026-05-24
updated: 2026-05-24
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
checkpoint:
  current_phase: 8
  phases_completed: [1, 2, 3, 4, 5, 6, 7]
  gray_areas_resolved:
    - topic: "pain category"
      decision: "missing capability — free + simple + dual-modality (positive & negative habits) + behavioral pattern insight does not exist as one product"
    - topic: "core insight"
      decision: "monetization rewards bloat and paywalls; restraint plus behavioral insight is the differentiator the market is not incentivized to ship"
    - topic: "primary persona scope"
      decision: "self + people like the builder — a person who has bounced off existing habit apps and wants to understand their own failure patterns"
    - topic: "auth model"
      decision: "email + password — standard credential login; backend-backed so the app can sync across devices"
    - topic: "role model"
      decision: "flat: one user role, each user sees only their own habits; no sharing, no admin UI"
    - topic: "signup flow"
      decision: "self-serve email+password signup with immediate access; no email verification gate in MVP"
    - topic: "mvp scope decision"
      decision: "scope down — drop manual import of historical data from Excel/other apps; keep all three frequencies (daily, weekly, monthly) and both modalities (positive & negative)"
    - topic: "primary success outcome"
      decision: "time-to-first-value: a new user can create their first habit and mark today within ~1 minute of registration"
    - topic: "secondary success outcome"
      decision: "engagement loop: a user marks habits across ≥ 7 distinct days within their first 2 weeks"
    - topic: "guardrails"
      decision: "data integrity (no silent loss of marks); per-user privacy (no cross-user habit leakage); MVP is free with no payment gate; perceived response time < 300 ms on the daily check-in interaction"
    - topic: "pattern-detection differentiator (MVP)"
      decision: "the monthly calendar IS the pattern view; no dedicated pattern-detection feature in v1 — day-of-week × week-of-month grid surfaces clusters by eye"
    - topic: "habit list grouping (Socrates FR-006)"
      decision: "list groups habits visually by modality (positive vs negative as distinct sections) to reinforce psychological framing"
    - topic: "habit edit & streak consequence (Socrates FR-007)"
      decision: "edits to modality or frequency reset the current streak to zero as a named consequence; pure renames do not affect metrics"
    - topic: "habit delete affordance (Socrates FR-008)"
      decision: "hard delete with ~5s undo toast; no soft-archive, no type-the-name confirmation"
    - topic: "day-status state model (Socrates FR-009)"
      decision: "binary completed/missed only — no neutral state in MVP; unmarked past days have defined treatment in business logic"
    - topic: "streak loss-aversion mitigation (Socrates FR-013/14/15)"
      decision: "pair current streak with a rolling-window consistency percentage (forgiving signal); move longest streak off the main detail surface into a secondary view; show raw ratio for first 14 days then transition to percentage"
    - topic: "total successful periods (Socrates FR-016)"
      decision: "dropped — redundant with longest streak and calendar; reintroduced slot used for the rolling-window percentage"
    - topic: "one-sentence business rule"
      decision: "habitpair applies a frequency-aware success rule to mark each tracking period as a success or a failure, computes consecutive-success runs and a rolling consistency window, and renders the resulting history in a day-of-week grid"
    - topic: "streak rule expression"
      decision: "three named sub-rules in ## Business Logic, one per frequency (daily / weekly / monthly), each with its own success criterion and unmarked-day treatment"
    - topic: "browser and device support"
      decision: "latest 2 versions of Chrome/Firefox/Safari/Edge on desktop + responsive mobile web (latest 2 of Chrome and Safari on phone-size viewports); no native iOS/Android in MVP"
    - topic: "accessibility commitment"
      decision: "keyboard navigability + semantic HTML landmarks; no WCAG 2.1 AA guarantee in MVP"
  frs_drafted: 16
  quality_check_status: accepted
---

# habitpair — Shape Notes

Source idea: `idea-notes.md` (committed to repo root).

## Vision & Problem Statement

Someone who wants to track both positive habits (gym, reading, meditation) and negative habits to avoid (no fast food, no smoking, no doomscrolling) is forced to choose between feature-bloated apps overloaded with motivational noise, paid apps that gate basic tracking behind subscriptions, single-modality apps that only model "good habits" and treat avoidance as a hack, or fallback tools (spreadsheets, notes apps) that surface no behavioral patterns. None of these answers the question the user actually has after a few weeks of tracking: *why do I fail when I fail?* The cost today is either a subscription fee, daily friction from a cluttered UI, or unanswered questions about one's own behavior.

The insight is that mainstream habit-tracking apps are not incentivized to ship a minimal-but-insightful version — monetization rewards feature bloat and subscription gates. The market gap is a free, deliberately simple tool that treats behavioral pattern detection (failures clustering by day of week, after poor sleep, during stressful stretches) as a first-class outcome, not a premium add-on. The product bets that a meaningful slice of users will prefer *restraint plus insight* over *feature bloat plus motivational noise*.

## User & Persona

**Primary persona — the self-aware habit tracker.** An adult who has previously tried at least one habit-tracking app and stopped using it because the app was too heavy, too pricey, too one-sided (positive habits only), or too noisy with motivational content. They care less about gamification or social validation and more about an honest answer to "what's actually going on with my behavior?" They reach for the product when they have one or two specific habits they want to change (start something, stop something) and they want a tool that will both record the data and surface patterns they can act on.

**Context of use:** daily — usually a single quick check-in to mark today's status, plus occasional sessions reviewing the calendar/streak/pattern view to understand longer trends.

**Secondary personas:** none in scope for MVP — explicitly single-persona to avoid the "everyone is the user" trap.

## Success Criteria

### Primary

- A new user can create their first habit and record today's status within approximately one minute of completing registration. Measured end-to-end as the elapsed time from the `account_created` event to the first `habit_status_marked` event for that user. The MVP has worked if a representative sample of new users hits this bar without coaching.

### Secondary

- A user marks habits across at least seven distinct calendar days within the first fourteen days of their account. Indicates the product creates a durable daily-use loop, not just one-off signup curiosity.

### Guardrails

- **Data integrity.** Every completed / missed / neutral mark a user records is durable. The product never silently loses, overwrites, or mis-attributes a day's status. A streak that breaks because of a system fault (not user behavior) is a P0 failure.
- **Per-user privacy.** A user's habits, marks, and statistics are visible only to that user. There is no shape of authenticated request in the MVP that returns another user's data. Cross-tenant leakage is a product-killing incident, regardless of size.
- **Free at MVP.** Nothing in the MVP product surface is gated behind payment, subscription, trial, or quota. The "free + simple + insightful" promise is load-bearing for the vision; any paywall — even cosmetic — invalidates the differentiation.
- **Perceived responsiveness on daily check-in.** Recording today's status on a habit feels instant to the user. Target: the user-visible state transitions within 300 ms of the tap/click on a typical session. The daily check-in is the most frequent interaction; if it feels slow, the whole product feels slow.

## User Stories

### US-01: New user creates first habit and marks today within ~1 minute of registration

- **Given** a person without a habitpair account opens the app
- **When** they register with email and password, create their first habit (picking a name, modality, and frequency), and mark today's status
- **Then** the elapsed wall-clock time from completing registration to the first recorded status mark is ≤ 60 seconds at the median, and the marked status is visible on the habit list

#### Acceptance Criteria
- Registration screen accepts email and password and creates the account in one submission
- After registration the user lands directly on a screen from which they can create a habit (no onboarding wizard, no settings flow)
- Habit creation accepts the three required fields (name, modality, frequency); target count is required only when frequency is weekly or monthly
- Immediately after the habit is created the user sees a control to mark today's status without an extra navigation step
- After marking, the user sees their new habit on the main list with today's status reflected

### US-02: User marks the daily check-in for an existing habit

- **Given** a signed-in user with at least one existing habit
- **When** they tap the habit's today-marker control on the habit list
- **Then** the habit's status for today changes to the selected value (completed / missed / neutral) and the new value persists across reloads

#### Acceptance Criteria
- The action is reachable directly from the habit list (no detail-page detour required)
- The marker exposes the two states (completed / missed) and an "unmarked" option, surfaced either as a cycle or as an explicit picker — to be locked at design time, not in PRD
- Visible state change happens within 300 ms (Guardrail)
- The mark survives sign-out + sign-in on the same or another device

### US-03: User opens the detail page to see streaks and the calendar pattern

- **Given** a signed-in user with at least 7 days of marks on a habit
- **When** they open that habit's detail page
- **Then** they see the monthly calendar, the current streak, the longest streak, the success percentage, and the total count of successful periods for that habit

#### Acceptance Criteria
- Calendar shows 7 columns (Mon → Sun, ISO 8601) × the number of weeks in the displayed month (5–6 rows)
- Each day cell visually distinguishes the four states: completed, missed, neutral, today
- Streak numbers are computed per the frequency-specific rules in `## Business Logic`
- Past days can be tapped and their status changed retroactively (FR-010)

## Functional Requirements

### Authentication

- FR-001: User can register a new account with an email address and a password. Priority: must-have
  > Socrates: No compelling counter-argument; email+password aligns with the existing `apps/auth-api` scaffolding and supports multi-device sync from day one. Defer-auth and OAuth-only alternatives considered and rejected.

- FR-002: User can sign in with their email address and password. Priority: must-have
  > Socrates: No product-level counter-argument; the FR stands. A stack-level note was raised (use short-lived access tokens + long-lived refresh tokens for session management) — that is an implementation concern, routed to `## Forward: tech-stack` for the downstream stack-selector step rather than encoded in this FR.

- FR-003: User can sign out of an authenticated session. Priority: must-have
  > Socrates: No compelling counter-argument; sign-out is a mechanically required affordance for any multi-device auth product.

### Habit lifecycle

- FR-004: User can create a habit by providing a name, a modality (positive or negative), and a tracking frequency (daily, weekly, or monthly). Priority: must-have
  > Socrates: No compelling counter-argument; the three configuration axes (name, modality, frequency) are the core MVP configurability. Cutting modality would contradict the dual-modality differentiator; cutting frequency would invalidate the seed's motivating examples (e.g., "gym 2x/week").

- FR-005: User can configure a target count per period for weekly and monthly habits (e.g. "2 times per week"); daily habits have an implicit target of one per day. Priority: must-have
  > Socrates: No compelling counter-argument; the configurable target IS the thing that makes weekly/monthly frequencies meaningful. Without it, weekly is just "happens this week" and the seed's "gym 2x/week" example is unsupported.

- FR-006: User can view a list of their habits, visually grouped into distinct sections by modality (positive habits and negative habits surfaced as separate groups), each row showing the habit's name and the current period's progress against its target. Priority: must-have
  > Socrates: Modality grouping was added in the Socrates round as a UX requirement — separating positive and negative habits into distinct sections reinforces the psychological framing of avoidance vs. action and makes the list easier to scan.

- FR-007: User can edit an existing habit's name, modality, frequency, and target count. Structural edits — changes to modality or frequency — reset the habit's current streak to zero as a named, user-visible consequence of the edit; the rationale is that comparing pre- and post-edit success against the same streak would silently rewrite the metric's meaning. Priority: must-have
  > Socrates: Streak-reset-on-structural-edit was added in the Socrates round. Pure renames do not affect metrics; modality and frequency changes do.

- FR-008: User can permanently delete a habit; all associated marks are removed in the same operation. The destructive action exposes a brief (~5 second) undo affordance so an accidental delete can be recovered without recourse to backups. Priority: must-have
  > Socrates: Undo-toast affordance added in the Socrates round. Stronger gates (type-the-habit-name confirmation, 30-day soft-delete window) were considered and rejected as over-engineered for the MVP.

### Daily check-in

- FR-009: User can mark a day's status for a habit as either completed or missed; the MVP supports a binary state model only, with no neutral / not-applicable third state. Priority: must-have
  > Socrates: Neutral state dropped in the Socrates round. Implication: an unmarked past day has a defined treatment in streak math (recorded in `## Business Logic`) — for daily habits, an unmarked past day breaks the streak until backfilled; for weekly/monthly habits, an unmarked day does not subtract from the period target until the period closes.

- FR-010: User can mark any past day's status retroactively, with no time-window restriction. Priority: must-have
  > Socrates: No compelling counter-argument; unrestricted backfill is consistent with the "users forget" reality and is the natural complement to dropping the neutral state. Past-window restrictions and one-way (only-mark-completed) variants were considered and rejected.

### Habit detail & insight

- FR-011: User can open a habit detail page from the habit list. Priority: must-have
  > Socrates: No compelling counter-argument; the detail content (calendar + streak + ratio + rolling %) is too rich to inline cleanly in the list view. A modal/sheet was considered as an alternative but full-page is the more standard pattern.

- FR-012: Habit detail page shows a monthly calendar view with one column per day-of-week (Monday first, ISO 8601) and one row per week, with each cell rendering the day's status (completed, missed, today-marker). Priority: must-have
  > Socrates: No compelling counter-argument; the day-of-week × week-of-month grid IS the pattern-detection differentiator described in the Vision. Year-heatmap and linear-list alternatives were considered and rejected for v1.

- FR-013: Habit detail page shows the current streak length for the habit, computed per the frequency-specific rules in `## Business Logic`. Priority: must-have
  > Socrates: Current streak is the dominant mental model in habit tracking and stands as written. The "drop streaks entirely" counter was considered and rejected; the loss-aversion concern is mitigated by backfill (FR-010) and by pairing the streak with a rolling-window percentage (FR-014).

- FR-014: Habit detail page shows a rolling-window consistency percentage (e.g., trailing 30 calendar days for daily habits, trailing 8 weeks for weekly habits) alongside the current streak, providing a forgiving signal that does not collapse on a single missed period. Priority: must-have
  > Socrates: Rolling percentage was added in the Socrates round as a complementary signal to the streak. Pairs naturally with FR-013; addresses the loss-aversion failure mode without dropping streaks.

- FR-015: User can see the longest streak ever achieved for the habit. This metric is surfaced in a secondary view (e.g., an expandable analytics/history section or sub-page), NOT on the main habit detail surface, to avoid putting all-time peak performance in constant comparison with current performance. Priority: must-have
  > Socrates: Placement requirement (secondary view, not prominent) added in the Socrates round to mitigate unhealthy comparison with past performance. The capability remains in MVP; only the visual prominence changes.

- FR-016: Habit detail page shows a recent-completion metric: a raw completion ratio (e.g., "X of Y periods completed") during the habit's first fourteen days of tracking, transitioning to a percentage representation afterward, once the denominator is large enough for the percentage to feel emotionally fair. Priority: must-have
  > Socrates: Adaptive ratio→percentage was added in the Socrates round. The small-N percentage trap (1 missed day of 3 reads as "67%") motivated the switch to an early-phase raw ratio.

## Non-Functional Requirements

- **Perceived responsiveness on daily check-in.** Marking a habit's status for the current period produces a visible state change within 300 ms of the user's interaction on a typical session. This is also a `### Guardrail` in `## Success Criteria`; restated here so the boundary is testable from outside the implementation.
- **Per-user data isolation.** There is no shape of authenticated request that returns another user's habits, marks, or computed statistics. Cross-user data leakage is a binary property: zero observed cross-user reads in the MVP scope.
- **Data durability.** Once the product confirms a status mark to the user (the UI reflects the new state), that mark survives sign-out, sign-in on another device, server restart, and ordinary failure modes. No acknowledged mark is ever silently lost.
- **Timezone and DST robustness of period rules.** A user travelling across timezones, or experiencing a daylight-saving-time transition, does not observe an unexpected "missed" day, a duplicated successful day, or a corrupted streak. Day, week, and month boundaries are evaluated consistently for a given user, with the rule documented in `## Business Logic`.
- **Longest-streak prominence boundary.** An external observer inspecting the main habit detail surface (FR-011) does not see the longest-streak metric. The metric is accessible only via an explicit user action that opens a secondary view; this is verifiable without inspecting the implementation.
- **Browser and device support.** The web product remains usable on the latest two major versions of Chrome, Firefox, Safari, and Edge on desktop, and on a responsive mobile-web layout on the latest two major versions of Chrome and Safari on phone-sized viewports. Native iOS or Android apps are out of MVP scope.
- **Accessibility baseline.** The product is operable with the keyboard alone (all interactive controls reachable and activatable via Tab / Enter / Space). Page structure uses semantic HTML landmarks; non-text controls expose accessible names. The MVP does not promise full WCAG 2.1 AA conformance, but the baseline above is binding.

## Business Logic

**habitpair applies a frequency-aware success rule to mark each tracking period as a success or a failure, computes consecutive-success runs and a rolling consistency window, and renders the resulting history in a day-of-week grid so users can see both their numeric progress and their behavioral patterns at a glance.**

The rule consumes three kinds of user-facing input: the habit's configuration (name, modality, frequency, and — for non-daily frequencies — a target count per period), the user's per-day status marks (completed or missed; an unmarked day carries a defined treatment described below), and the passage of calendar time (a day boundary at local midnight; a week boundary at Monday 00:00 local; a month boundary at the first of the month). It produces, per habit: a per-period success/failure decision, a current streak (the count of consecutive successful periods ending in the current period), a longest streak (the maximum of all historical streaks), a rolling consistency percentage over a recent window (trailing 30 days for daily habits, trailing 8 weeks for weekly habits, trailing 6 months for monthly habits), and an adaptive early-phase ratio that transitions to a percentage after fourteen days of tracking.

The user encounters the rule in two places. On the habit list (FR-006), each habit displays the **current period's** progress against its target — "completed" or "missed" for daily, "1 of 2 done this week" for weekly, "3 of 8 done this month" for monthly. On the habit detail page (FR-011 onward), the rule's outputs are surfaced as a monthly calendar grid, the current streak, the rolling consistency percentage, and the adaptive early-phase ratio. The "longest streak" output is surfaced in a secondary view to keep all-time peak performance out of the user's primary attention (FR-015). The product makes no recommendation, no nudge, no "you should do X" inference — the rule classifies and counts; the user interprets.

### Success rule for daily habits

- **Tracking period:** one calendar day, midnight to midnight in the user's local timezone.
- **Success:** the day is explicitly marked "completed". Modality determines what "completed" means at the user level: for a positive habit (e.g., gym), "completed" means the action was performed; for a negative habit (e.g., no doomscrolling), "completed" means the avoidance succeeded. The rule treats both identically.
- **Failure:** the day is explicitly marked "missed", OR the day has fully passed (its local midnight has elapsed and it remains unmarked beyond the user's current session). For daily habits, an unmarked past day breaks the streak until the user backfills it.
- **Streak:** the longest unbroken run of consecutive successful days ending in today (or yesterday, if today is unmarked and not yet past). A missed day or an unmarked-and-past day breaks the streak.

### Success rule for weekly habits

- **Tracking period:** one calendar week, Monday 00:00 to Sunday 23:59 local time (ISO 8601 week).
- **Target:** the configured per-week count (e.g., "2 per week"). The week succeeds when the count of "completed" daily marks within the week reaches or exceeds the target.
- **In-progress weeks:** unmarked days in the current (not-yet-closed) week do **not** count as failures — they are potential success days that have not been filled yet. The week is only failed when it closes (Sunday's local midnight passes) with the target unmet.
- **Streak:** consecutive successful weeks. A failed week or a closed-unmet week breaks the streak.

### Success rule for monthly habits

- **Tracking period:** one calendar month, from the first day at 00:00 to the last day at 23:59 local time.
- **Target:** the configured per-month count (e.g., "8 per month").
- **In-progress months:** same treatment as weekly — unmarked days inside the current month are not failures until the month closes.
- **Streak:** consecutive successful months. A failed month breaks the streak.

### Edge cases captured here for downstream design

- **Habit created mid-period.** A weekly or monthly habit created in the middle of a week or month: the in-progress period uses the configured target unchanged (no proration); the user may not be able to hit the target this period and that is acceptable — the habit's "first real period" is the next one.
- **Structural edit.** Changing a habit's modality or frequency resets the current streak to zero (FR-007). The longest streak (historical) is **not** modified by edits — it reflects what the user actually achieved at the time, under the historical configuration.
- **Backfill into closed periods.** A user backfilling a "completed" mark into a previously-closed weekly/monthly period that retroactively reaches its target: the period transitions to "succeeded", and streaks are recomputed across the affected range. Backfilling a "missed" into a previously-successful period has the symmetric effect.
- **Today is special-cased in rendering only.** "Today" is a visual marker on the calendar (FR-012), not a logical state. The status of today follows the same rules as any other day; the marker just identifies which cell is the current one.

## Access Control

Single-role multi-user product. Every user owns their own habits and sees only their own data; no sharing, no admin UI, no family or couple modes in the MVP.

**Authentication.** Email + password. Self-serve signup: the user enters an email and password, the account is created, and the app is immediately usable — no email-verification gate in the MVP. Session management is server-backed (the existing `apps/auth-api` is the intended owner).

**Roles.** Exactly one role: `user`. Every authenticated user has the same capabilities. No admin role surfaces in the product UI; any operational data access happens at the database layer outside the product.

**Gated routes.** All habit-tracking functionality requires authentication. An unauthenticated request to a gated route returns the user to the sign-in screen.

**Out of MVP (recorded explicitly so they show up in Non-Goals later):** Google / Apple sign-in, magic-link / passwordless flows, email verification gate, shared habits, accountability-partner features, multi-role separation.

**Open question to revisit at cross-check:** is a password-reset flow in MVP scope? Not in the seed; if missing it would mean a user who forgets their password loses their habit history. Flag for `## Open Questions`.

## Non-Goals

### Functional non-goals (capabilities the MVP explicitly will not provide)

- **No AI or ML.** No pattern-detection algorithms, no habit analyzer, no behavioral inference, no AI chat or coaching. Differentiation in v1 comes from the calendar layout surfacing patterns visually; folding AI in v1 contradicts the "restraint plus insight" insight and explodes scope. AI-driven analysis is the natural v2 axis.
- **No notifications, reminders, or motivational messages.** No push notifications, no email nudges, no in-app motivational quotes. Aligns with the "no motivational noise" half of the vision; users return to the product because they want to, not because the product nags them.
- **No social features.** No habit sharing, no friends, no leaderboards, no accountability partners, no comments, no public profiles. Strictly single-user in v1. Social is a major scope expansion best handled in v2.
- **No manual import of historical data.** Excel files, exports from other habit-tracking apps, and any other backfill-via-upload flow are out of v1. Day-1 users start from zero. Cut in Phase 3 as the largest scope cost on the MVP path.
- **No third-party sign-in.** Google, Apple, GitHub, etc. — none in v1. Email + password only. The reasoning is in `## Access Control`.
- **No shared habits or accountability-partner features.** Strict single-tenant ownership of each habit's data.

### Non-functional non-goals (quality dimensions the MVP explicitly will not aim for)

- **No native mobile apps.** iOS and Android native clients are out of v1. Mobile use is supported via responsive web. Native clients are a major surface expansion.
- **No offline-first / on-device-only storage.** habitpair is a backend-backed product for multi-device sync; offline-first would be a meaningfully different product architecture and is not the chosen shape.
- **No full WCAG 2.1 AA accessibility certification.** v1 commits to keyboard navigability and semantic HTML landmarks (see `## Non-Functional Requirements`), but does not guarantee full AA conformance. Conformance audit / remediation is a deliberate v2+ workstream.
- **No internationalization.** The MVP UI ships in English only. Future i18n is a deliberate decision, not a default.

## Open Questions

1. **Is a password-reset flow in MVP scope?** Not in the seed; surfaced in Phase 2 Access Control. Without it, a user who forgets their password loses access to their habit history permanently. Owner: user. Resolution date: TBD; recommended to resolve before `/10x-prd` runs so it lands in PRD content cleanly.
2. **What is the UI shape of the "secondary view" for longest streak (FR-015)?** Options: expandable section on the detail page, separate sub-page, opt-in modal, dedicated history tab. Routed to design rather than PRD; the FR is satisfied by any shape that is not prominent on the main detail surface. Owner: design.
3. **Email verification policy after MVP.** The MVP defers verification (signup → immediate access). Once user count grows past trusted-network size, spam-account risk rises. Owner: user; flag for re-evaluation when scale crosses the "dozens of strangers" mark.

## Quality cross-check

Run on 2026-05-24. All six soft-gate elements present:

- **Access Control** — present. Single-role email+password auth with self-serve signup and immediate access.
- **Business Logic** — present. One-sentence rule heads the section; three named per-frequency sub-rules follow. Not empty CRUD.
- **Project artifacts** — present. shape-notes.md frontmatter carries the full checkpoint plus context_type, product_type, target_scale, and timeline_budget.
- **Timeline-cost acknowledgment** — present implicitly. mvp_weeks=3 sits within the soft-gate window; no explicit acknowledgment block needed.
- **Non-Goals** — present. Six functional non-goals (no AI, no notifications, no social, no import, no third-party sign-in, no shared habits) and four non-functional non-goals (no native mobile, no offline-first, no full WCAG AA, no i18n).
- **Preserved behavior** — N/A (greenfield session; the brownfield check does not apply).

Open Questions surfaced by the cross-check:

1. Password-reset flow MVP scope is still TBD (already in `## Open Questions`).
2. UI shape of the secondary view for longest streak is design-owned (already in `## Open Questions`).
3. Email verification policy as scale grows is operationally-owned (already in `## Open Questions`).

`quality_check_status: accepted` — no warnings.

## Forward: tech-stack

(Informational only — not part of the PRD schema. Captured here so the downstream tech-stack step can pick it up.)

Existing scaffolding in this repo, already committed before shaping started:

- **Backend split** — two NestJS services: `apps/auth-api` (authentication) and `apps/habits-api` (domain). Both use Prisma. The split is pre-decided; the PRD will not justify or relitigate it.
- **Web client** — `apps/web` is a Vite + TypeScript SPA scaffold.
- **Infrastructure** — Skaffold + Kubernetes deployment, GitHub Actions CI/CD with Trivy security scans, Dockerfiles per service.
- **Workspace** — npm workspaces, root `package.json` declares `apps/*` and `packages/*`.

These are inputs for downstream stack-selector / bootstrapper steps, not commitments inside the PRD. If shaping surfaces a product requirement that contradicts the scaffolding (e.g., "must run offline-first on-device"), that contradiction is flagged for the tech-stack step to resolve.

### Token strategy (surfaced during FR-002 Socrates round)

User volunteered an implementation preference: sign-in should use **short-lived access tokens with long-lived refresh tokens** to keep users effectively signed in across sessions while preserving a standard session-security model. This is a stack-level commitment, not a product-level FR, so it lives here for the downstream stack-selector step rather than in `## Functional Requirements` or `## Non-Functional Requirements`. The PRD only requires that sign-in and sign-out work; the exact session-management mechanism (access + refresh tokens, opaque session cookies, single long-lived JWT, etc.) is downstream.
