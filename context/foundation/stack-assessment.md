---
project: habitpair
assessed_at: 2026-05-25
agent_readiness: ready-with-compensation
context_type: brownfield
stack_components:
  language: TypeScript 5.7-5.8 (strict)
  framework: NestJS 11 (APIs) + React 18 + TanStack Router (web)
  build_tool: Vite 7 (web) / nest build (APIs)
  test_runner: Jest 29 (APIs) + Vitest 4 (web)
  package_manager: npm (workspaces)
  ci_provider: GitHub Actions
  deployment_target: AWS k3s via Terraform (APIs, GHCR images) + S3 + CloudFront (web); local via Skaffold + k3d
gates_passed: 4
gates_failed: 0
---

## Stack Components

**Monorepo shape.** npm workspaces with two backend services (`apps/auth-api`, `apps/habits-api`) and a single-page web client (`apps/web`). The root `package.json` orchestrates dev across the three workspaces via `concurrently`. The `packages/*` glob is declared in workspaces but currently empty — no shared package exists.

**Language.** TypeScript 5.7 (web) and 5.8 (APIs). Both API tsconfigs and the web tsconfig set `strict: true`; the web config additionally enables `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, and `isolatedModules`. Node engine pinned to `>=22` in every workspace and `.nvmrc = 22`.

**Backend framework.** NestJS 11 (`@nestjs/common`, `@nestjs/core`, `@nestjs/platform-express`, `@nestjs/config`, `@nestjs/terminus`). Decorator-based modules + DI; `habits-api` additionally pulls `@nestjs/jwt`. Both services follow the standard NestJS layout (`*.module.ts` + `*.controller.ts` + `*.service.ts` siblings under `src/`).

**ORM.** Prisma 6 per service. Each service's `schema.prisma` outputs the generated client to a service-local `apps/<svc>/generated/prisma/` path (custom `generator client output`) so the two services don't collide in the hoisted `node_modules/.prisma/client`. PostgreSQL 16 in Docker for local dev (`infra/docker/docker-compose.yaml`).

**Frontend framework.** React 18 with TanStack Router (file-based, `apps/web/src/routes/__root.tsx` + `index.tsx`, generated tree at `routeTree.gen.ts`) and TanStack React Query for data fetching. Routing wired through `TanStackRouterVite({ target: 'react', autoCodeSplitting: true })` in `vite.config.ts`. Styling via Tailwind 4 (`@tailwindcss/vite`).

**Build / bundler.** Vite 7 for the web SPA. NestJS CLI's `nest build` (tsc-based) for the two APIs.

**Test runner.** Jest 29 + ts-jest for both APIs (with a separate `test/jest-e2e.json` config); Vitest 4 for the web. supertest 7 for API e2e. None of the apps have committed test files beyond the `--passWithNoTests` guard.

**Linter & formatter.** ESLint 9 (flat config, `eslint.config.mjs`) + typescript-eslint 8 + Prettier 3 + eslint-config-prettier across all three workspaces. Auth-api ESLint config warns on `no-explicit-any` and ignores `_`-prefixed unused args.

**CI/CD.** GitHub Actions with per-app workflows: `auth-api-test.yaml`, `habits-api-test.yaml`, `web-test.yaml` (PR + main push, path-filtered), matching `*-deploy.yaml` workflows, plus `codeql.yml`, `gitleaks.yml`, `infra-ci.yaml`. API test workflows spin up Postgres 16 as a service container and run `prisma migrate deploy` before `npm test`.

**Deployment.** Two targets:
- APIs → AWS k3s on EC2, provisioned via Terraform (`infra/terraform/`), images pushed to GHCR (`ghcr.io/ivan-zakharanka-airhelp/habitpair/...`), rolled out with `kubectl set image`. Manifests under `infra/k8s/overlays/aws` (kustomize).
- Web → S3 bucket fronted by CloudFront; `index.html` set `no-cache`, assets `immutable`.
- Local k8s loop available via `skaffold dev --port-forward` against a k3d cluster.

**Instruction files.** A root `CLAUDE.md` exists but is scoped to the 10xDevs Module 1 lesson narrative (talks about `/10x-tech-stack-selector`, `/10x-bootstrapper`, etc.). It carries **no project-level coding conventions** — no description of the multi-service architecture, the JWT contract between the two APIs, the per-service Prisma output trick, the monorepo layout rules, or the deployment paths. No `AGENTS.md` and no `.cursor/rules` directory.

## Quality Gate Assessment

| Component                       | Typed | Convention | Training Data | Documented | Verdict |
|---------------------------------|-------|------------|---------------|------------|---------|
| Language (TypeScript, strict)   |  ✓    |  —         |  —            |  —         | pass    |
| Backend (NestJS 11)             |  —    |  ✓         |  ✓            |  ✓         | pass    |
| ORM (Prisma 6)                  |  —    |  ✓         |  ✓            |  ✓         | pass    |
| Frontend (React 18)             |  —    |  ~         |  ✓            |  ✓         | partial |
| Router (TanStack Router)        |  —    |  ✓         |  ~            |  ✓         | partial |
| Build / bundler (Vite 7)        |  —    |  ✓         |  ✓            |  ✓         | pass    |
| Test runner — APIs (Jest 29)    |  —    |  —         |  ✓            |  ✓         | pass    |
| Test runner — web (Vitest 4)    |  —    |  —         |  ✓            |  ✓         | pass    |

Legend: ✓ = pass, ✗ = fail, ~ = partial, — = not applicable

Overall: **four criteria met across the stack**, with two partials that are mitigated by compensation rather than blockers.

### Gate Details

**Typed — pass.** TypeScript with `strict: true` enforced in every workspace (`apps/auth-api/tsconfig.json:15`, `apps/habits-api/tsconfig.json` same shape, `apps/web/tsconfig.json:15`). Prisma generates fully-typed clients per service (`schema.prisma` declares `generator client { provider = "prisma-client-js"; output = "../generated/prisma" }`). NestJS decorator metadata + DI means handler/service contracts are explicit in source. The web tsconfig adds `verbatimModuleSyntax` and `isolatedModules`, the strictest practical config. No `any`-leaking surfaces detected; ESLint warns on `no-explicit-any` (`apps/auth-api/eslint.config.mjs:17`).

**Convention-based — pass for backend, partial for frontend.**
- *NestJS* is convention-driven by definition: modules + controllers + services + DI. `apps/auth-api/src/app.module.ts`, `apps/auth-api/src/health/health.module.ts` + `health.controller.ts` follow the canonical pattern, and `nest-cli.json` plus the `dist/`-out build is conventional NestJS.
- *Prisma* enforces `prisma/schema.prisma` + `prisma/migrations/` + a single client generator — strong convention.
- *TanStack Router* enforces file-based routes (`apps/web/src/routes/__root.tsx` + `index.tsx`), with `routeTree.gen.ts` committed and regenerated by the Vite plugin — strong convention for routing.
- *React app shape outside routes*: weak. There is a `src/lib/` directory but no documented rule for where features, queries, mutations, hooks, or components live. The monorepo is small enough that this is not biting today, but it is the soft spot.

**Popular in training data — pass overall, partial on the router (assessed within JS/TS family).** NestJS, React, Prisma, Vite, Vitest, and Jest are all top-tier within JS/TS. TanStack Router went 1.0 relatively recently and has materially less corpus than React Router or Next.js routing — the agent has internalized TanStack Query much more deeply than TanStack Router. Not a fail (it is mainstream within the TanStack family the agent knows), but worth steering with examples.

**Well-documented — pass.** Every framework in the stack ships current, versioned docs: docs.nestjs.com, react.dev, tanstack.com/router, tanstack.com/query, prisma.io/docs, vite.dev, vitest.dev, jestjs.io.

## Gaps & Compensation

The stack passes all four criteria when scored component-by-component, so the gaps that follow are not gate failures — they are *integration-level* conventions the framework can't enforce on its own. In a multi-app monorepo with two NestJS services + a SPA + custom infra, the load-bearing knowledge lives between the components, not inside any one of them. The agent needs an instruction file that names those joins explicitly.

### Gap 1 — Cross-service contracts are undocumented

`auth-api` issues credentials; `habits-api` consumes JWTs (`@nestjs/jwt` is in habits-api but not auth-api). How tokens are signed, what claims they carry, which secret/key the two services share, how rotation works — none of this is captured in code that the agent can read top-down. Today an agent reading `habits-api/src` would have to reverse-engineer the contract from the JWT middleware.

### Gap 2 — Per-service Prisma client output trick is non-obvious

Each `schema.prisma` writes its generated client to `apps/<svc>/generated/prisma/` rather than the default `node_modules/.prisma/client` location, because the hoisted root would let one service overwrite the other. An agent unfamiliar with this trick may "fix" it back to defaults and break the build.

### Gap 3 — Web app shape outside routes is by convention only

TanStack Router governs the `routes/` directory; the rest of `apps/web/src/` (`lib/`, future `components/`, `features/`, `hooks/`, etc.) has no enforced layout. Today the app is minimal so the gap is not paying friction; once a third route lands, an undocumented layout will diverge per-PR.

### Gap 4 — TanStack Router idioms aren't framework-popular yet

The agent knows React Router and Next.js routing far better than TanStack Router. Without examples in an instruction file, completions will tend to drift toward React Router idioms (`useNavigate` from `react-router-dom`, declarative `<Route>` trees, etc.) rather than TanStack Router's `createFileRoute`, `Route.useLoaderData`, `beforeLoad`, etc.

### Gap 5 — CLAUDE.md is lesson-scoped, not project-scoped

The root `CLAUDE.md` is currently the 10xDevs Module 1 narrative — it tells the agent how to use `/10x-tech-stack-selector`, not how to navigate or extend `habitpair`. Either CLAUDE.md needs a project-conventions section appended below the lesson content, or the project conventions should land in `AGENTS.md` (the lesson content can stay in CLAUDE.md without interference).

### Recommended Instruction File Additions

Below are ready-to-paste blocks for `AGENTS.md` (or appended to `CLAUDE.md` below the lesson scaffolding). Each one directly closes a gap above.

```markdown
## Architecture — services & boundaries

