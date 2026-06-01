# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

See [@README.md](README.md) for product overview, the full Makefile-driven command reference, and AWS deploy walkthrough. This file captures only what the README does not — local conventions and non-obvious traps.

## Tripwires (read first)

- **URL prefix is asymmetric between local and prod.** Each backend calls `app.setGlobalPrefix('auth' | 'habits')` in `main.ts`, so locally a service serves `/auth/*` (e.g. `localhost:3000/auth/health`), NOT `/api/auth/*`. In prod, Traefik prepends `/api` at the gateway and routes `api.habitpair.com/api/auth/*` → auth-api `/auth/*`. When writing/curling local URLs, drop the `/api` prefix; when writing prod URLs, keep it.
- **Each backend owns its own Prisma client.** Both `apps/*-api/prisma/schema.prisma` set `output = "../generated/prisma"` to avoid hoist collisions in the monorepo's shared `node_modules`. Do not collapse them into a shared `@prisma/client` — the comment in the schema explains why. Import from `../generated/prisma` (already done via `PrismaService`).
- **One Postgres, two logical databases.** `auth` and `habits` are separate DBs on the same instance. Cross-DB queries do not exist; if data needs to flow across services it goes through HTTP + JWT, not SQL. Per-service migrations: `npm run migrate -w @habitpair/auth-api` (and `-habits`).
- **Tailwind CSS v4, not v3.** Single entry point `apps/web/src/styles.css` is just `@import 'tailwindcss';`. There is no `tailwind.config.js`; use `@theme` / `@utility` / `@source` in the CSS file. Use slash opacity (`bg-black/50`), not `bg-opacity-50`. Do not add a PostCSS pipeline — the Vite plugin (`@tailwindcss/vite`) handles it.
- **React Compiler 1.0 is on.** Wired in [apps/web/vite.config.ts](apps/web/vite.config.ts) via `@rolldown/plugin-babel` + `reactCompilerPreset`. Skip defensive `useMemo` / `useCallback` / `React.memo` — the compiler covers them. Only memoize when a value crosses into a non-React API (window listener, imperative handle, effect cleanup whose stability matters for an external subscription).
- **Generated files are write-only by tooling.** `apps/web/src/routeTree.gen.ts` (TanStack Router plugin, on save) and `apps/{auth,habits}-api/generated/` (Prisma) are clobbered on the next build. ESLint already ignores `routeTree.gen.ts`. To change a route, add/rename a file under `apps/web/src/routes/`; to change a DB type, edit `prisma/schema.prisma` and run `generate`.
- **No deep imports across `apps/*`.** `apps/habits-api` MUST NOT `import` from `apps/auth-api/src/...` and vice versa. `packages/*` is declared in [package.json](package.json) as the workspace glob for shared code, but the directory does not exist yet — create `packages/<name>/` as a new workspace when you need it. Communication between services is HTTP only.
- **Prod runs arm64 (Graviton).** [Makefile](Makefile) deploy targets pass `--platform linux/arm64`. If you `docker build` by hand for prod, do the same; local-dev images default to host arch and that's fine.

## Common commands

`make` is the entry point. `make help` lists every target; [@README.md](README.md) describes them in context. Quick reference for the handful used most often:

| Goal | Command |
|---|---|
| First-time setup (deps, Postgres, Prisma clients, migrations) | `make setup` |
| All three apps in one terminal (auth + habits + web) | `make up` |
| One workspace only | `npm run dev:auth` / `npm run dev:habits` / `npm run dev:web` |
| Lint / test / build all backends | `make lint` / `make test` / `make build` |
| Single backend test file | `npm test -w @habitpair/<service> -- <pattern>` (Jest filters by filename or `-t '<test name>'`) |
| Frontend test | `npm run test -w @habitpair/web` (Vitest) — `-- <pattern>` to filter |
| Frontend typecheck | `npm run typecheck -w @habitpair/web` (backends typecheck via `nest build`) |
| Prisma — new migration / studio | `npm run migrate -w @habitpair/<service>` / `npm run studio -w @habitpair/<service>` |

Backend test runner is **Jest 29** with `testRegex: ".*\\.spec\\.ts$"` and `rootDir: src`. Specs colocate next to source (`foo.controller.ts` + `foo.controller.spec.ts`). E2E lives in `apps/<service>/test/`. Frontend runner is **Vitest 4** — colocate specs next to source.

## Architecture

