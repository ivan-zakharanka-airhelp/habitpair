# Auth & Session Contract (F-01) Implementation Plan

## Overview

Build real email+password authentication end-to-end so every later slice (S-01–S-04) can rely on a signed-in user with a stable identity. `auth-api` becomes the token issuer: a `User` + `RefreshToken` data model, argon2id password hashing, and `register` / `login` / `refresh` / `logout` endpoints that mint a short-lived stateless HS256 access token plus a rotating, server-revocable refresh token. `habits-api`'s existing verification is hardened so issued tokens actually verify, and both services adopt a shared `class-validator` validation convention. The SPA gains token persistence (refresh in `localStorage`, access in memory), transparent refresh-on-401, route gating via TanStack Router context + `beforeLoad`, and the register / sign-in / sign-out UI.

## Current State Analysis

**The verification half is already production-shaped; the issuance half is absent.**

- **auth-api** ([apps/auth-api](apps/auth-api)) is a health-only scaffold: empty Prisma schema (datasource + generator, no models), **zero migrations** (`prisma/migrations/` holds only `.gitkeep`), and **zero auth dependencies** (no `@nestjs/jwt`, no hashing lib, no `class-validator`). `ConfigModule.forRoot({ isGlobal: true })` and a `@Global()` `PrismaModule` are wired; `main.ts` sets `setGlobalPrefix('auth')` and CORS (`credentials: false`, allows `Authorization`).
- **habits-api** already has `@nestjs/jwt@^11` and a working guard: [jwt.guard.ts](apps/habits-api/src/auth/jwt.guard.ts) extracts the bearer token, calls `jwtService.verifyAsync(token, { algorithms: ['HS256'] })`, and attaches `request.user = { sub }`. [habits.controller.ts](apps/habits-api/src/habits/habits.controller.ts) scopes every query by `req.user.sub`. The guard's token logic is sound — it has simply had no issuer. Two gaps: (1) `JwtModule.register({ secret: process.env.JWT_SECRET ?? 'unsafe-dev-only-secret', ... })` in [app.module.ts](apps/habits-api/src/app.module.ts) reads `process.env` at module-import time (before `@nestjs/config` loads `.env`) and its dev fallback differs from auth-api's `.env` value; (2) request validation is inline (`if (!title) throw new BadRequestException`).
- **Frontend** ([apps/web](apps/web)) stores the token in a module-level `let bearerToken` in [apiClient.ts](apps/web/src/lib/apiClient.ts) — **lost on every reload**. `makeClient` returns the raw `Response` and does not throw on non-2xx. There is no storage, no route guard, no router `context`, no auth UI, and no form library. `main.tsx` nests `QueryClientProvider` → `RouterProvider` with no auth context. `components/`, `hooks/`, `types/` do not exist. `routes/` holds only `__root.tsx` and `index.tsx` (a health page).

**Constraints discovered:**
- Each service owns its own Prisma client (`output = "../generated/prisma"`); the `auth` and `habits` databases are separate — no cross-DB FK. `userId` in habits is the JWT `sub`, by design.
- `JwtPayload` is `{ sub: string; iat?: number; exp?: number }` ([jwt-payload.ts](apps/habits-api/src/auth/jwt-payload.ts)). The issued access token must keep `sub = userId` to honor this contract unchanged.
- CLAUDE.md: introducing `class-validator` obliges applying it to **both** services and removing the inline check in the same change.
- Prod runs `linux/arm64` (Graviton) — native modules (argon2) must build for that target.

## Desired End State

A new visitor can register, is auto-signed-in, and lands in the (placeholder) authenticated app; the session survives reloads and works across devices; signing out revokes that device's session. Every `habits-api` request carries a verified per-user `sub`, and there is no authenticated request shape that returns another user's data. Verify by: running all three apps (`make up`), registering in the browser, reloading (still signed in), signing out (bounced to `/login`), signing back in, and confirming a token minted by `auth-api` is accepted by `habits-api`.

