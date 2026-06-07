---
change_id: testing-backend-integration-suite
title: Cross-user isolation + persisted-correctness integration suite
status: impl_reviewed
created: 2026-06-07
updated: 2026-06-07
archived_at: null
---

## Notes

Open a change folder for rollout Phase 1 of context/foundation/test-plan.md: "Cross-user isolation + persisted-correctness integration suite".
Risks covered: #1, #2, #5, #6 (from §2). Test types planned: integration (Supertest + real DB), extending apps/*/test/app.e2e-spec.ts against the CI Postgres harness.
Risk response intent (what this phase must prove protected):
- #1: a non-owning user gets 404 (not 403) on every habit / mark / metrics / calendar / PATCH / DELETE route for a resource they do not own — no existence leak.
- #2: seeded marks read back through /metrics and /calendar return correct, mutually-agreeing values over a real database (the stored-date<->UTC seam that pure unit tests cannot catch).
- #5: a retroactive backfill into a closed period recomputes the streak / rolling % / best-streaks across the affected range and keeps the calendar coloring in agreement.
- #6: a mark written via the API is present on an independent re-read (write -> read-back, not just the write response).
After creating the folder, follow the downstream continuation rule (suggest /10x-research next).
