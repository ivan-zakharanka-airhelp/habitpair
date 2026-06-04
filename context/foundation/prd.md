---
project: habitpair
version: 1
status: draft
created: 2026-05-24
context_type: greenfield
product_type: web-app
target_scale:
  users: medium
  qps: low
  data_volume: small
timeline_budget:
  mvp_weeks: 3
  hard_deadline: null
  after_hours_only: true
---

# habitpair — Product Requirements Document

## Vision & Problem Statement

Someone who wants to track both positive habits (gym, reading, meditation) and negative habits to avoid (no fast food, no smoking, no doomscrolling) is forced to choose between feature-bloated apps overloaded with motivational noise, paid apps that gate basic tracking behind subscriptions, single-modality apps that only model "good habits" and treat avoidance as a hack, or fallback tools (spreadsheets, notes apps) that surface no behavioral patterns. None of these answers the question the user actually has after a few weeks of tracking: *why do I fail when I fail?* The cost today is either a subscription fee, daily friction from a cluttered UI, or unanswered questions about one's own behavior.

The insight is that mainstream habit-tracking apps are not incentivized to ship a minimal-but-insightful version — monetization rewards feature bloat and subscription gates. The market gap is a free, deliberately simple tool that treats behavioral pattern detection (failures clustering by day of week, after poor sleep, during stressful stretches) as a first-class outcome, not a premium add-on. The product bets that a meaningful slice of users will prefer *restraint plus insight* over *feature bloat plus motivational noise*.

## User & Persona

**Primary persona — the self-aware habit tracker.** An adult who has previously tried at least one habit-tracking app and stopped using it because the app was too heavy, too pricey, too one-sided (positive habits only), or too noisy with motivational content. They care less about gamification or social validation and more about an honest answer to "what's actually going on with my behavior?" They reach for the product when they have one or two specific habits they want to change (start something, stop something) and they want a tool that will both record the data and surface patterns they can act on.

**Context of use:** daily — usually a single quick check-in to mark today's status, plus occasional sessions reviewing the calendar, streak, and rolling-consistency view to understand longer trends.

**Secondary personas:** none in scope for MVP — explicitly single-persona to avoid the "everyone is the user" trap.

## Success Criteria

### Primary

- A new user can create their first habit and record today's status within approximately one minute of completing registration. Measured end-to-end as the elapsed time from the `account_created` event to the first `habit_status_marked` event for that user. The MVP has worked if a representative sample of new users hits this bar without coaching.

### Secondary

- A user marks habits across at least seven distinct calendar days within the first fourteen days of their account. Indicates the product creates a durable daily-use loop, not just one-off signup curiosity.

### Guardrails

- **Data integrity.** Every completed / missed mark a user records is durable. The product never silently loses, overwrites, or mis-attributes a day's status. A streak that breaks because of a system fault (not user behavior) is a P0 failure.
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
- **When** they activate the habit's today-marker control on the habit list
- **Then** the habit's status for today changes to the selected value (completed or missed) and the new value persists across reloads

#### Acceptance Criteria

- The action is reachable directly from the habit list (no detail-page detour required)
- The control exposes the two states (completed / missed) and an "unmarked" option; the precise interaction shape (cycle vs. picker) is a design-time decision and is not pinned in this PRD
- Visible state change happens within 300 ms (Guardrail)
- The mark survives sign-out + sign-in on the same or another device

### US-03: User opens the detail page to see streaks and the calendar pattern

- **Given** a signed-in user with at least seven days of marks on a habit
- **When** they open that habit's detail page
- **Then** they see the monthly calendar, the current streak, the rolling-window consistency percentage, and the recent-completion metric (raw ratio early, percentage afterwards) for that habit

#### Acceptance Criteria

- Calendar shows seven columns (Monday through Sunday, ISO 8601) by the number of weeks in the displayed month (five or six rows)
- Each day cell visually distinguishes its status: completed, missed, and today (the unmarked state is the visual default for any other cell)
- Streak numbers are computed per the frequency-specific rules in `## Business Logic`
- Past days can be selected and their status changed retroactively (FR-010)