habitpair is an npm-workspaces monorepo with three apps:

- `apps/auth-api` (NestJS 11) — owns user accounts, signup, sign-in, and JWT issuance. Database: `habitpair` (PostgreSQL).
- `apps/habits-api` (NestJS 11) — owns habits, daily marks, and habit-level statistics. Database: `habits_service` (PostgreSQL). Consumes JWTs issued by `auth-api` (`@nestjs/jwt` verifier).
- `apps/web` (React 18 + Vite + TanStack Router) — single SPA, talks to both APIs via `VITE_AUTH_API_URL` and `VITE_HABITS_API_URL`. No SSR.

The two APIs do NOT call each other. Both validate the same JWT signed by `auth-api`; the shared secret/key is supplied via env. Adding a feature that crosses services means adding a route to whichever service owns the data — never an in-process call from one Nest app to the other.

## Architecture — Prisma per service

Each service has its own `schema.prisma` and its own database. Client output is set to `output = "../generated/prisma"` so the two services do not collide in the hoisted `node_modules/.prisma/client`. Do not "fix" the output path back to defaults — the per-service path is intentional. Imports look like `import { PrismaClient } from '../../generated/prisma'`, not `@prisma/client`.

When adding a new Prisma model: `cd apps/<svc>` (or `npm run migrate -w @habitpair/<svc>`) and run `prisma migrate dev --name <change>`. Never write SQL migrations by hand.

