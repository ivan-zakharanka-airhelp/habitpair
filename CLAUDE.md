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

## 10xDevs AI Toolkit - Module 3, Lesson 2

Lesson 2 is about **writing tests that actually protect code** — not just maximise coverage. The oracle problem and vibe-testing anti-patterns explain why LLM-generated tests fail on real code; the risk-first quality contract from Lesson 1 is the fix.

```
context/foundation/test-plan.md (§3 Phased Rollout)
        │
        ▼  (one rollout phase at a time)
   /10x-research  ──►  research.md  (oracle source: what code should do, not what it does)
        │
        ▼
   /10x-plan  ──►  plan.md  (cost × signal, two-layer strategy, ordered phases)
        │
        ▼
   /10x-implement  or  /10x-tdd   ──►  working tests + §6 cookbook update
```

`/10x-tdd` is an **optional test-first mode**, not a replacement for the chain. It reads the same `plan.md`, writes to the same `## Progress` section, and covers the same phases as `/10x-implement`. Use it only when you can name the first failing assertion before writing any code.

### Task Router — Where to start

| Skill / Prompt | Use it when |
| --- | --- |
| `/10x-research` | Before writing any test for a risk. Research produces the oracle — what behaviour a test must prove — from sources (PRD, tech-stack, docs), not from the implementation shape. Also reveals whether a risk is already covered or has two separate faces (one safe, one real). |
| `/10x-plan` | Research is done. Plan decomposes the risk into ordered phases: environment setup first, then rules that depend on it, then hermetic stubs for failures that real infra cannot trigger, then cookbook update. Each phase names the behaviour it asserts and the regression it catches. |
| `/10x-implement` | Default executor for plan phases. Use for environment setup, existing code, scaffolding, and any phase where you cannot define a red test before writing code. |
| `/10x-tdd` | Optional. Use instead of `/10x-implement` for a phase where you can name the first red test in one sentence. Agent writes the failing test first, then the minimal code to green it, then refactors. Stops at the assertion before touching the implementation — that pause is the point. |
| `m3l2-ad-hoc-testing` prompt | You have a single file and want tests now, without the full research→plan→implement cycle. The prompt forces oracle-from-sources (reads PRD + TECH_STACK before asserting), behavioural assertions, edge cases from risk, and a regression table. Use it knowing you are trading depth for speed. |

### When to use `/10x-tdd` vs `/10x-implement`

The deciding question: *Can you name the first red test in one sentence?*

Good conditions for `/10x-tdd`:
- "promuje wyłącznie drafty w stanie `accepted`, a `pending`/`rejected` nigdy nie trafiają do talii"
- "zwraca `ok: true` i loguje `orphan_review_state`, gdy upsert stanu powtórek padnie w trakcie zapisu"
- "zwraca 401, gdy użytkownik nie ma dostępu do kursu"
- "resetuje interwał powtórki do jednego dnia, gdy ocena wynosi 0"

Each of these names an observable outcome, not an internal detail. If you cannot produce a sentence like this, stay on `/10x-implement` or return to `/10x-research`.

`/10x-tdd` is **not suited** for: environment setup, CI/CD config, documentation, thin wiring where the test would just rewrite the implementation, or a spike where you are still discovering the contract.

You can mix both modes in one plan:

```
/10x-implement <change-id> phase 1   # environment
/10x-tdd       <change-id> phase 2   # contract (new code)
/10x-tdd       <change-id> phase 3   # contract (API endpoint)
/10x-implement <change-id> phase 4   # cookbook + plan sync
```

Both write progress to the same `## Progress` section in `plan.md`.

### Two-layer test strategy (cost × signal)

For each risk, pick the **cheapest test that gives a real signal**. Do not default to e2e "because it's safest", and do not chase coverage percentage.

| Layer | When to use | When NOT to use |
| --- | --- | --- |
| Integration (real DB / real infra) | The rule involves DB constraints, cascades, real SQL, or unique constraints that a mock would lie about. | Auth flows gated by RLS that belong to a separate phase; anything where setup cost exceeds signal value. |
| Hermetic (stub client) | Partial failures that real infra cannot trigger easily (e.g. second operation in a sequence fails). | Rules that depend on actual DB state — a stub will lie about constraint violations and cascades. |

A non-atomic save sequence (multiple independent operations without a transaction) means: write hermetic tests for partial-failure branches, not integration tests that force a mid-sequence error.

### Oracle rules

- The oracle — what the code *should* do — must come from sources: PRD, docs, tech-stack constraints, domain knowledge. It must **not** come from reading the implementation.
- If the implementation has a bug, copying its output as the expected value produces a mirror test that passes against the bug.
- When sources do not resolve the expected behaviour unambiguously, **stop and ask** rather than guessing.
- Research's job is to surface the oracle before any test is written.

### Vibe-testing anti-patterns to avoid

| Anti-pattern | How it looks | What to do instead |
| --- | --- | --- |
| Mirror implementation | Assertion computes the expected value with the same logic as the tested code. | Assert against a value derived from the oracle (PRD / domain rule), not from the implementation. |
| Happy paths only | Tests only pass valid inputs; edge cases absent. | Add at least one edge case per risk: `null`, empty, dependency error, invalid input. |
| Redundant copies | Six nearly identical tests checking the same absence of a sentinel. | One parameterised test (`it.each`) per property; each test catches a different regression. |

### Mutation testing (Stryker) — selective quality gate

Coverage says "this line was executed". Mutation score says "would a test fail if I broke this line?" Use Stryker as a **selective gate** after a risk phase, not as a CI gate on every commit.

Workflow:
1. Tests pass for the risk phase.
2. Run `npx stryker run --mutate "path/to/file.ts"` (narrow scope to the changed module).
3. Open the HTML report; find survived mutants.
4. For each survived mutant ask: "Would this change hurt a user or the business?"
   - Yes → add an assertion that kills the mutant.
   - No (equivalent mutant or cosmetic change) → ignore consciously.
5. Do not chase 100% mutation score. A test that pins implementation details to kill a cosmetic mutant is itself a vibe test.

The integration gate can stay **ad hoc** (not on every commit) when running local infra is expensive. Mark it accordingly in `test-plan.md §4`.

### Lesson boundaries

- Do not configure hooks, hook lifecycle, or debugging hooks. That is Lesson 3.
- Do not configure MCP servers, Playwright API, e2e code, or multimodal scenario code. That is Lesson 4.
- Do not run the bug-to-fix-to-regression-test workflow. That is Lesson 5.
- Do not author CI/CD pipelines from scratch. That is Module 1 Lesson 5 / Module 2 Lesson 5.
- Do not run `/10x-test-plan` to change the risk strategy. That is Lesson 1. Use `/10x-test-plan --status` to read current state.
- Do not write tests without a research step unless using the ad-hoc prompt with full awareness of its trade-offs.

### Paths used by this lesson

- `context/foundation/test-plan.md` — §3 rollout state; §6 cookbook (filled in as phases ship)
- `context/changes/<change-id>/research.md` — oracle source per rollout phase
- `context/changes/<change-id>/plan.md` — ordered phases with `## Progress` as execution state
- `.claude/prompts/m3l2-ad-hoc-testing.md` — ad-hoc file-level testing prompt

<!-- END @przeprogramowani/10x-cli -->