## Functional Requirements

### Authentication

- FR-001: User can register a new account with an email address and a password. Priority: must-have
  > Socrates: No compelling counter-argument; email+password supports multi-device sync from day one. Defer-auth (anonymous-only launch) and OAuth-only alternatives considered and rejected.

- FR-002: User can sign in with their email address and password. Priority: must-have
  > Socrates: No product-level counter-argument; the FR stands. A stack-level session-management concern was raised during shaping and routed to downstream stack selection rather than encoded in this FR.

- FR-003: User can sign out of an authenticated session. Priority: must-have
  > Socrates: No compelling counter-argument; sign-out is a mechanically required affordance for any multi-device authenticated product.

### Habit lifecycle

- FR-004: User can create a habit by providing a name, a modality (positive or negative), and a tracking frequency (daily, weekly, or monthly). Priority: must-have
  > Socrates: No compelling counter-argument; the three configuration axes (name, modality, frequency) are the core MVP configurability. Cutting modality would contradict the dual-modality differentiator; cutting frequency would invalidate the seed's motivating examples (e.g., "gym 2x/week").

- FR-005: User can configure a target count per period for weekly and monthly habits (e.g. "2 times per week"); daily habits have an implicit target of one per day. Priority: must-have
  > Socrates: No compelling counter-argument; the configurable target IS the thing that makes weekly/monthly frequencies meaningful. Without it, weekly is just "happens this week" and the seed's "gym 2x/week" example is unsupported.

- FR-006: User can view a list of their habits, visually grouped by modality (positive habits and negative habits surfaced as separate groups), each row showing the habit's name and the current period's progress against its target. Priority: must-have
  > Socrates: Modality grouping was added in the Socrates round as a UX requirement — separating positive and negative habits reinforces the psychological framing of avoidance vs. action and makes the list easier to scan.

- FR-007: User can edit an existing habit's name, modality, and target count. A habit's frequency is fixed at creation and cannot be edited, so the habit keeps a single, stable period structure for its lifetime; because no edit can change that structure, an edit never resets the current streak. Priority: must-have
  > Socrates: The streak-reset-on-structural-edit consequence was retired in the metrics slice (S-03) by making frequency immutable. Frequency was the only editable field whose change reframed what a "period" — and therefore a streak — meant; locking it removes the need for a reset seam, rule-versioning, or a migration. Name, modality, and target-count edits remain in scope (S-04).

- FR-008: User can permanently delete a habit; all associated marks are removed in the same operation. The destructive action exposes a brief (~5 second) opportunity to reverse the deletion so an accidental delete can be recovered without recourse to backups. Priority: must-have
  > Socrates: Brief reversal window was added in the Socrates round. Stronger gates (type-the-habit-name confirmation, 30-day recoverable-deletion window) were considered and rejected as over-engineered for the MVP.

### Daily check-in

- FR-009: User can mark a day's status for a habit as either completed or missed; the MVP supports a binary state model only, with no neutral / not-applicable third state. Priority: must-have
  > Socrates: Neutral state dropped in the Socrates round. Implication: an unmarked past day has a defined treatment in streak math (recorded in `## Business Logic`) — for daily habits, an unmarked past day breaks the streak until the user retroactively marks it; for weekly and monthly habits, an unmarked day does not subtract from the period target until the period closes.

- FR-010: User can mark any past day's status retroactively, with no time-window restriction. Priority: must-have
  > Socrates: No compelling counter-argument; unrestricted retroactive marking is consistent with the "users forget" reality and is the natural complement to dropping the neutral state. Past-window restrictions and one-way (only-mark-completed) variants were considered and rejected.

### Habit detail and insight

