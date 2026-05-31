# Auth & Session Contract (F-01) — Plan Brief

> Full plan: `context/changes/auth-and-session-contract/plan.md`

## What & Why

Build real email+password authentication end-to-end. This is roadmap foundation **F-01** — the cross-cutting gate every later slice (S-01–S-04) depends on. Today the verification half exists (habits-api can check a token) but nothing issues tokens, so no signed-in user with a stable identity exists yet. F-01 makes that user real, with per-user data isolation that the PRD treats as a binary, product-killing guardrail.

## Starting Point

`auth-api` is a health-only scaffold — empty Prisma schema, zero migrations, zero auth deps. `habits-api` already has a working HS256 `JwtGuard` that attaches `{ sub }` and scopes queries by it; it just has no issuer and loads its secret unreliably. The SPA keeps its token in a module variable (lost on reload), with no storage, route guards, router context, or auth UI.

## Desired End State

A visitor registers, is auto-signed-in, and lands in the (placeholder) authenticated app within ~1 minute. The session survives reloads and works across devices; signing out revokes that device's session. Every habits-api request carries a verified per-user `sub`, and no authenticated request returns another user's data.

## Key Decisions Made

| Decision | Choice | Why | Source |
| --- | --- | --- | --- |
| Session model | Stateless HS256 access + rotating, hashed refresh row | Real server-side sign-out/revocation while habits-api stays stateless | Roadmap/Plan |
| Client token storage | Refresh in `localStorage`, access in memory, boot exchange | Survives reload; access token never persisted | Plan |
| Expired-access handling | Transparent refresh-and-retry on 401 (single-flight) | Continuous sessions; supports short access TTL | Plan |
| Sign-out scope | Current device only | Matches PRD's "an authenticated session" | Plan |
| Password hashing | argon2id | Memory-hard, no bcrypt 72-byte cap | Plan |
| Request validation | `class-validator` + global `ValidationPipe`, both services | Establishes the unchosen convention once (CLAUDE.md) | Plan |
| After registration | Auto-sign-in (return tokens) | Serves the ~1-min activation north-star | PRD/Plan |
| Route gating | TanStack Router `context` + `beforeLoad` redirect | Idiomatic; no flash; precedent for later slices | Plan |
| Forms | Minimal controlled + native validation | Zero deps; fits "deliberately simple" | Plan |
| Password reset | Out of F-01 scope | PRD/roadmap permit shipping without it | PRD/Roadmap |

## Scope

**In scope:** User + RefreshToken model + first migration; argon2id hashing; register/login/refresh/logout endpoints; consistent secret loading + shared validation in habits-api; SPA token store, refresh-on-401, route gating, and auth UI.

**Out of scope:** password reset, email verification, OAuth/magic-link, "sign out everywhere", refresh reuse-detection, rate limiting, habit features (placeholder home), cookies/RS256.

## Architecture / Approach

auth-api issues a 15-min stateless access token (`{ sub: userId }`, HS256) plus a 30-day opaque refresh token stored as a SHA-256 hash for rotation/revocation. habits-api verifies the access token with no DB lookup (self-contained token, no auth→habits callback). The SPA holds the access token in memory and the refresh token in `localStorage`, exchanging it on boot and transparently on any 401. Both services load the shared `JWT_SECRET` via `registerAsync` + `ConfigService`.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. auth-api issuer | Model + migration + argon2id + 4 endpoints, e2e-proven | Token lifecycle correctness; argon2 native build (arm64) |
| 2. habits-api alignment | Reliable secret loading + shared validation convention | Secret mismatch → every request 401s |
| 3. Frontend plumbing | Token store, refresh-on-401, auth API layer | Refresh stampede if not single-flight |
| 4. Frontend UX + gating | Router-context guard, boot rehydration, forms, sign-out | Boot-ordering flash to `/login` for valid users |

**Prerequisites:** none (F-01 is the first foundation). Local Postgres on 5434 (`make setup`).
**Estimated effort:** ~4 sessions, one per phase, backend-first.

## Open Risks & Assumptions

- The shared-secret loading fix (Phase 2) is the linchpin; if secrets diverge, the symptom masquerades as a frontend bug.
- `localStorage` refresh token is XSS-readable — accepted for this learning-scale app; access token stays in memory.
- argon2's native binding must build in the `linux/arm64` production image, not just locally.
- Forgotten-password lockout is a known, accepted gap until reset ships.

## Success Criteria (Summary)

- A new user registers → auto-signed-in → reaches the app, and the session persists across reloads and sign-out/sign-in.
- A token minted by auth-api is accepted by habits-api; a wrong-secret token is rejected.
- No authenticated request returns another user's data (per-user `sub` isolation holds end-to-end).