### Key Discoveries:
- habits-api guard already verifies HS256 + attaches `{ sub }` — [jwt.guard.ts](apps/habits-api/src/auth/jwt.guard.ts) needs **no change**; only the module's secret loading does.
- Existing per-user isolation pattern: `req.user.sub` → service `userId` param → `where: { userId }` ([habits.service.ts](apps/habits-api/src/habits/habits.service.ts)). Reuse it; do not invent a new identity path.
- `setBearerToken()` already exists in [apiClient.ts](apps/web/src/lib/apiClient.ts) — the in-memory access-token slot to build on.
- The health-call pattern `client('/auth/health')` in [index.tsx](apps/web/src/routes/index.tsx) shows how the SPA calls APIs (`path` is appended to the per-service base URL).

## What We're NOT Doing

- **Password reset / forgot-password** — deferred (PRD Open Question 1; roadmap unknown, non-blocking). Documented gap.
- **Email verification** — PRD defers; signup grants immediate access.
- **OAuth / third-party / magic-link / passwordless** — PRD Non-Goals.
- **"Sign out everywhere" / session-management UI** — sign-out revokes the current device only.
- **Server-side revocation of the live access token** — sign-out deletes the refresh row and clears the client, so no new access tokens are minted, but the already-issued stateless access token stays valid until it expires (≤15m). "Signing out revokes that device's session" means this — not an instant server-side kill of the outstanding access token.
- **Refresh-token reuse-detection chain revocation** — simple rotation (delete old, issue new); a presented-but-unknown refresh token just 401s.
- **Multi-tab session sync** — the refresh token is in `localStorage` and rotates per use; two tabs of the same browser are not synced, so a background tab holding a rotated-away token will 401 and log out. Single-active-tab is the assumed usage at this scale (a `storage`-event sync is the future fix).
- **Rate limiting / account lockout on sign-in** — noted as future hardening, not in F-01.
- **Habit features** — Phase 4's signed-in home is a placeholder; the habit list is S-01.
- **Asymmetric keys (RS256) / per-service secrets / httpOnly cookies / CORS credentials changes** — stays HS256 shared-secret + Bearer header per the existing architecture.

## Implementation Approach

Backend-first, then frontend, in dependency order. Phase 1 builds the entire issuer and proves it with an integration test against real Postgres. Phase 2 makes habits-api actually verify those tokens and adopts the shared validation convention. Phase 3 lays the SPA token/refresh plumbing (no UI). Phase 4 adds the auth UX and route gating and is validated by a full manual browser run. Access-token verification stays stateless (no DB lookup in habits-api), preserving the "self-contained token, no auth→habits callback" architecture; only refresh tokens are server-side state, which is what makes sign-out and rotation real.

## Critical Implementation Details