- FR-011: User can open a habit detail page from the habit list. Priority: must-have
  > Socrates: No compelling counter-argument; the detail content (calendar plus streak plus ratio plus rolling percentage) is too rich to inline cleanly in the list. Inline-expansion and modal alternatives were considered and rejected for v1.

- FR-012: Habit detail page shows a monthly calendar view with one column per day-of-week (Monday first, ISO 8601) and one row per week, with each cell rendering the day's status (completed, missed, or today-marker for the current day). Priority: must-have
  > Socrates: No compelling counter-argument; the day-of-week by week-of-month grid IS the pattern-detection differentiator described in the Vision. Year-heatmap and linear-list alternatives were considered and rejected for v1.

- FR-013: Habit detail page shows the current streak length for the habit, computed per the frequency-specific rules in `## Business Logic`. Priority: must-have
  > Socrates: Current streak is the dominant mental model in habit tracking and stands as written. The "drop streaks entirely" counter was considered and rejected; the loss-aversion concern is mitigated by retroactive marking (FR-010) and by pairing the streak with a rolling-window percentage (FR-014).

- FR-014: Habit detail page shows a rolling-window consistency percentage (trailing 30 calendar days for daily habits, trailing 8 weeks for weekly habits, trailing 6 months for monthly habits) alongside the current streak, providing a forgiving signal that does not collapse on a single missed period. Priority: must-have
  > Socrates: Rolling percentage was added in the Socrates round as a complementary signal to the streak. Pairs naturally with FR-013; addresses the loss-aversion failure mode without dropping streaks.

- FR-015: User can see the habit's top 10 longest streaks, each shown with its start date, end date, and length in days, ordered by length (longest first; length-ties broken toward the more recent streak). The user's active streak is always represented in this view — highlighted in place when it ranks in the top 10, or pinned distinctly below the leaderboard (with a "how much more to crack the top 10" nudge) when it is too short to rank — so immediate progress stays visible without distorting the all-time leaderboard. These are surfaced in a secondary view (the precise shape is a design decision; the FR is satisfied by any placement that is not prominent on the main detail surface), to avoid putting all-time peak performance in constant comparison with current performance. Priority: must-have
  > Socrates: Placement requirement (secondary view, not prominent) added in the Socrates round to mitigate unhealthy comparison with past performance. The capability remains in MVP; only the visual prominence changes. See Open Question 2 for the secondary-view shape decision.

- FR-016: Habit detail page shows a recent-completion metric: a raw completion ratio (e.g., "X of Y periods completed") during the habit's first fourteen days of tracking, transitioning to a percentage representation afterward, once the denominator is large enough for the percentage to feel emotionally fair. Priority: must-have
  > Socrates: Adaptive ratio-to-percentage was added in the Socrates round. The small-N percentage trap (one missed day of three reads as "67%") motivated the switch to an early-phase raw ratio.

## Non-Functional Requirements

- **Perceived responsiveness on daily check-in.** Marking a habit's status for the current period produces a user-visible state change within 300 ms of the user's interaction on a typical session. This is also a Guardrail in `## Success Criteria`; restated here so the boundary is testable from outside the implementation.
- **Per-user data isolation.** There is no shape of authenticated request that returns another user's habits, marks, or computed statistics. Cross-user data leakage is a binary property: zero observed cross-user reads in the MVP scope.
- **Data durability.** Once the product confirms a status mark to the user (the UI reflects the new state), that mark survives sign-out, sign-in on another device, server restart, and ordinary failure modes. No acknowledged mark is ever silently lost.
- **Timezone and DST robustness of period rules.** A user travelling across timezones, or experiencing a daylight-saving-time transition, does not observe an unexpected "missed" day, a duplicated successful day, or a corrupted streak. Day, week, and month boundaries are evaluated consistently for a given user, with the rule documented in `## Business Logic`.
- **Best-streaks prominence boundary.** An external observer inspecting the main habit detail surface (FR-011) does not see the top-10 best-streaks metric. It is accessible only via an explicit user action that opens a secondary view; this is verifiable without inspecting the implementation.
- **Browser and device support.** The product remains usable on the latest two major versions of the four mainstream desktop browsers, and on a responsive mobile-web layout on the latest two major versions of the leading mobile browsers. Native mobile applications are out of MVP scope.
- **Accessibility baseline.** The product is operable with the keyboard alone (all interactive controls reachable and activatable via Tab, Enter, and Space). Page structure exposes semantic landmark roles; non-text controls expose accessible names. The MVP does not promise full WCAG 2.1 AA conformance, but the baseline above is binding.

