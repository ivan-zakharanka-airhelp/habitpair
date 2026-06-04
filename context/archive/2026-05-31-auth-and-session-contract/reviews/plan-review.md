<!-- PLAN-REVIEW-REPORT -->
# Plan Review: Auth & Session Contract (F-01)

- **Plan**: context/changes/auth-and-session-contract/plan.md
- **Mode**: Deep
- **Date**: 2026-05-31
- **Verdict**: REVISE → SOUND (after fixes)
- **Findings**: 1 critical, 3 warnings, 3 observations — all triaged

## Verdicts

| Dimension | Verdict (initial) |
|-----------|-------------------|
| End-State Alignment | PASS |
| Lean Execution | PASS |
| Architectural Fitness | PASS |
| Blind Spots | FAIL (F1, F3, F5, F6) |
| Plan Completeness | WARNING (F2, F4, F7) |

## Grounding
14/14 paths ✓, key symbols ✓ (bearerToken/setBearerToken, habits-api JwtModule `?? 'unsafe-dev-only-secret'` fallback, inline `title` BadRequestException, CORS allowedHeaders, npm scripts), brief↔plan ✓.

## Findings

### F1 — getOrThrow('JWT_SECRET') breaks tests/CI that run without the env

- **Severity**: ❌ CRITICAL
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Phase 1 §9 / Phase 2 §1
- **Detail**: Both phases switch to `c.getOrThrow('JWT_SECRET')` and Phase 2 deletes habits-api's `?? 'unsafe-dev-only-secret'` fallback (comment: "Dev fallback keeps e2e tests runnable without env setup"). No test env supplies JWT_SECRET — both `*-test.yaml` Test steps set only `DATABASE_URL`; `ConfigModule.forRoot` has no `envFilePath`, so `.env.example` is never auto-loaded; Jest doesn't load it. Every spec that boots the Nest app (both e2e suites, criteria 1.5/2.4) throws at module init → the automated gate goes red.
- **Fix A ⭐ Recommended**: Add `envFilePath: ['.env', '.env.example']` to both `ConfigModule.forRoot` so `getOrThrow` resolves the committed dev value in dev/test/CI while prod's injected env still wins (the image doesn't ship `.env.example`).
- **Fix B**: Inject `JWT_SECRET` into the workflows' Test/e2e step env (fixes CI but not bare local `npm test`).
- **Decision**: FIXED via Fix A (envFilePath in both `app.module.ts`; also noted in Critical Implementation Detail "Shared-secret consistency & load timing").

### F2 — CI never runs the e2e suite the plan leans on

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 1 SC 1.5 / Phase 2 SC 2.4 / Migration Notes
- **Detail**: Both `*-test.yaml` run `npm test` only (jest `testRegex .*\.spec\.ts$`, `rootDir src`); neither invokes `test:e2e`. The register→login→refresh→logout lifecycle and habits token-accept run locally only; the Migration Notes "broken migration fails CI" claim overstates the net for the new flow.
- **Fix**: Add a `test:e2e` step to both `*-test.yaml` after `migrate:deploy`, with `DATABASE_URL` (+ `JWT_SECRET` per F1). Postgres service + migrate already present.
- **Decision**: FIXED — added Phase 1 §10 + Phase 2 §4 (CI e2e step) and tightened the Migration Notes claim.

### F3 — argon2 native build on node:22-alpine (arm64) flagged but never verified

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Blind Spots
- **Location**: Critical Implementation Detail #5 / Phase 1 SC
- **Detail**: Plan names "verify the image builds, not just local dev" as critical, but no phase touches `apps/auth-api/Dockerfile` and all Phase 1 automated criteria are host `npm` commands. Dockerfile is `node:22-alpine` (musl) with `npm ci --omit=dev` in the prod stage; argon2 generally has no musl prebuilt and alpine lacks `python3`/`make`/`g++`, so the arm64 prod install can fail.
- **Fix A ⭐ Recommended**: Switch base to `node:22-slim` (glibc, argon2 prebuilds) + add SC `docker build --platform linux/arm64 -f apps/auth-api/Dockerfile .`.
- **Fix B**: Stay on alpine, add `apk add python3 make g++` before the prod-stage `npm ci` + same build criterion.
- **Decision**: FIXED via Fix A — added Phase 1 §11 (Dockerfile base), automated SC + Progress checkbox 1.7 (manual items renumbered to 1.8–1.10).

### F4 — Phase 4 router-context contract omits __root.tsx and the re-eval mechanism

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Completeness
- **Location**: Phase 4 §1 / §2
- **Detail**: §1 lists `router.tsx` + `main.tsx`; §2 reads `context.auth` in `_authed.tsx`'s `beforeLoad`. But `__root.tsx` is `createRootRoute({...})` — it must become `createRootRouteWithContext<{ auth }>()` for `createRouter({ context })` and typed `beforeLoad` to compile (SC 4.1). The contract is also silent on how subscribed `authStore` state re-reaches the singleton router (needs `<RouterProvider context>` + `router.invalidate()` on change, or `beforeLoad` won't re-run after the boot exchange — the plan's own "Boot rehydration ordering" race).
- **Fix**: Add `__root.tsx` to §1 (switch to `createRootRouteWithContext`), define `AuthContext`, and specify `<RouterProvider context={{ auth }}>` + `router.invalidate()` on `authStore` change.
- **Decision**: FIXED — Phase 4 §1 file list and contract expanded.

### F5 — Multi-tab + rotation can force-logout a valid user

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Phase 3 §1
- **Detail**: localStorage refresh token + rotation + per-tab single-flight: a background tab presenting a rotated-away token gets 401 → spurious logout. Not promised (single-device scope) but unmentioned.
- **Fix**: Document multi-tab sessions as out-of-scope (or add a `storage`-event sync).
- **Decision**: FIXED — added a "Multi-tab session sync" bullet to "What We're NOT Doing".

### F6 — Sign-out doesn't kill the outstanding access token

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Blind Spots
- **Location**: Desired End State / What We're NOT Doing
- **Detail**: Stateless access tokens stay valid ≤15m after logout; "revokes that device's session" reads as instant.
- **Fix**: Note in "What We're NOT Doing" that logout clears the client + stops new access tokens but doesn't server-side-revoke the live access token.
- **Decision**: FIXED — added a "Server-side revocation of the live access token" bullet.

### F7 — Phase 4 Progress has 6 manual checkboxes for 8 manual criteria

- **Severity**: 🔍 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Plan Completeness
- **Location**: Progress §Phase 4
- **Detail**: "Visit `/` while signed out → redirect" and "sign in again" were merged into 4.7/4.8. Parseable, but not a 1:1 mirror — two distinct checks can be silently skipped.
- **Fix**: Split into discrete checkboxes (4.5–4.12).
- **Decision**: FIXED — Phase 4 manual Progress split to 8 items (4.5–4.12).