- **Shared-secret consistency & load timing.** Both services must resolve the *same* HS256 secret, loaded via `JwtModule.registerAsync` + `ConfigService` rather than a bare `process.env` read at import time. If the secrets diverge (today habits-api's import-time fallback can win before `.env` loads), every authenticated request 401s and the symptom looks like a frontend bug. This is the linchpin of the whole change. Load the secret through `ConfigModule.forRoot({ envFilePath: ['.env', '.env.example'] })` so `getOrThrow('JWT_SECRET')` never throws under Jest/CI/local-without-`.env` (which is what the deleted dev fallback used to guarantee), while prod's injected env var still wins.
- **Refresh single-flight.** When several gated requests 401 at once, they must share one in-flight `/auth/refresh` call. Because refresh rotates (the old token is deleted), parallel refreshes would invalidate each other and cascade to a forced logout. The access token lives in memory; the refresh token in `localStorage`.
- **Boot rehydration ordering.** On app load the SPA exchanges the stored refresh token for a fresh access token. The router context must expose an "auth resolving" state during that exchange so `beforeLoad` does not bounce a returning, still-valid user to `/login` before it resolves.
- **Two different hashes for two different secrets.** argon2id is for the password (low entropy, deliberately slow). Refresh tokens are high-entropy random; store a fast **SHA-256** hash of them — do not argon2-hash refresh tokens (per-request cost) and do not store them in plaintext.
- **argon2 native build on arm64.** The production Docker image (`linux/arm64`) must compile/include argon2's native binding; verify the image builds, not just local dev.

## Phase 1: auth-api issuer

### Overview
Stand up the full token issuer in auth-api: dependencies, data model + first migration, password/token services, and the four HTTP endpoints. Proven end-to-end against a real Postgres `auth` database.

### Changes Required:

#### 1. Dependencies
**File**: `apps/auth-api/package.json` (+ root `npm install`)
**Intent**: Add the libraries auth-api needs to sign tokens, hash passwords, and validate input.
**Contract**: Add to `dependencies`: `@nestjs/jwt` (^11, matching habits-api), `argon2`, `class-validator`, `class-transformer`. After editing, run `npm install` at the repo root (lockfile lives there).

#### 2. Data model
**File**: `apps/auth-api/prisma/schema.prisma`
**Intent**: Add the `User` and `RefreshToken` models. Email is the unique login identity (stored lowercased); refresh tokens are stored as hashes for server-side revocation/rotation.
**Contract**: Two models on the existing `db`/`generator`:
- `User { id String @id @default(uuid(7)); email String @unique; passwordHash String; createdAt DateTime @default(now()); updatedAt DateTime @updatedAt; refreshTokens RefreshToken[] }`
- `RefreshToken { id String @id @default(uuid(7)); userId String; tokenHash String @unique; expiresAt DateTime; createdAt DateTime @default(now()); user User @relation(fields: [userId], references: [id], onDelete: Cascade); @@index([userId]) }`
`tokenHash` holds the SHA-256 hex of the opaque refresh token, never the token itself.

#### 3. First migration
**File**: `apps/auth-api/prisma/migrations/**`
**Intent**: Create the tables in the `auth` database.
**Contract**: `npm run migrate -w @habitpair/auth-api` (Prisma `migrate dev`) generates the migration and regenerates the client into `apps/auth-api/generated/prisma`.

#### 4. Password service
**File**: `apps/auth-api/src/auth/password.service.ts`
**Intent**: Encapsulate argon2id hashing and verification so the algorithm/params live in one place.
**Contract**: `hash(plain: string): Promise<string>` and `verify(hash: string, plain: string): Promise<boolean>` using `argon2.hash(plain, { type: argon2.argon2id })` with sane memory/time cost. No 72-byte cap (argon2, not bcrypt), but enforce a max length in the DTO to bound cost.

#### 5. Token service
**File**: `apps/auth-api/src/auth/token.service.ts`
**Intent**: Mint access tokens and mint/rotate/revoke refresh tokens. The single owner of token lifetimes and the refresh-hash scheme.
**Contract**:
- `issueAccessToken(userId): Promise<string>` → `jwtService.signAsync({ sub: userId })` with `expiresIn: '15m'`, HS256 (claim is `{ sub }` only — matches `JwtPayload`).
- `issueRefreshToken(userId): Promise<string>` → generate 32 random bytes (base64url), persist a `RefreshToken` row with `tokenHash = sha256(token)` and `expiresAt = now + 30d`, return the raw token.
- `rotate(rawToken): Promise<{ userId, refreshToken }>` → look up by `sha256(rawToken)`; if missing or expired, throw `UnauthorizedException`; delete the old row and issue a new one (rotation).
- `revoke(rawToken): Promise<void>` → delete the row matching `sha256(rawToken)` (current-device sign-out; no error if already gone).
Use Node `crypto` for the random bytes and SHA-256.

#### 6. DTOs
**File**: `apps/auth-api/src/auth/dto/` (`register.dto.ts`, `login.dto.ts`, `refresh.dto.ts`, `logout.dto.ts`)
**Intent**: Declarative validation for request bodies.
**Contract**: `RegisterDto` / `LoginDto`: `email` `@IsEmail()`, `password` `@IsString() @MinLength(8) @MaxLength(128)`. `RefreshDto` / `LogoutDto`: `refreshToken` `@IsString() @IsNotEmpty()`.

#### 7. Auth service
**File**: `apps/auth-api/src/auth/auth.service.ts`
**Intent**: Orchestrate the flows over Prisma + password/token services.
**Contract**:
- `register(email, password)` → lowercase email; create `User` with `passwordHash`; on unique violation throw `ConflictException` (409); then issue access + refresh; return `{ accessToken, refreshToken, user: { id, email } }`.
- `login(email, password)` → find by lowercased email, `password.verify`; on any failure throw `UnauthorizedException` with a **generic** message ("Invalid email or password" — no enumeration); issue tokens.
- `refresh(rawToken)` → `token.rotate`, load user, return new tokens + user.
- `logout(rawToken)` → `token.revoke`.

#### 8. Controller + module
**File**: `apps/auth-api/src/auth/auth.controller.ts`, `apps/auth-api/src/auth/auth.module.ts`
**Intent**: Expose the endpoints under the `/auth` global prefix and wire the providers.
**Contract**: `POST /auth/register` (201, returns tokens + user — auto-sign-in), `POST /auth/login` (200), `POST /auth/refresh` (200), `POST /auth/logout` (204). `AuthModule` provides `AuthService`, `PasswordService`, `TokenService`, declares `AuthController`; imported by `AppModule`.

#### 9. JWT + ValidationPipe wiring
**File**: `apps/auth-api/src/app.module.ts`, `apps/auth-api/src/main.ts`
**Intent**: Configure signing with a reliably-loaded secret and turn on global validation.
**Contract**: In `app.module.ts` add `JwtModule.registerAsync({ global: true, inject: [ConfigService], useFactory: (c) => ({ secret: c.getOrThrow('JWT_SECRET'), signOptions: { algorithm: 'HS256' } }) })` and import `AuthModule`. Also extend the existing `ConfigModule.forRoot` to `forRoot({ isGlobal: true, envFilePath: ['.env', '.env.example'] })` so `getOrThrow('JWT_SECRET')` resolves to the committed dev value under Jest/local runs that have no backend `.env`; prod's injected `JWT_SECRET` env var still takes precedence and the image does not ship `.env.example`. In `main.ts` add `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true }))`.

#### 10. CI runs the e2e suite
**File**: `.github/workflows/auth-api-test.yaml`
**Intent**: Make the lifecycle e2e part of the CI safety net, not a local-only gate.
**Contract**: After the existing `migrate:deploy` step, add a step running `npm run test:e2e -w @habitpair/auth-api` with env `DATABASE_URL` (the Postgres service, already present) and `JWT_SECRET` (any non-empty value). Today the workflow runs only `npm test` (jest `testRegex: .*\.spec\.ts$`, `rootDir: src`), so the register→login→refresh→logout lifecycle would otherwise never run in CI.

#### 11. Dockerfile base for argon2 (arm64)
**File**: `apps/auth-api/Dockerfile`
**Intent**: Ensure argon2's native binding is present in the production `linux/arm64` image (Critical Implementation Detail #5), not just on the host.
**Contract**: Switch the base from `node:22-alpine` (musl — argon2 has no musl prebuilt, so it would compile from source, but alpine ships no `python3`/`make`/`g++`) to `node:22-slim` (Debian/glibc, where argon2 ships prebuilt binaries → no compile) in **both** the `build` and `production` stages. habits-api adds no native deps, so its Dockerfile may stay on alpine (switch for parity only if desired).

### Success Criteria:

#### Automated Verification:
- Root install succeeds and argon2 builds: `npm install`
- Migration applies cleanly: `npm run migrate -w @habitpair/auth-api`
- Prisma client generates: `npm run generate -w @habitpair/auth-api`
- Unit tests pass (password, token, auth services): `npm test -w @habitpair/auth-api`
- E2E flow passes against real Postgres: `npm run test:e2e -w @habitpair/auth-api` (register → login → refresh rotates → logout; duplicate email → 409; bad credentials → 401; reuse of pre-rotation refresh token → 401)
- Lint passes: `npm run lint -w @habitpair/auth-api`
- auth-api production image builds for arm64 with argon2's native binding present: `docker build --platform linux/arm64 -f apps/auth-api/Dockerfile .` (from repo root — the Dockerfile's build context)