## Business Logic

**habitpair applies a frequency-aware success rule to mark each tracking period as a success or a failure, computes consecutive-success runs and a rolling consistency window, and renders the resulting history in a day-of-week grid so users can see both their numeric progress and their behavioral patterns at a glance.**

The rule consumes three kinds of user-facing input: the habit's configuration (name, modality, frequency, and — for non-daily frequencies — a target count per period), the user's per-day status marks (completed or missed; an unmarked day carries a defined treatment described below), and the passage of calendar time (a day boundary at local midnight; a week boundary at Monday 00:00 local time; a month boundary at the first day of the month). It produces, per habit: a per-period success/failure decision, a current streak (the count of consecutive successful periods ending in the current period), the top 10 longest streaks (each with its start date, end date, and length, drawn from all historical streak runs), a rolling consistency percentage over a recent window (trailing 30 days for daily habits, trailing 8 weeks for weekly habits, trailing 6 months for monthly habits), and an adaptive early-phase ratio that transitions to a percentage after fourteen days of tracking.

The user encounters the rule in two places. On the habit list (FR-006), each habit displays the **current period's** progress against its target — "completed" or "missed" for daily, "1 of 2 done this week" for weekly, "3 of 8 done this month" for monthly. On the habit detail page (FR-011 onward), the rule's outputs are surfaced as a monthly calendar grid, the current streak, the rolling consistency percentage, and the adaptive early-phase ratio. The top-10 best-streaks output is surfaced only in a secondary view to keep all-time peak performance out of the user's primary attention (FR-015). The product makes no recommendation, no nudge, no "you should do X" inference — the rule classifies and counts; the user interprets.

### Success rule for daily habits