## Backend conventions — NestJS

Each feature is its own module folder under `apps/<svc>/src/<feature>/`, containing at minimum:

- `<feature>.module.ts` — `@Module({ imports, controllers, providers, exports })`
- `<feature>.controller.ts` — HTTP surface; decorate routes with `@Get/@Post/...`
- `<feature>.service.ts` — business logic; constructor-inject `PrismaService` and other services

Register the new module in `apps/<svc>/src/app.module.ts` under `imports`. Configuration goes through `@nestjs/config` (`ConfigService.get(...)`), never `process.env` directly.

## Frontend conventions — web app layout

- `apps/web/src/routes/` — TanStack Router file-based routes. The route tree (`routeTree.gen.ts`) is auto-generated by `TanStackRouterVite`; do not hand-edit it.
- `apps/web/src/lib/` — shared utilities, API clients, and query/mutation factories.
- New screens land as a route file under `src/routes/`. Use `createFileRoute('/<path>')({ component: ... })`; data dependencies go in `loader` or `beforeLoad`. Auth gates go in `beforeLoad` on a layout route, not per-leaf-route.
- Data fetching: TanStack React Query. Hooks live in `src/lib/` (or a future `src/features/<feature>/`), shaped as `useXxxQuery` and `useXxxMutation`.
- Styling: Tailwind 4 utility classes inline in JSX. No CSS modules, no styled-components.