#### Manual Verification:
- `curl POST /auth/register` returns 201 with `accessToken`, `refreshToken`, and `user`; the access token decodes to `{ sub: <userId> }`
- `curl POST /auth/refresh` with the returned refresh token returns new tokens; replaying the *old* refresh token afterward returns 401
- `curl POST /auth/logout` then refresh with that token returns 401

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 2.

---

## Phase 2: habits-api verification alignment + shared validation

### Overview
Make habits-api reliably verify auth-api-issued tokens (consistent secret loading) and adopt the `class-validator` + global `ValidationPipe` convention, replacing the one inline check — satisfying the CLAUDE.md "apply consistently" rule.

### Changes Required:

#### 1. Reliable secret loading
**File**: `apps/habits-api/src/app.module.ts`
**Intent**: Load the HS256 secret through `ConfigService` so it matches auth-api and isn't read before `.env` is loaded.
**Contract**: Replace `JwtModule.register({ secret: process.env.JWT_SECRET ?? 'unsafe-dev-only-secret', ... })` with `JwtModule.registerAsync({ global: true, inject: [ConfigService], useFactory: (c) => ({ secret: c.getOrThrow('JWT_SECRET'), signOptions: { algorithm: 'HS256' } }) })`. No divergent dev fallback. Also extend `ConfigModule.forRoot` to `forRoot({ isGlobal: true, envFilePath: ['.env', '.env.example'] })` so `getOrThrow('JWT_SECRET')` resolves under Jest/CI (the workflows set only `DATABASE_URL`) and local runs without a backend `.env` — this takes over the deleted fallback's role of keeping e2e runnable without env setup; prod's injected env var still wins. [jwt.guard.ts](apps/habits-api/src/auth/jwt.guard.ts) is unchanged.

