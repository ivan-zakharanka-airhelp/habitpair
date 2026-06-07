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

## 10xDevs AI Toolkit - Module 3, Lesson 3

Lesson 3 is about **hooks** — turning the quality gates from Lesson 1 and the tests from Lesson 2 into automatic, deterministic checks that fire while the agent works. A hook runs outside the model, so it survives context compression, instruction changes, and the model "forgetting". The payoff for agentic hooks specifically: a `PostToolUse` check can feed its result back into the agent's context, so the agent fixes trivial errors (formatting, a missing import, a wrong type) on its own in the next iteration instead of you discovering them minutes later.

```
context/foundation/test-plan.md  (§4 Quality Gates: which check, required when)
        │
        ▼  (assign each gate to the cheapest layer that still gives signal)
   per-edit (agent hooks)  →  pre-commit (git hooks)  →  pre-push  →  CI
        │ lint, format, scoped tests          │ staged       │ heavier    │ integration
        ▼
   exit code + stdout  →  additionalContext  →  agent reacts next turn
```

### Task Router — Which layer for this check

| You want to | Do this |
| --- | --- |
| React the instant the agent edits a file | A per-edit hook (`PostToolUse` matcher `Write\|Edit` in Claude Code). Right for fast checks: lint/format, and scoped tests on risk-area files. This is the **only** layer that can hand feedback to the agent mid-session. |
| Run only the tests that depend on the edited file | Parse the path from the hook's stdin (`jq -r .tool_input.file_path`) and run your runner's related-tests mode (`vitest related "$FILE" --run`, `jest --findRelatedTests $FILE`). Gate it on whether the file is a risk area in `test-plan.md`; don't run tests on every helper or config edit. |
| Catch changes that bypassed the agent (manual edits, a teammate's commit) | A pre-commit git hook (Lefthook or Husky+lint-staged) over staged files: lint + typecheck, and tests on staged risk files. |
| Run heavier checks before code leaves the machine | Pre-push: full typecheck or a broader test set. Anything too slow for per-edit moves here. |
| Decide where a given gate belongs | Ask: is it fast enough (a few seconds) for per-edit, or should it wait for commit/push/CI? Slow checks block the agent loop on every edit — push them up a layer. |
| Use the same hook across tools | The trigger → matcher → handler → signal pattern is the same in Cursor, Codex, Windsurf, and Copilot; only the config file and event names change. See the cross-tool table below. |

### Hook lifecycle — the universal pattern

Every tool's hooks follow four steps:

1. **Trigger** — an event in the tool (e.g. the agent just saved a file: `PostToolUse`).
2. **Matcher** — a filter deciding whether this hook runs (tool name like `Write`/`Edit`, file type, or a name pattern).
3. **Handler** — the action that runs, usually a shell command.
4. **Signal** — the result returns to the tool. The exit code says pass/fail; stdout can flow into the agent's context as feedback.

### Exit codes and the feedback loop

- **0** — success; the hook passed, continue.
- **2** — blocking error; the agent sees the feedback and should react.
- **anything else** — non-blocking error; logged, but does not interrupt work.

On a blocking failure, stdout flows into the agent's context (in Claude Code via `additionalContext`, capped at 10,000 characters; other tools have similar mechanisms with their own limits). That is why the agent can self-correct: it sees the concrete message — missing type, unimported module, badly formatted line — not just "something failed".

The boundary: the agent reliably fixes **trivial** corrections on its own. When a test fails because of wrong business logic, the hook surfaces it but the agent may not diagnose the real cause — it says "something is off" and tries a trivial fix. If that does not resolve in one or two tries, the signal comes back to you, and the problem may deserve its own change-id with the full `/10x-new → /10x-research → /10x-plan → /10x-implement` workflow.

### Three local layers (plus CI)

| Layer | Catches | Timing |
| --- | --- | --- |
| Per-edit (agent hooks) | Formatting, simple type errors, failing unit tests on risk files. Only layer that feeds the agent mid-work. | ms–s |
| Pre-commit (git hooks) | What slipped past per-edit: manual edits, files changed outside the hook, checks too slow for per-edit. Operates on staged files. | s |
| Pre-push | Heavier checks before pushing to remote (full typecheck, broader test set). | s–min |
| CI | Integration problems, cross-module dependencies, checks needing infra unavailable locally. | min |

Local layers do **not** replace CI — CI stays the key verification for shared repo state and environments you don't control. But each local layer that catches an error is one fewer CI round-trip. You don't need all layers from day one: start with one per-edit hook (lint) and one commit gate, add layers as you see what escapes. The quality gates in `test-plan.md §4` decide which checks are worth automating and when; a plan may legitimately defer per-edit hooks if the cost/signal ratio isn't there yet.

### Key rules

- Keep per-edit hooks fast. If a check takes more than a few seconds, move it to commit, push, or CI — a slow per-edit hook blocks the agent loop on every edit. Lint/format are ideal per-edit; full typecheck is often a commit gate in larger projects.
- Run scoped tests, not the whole suite, per edit — only tests related to the edited file, and only when that file is a risk area in `test-plan.md`.
- `related` is a subcommand, not a flag (`vitest related`, not `--related`). Use `--run` so the hook terminates instead of entering watch mode.
- `PostToolUse` fires once per tool use; three edits in one turn fire it three times independently — there is no built-in aggregation.
- The git hook tool (Lefthook vs Husky+lint-staged) is an implementation detail; the rule is the same — run checks on staged files before commit. If Husky already works, don't migrate.
- **Context injection is not universal.** Claude Code, Cursor, Codex, and Copilot (in VS Code) can pass a hook's result to the agent; Windsurf cannot — it can block (exit 2) but can't tell the agent what went wrong.

### The same pattern in every tool

| Tool | Events | Handlers | Context injection | Config |
| --- | --- | --- | --- | --- |
| Claude Code | ~30 | command, http, mcp_tool, prompt, agent | yes | `.claude/settings.json` |
| Cursor | ~18 | command, prompt | yes | `.cursor/hooks.json` |
| Codex | 10 | command | yes | `.codex/hooks.json` |
| Windsurf | 12 | command | **no** | `.windsurf/hooks.json` |
| Copilot | ~13 | command, http, prompt | yes (VS Code) | `.github/hooks/*.json` |

### Lesson boundaries

- This lesson configures hooks and local quality layers only. The hook JSON, `lefthook.yml`, and the per-edit/commit/push layering are the scope.
- Do not write E2E tests, configure Playwright/MCP, or run browser scenarios. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test debugging workflow. That is Lesson 5.
- Do not change the risk strategy or quality-gate definitions. That is Lesson 1 (`/10x-test-plan`); read current state with `/10x-test-plan --status`.
- Do not write unit/integration test code from scratch here. That is Lesson 2 — hooks only *run* the tests those lessons produced.
- Do not author CI/CD pipelines. That is Module 1 Lesson 5 / Module 2 Lesson 5; hooks are the local layers in front of CI.

### Paths used by this lesson

- `.claude/settings.json` — hook configuration (`~/.claude/settings.json` global, `.claude/settings.json` project, `.claude/settings.local.json` local overrides). Other tools use their own config file (see the table).
- `lefthook.yml` — pre-commit git hook config (lint + typecheck + tests on `{staged_files}`).
- `context/foundation/test-plan.md` — §4 quality gates decide which checks to automate and at which layer; risk areas decide which edits warrant scoped tests.

<!-- END @przeprogramowani/10x-cli -->
