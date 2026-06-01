<!-- IMPL-REVIEW-REPORT -->
# Implementation Review: Auth & Session Contract (F-01)

- **Plan**: context/changes/auth-and-session-contract/plan.md
- **Scope**: Phases 1–4 of 4 (all complete)
- **Date**: 2026-06-01
- **Verdict**: NEEDS ATTENTION (triaged — all chosen fixes applied)
- **Findings**: 0 critical, 4 warnings, 4 observations

## Verdicts

| Dimension | Verdict |
|-----------|---------|
| Plan Adherence | WARNING (F3 — deliberate routing drift + stale 4.10; resolved by doc update) |
| Scope Discipline | WARNING (benign extra scope: k8s migration Jobs, k8s-migrate.sh, Makefile, Navbar, eslint/vite config) |
| Safety & Quality | WARNING (F1, F2 + F5/F6/F7; no CRITICAL) |
| Architecture | PASS |
| Pattern Consistency | WARNING (F4 — raw `<a>` vs `<Link>`) |
| Success Criteria | WARNING (4.10 stale by design; SC 1.7 arm64 docker build not re-run locally) |

**Success criteria re-run locally:** auth-api lint ✅ / unit 14/14 ✅ / e2e 9/9 ✅; habits-api build ✅ / lint ✅ / unit 5/5 ✅ / e2e 8/8 ✅; web typecheck ✅ / lint ✅ (0 err, 7 pre-existing react-refresh warnings) / unit 11/11 ✅ / build ✅. Not re-run: SC 1.7 `docker build --platform linux/arm64` (slow / needs arm64 builder; claimed in Progress + covered by CI).

**Verified correct (no finding):** argon2id password hashing; SHA-256 refresh-token hashing (never plaintext/argon2); generic login message; single-flight refresh; removed habits-api JWT fallback; HS256 pinning; ValidationPipe `forbidNonWhitelisted` in both services; `uuid(7)` IDs (not cuid); PrismaService injection; no cross-app imports; `jwt.guard.ts` unchanged; access token memory-only.

## Findings

### F1 — No rate limiting on auth endpoints

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality
- **Location**: apps/auth-api/src/auth/auth.controller.ts (all 4 routes)
- **Detail**: register/login/refresh/logout are unauthenticated + unthrottled; login runs the expensive argon2id verify, exposing a brute-force / CPU-exhaustion DoS vector on the t4g.small. The plan explicitly deferred rate limiting under "What We're NOT Doing".
- **Fix A ⭐**: Accept as documented risk (keep deferred per plan). **Fix B**: Add `@nestjs/throttler` per-IP on login/register across both services.
- **Decision**: ACCEPTED AS RISK — matches the plan's explicit deferral; small scale + ≤15m access tokens. Future hardening.

### F2 — Refresh-token rotation is non-atomic

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Safety & Quality (Reliability)
- **Location**: apps/auth-api/src/auth/token.service.ts:41-42 (pre-fix)
- **Detail**: `rotate()` did `delete` then `issueRefreshToken` (create) as two separate writes; a failure between them revoked the old token with no replacement → silent logout.
- **Fix**: Wrap delete + create in `prisma.$transaction([...])`.
- **Decision**: FIXED — `rotate()` now mints the new token then runs `prisma.$transaction([delete, create])` atomically. `token.service.spec.ts` updated with a `$transaction` mock. Unit 14/14 + e2e 9/9 green.

### F3 — Routing diverged from plan; Progress 4.10 now false

- **Severity**: ⚠️ WARNING
- **Impact**: 🔎 MEDIUM — real tradeoff; pause to reason through it
- **Dimension**: Plan Adherence / Success Criteria
- **Location**: apps/web/src/routes/index.tsx (now public), apps/web/src/routes/_authed/app.tsx (gated home), plan Progress 4.10
- **Detail**: Phase 4 planned the gated home at `/`. Commit 2f65999 made `/` a public landing, moved the gated home to `/app`, and added a Navbar. The `_authed` gate is intact, but Progress 4.10 ("visiting `/` while signed out → /login") is marked [x] yet is now false by design.
- **Fix A ⭐**: Document the change in the plan. **Fix B**: Revert to gated `/`.
- **Decision**: FIXED (Fix A) — added a "## Addenda (post-implementation)" section to plan.md documenting the public `/` + `/app` gate and reinterpreting 4.10. No code change; guard verified intact.

### F4 — Auth-form cross-links use raw `<a href>` instead of `<Link>`

- **Severity**: ⚠️ WARNING
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Pattern Consistency
- **Location**: apps/web/src/components/LoginForm.tsx:59, apps/web/src/components/RegisterForm.tsx:59
- **Detail**: Raw anchors trigger a full page reload, discarding the in-memory access token and forcing an unnecessary boot-refresh round-trip. Navbar/index already use `<Link>`.
- **Fix**: Replace with TanStack `<Link to="...">`.
- **Decision**: FIXED — both forms now use `<Link>`. Component tests stub `Link` to a plain anchor (`vi.mock`) so they render without a router context. Web tests 11/11 green.

### F5 — Login user-enumeration via timing side-channel

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/auth-api/src/auth/auth.service.ts:37-42 (pre-fix)
- **Detail**: `if (!user || !(await verify))` short-circuited when the email was unknown, skipping argon2.verify → "no such email" returned measurably faster than "wrong password".
- **Fix**: Run a verify against a constant dummy hash when the user is missing.
- **Decision**: FIXED — `AuthService` now precomputes a throwaway argon2 hash in `onModuleInit`; `login()` always verifies (against the dummy when no user) so both paths cost the same. `auth.service.spec.ts` updated to assert the constant-time verify.

### F6 — Committed dev JWT_SECRET reachable via envFilePath fallback

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality
- **Location**: apps/auth-api/src/app.module.ts:15, apps/habits-api/src/app.module.ts:15 (+ .env.example)
- **Detail**: `ConfigModule` loads `['.env', '.env.example']`; `.env.example` commits a dev `JWT_SECRET`, so an env with neither an injected var nor a `.env` boots on it. Intentional (keeps Jest/CI/local runnable) and safe in prod (image omits `.env.example` → `getOrThrow` crashes).
- **Fix**: Drop `.env.example` from `envFilePath` and require `JWT_SECRET` in CI/local.
- **Decision**: ACCEPTED — intentional plan design; prod is safe. Left as-is.

### F7 — refresh() rotates before confirming the user exists

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Safety & Quality (Reliability)
- **Location**: apps/auth-api/src/auth/auth.service.ts:47-49
- **Detail**: `rotate()` runs before the `findUnique` user check. Ordering is backwards but harmless: FK cascade removes a user's refresh tokens with the user, and F2's transaction now rolls back any FK failure.
- **Fix**: Reorder, or accept.
- **Decision**: ACCEPTED / SKIPPED — effectively impossible given cascade + the F2 transaction. Left as-is.

### F8 — No purge of expired refresh tokens

- **Severity**: 🔭 OBSERVATION
- **Impact**: 🏃 LOW — quick decision; fix is obvious and narrowly scoped
- **Dimension**: Performance
- **Location**: apps/auth-api/src/auth/token.service.ts
- **Detail**: Expired-but-not-rotated rows persist until the owning user is cascade-deleted. Negligible at current scale.
- **Fix**: Add a periodic cleanup (delete where `expiresAt < now`) when volume warrants.
- **Decision**: SKIPPED — future hardening.