#### 2. Validation dependencies + pipe
**File**: `apps/habits-api/package.json` (+ root `npm install`), `apps/habits-api/src/main.ts`
**Intent**: Bring habits-api onto the same validation convention.
**Contract**: Add `class-validator`, `class-transformer`; add the same global `ValidationPipe({ whitelist: true, transform: true, forbidNonWhitelisted: true })` in `main.ts`.

#### 3. CreateHabitDto replaces inline check
**File**: `apps/habits-api/src/habits/dto/create-habit.dto.ts`, `apps/habits-api/src/habits/habits.controller.ts`
**Intent**: Express the habit-title rule declaratively and remove the manual `if (!title)`.
**Contract**: `CreateHabitDto { title: string }` with `@IsString() @IsNotEmpty()` (and `@Transform` trim, or trim in the service). Controller `create()` takes `@Body() dto: CreateHabitDto` and passes `dto.title`; delete the inline `BadRequestException`.

#### 4. CI runs the e2e suite
**File**: `.github/workflows/habits-api-test.yaml`
**Intent**: Exercise the shared-secret token-accept path in CI, not just locally.
**Contract**: After the existing `migrate:deploy` step, add a step running `npm run test:e2e -w @habitpair/habits-api` with env `DATABASE_URL` and `JWT_SECRET`. The workflow currently runs only `npm test`, so the "shared-secret token accepted / wrong-secret 401" check would otherwise never run in CI.

### Success Criteria:

#### Automated Verification:
- Root install succeeds: `npm install`
- Builds/typechecks: `npm run build -w @habitpair/habits-api`
- Guard + habits unit tests pass: `npm test -w @habitpair/habits-api`
- E2E: `POST /habits` with missing/empty title → 400 (from ValidationPipe); a request bearing a token signed with the shared secret is accepted: `npm run test:e2e -w @habitpair/habits-api`
- Lint passes: `npm run lint -w @habitpair/habits-api`