- **Tracking period:** one calendar day, midnight to midnight in the user's local timezone.
- **Success:** the day is explicitly marked "completed". Modality determines what "completed" means at the user level: for a positive habit (e.g., gym), "completed" means the action was performed; for a negative habit (e.g., no doomscrolling), "completed" means the avoidance succeeded. The rule treats both identically.
- **Failure:** the day is explicitly marked "missed", OR the day has fully passed (its local midnight has elapsed and it remains unmarked beyond the user's current session). For daily habits, an unmarked past day breaks the streak until the user retroactively marks it (FR-010).
- **Streak:** the longest unbroken run of consecutive successful days ending in today (or in yesterday, if today is unmarked and not yet past). A missed day or an unmarked-and-past day breaks the streak.

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
- **Structural edit.** A habit's frequency is fixed at creation, so its period structure never changes and no edit resets the current streak (FR-007). The editable fields (name, modality, target count) do not alter the period boundaries the streak is built on. Historical streaks (and therefore the top-10 best-streaks view) are **not** rewritten by edits — they reflect what the user actually achieved at the time, under the same period structure the habit has always had.
- **Retroactive marks into closed periods.** A user retroactively marking a "completed" status into a previously-closed weekly or monthly period that thereby reaches its target: the period transitions to "succeeded", and streaks are recomputed across the affected range. Retroactively marking a "missed" status into a previously-successful period has the symmetric effect.
- **Today is special-cased in rendering only.** "Today" is a visual marker on the calendar (FR-012), not a logical state. The status of today follows the same rules as any other day; the marker just identifies which cell is the current one.

## Access Control

Single-role multi-user product. Every user owns their own habits and sees only their own data; no sharing, no admin user interface, no family or couple modes in the MVP.

**Authentication.** Email plus password. Self-serve signup: the user enters an email and password, the account is created, and the app is immediately usable — no email-verification gate in the MVP.

**Roles.** Exactly one role: `user`. Every authenticated user has the same capabilities. No admin role surfaces in the product UI; any operational data access happens outside the product's user-facing surface.

**Gated routes.** All habit-tracking functionality requires authentication. An unauthenticated request to a gated route returns the user to the sign-in screen.

**Out of MVP** (also reflected in `## Non-Goals`): third-party sign-in (Google, Apple, and similar), magic-link or passwordless flows, email-verification gate, shared habits, accountability-partner features, multi-role separation.

The password-reset flow is **not** committed in this PRD — see Open Question 1.

## Non-Goals

### Functional non-goals (capabilities the MVP explicitly will not provide)

- **No AI or machine learning.** No pattern-detection algorithms, no habit analyzer, no behavioral inference, no AI chat or coaching. Differentiation in v1 comes from the calendar layout surfacing patterns visually; folding AI in v1 contradicts the "restraint plus insight" insight and explodes scope. AI-driven analysis is the natural v2 axis.
- **No notifications, reminders, or motivational messages.** No push notifications, no email nudges, no in-app motivational quotes. Aligns with the "no motivational noise" half of the vision; users return to the product because they want to, not because the product nags them.
- **No social features.** No habit sharing, no friends, no leaderboards, no accountability partners, no comments, no public profiles. Strictly single-user in v1. Social is a major scope expansion best handled in v2.
- **No manual import of historical data.** Spreadsheet uploads, exports from other habit-tracking apps, and any other historical-data-via-upload flow are out of v1. Day-1 users start from zero. Cut during MVP-scope shaping as the largest scope cost on the MVP path.
- **No third-party sign-in.** Sign-in via external identity providers is out of v1. Email plus password only.
- **No shared habits or accountability-partner features.** Strict single-tenant ownership of each habit's data.

### Non-functional non-goals (quality dimensions the MVP explicitly will not aim for)

- **No native mobile applications.** Native mobile clients (iOS, Android) are out of v1. Mobile use is supported via responsive web. Native clients are a major surface expansion.
- **No offline-first or on-device-only storage.** habitpair is a backend-backed product for multi-device sync; offline-first would be a meaningfully different product architecture and is not the chosen shape.
- **No full WCAG 2.1 AA accessibility certification.** v1 commits to keyboard navigability and semantic landmark roles (see `## Non-Functional Requirements`), but does not guarantee full AA conformance. A conformance audit and remediation pass is a deliberate v2+ workstream.
- **No internationalization.** The MVP user interface ships in English only. Future i18n is a deliberate decision, not a default.

## Open Questions

1. **Is a password-reset flow in MVP scope?** Surfaced during access-control shaping. Without it, a user who forgets their password loses access to their habit history permanently — a load-bearing UX gap once the user base extends beyond people who reliably remember a single password. Owner: user. Block: medium — the MVP can ship without it, but the gap should be resolved before user count crosses single digits. Resolution by: TBD.
2. **What is the precise shape of the "secondary view" for the top-10 best streaks (FR-015)?** ~~Options surveyed include: a proportional bar chart (as in the reference screenshot), an expandable analytics or history section on the detail page, a separate sub-page, an opt-in modal, or a dedicated history tab.~~ **Resolved (S-03):** a collapsed-by-default "Best streaks" disclosure below the calendar, expanding to a proportional centered-bar chart (bar width ∝ length), ordered longest-first, with the active streak highlighted in place or pinned below when it doesn't rank. Owner: design. Block: no.
3. **Email verification policy after MVP.** The MVP defers email verification (signup leads to immediate access). Once the user count grows past trusted-network size, spam-account risk rises and verification becomes valuable. Owner: user, with input from operations. Block: no for MVP; flag for re-evaluation when user count crosses the "dozens of strangers" threshold.
