# Frame Brief: S-01 data-model foundation — what actually carries fragility risk

> Framing step before /10x-plan. This document captures what is *actually*
> at issue, separated from what was initially assumed.

## Reported Observation

Implementing S-01 (create a habit + mark today), but unsure how to model it in
DB/API so the later slices stay "effective" — e.g. a user with ~900 days of
history needing statistics and a calendar view. Stated fear: a fragile S-01
foundation will make S-02 (calendar) and S-03 (metrics) "go wrong."

## Initial Framing (preserved)

- **User's stated cause or approach**: the fragility axis is *efficiency/
  performance at scale* — the data model must perform well over long histories,
  and getting it wrong now cascades into the calendar + statistics slices.
- **User's proposed direction**: build S-01's DB + API on a foundation robust/
  efficient enough to carry the later slices, not a throwaway minimal model.
- **Pre-dispatch narrowing (Step 1.5)**: fragility axis → *"not sure / all of
  these"* (axes not separated); S-01 scope → *"only what S-01's screens use"*
  (minimal + seams); expected history size → *"large (many years / many
  habits)"* — which contradicts the PRD's `data_volume: small` (prd.md:8–11).

## Dimension Map

Where a "fragile foundation" could actually originate:

1. **Mark grain & shape** — one durable row per (habit, day) vs a rewritable
   blob / period-grain record. At stake: durability guardrail + per-day calendar.
2. **Date/time semantics** — a mark keyed by a *local calendar date* vs a *UTC
   instant*; where "today" is decided. At stake: the TZ/DST NFR. ← the real trap
3. **Stats compute location** — compute streak/rolling-% on read vs materialize.
   At stake: the "effective at 900 days" worry + S-02's recompute seam.
4. **Period/frequency model** — store per-period success vs derive it from daily
   marks. At stake: retroactive marks + structural-edit streak reset. ← user's
   framing lands here ("how to implement in DB")
5. **Query/index strategy** — indexes for (habit, date-range) / (habit, all).
   (derivative of #1)

## Hypothesis Investigation

| Hypothesis | Evidence | Verdict |
| --- | --- | --- |
| **1. Per-day discrete durable Mark rows** is the foundational shape | Weekly/monthly success = "count of *completed daily marks*" (prd.md `## Business Logic`); durability guardrail "never silently lost, overwritten, or mis-attributed" (prd.md:46,155); blob/period-grain shapes are fatal shortcuts (agent B). No Mark entity exists yet — only mock `Habit` (schema.prisma:14–21). | **STRONG** (load-bearing) |
| **2. Local-calendar-date keying** (not UTC instant) | TZ/DST robustness NFR (prd.md:156); day=local-midnight, week=Mon 00:00, month=1st-local (`## Business Logic`); repo is greenfield for dates — no date lib, no "today"/boundary helper anywhere (agent A); only precedent is auth token expiry as a **UTC instant** (token.service.ts:28) — correct for an instant, wrong shape to copy for a calendar day. | **STRONG** (the real trap) |
| **3. Performance / materialized stats** is the fragility axis | Even the user's "large" case (20 habits × 5 yr ≈ 36.5k rows/user) is trivial for Postgres; every hot read is a bounded range scan (≤~180 rows) on a `(habitId, localDate)` index; the only full-history read (longest streak) is the coldest and still ≤ a few thousand rows; 300 ms NFR is on the *write* (single-row upsert, history-independent) (agent C). | **NONE** (not a foundation risk) |
| **4. Derive period success from daily marks** (don't store it) | Period success is a *derived output* of the rule over daily marks, never primary data (prd.md `## Business Logic`); storing per-period success forecloses per-day calendar cells + retroactive day edits (agent B). | **STRONG** (derive, don't store) |
| **5. Query/index strategy** | A single `(habitId, localDate)` index serves all five access patterns cheaply (agent C); current schema has only `@@index([userId])` (schema.prisma:20). | **WEAK** (trivial; falls out of #1) |

## Narrowing Signals

- User could **not** separate the fragility axes (Step 1.5 Q1 = "not sure / all")
  → the value of this frame is doing that separation for them.
- User intends **minimal + seams** scope (Step 1.5 Q2) → matches the finding that
  S-01 can be minimal *if and only if* the 3 hard-to-reverse decisions are right.
- User expects **"large"** volume; PRD says `data_volume: small` (prd.md:8–11) →
  Agent C resolves the conflict: even "large" is trivial here, so the performance
  worry is real-sounding but unfounded at this product's scale.

## Cross-System Convention

No prior date- or mark-model decision exists in `context/changes/` or
`context/archive/` to inherit. The one date precedent in the codebase (auth-api
storing token expiry as a UTC `DateTime` instant, token.service.ts:28) is the
*right* shape for an instant but the *wrong* shape for a calendar day — so the
tempting local convention actively points toward the trap (dimension 2). This
strengthens, rather than weakens, the reframe.

## Reframed (or Confirmed) Problem Statement

> **The actual problem to plan around is**: making three small, hard-to-reverse
> *modeling/semantics* decisions correctly — not building for performance.

The user's instinct is right that a fragile foundation would doom S-02/S-03 —
but the fragility lives in **shape and date-semantics**, not in query
performance. Three decisions are cheap now and ruinous to reverse later:
(1) discrete **per-day Mark rows**, one per habit per day, where *absence = unmarked*;
(2) each mark keyed by a **local calendar date** with a unique `(habitId, date)`
constraint; (3) a **write-time recompute seam** the write path fires (no-op
consumer in S-01) so S-03 can plug in its engine. Everything S-02/S-03 add is
read-side computation over those same rows — no schema rewrite. Performance over
"900 days / large history" falls out of the right grain + one index, so it is
*not* a decision to make now.

## Confidence

- **HIGH** — three independent sub-agents converged (greenfield confirmed,
  requirements trace, performance math); the reframe matches convention (derive-
  don't-store; calendar-date for calendar data); and the decisive narrowing
  signal (user can't separate axes; expects "large" but scale is small) is
  resolved by evidence, not assertion.

## What Changes for /10x-plan

Plan S-01 around getting the **three load-bearing modeling decisions** right
(per-day Mark rows, local-date keying + uniqueness, recompute seam) and otherwise
build *only* what S-01's two screens need (create habit; mark today + current-
period progress against target). Do **not** plan a statistics engine, a streak
cache, or any scaling/materialization strategy — those are S-03 read-side
additions. Explicitly avoid the four fatal shortcuts: storing per-period success,
keying marks by UTC instant, a mutable status field/blob on `Habit`, or a stored
streak number without the underlying marks.

## References

- Source files: apps/habits-api/prisma/schema.prisma:14–21; apps/habits-api/prisma/migrations/20260522100152_init/migration.sql; apps/auth-api/src/auth/token.service.ts:28
- PRD: prd.md frontmatter:8–11 (`target_scale`), :153 (300 ms NFR), :155 (durability NFR), :156 (TZ/DST NFR), :161–195 (`## Business Logic`), FR-009:125 / FR-010:128
- Roadmap: roadmap.md S-01:68–79, S-02:81–91 (recompute-seam note :90), S-03:93–104
- Related research: none (`research.md` not present for this change)
- Investigation sub-agents: conventions scan (Explore); requirements trace (general-purpose, id a462e9522b8c3a5f9); performance reality check (general-purpose, id aa24916b6887109a0)