#### Manual Verification:
- A token from `auth-api` `POST /auth/login` is accepted by `habits-api` `GET /habits` (200, returns only that user's list); a token signed with a different secret → 401
- `POST /habits` with `{}` returns a 400 validation error, not a 500

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 3.

---

## Phase 3: Frontend auth plumbing

### Overview
Add the SPA's token store (access in memory, refresh in `localStorage`), transparent refresh-on-401 in `apiClient`, and the auth API/query layer. No UI in this phase.

### Changes Required:

#### 1. Auth token store
**File**: `apps/web/src/lib/authStore.ts`
**Intent**: Single source of truth for tokens + auth state, with persistence and single-flight refresh.
**Contract**: Holds access token in memory and refresh token in `localStorage` (one storage key). Exposes: current access token getter; `setSession({ accessToken, refreshToken, user })`; `clear()`; `subscribe(cb)` (for router context); `refresh(): Promise<boolean>` that is **single-flight** (concurrent callers await one in-flight promise) — calls `authApi('/auth/refresh', { refreshToken })`, on success stores new tokens, on failure clears state and invokes an `onAuthCleared` callback. Exposes `bootstrap(): Promise<void>` that, if a refresh token exists, attempts one refresh to rehydrate.

#### 2. apiClient refresh-and-retry
**File**: `apps/web/src/lib/apiClient.ts`
**Intent**: Attach the in-memory access token and transparently recover from an expired one.
**Contract**: `makeClient` reads the access token from `authStore` (replacing the standalone `bearerToken`/`setBearerToken`). On a `401`, if not already an auth endpoint and a refresh token exists, `await authStore.refresh()` once and retry the original request; if refresh fails, surface the error (store already cleared → `onAuthCleared` drives redirect). Never refresh-retry `/auth/*` calls (avoid loops).

#### 3. Auth API + query layer + types
**File**: `apps/web/src/lib/auth.ts`, `apps/web/src/types/auth.ts`
**Intent**: Typed calls and TanStack Query mutations for the four endpoints.
**Contract**: `types/auth.ts`: `User { id; email }`, `AuthResponse { accessToken; refreshToken; user }`, `Credentials { email; password }`. `lib/auth.ts`: `registerRequest` / `loginRequest` / `logoutRequest` functions (POST via `authApi`, throw on non-2xx with the server message) and `useRegister` / `useLogin` / `useLogout` mutation hooks that call `authStore.setSession` / `authStore.clear` on success.

### Success Criteria:

#### Automated Verification:
- Typecheck passes: `npm run typecheck -w @habitpair/web`
- Unit tests pass: `npm run test -w @habitpair/web` covering — concurrent `refresh()` calls trigger exactly one network call (single-flight); refresh token persists to and clears from `localStorage`; `apiClient` retries once on 401 and succeeds with the new token; a failed refresh clears the store and fires `onAuthCleared`
- Lint passes: `npm run lint -w @habitpair/web`

#### Manual Verification:
- (Primarily exercised in Phase 4) Token store survives a manual page reload when seeded with a valid refresh token

**Implementation Note**: After automated verification passes, pause for manual confirmation before Phase 4.

---

## Phase 4: Frontend auth UX + route gating

### Overview
Wire auth state into TanStack Router context, gate protected routes with `beforeLoad`, rehydrate on boot, and add the `/login` + `/register` forms and a gated signed-in home with sign-out. Validated by a full manual browser run.

### Changes Required:

#### 1. Router context + boot rehydration
**File**: `apps/web/src/routes/__root.tsx`, `apps/web/src/router.tsx`, `apps/web/src/main.tsx`
**Intent**: Carry auth state into routing and resolve the stored session before gating decisions.
**Contract**: Change `__root.tsx` from `createRootRoute({...})` to `createRootRouteWithContext<{ auth: AuthContext }>()({...})` so the context is typed and `beforeLoad({ context })` can read `context.auth` (without this, SC 4.1 typecheck fails). Define `AuthContext = { isAuthenticated: boolean; isResolving: boolean; user: User | null }`. In `router.tsx`, `createRouter({ routeTree, context: { auth: { isAuthenticated: false, isResolving: true, user: null } } })` (default boot context). In `main.tsx`, subscribe to `authStore`, pass the live value via `<RouterProvider router={router} context={{ auth }} />`, and call `router.invalidate()` on every `authStore` change so `beforeLoad` re-runs once the boot exchange resolves — otherwise the singleton router keeps its stale boot context and a returning, still-valid user is bounced to `/login` (the "Boot rehydration ordering" race). `main.tsx` also calls `authStore.bootstrap()` (boot refresh exchange), wires `authStore.onAuthCleared = () => router.navigate({ to: '/login' })`, and renders a lightweight pending state while `isResolving`.

#### 2. Gated layout + guard
**File**: `apps/web/src/routes/_authed.tsx` (pathless layout), move home to `apps/web/src/routes/_authed/index.tsx`
**Intent**: One reusable gate for all authenticated routes — the precedent for S-01–S-04.
**Contract**: `_authed.tsx` `beforeLoad({ context })`: if not `context.auth.isAuthenticated` (and not resolving), `throw redirect({ to: '/login' })`. The signed-in home renders "Signed in as {email}" + a sign-out button (calls `useLogout`). The old health content in `index.tsx` is removed/replaced.

#### 3. Public auth routes + forms
**File**: `apps/web/src/routes/login.tsx`, `apps/web/src/routes/register.tsx`, `apps/web/src/components/LoginForm.tsx`, `apps/web/src/components/RegisterForm.tsx`, `apps/web/src/hooks/useAuth.ts`
**Intent**: The sign-in / register surfaces and a hook to read auth state.
**Contract**: Public routes (no guard). Forms are minimal controlled components using native validation (`type="email"`, `required`, `minLength`), calling `useLogin` / `useRegister`; on success navigate to `/`; server errors render inline. `useAuth()` returns `{ isAuthenticated, user, logout }` from router context / `authStore`. Keyboard-operable, semantic landmarks (a11y baseline).

### Success Criteria:

#### Automated Verification:
- Typecheck passes: `npm run typecheck -w @habitpair/web`
- Component tests pass: `npm run test -w @habitpair/web` (LoginForm/RegisterForm submit + inline error display)
- Production build succeeds (route tree generates): `npm run build -w @habitpair/web`
- Lint passes: `npm run lint -w @habitpair/web`

#### Manual Verification (browser, all three apps via `make up`):
- Register a new account → auto-signed-in → lands on the gated home showing the email
- Reload the page → still signed in (boot refresh exchange succeeds)
- Sign out → redirected to `/login`; refresh token cleared from `localStorage`; navigating back to `/` re-bounces to `/login`
- Sign in with the same credentials → back on the home
- Bad credentials → inline "Invalid email or password", no crash
- Visiting `/` while signed out → redirected to `/login`
- Two separate accounts receive distinct identities; `habits-api` `GET /habits` returns only the signed-in user's (empty) list — no cross-user data
- Forms are fully operable via Tab / Enter (keyboard-only)

**Implementation Note**: After automated verification passes, pause for final manual confirmation.

---

## Testing Strategy

### Unit Tests:
- auth-api: `PasswordService` (hash≠plain, verify true/false), `TokenService` (access claim `sub`; refresh rotate deletes old + issues new; expired/unknown → throw; revoke idempotent), `AuthService` (duplicate→409, bad creds→generic 401).
- web: `authStore` single-flight refresh, `localStorage` persist/clear, `apiClient` 401-retry, failed-refresh clears + fires `onAuthCleared`.

### Integration Tests:
- auth-api e2e against real Postgres: full register→login→refresh→logout lifecycle + negative cases.
- habits-api e2e: ValidationPipe rejects empty title (400); a shared-secret token is accepted, a wrong-secret token is 401.

### Manual Testing Steps:
1. `make up`; register in the browser; confirm auto-sign-in and the email shows.
2. Reload; confirm session persists. Sign out; confirm redirect + cleared storage.
3. Sign in again; confirm return to home. Try a wrong password; confirm inline error.
4. With two accounts, confirm each token's `sub` differs and habits list is isolated.

## Performance Considerations

- Access-token verification in habits-api is stateless (no DB) — keeps gated reads fast and protects the 300 ms check-in guardrail that S-01 must meet.
- argon2id cost is tuned to ~tens-to-low-hundreds of ms per hash (login/register only — not on the hot path). Refresh tokens use SHA-256 (cheap) since they are high-entropy.
- The boot refresh exchange adds one round-trip before gated routes render; the pending state keeps it from flashing `/login`.

## Migration Notes

- auth-api's first migration creates `User` + `RefreshToken` in the `auth` database (already provisioned locally on port 5434 and in RDS by the bootstrap script). No data migration — greenfield.
- habits-api schema is unchanged. In CI/prod, `migrate:deploy` runs auth-api's migration before tests/rollout (per the path-filtered workflow). Both `*-test.yaml` workflows now run `test:e2e` after `migrate:deploy` (Phase 1 §10 / Phase 2 §4), so a broken migration or an auth-lifecycle regression fails CI rather than reaching prod.
- No secret rotation: both services continue to read `JWT_SECRET` (local `.env`; K8s secret `auth-jwt-secret`).

## References

- Roadmap: `context/foundation/roadmap.md` (F-01)
- PRD: `context/foundation/prd.md` (FR-001/002/003, Access Control, Non-Functional Requirements)
- Existing guard/contract: [apps/habits-api/src/auth/jwt.guard.ts](apps/habits-api/src/auth/jwt.guard.ts), [apps/habits-api/src/auth/jwt-payload.ts](apps/habits-api/src/auth/jwt-payload.ts)
- Isolation pattern: [apps/habits-api/src/habits/habits.service.ts](apps/habits-api/src/habits/habits.service.ts)
- SPA API client: [apps/web/src/lib/apiClient.ts](apps/web/src/lib/apiClient.ts)

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: auth-api issuer

#### Automated
- [x] 1.1 Root install succeeds and argon2 builds (`npm install`) — 91cf80b
- [x] 1.2 Migration applies cleanly (`npm run migrate -w @habitpair/auth-api`) — 91cf80b
- [x] 1.3 Prisma client generates (`npm run generate -w @habitpair/auth-api`) — 91cf80b
- [x] 1.4 Unit tests pass — password, token, auth services (`npm test -w @habitpair/auth-api`) — 91cf80b
- [x] 1.5 E2E lifecycle + negative cases pass (`npm run test:e2e -w @habitpair/auth-api`) — 91cf80b
- [x] 1.6 Lint passes (`npm run lint -w @habitpair/auth-api`) — 91cf80b
- [x] 1.7 auth-api arm64 image builds with argon2 (`docker build --platform linux/arm64 -f apps/auth-api/Dockerfile .`) — 91cf80b

#### Manual
- [x] 1.8 `curl` register returns 201 with tokens + user; access token decodes to `{ sub }` — 91cf80b
- [x] 1.9 Refresh rotates; replaying the old refresh token → 401 — 91cf80b
- [x] 1.10 Logout then refresh with that token → 401 — 91cf80b

### Phase 2: habits-api verification alignment + shared validation

#### Automated
- [x] 2.1 Root install succeeds (`npm install`) — 2910700
- [x] 2.2 Builds/typechecks (`npm run build -w @habitpair/habits-api`) — 2910700
- [x] 2.3 Guard + habits unit tests pass (`npm test -w @habitpair/habits-api`) — 2910700
- [x] 2.4 E2E: empty title → 400; shared-secret token accepted (`npm run test:e2e -w @habitpair/habits-api`) — 2910700
- [x] 2.5 Lint passes (`npm run lint -w @habitpair/habits-api`) — 2910700

#### Manual
- [x] 2.6 auth-api login token accepted by habits-api `GET /habits` (200); wrong-secret token → 401 — 2910700
- [x] 2.7 `POST /habits` with `{}` returns 400, not 500 — 2910700

### Phase 3: Frontend auth plumbing

#### Automated
- [x] 3.1 Typecheck passes (`npm run typecheck -w @habitpair/web`) — cc38b22
- [x] 3.2 Unit tests pass — single-flight refresh, storage persist/clear, 401-retry, failed-refresh clears + fires `onAuthCleared` (`npm run test -w @habitpair/web`) — cc38b22
- [x] 3.3 Lint passes (`npm run lint -w @habitpair/web`) — cc38b22

#### Manual
- [x] 3.4 Token store survives a manual reload when seeded with a valid refresh token — fa39f24

### Phase 4: Frontend auth UX + route gating

#### Automated
- [x] 4.1 Typecheck passes (`npm run typecheck -w @habitpair/web`) — fa39f24
- [x] 4.2 Component tests pass — form submit + inline error (`npm run test -w @habitpair/web`) — fa39f24
- [x] 4.3 Production build succeeds, route tree generates (`npm run build -w @habitpair/web`) — fa39f24
- [x] 4.4 Lint passes (`npm run lint -w @habitpair/web`) — fa39f24

#### Manual
- [x] 4.5 Register → auto-signed-in → gated home shows email — fa39f24
- [x] 4.6 Reload → still signed in (boot exchange) — fa39f24
- [x] 4.7 Sign out → redirect to `/login`; `localStorage` refresh cleared — fa39f24
- [x] 4.8 Sign in again with same credentials → back on home — fa39f24
- [x] 4.9 Bad credentials → inline "Invalid email or password", no crash — fa39f24
- [x] 4.10 Visiting `/` while signed out → redirected to `/login` — fa39f24
- [x] 4.11 Two accounts isolated — `GET /habits` returns only the signed-in user's list — fa39f24
- [x] 4.12 Forms fully operable via keyboard (Tab / Enter) — fa39f24
