---
project: habitpair
assessed_at: 2026-05-25
agent_readiness: ready-with-compensation
context_type: brownfield
stack_components:
  language: TypeScript
  framework: React 19.2 + TanStack Router (frontend), NestJS 11 (backends)
  build_tool: Vite 8 (frontend), nest-cli (backends)
  test_runner: Vitest 4 (frontend), Jest 29 (backends)
  package_manager: npm workspaces
  ci_provider: GitHub Actions
  deployment_target: Docker + Skaffold + k8s on AWS (Terraform-managed)
gates_passed: 4
gates_failed: 0
---

## Stack Components

**Repository shape.** habitpair is a single-repo monorepo using npm workspaces (`apps/*` + `packages/*`, though `packages/` is declared in `package.json:6` but has no contents on disk yet). The Node engine is pinned to `>=22` across all three apps. Local dev is orchestrated by `concurrently` running the three workspaces side by side (`package.json:10`).

**Frontend — `apps/web`.** TypeScript `~6.0.2` with `strict: true`, `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`, and `verbatimModuleSyntax: true` (`apps/web/tsconfig.app.json:19-23`). React 19.2 with React Compiler 1.0 wired through `@rolldown/plugin-babel` in `apps/web/vite.config.ts:12`. Routing is TanStack Router 1.170 with file-based discovery and auto code splitting (`apps/web/vite.config.ts:10`), producing the generated `apps/web/src/routeTree.gen.ts` consumed by `apps/web/src/router.tsx:2`. Data fetching is TanStack Query 5. Styling is Tailwind CSS 4 via `@tailwindcss/vite`. Build is Vite 8, tests are Vitest 4, lint is ESLint 10 + typescript-eslint + Prettier (`apps/web/eslint.config.js`).

**Backends — `apps/auth-api` and `apps/habits-api`.** Both are NestJS 11 services on TypeScript `~5.8` with `strict: true`, decorator metadata, and CommonJS module output (`apps/auth-api/tsconfig.json:14`, `apps/habits-api/tsconfig.json`). Both ship with `@nestjs/config`, `@nestjs/terminus` for health checks, and Prisma 6 as the ORM (each app has its own `prisma/` directory and `generated/` client output). `apps/habits-api` additionally pulls in `@nestjs/jwt` for token verification. Tests use Jest 29 + ts-jest + supertest, with a NestJS-standard `jest` block in each `package.json`. Lint is ESLint 9 + typescript-eslint + Prettier. The minimal `apps/auth-api/src/app.module.ts:1-15` shows the canonical NestJS module composition (`ConfigModule.forRoot({ isGlobal: true })`, `PrismaModule`, `HealthModule`).

**Build, deployment, and infrastructure.** Each backend has its own `Dockerfile`; local dev pulls images via `infra/docker/docker-compose.yaml`. Production deployment is Skaffold-driven into k8s manifests under `infra/k8s/`. All AWS infrastructure (EC2, RDS, ACM, DNS, security groups, frontend bucket, SSH key) is Terraform-managed under `infra/terraform/`. CI/CD is GitHub Actions: per-app `*-test.yaml` and `*-deploy.yaml` workflows, plus `codeql.yml`, `gitleaks.yml`, and `infra-ci.yaml`.

**Instruction files.** `CLAUDE.md` is present at repo root but its content is exclusively the 10xDevs Lesson 3 / bootstrapper scaffolding guide — it carries no project conventions about how to add a new route, where shared types live, how DTOs are validated, or how the React Compiler interacts with manual memoization. There is no `AGENTS.md`, no `.cursor/rules`, no `.github/copilot-instructions.md`.

## Quality Gate Assessment

| Component                       | Typed | Convention | Training Data | Documented | Verdict |
|---------------------------------|-------|------------|---------------|------------|---------|
| TypeScript (language)           | ✓     | —          | —             | —          | pass    |
| React 19 + TanStack Router      | —     | ✓          | ✓             | ✓          | pass    |
| NestJS 11                       | —     | ✓          | ✓             | ✓          | pass    |
| Vite 8 (build)                  | —     | ✓          | ✓             | ✓          | pass    |
| Vitest 4 (test, frontend)       | —     | ✓          | ✓             | ✓          | pass    |
| Jest 29 (test, backends)        | —     | ✓          | ✓             | ✓          | pass    |
| Prisma 6 (ORM)                  | ✓     | ✓          | ✓             | ✓          | pass    |
| Tailwind CSS 4                  | —     | ✓          | ~             | ✓          | pass-w/note |
| React Compiler 1.0              | —     | ✓          | ~             | ✓          | pass-w/note |