## Frontend conventions — TanStack Router (not React Router)

This project uses `@tanstack/react-router`, NOT `react-router-dom`. The agent's default React Router instincts do not apply. Cheat-sheet:

- Navigation hook: `useNavigate()` from `@tanstack/react-router` (returns a function), or `<Link to="/path">` from the same package.
- Reading route params: `Route.useParams()` (where `Route` is the value returned by `createFileRoute`), NOT `useParams()` from React Router.
- Reading route data: `Route.useLoaderData()`.
- Auth gate / redirect: throw `redirect({ to: '/sign-in' })` from `beforeLoad`, not via `<Navigate>`.
- Type-safe links: prefer `to: '/foo'` (Router infers the route map) over string concatenation.

When in doubt, check `apps/web/src/routes/__root.tsx` for the canonical pattern in this codebase, then the TanStack Router docs at tanstack.com/router.

## Dev loop

- Full stack locally: `make up` (Postgres + both APIs + web via concurrently).
- DB only: `make db-up`. New migrations: `make db-migrate` (auth-api) or `make db-migrate-habits`.
- Web only: `make web` (no API, no DB).
- Tests: `make test` (unit), `make test-e2e` (e2e). Both APIs use Jest + supertest; web uses Vitest.
- Lint: `make lint`. The repo runs ESLint 9 flat-config + Prettier; no editor-magic required.
```

## Summary

habitpair's stack is agent-friendly across every meaningful axis — typed end-to-end, convention-based on its load-bearing components (NestJS for both APIs, file-based TanStack routing for the web, Prisma for both DBs), built on mainstream JS/TS choices the agent has internalized, and documented by versioned official docs at every layer.

**Key strengths**
- TypeScript `strict: true` everywhere, with the web workspace adding the harder bolt-ons (`noUnusedLocals`, `verbatimModuleSyntax`).
- NestJS + Prisma + TanStack Router each ship the kind of opinionated structure the agent can navigate without per-PR explanation.
- CI is per-app, path-filtered, and runs real migrations against a real Postgres container — close to how the code actually runs.
- Deployment is reproducible (Terraform-managed) rather than click-ops.

**Key gaps (all compensable via instruction-file additions, not stack changes)**
- The two-service JWT contract isn't documented anywhere the agent can read top-down.
- The per-service Prisma client output path is a non-obvious trick that an agent could "fix" back to defaults and break the build.
- Web app layout outside `routes/` is convention-by-intuition rather than written rule.
- TanStack Router has thinner training-data than React Router, so the agent's defaults skew toward the wrong library without examples.
- The root `CLAUDE.md` currently carries only the 10xDevs lesson narrative — no project-coding context lives anywhere on disk yet.

**Recommended next step.** Run `/10x-health-check` to verify the stack's current health against the gaps identified above. Before that, paste the recommended `AGENTS.md` blocks (or append them under a `## Project context` heading in `CLAUDE.md`) so the agent reads conventions every conversation, not just when an explicit prompt remembers to mention them.
