# Cross-user Isolation + Persisted-correctness Integration Suite — Plan Brief

> Full plan: `context/changes/testing-backend-integration-suite/plan.md`
> Research: `context/changes/testing-backend-integration-suite/research.md`

## What & Why

Build a two-user, real-Postgres integration suite for `habits-api` that proves the four highest-impact backend properties from `test-plan.md` §2 — cross-user isolation (#1), persisted correctness + calendar↔metrics agreement (#2), retroactive backfill recompute (#5), and durable write/read-back (#6). These are the High-impact risks the rollout protects first, and they fail at a seam pure unit tests can't reach: HTTP wiring over a real database with two users.

## Starting Point

The habits-api e2e harness already exists (`createTestApp`, `createHabit`, `putMark`, the two-user pattern, `deleteMany`-based reset) and the implementation is **already correct** against all four risks at the unit/mock level. The gap is integration-level proof: the two mark routes have zero cross-user coverage, no test asserts the calendar and metrics agree over one seeded mark set, no backfill test exercises a *closed* failing period across both read-models, and durability is only ever checked via the write response.

## Desired End State

Two new spec files — `isolation.e2e-spec.ts` (#1 + #6) and `consistency.e2e-spec.ts` (#2 + #5) — pass against the CI Postgres harness. A non-owner provably gets 404 with no side-effect on every route; one seeded mark set reads back correct and mutually-agreeing across both endpoints; a backfill into a closed period recomputes both read-models together; and a confirmed write survives an independent second-token read-back. The test-plan cookbook (§6.2/§6.4/§6.6) documents the pattern and the rollout status advances.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Test layer | Integration only (Supertest + real DB) | Cheapest *new* signal; the math is already unit-covered and §7 forbids re-testing it. | Research |
| Hermetic stubs | None | The mark write is a single atomic upsert — no partial-failure branch to force. | Research |
| File organization | Two new specs by risk (`isolation`, `consistency`) | Keeps each behavioral suite cohesive; the agreement test spans two endpoints so it has no home in calendar/metrics spec. | Plan |
| Agreement assertion (#2) | Oracle + mutual | Hand-derive expected failures from the rule, assert both endpoints match it AND each other — catches drift *and* the mirror-test trap. | Plan |
| Date convention | Shared `TODAY` constant in the harness | Makes the closed-vs-open period boundary (crux of #5) deterministic and unambiguous. | Plan |
| DELETE-marks scope | Full: 404 + read-back + idempotent | Route has zero e2e coverage; idempotent-on-absent is a real-DB fact the mock can't prove. | Plan |
| #6 read-back | Second token, same `sub` | Faithfully models US-02's "another device/session" at trivial cost. | Plan |
| Cookbook | Update §6 + status as a final docs phase | CLAUDE.md ties §6 updates to phase completion; §6.2/§6.4 were placeholdered for this phase. | Plan |

## Scope

**In scope:** habits-api e2e suite for risks #1/#2/#5/#6; harness helpers (`TODAY`, `deleteMark`, read wrappers); test-plan cookbook + status sync.

**Out of scope:** any production code change; re-testing pure period/metrics/DST math; hermetic stubs; the PRD local-timezone boundary (SPA / Phase-2 e2e); auth-api and risk #3 (Phase 2); `userId`-scoping the second-stage writes.

## Architecture / Approach

Scaffolding first (Phase 1 helpers), then the two risk suites that depend on it (Phases 2–3), then the cookbook sync (Phase 4) — the order CLAUDE.md prescribes. Both suites reuse the established two-user inline pattern, per-`it` habit seeding, and `beforeAll`/`afterAll` `deleteMany` reset; every time-dependent read passes an explicit `today` from the shared `TODAY` anchor. The oracle for every assertion comes from the documented Business-Logic rule, never from the engine's output — enforced structurally in the agreement tests.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Harness extensions | `TODAY`, `deleteMark`, `getCalendar`/`getMetrics`/`getHabits` wrappers | Trivial — must not regress existing specs |
| 2. Isolation + durability (#1, #6) | All-route 404 sweep + owner-unchanged; write/read-back, upsert, unmark | The ValidationPipe-before-ownership gotcha (use well-formed params) |
| 3. Correctness + agreement + backfill (#2, #5) | Round-trip + oracle+mutual agreement; closed-period flip both directions | Writing a mirror test that passes against a shared bug |
| 4. Cookbook + test-plan sync | §6.2/§6.4/§6.6 filled; §3 status + §5 gate advanced | Docs drifting from merged reality |

**Prerequisites:** local Postgres on 5434 (`make db-up`) or the CI service container; existing e2e harness (present).
**Estimated effort:** ~2–3 sessions across 4 phases; Phase 3 is the bulk.

## Open Risks & Assumptions

- **Local-tz vs UTC** (research Open Q1): the backend is UTC-internally-consistent and applies no per-user timezone; the suite asserts round-trip + agreement only and never an expected local-tz value. Whether the PRD local-tz rule holds end-to-end is a Phase-2/SPA question — flagged, not resolved.
- **Assumption**: the implementation is correct, so all tests should pass first try. If one fails, it is a genuine defect to file — not a prompt to weaken the assertion.
- **Mutation testing** is an optional, selective gate after Phase 3 — not a CI gate.

## Success Criteria (Summary)

- A non-owning user provably gets 404 on every `habitId`-addressed route (incl. both mark routes) with the owner's data unchanged.
- One seeded mark set reads back correct and mutually-agreeing across `/calendar` and `/metrics`, with expected failures derived from the rule.
- A backfill into a closed period recomputes streak/%/best-streaks and clears the calendar failure entry — together; the symmetric break holds too.
- A confirmed mark is present on an independent second-token read-back; repeat-PUT upserts to a single row; unmark is durable and idempotent.