Two NestJS 11 services (`auth-api`, `habits-api`) + one Vite 8 / React 19 SPA (`web`). The SPA holds two API base URLs ([apiClient.ts](apps/web/src/lib/apiClient.ts) — `VITE_AUTH_API_URL`, `VITE_HABITS_API_URL`); in prod both resolve to `api.habitpair.com/api` and Traefik routes by path. habits-api accepts JWTs issued by auth-api, verified by a NestJS guard ([jwt.guard.ts](apps/habits-api/src/auth/jwt.guard.ts)) — there is no auth-api → habits-api session callback; the token is self-contained.

Frontend uses TanStack Router (file-based) + TanStack Query. Backend feature shape is the canonical NestJS module — one folder per feature with `feature.module.ts`, `feature.controller.ts`, `feature.service.ts` (see [apps/habits-api/src/habits/](apps/habits-api/src/habits/) as the reference). `PrismaService` is provided by `PrismaModule` and injected — never import `PrismaClient` directly from a controller/service. Config is read via `@nestjs/config` (`ConfigModule.forRoot({ isGlobal: true })`) — avoid `process.env` outside `main.ts`. Health is served at `/<prefix>/health` via `@nestjs/terminus`; add new probes to the existing `HealthController`, not as ad-hoc routes.

Request validation is currently inline (`if (!body.title) throw new BadRequestException(...)` — see [habits.controller.ts](apps/habits-api/src/habits/habits.controller.ts)). A `class-validator` + `ValidationPipe` convention has not been chosen yet — if you introduce one, do so consistently across both services and remove the inline checks in the same change.

## Frontend layout (`apps/web/src/`)

- `routes/` — file-based, TanStack Router regenerates `routeTree.gen.ts` on save.
- `lib/` — API clients, `queryClient`, query/mutation helpers keyed by entity.
- `components/`, `hooks/`, `types/` — **do not exist yet.** Create them when needed (the first feature sets the precedent silently otherwise). PascalCase for components, `useFoo.ts` exports `useFoo`.
- Styles: `styles.css` only; no CSS modules.

## CI & deploys

GitHub Actions, **path-filtered per app** — a change to `apps/auth-api/**` only triggers auth-api's `*-test` and `*-deploy` workflows (see [.github/workflows/](.github/workflows/)). Backend test workflows spin up a real Postgres 16 service container and run `migrate:deploy` before tests, so a broken migration fails CI, not prod. CodeQL + gitleaks run weekly and on PR.

When you bump a workspace's `package.json`, also re-run `npm install` at the repo root — the lockfile lives there, not in the workspace.

<!-- BEGIN @przeprogramowani/10x-cli -->

## 10xDevs AI Toolkit - Module 2, Lesson 3

Review AI-generated code before merge with the **implementation review chain**:

```
/10x-implement -> /10x-impl-review -> triage -> (/10x-lesson | fix | skip | disagree)
```

`/10x-impl-review` is the lesson focus. Review is a quality gate, not an instruction to fix every finding.

### Task Router - Where to start

| Skill | Use it when |
| --- | --- |
| **Code review (lesson focus)** | |
| `/10x-impl-review <change-id>` | You have implemented code and want a structured review before merge. The skill checks plan adherence, scope discipline, safety and quality, architecture, pattern consistency, and success criteria, then presents findings for triage. |
| **Recurring lesson outcome** | |
| `/10x-lesson` | A finding reveals a recurring project rule or agent failure pattern. Record it in `context/foundation/lessons.md` instead of treating it as a one-off note. |

### Triage discipline

- Severity says how bad the finding is. Impact says how much the decision matters now.
- Valid outcomes: fix now, fix differently, skip, accept as risk, record as recurring rule (`/10x-lesson`), disagree.
- Fix critical findings. Do not burn hours on low-impact observations just because the agent found them.
- Conscious skipping of low-impact findings is a valid review outcome, not negligence.
- If you disagree with a finding, record why. Wrong agent reasoning is also signal.

### Review boundaries

- This lesson reviews implemented code. It does not create the plan, execute new phases, or teach CI review.
- Testing strategy and quality gates are introduced in Module 3.
- Do not use `/10x-contract` as a triage outcome in this lesson.

### Paths used by this lesson

- `context/changes/<change-id>/plan.md` - expected implementation contract
- `context/changes/<change-id>/reviews/` - review output
- `context/foundation/lessons.md` - recurring lessons

Skills must not write to `context/archive/`. Archived changes are immutable; if a resolved target path starts with `context/archive/`, abort with: "This change is archived. Open a new change with `/10x-new` instead."

<!-- END @przeprogramowani/10x-cli -->