Legend: ✓ = pass, ✗ = fail, ~ = partial (covered by compensation below), — = not applicable.

### Gate details

**Type safety.** TypeScript with `strict: true` everywhere. Frontend additionally enforces `noUnusedLocals`, `noUnusedParameters`, and `verbatimModuleSyntax: true` — agents will get immediate feedback on dead imports and ambiguous type-vs-value imports. Prisma adds generated typed clients on the backend (the `generated/` directory in each API). Evidence: `apps/web/tsconfig.app.json:19`, `apps/auth-api/tsconfig.json:14`, both `apps/*-api/prisma/` directories.

**Convention strength.** NestJS is one of the most opinionated Node frameworks shipping (module → controller → service → provider, decorator-driven DI, file naming by suffix `*.module.ts` / `*.controller.ts` / `*.service.ts`, `nest-cli.json` driving builds). TanStack Router supplies the equivalent for the frontend via file-based routing — every route lives as a file under `apps/web/src/routes/` and the router-plugin regenerates `routeTree.gen.ts` on save (`apps/web/vite.config.ts:10`). Prisma's schema-first, single-source-of-truth model is itself a strong convention. Evidence: `apps/auth-api/src/app.module.ts:1-15` (canonical NestJS module shape), `apps/web/eslint.config.js:11` (the generated routeTree is explicitly ignored, confirming the convention), `nest-cli.json` present in both backends.

**Training-data coverage.** Every primary framework choice (React, NestJS, Vite, Vitest, Jest, Prisma, TanStack Router, TanStack Query) is squarely in the popular-JS/TS bucket. Two components sit on recent majors where the agent's default idiom lean is toward the prior major:
- **Tailwind CSS 4** introduced the CSS-first config (`@import "tailwindcss"` in a CSS file) and the `@tailwindcss/vite` plugin in place of the v3 PostCSS pipeline. Most training-data examples are still v3. Agents will reach for `tailwind.config.js` files and `@tailwind base/components/utilities` directives unless steered. The compensation section below pins the v4 patterns.
- **React Compiler 1.0** changes the meaning of `useMemo` / `useCallback` / `memo()` — the compiler covers most cases the prior idiom hand-rolled. Untreated, the agent will continue to wrap callbacks and values defensively, producing redundant code. The compensation section pins the rule.

**Documentation quality.** Every component has current, versioned official docs at a canonical URL (react.dev, tanstack.com, docs.nestjs.com, vitejs.dev, vitest.dev, jestjs.io, prisma.io, tailwindcss.com). No stack component depends on community wikis or out-of-sync blog posts.

## Gaps & Compensation

No gate fully fails. Two soft-gap pockets and several **convention gaps the framework leaves to the project** warrant concrete instruction-file entries before agent-assisted work scales. Compensation is concrete and limited — not heavy.

### Soft gaps (training-data drift on recent majors)

1. **Tailwind v4 vs v3.** Agents will default to v3 patterns (config-as-JS, PostCSS, `@tailwind` directives, named utility classes like `bg-opacity-50`). v4 has CSS-first config, the dedicated `@tailwindcss/vite` plugin, and renamed utilities. Compensation: pin the v4 patterns in `CLAUDE.md` (see entry T-1 below).
2. **React Compiler 1.0 memo semantics.** Agents will reach for `useMemo` / `useCallback` / `memo()` for cases the compiler now covers. Compensation: a one-paragraph rule in `CLAUDE.md` naming when manual memoization is still required (deps used outside the component scope, refs into imperative APIs, etc.) and when to trust the compiler (default).

### Project conventions the framework leaves open

3. **Frontend code organization beyond routes.** TanStack Router dictates where routes live; nothing tells the agent where components, hooks, API clients, or types go. Today `apps/web/src/` has only `lib/`, `routes/`, `main.tsx`, `router.tsx`, `styles.css` — no `components/`, no `hooks/`. The first feature work will set the precedent silently unless documented now. Compensation: name the folder layout explicitly (entry F-1 below).
4. **Generated file no-touch rule.** `apps/web/src/routeTree.gen.ts` is regenerated by the router-plugin on save. ESLint already ignores it (`apps/web/eslint.config.js:11`), but no human- or agent-facing rule says "never hand-edit this." Compensation: one line in `CLAUDE.md` (entry F-2).
5. **Backend conventions NestJS leaves to the project.** NestJS supplies the module/controller/service skeleton but the project picks where DTOs live, how request validation is wired (`class-validator` + `ValidationPipe`, Zod, hand-rolled), how Prisma is accessed (PrismaService injection vs. direct client), and how cross-cutting errors are surfaced. None of the current source documents these choices. Compensation: a `## Backends` section in `CLAUDE.md` (entry B-1).
6. **Shared types between `auth-api` and `habits-api`.** `packages/*` is declared as a workspace glob in `package.json:6` but the directory is empty. The habits-api validates JWTs that the auth-api issues — any shared shape (token payload, error envelope, user identity) currently has nowhere to live. Compensation: decide and document where shared types go (entry M-1).
7. **No AGENTS.md.** Other agent tooling reads `AGENTS.md` rather than `CLAUDE.md`. Compensation: create a thin `AGENTS.md` that delegates to `CLAUDE.md`, or duplicate the load-bearing sections.

### Recommended Instruction File Additions

Ready-to-paste blocks for `CLAUDE.md` (or `AGENTS.md`). Drop these in below the current 10xDevs scaffolding content.

---

**Entry T-1 — Tailwind CSS v4 idioms**

```markdown
## Styling — Tailwind CSS v4

This project uses Tailwind CSS v4, not v3. The differences matter:

- Config lives in CSS, not JS. There is no `tailwind.config.js`. Theme tokens, custom utilities, and content paths are declared via `@theme`, `@utility`, and `@source` blocks inside `apps/web/src/styles.css`.
- The entry point is `@import "tailwindcss";` at the top of `apps/web/src/styles.css`. Do NOT use `@tailwind base; @tailwind components; @tailwind utilities;` — that is v3 syntax.
- The Vite plugin `@tailwindcss/vite` replaces the v3 PostCSS pipeline. Do not add `postcss.config.*` for Tailwind.
- Opacity utilities use the slash syntax: `bg-black/50`, not `bg-opacity-50`. Several v3 utilities were renamed; check tailwindcss.com/docs before reaching for a v3 name.
```

**Entry T-2 — React Compiler 1.0 memo semantics**

```markdown
## React Compiler — memo, useMemo, useCallback

React Compiler 1.0 is enabled in `apps/web/vite.config.ts`. It auto-memoizes components, hooks, and derived values, so manual wrappers are usually redundant.

- Do NOT add `useMemo`, `useCallback`, or `React.memo` defensively. Write the straightforward version first and let the compiler optimize it.
- Manual memoization is still needed when: (a) a value or callback is consumed outside React's reactivity (a `useEffect` cleanup that holds an imperative handle, a ref into a non-React API, an event listener attached to `window`); (b) the value is the dependency of a `useEffect` whose stability is load-bearing for an external subscription.
- If you find yourself reaching for `useMemo`, pause and check whether the compiler already handles it. The codebase prefers the un-memoized form.
```

**Entry F-1 — Frontend code organization**

```markdown
## Frontend layout — apps/web/src

- Routes: `apps/web/src/routes/` only. File-based. TanStack Router auto-discovers and regenerates `routeTree.gen.ts` on save.
- UI components: `apps/web/src/components/` — feature-agnostic UI primitives. PascalCase filenames.
- Feature-specific components: colocated under `apps/web/src/routes/<route>/` next to the route file that owns them, not in `components/`.
- Hooks: `apps/web/src/hooks/`. Filename matches the hook (`useFoo.ts` exports `useFoo`).
- API clients and data-layer helpers: `apps/web/src/lib/`. TanStack Query queryOptions live here, keyed by entity.
- Shared types not tied to a single feature: `apps/web/src/types/`.
- Styles: `apps/web/src/styles.css` is the single Tailwind entry point. Component-level CSS modules are not used.
```

**Entry F-2 — Generated files (do not edit)**

```markdown
## Generated files (do not hand-edit)

The following files are regenerated by tooling. Hand-edits are lost on the next build:

- `apps/web/src/routeTree.gen.ts` — TanStack Router. Regenerated by the `@tanstack/router-plugin/vite` plugin on save and on build.
- `apps/auth-api/generated/` and `apps/habits-api/generated/` — Prisma client output. Regenerated by `npm run generate -w @habitpair/auth-api` (and equivalent for habits-api).

To change a route, add or rename a file under `apps/web/src/routes/`. To change a database type, edit the corresponding `prisma/schema.prisma` and run `generate`.
```

**Entry B-1 — Backend conventions (NestJS + Prisma)**

```markdown
## Backends — apps/auth-api and apps/habits-api

Both services are NestJS 11 with Prisma 6. Module composition follows the canonical NestJS shape: each feature has its own folder (`feature.module.ts`, `feature.controller.ts`, `feature.service.ts`, `feature.dto.ts`).

- DTOs live alongside the controller as `<feature>.dto.ts`. Use `class-validator` decorators on DTO fields; mount `ValidationPipe({ whitelist: true, transform: true })` globally in `main.ts`.
- Prisma access: inject `PrismaService` (provided by `PrismaModule`) into a feature service; do NOT import `PrismaClient` directly outside `PrismaModule`.
- Health checks: each service exposes `/health` via `@nestjs/terminus` (see `apps/auth-api/src/health/`). Add new checks there, not as one-off routes.
- Configuration: `@nestjs/config` with `isGlobal: true` (see `apps/auth-api/src/app.module.ts`). Read env via `ConfigService.get<T>(key)` with a typed schema; never `process.env` in a controller or service.
- JWT (habits-api): `@nestjs/jwt` is used to verify tokens issued by auth-api. Token verification belongs in a NestJS guard, not inline in a controller.
```

**Entry M-1 — Monorepo shared types**

```markdown
## Monorepo conventions — shared code

- Workspace shape: `apps/*` (deployables) and `packages/*` (shared libraries). The `packages/` workspace is declared but currently empty.
- Shared types between `apps/auth-api` and `apps/habits-api` (token payload, error envelopes, user identity) live in `packages/shared-types/` as a published-internally workspace package, consumed via `import type { ... } from '@habitpair/shared-types'`.
- Anything cross-cutting that is not just a type (a helper, a constant, a schema) gets its own `packages/<name>/` workspace, never a relative import across `apps/*` boundaries.
- Do not deep-import from another app: an `apps/habits-api` file MUST NOT `import` from `apps/auth-api/src/...`. Lift shared code to `packages/*` instead.
```

**Entry M-2 — Common scripts**

```markdown
## Workspace scripts — common operations

Run from the repo root unless noted.

- All three services in dev: `npm run dev`
- One service only: `npm run dev:auth` | `npm run dev:habits` | `npm run dev:web`
- Build a single app: `npm run build -w @habitpair/web` (or `@habitpair/auth-api`, `@habitpair/habits-api`)
- Type check (frontend): `npm run typecheck -w @habitpair/web`
- Lint a single app: `npm run lint -w @habitpair/<app>`
- Test: `npm run test -w @habitpair/<app>` — Vitest for web, Jest for the backends
- Prisma migrations (per backend): `npm run migrate -w @habitpair/auth-api`
- Regenerate Prisma client: `npm run generate -w @habitpair/auth-api`
```

## Summary

**Verdict: ready-with-compensation.** The stack passes all four agent-friendly criteria — type safety is strong everywhere, both frontend and backend frameworks are opinionated, every component is squarely popular within the JS/TS family, and official documentation is current and versioned. The label "with compensation" reflects two real friction sources that are not gate failures but will show up on the first few feature passes if not pinned:

1. **Recent-major drift.** Tailwind v4 and React Compiler 1.0 changed idioms that the agent's default lean still pattern-matches to v3 / pre-compiler. Entries T-1 and T-2 above pin the current behavior.
2. **Convention gaps the framework leaves open.** TanStack Router and NestJS each cover the load-bearing convention (routing, modules), but the project's choices about where components live, where shared types go, and how DTOs are validated have not been written down. Entries F-1, B-1, M-1 lock the patterns the next feature will silently establish.

**Strengths to lean on.** TypeScript `strict` everywhere with extra lint flags on the frontend. NestJS + Prisma is a well-trodden, doc-rich, convention-heavy backend stack. TanStack Router's file-based discovery + ESLint already ignoring `routeTree.gen.ts` means the generated-file boundary is mechanically enforced. CI is comprehensive (per-app test, deploy, CodeQL, gitleaks, infra-ci).

**Recommended next step.** Run `/10x-health-check` next. It will pick up this assessment as input and focus health checks on the gaps identified above (dependency recency on the bleeding-edge majors, security audit, missing test coverage on the just-scaffolded `apps/web`).
