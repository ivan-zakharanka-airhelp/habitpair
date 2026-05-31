---
project: habitpair
checked_at: 2026-05-25T15:30:00Z
health_status: healthy
context_type: brownfield
language_family: js
stack_assessment_available: true
checks_run:
  - lockfile
  - dependency_audit
  - outdated_deps
  - test_runner
  - ci_cd
  - configuration
audit_findings:
  critical: 0
  high: 0
  moderate: 0
  low: 0
test_runner_detected: true
ci_provider: GitHub Actions
recommended_fixes: 4
---

## Dependency Health

### Lockfile

```
Status: present (package-lock.json, 444 KB)
Package manager: npm (workspaces; `apps/*` + `packages/*` globs declared)
```

`package-lock.json` was regenerated in commit `190726f` ("Regenerate package-lock.json with cross-platform native bindings") and is current.

### Security Audit

```
Tool: npm audit --json
Summary: 0 CRITICAL, 0 HIGH, 0 MODERATE, 0 LOW
Direct vs transitive: not distinguished — clean across both
```

Audited 883 dependencies (204 prod, 680 dev, 46 optional, 8 peer). No advisories of any severity. Reinforced by CI: `.github/workflows/codeql.yml` runs CodeQL `security-and-quality` queries on every PR and weekly on cron, and `.github/workflows/gitleaks.yml` adds secret scanning.

### Outdated Dependencies

```
Packages with major version gaps: 9
```

All gaps live on the two backends (`apps/auth-api`, `apps/habits-api`). The frontend already runs the latest major of every tool in this list.

- **typescript**: 5.9.3 → 6.0.3 (1 major behind) — backends only
- **eslint**: 9.39.4 → 10.4.0 (1 major behind) — backends only
- **@eslint/js**: 9.39.4 → 10.0.1 (1 major behind) — backends only
- **jest**: 29.7.0 → 30.4.2 (1 major behind) — both backends
- **@types/jest**: 29.5.14 → 30.0.0 (1 major behind) — both backends
- **prisma**: 6.19.3 → 7.8.0 (1 major behind) — both backends
- **@prisma/client**: 6.19.3 → 7.8.0 (1 major behind) — both backends
- **@types/supertest**: 6.0.3 → 7.2.0 (1 major behind) — both backends
- **@types/node** (backends): 22.19.19 → 25.9.1 (3 major versions behind). This is partly intentional — the backends pin `engines.node >= 22`, so `@types/node@22` pair-tracks the runtime LTS. Bumping to 25 implies bumping the engine target too, which is a separate decision.

The frontend's `@types/node` is on 24.x (one major behind 25.x) and tracks the bundler/tooling side of the type definitions, not the runtime — bumping is low risk.

## Test Suite

```
Test runner: detected (Vitest 4 for web, Jest 29 for both backends)
Tests found: 2 unit + 2 e2e skeleton (across the monorepo)
Test execution: passing (with --passWithNoTests)
```

Per-workspace breakdown:

- **`apps/web`** — Vitest 4 wired via `vite.config.ts` and `npm run test -w @habitpair/web`. **0 test files.** The workspace was rescaffolded in commit `3c29077` ("Rewrite apps/web with fresh Vite + React Compiler scaffold"); empty test tree is expected for fresh scaffolding.
- **`apps/auth-api`** — Jest 29 + ts-jest, configured in `package.json` (`testRegex: ".*\\.spec\\.ts$"`, `rootDir: "src"`). **0 unit specs under `src/`**, one e2e skeleton at `test/app.e2e-spec.ts` (run separately via `test:e2e`).
- **`apps/habits-api`** — Same Jest config as auth-api. **1 unit spec** (`src/auth/jwt.guard.spec.ts`) plus the e2e skeleton at `test/app.e2e-spec.ts`.

The runners themselves are healthy: all three resolve from the workspace, list tests on demand, and pass when invoked. Coverage is the next axis — addressed under Category A below.

## CI/CD

```
Provider: GitHub Actions
Configuration: .github/workflows/ (9 workflow files)
```

| Stage      | Status | Notes                                                                                |
|------------|--------|--------------------------------------------------------------------------------------|
| Lint       | ✓      | ESLint per app (`npm run lint -w <workspace>`)                                       |
| Test       | ✓      | Vitest (web), Jest with real Postgres service (backends)                             |
| Build      | ✓      | `nest build` (backends); `tsc -b && vite build` covered by web `build` script        |
| Type check | ✓      | Web has dedicated `typecheck` step (`tsc -b`); backends type-check via ts-jest+build |
| Security   | ✓      | CodeQL `security-and-quality` weekly + on PR; gitleaks for secret scanning           |

Additional coverage worth noting:
- Per-app pipelines are path-filtered — only the affected workspace runs on PR
- Backend CI spins up a Postgres 16 service container and runs `migrate:deploy` before tests, so the schema is exercised on every commit, not just deploy
- Concurrency groups cancel in-progress PR runs but preserve main-branch runs (the deploy workflows gate on them via `workflow_run`)
- Per-app deploy workflows (`*-deploy.yaml`) and an `infra-ci.yaml` for Terraform validation are present

This is unusually thorough CI for a project at the bootstrap stage. No gaps to flag here.

## Configuration

### High severity

None.

### Medium severity

None.

### Low severity

- **`.editorconfig`** — not present at repo root. Without it, editors with mixed configurations across the team will produce churn-only diffs (trailing whitespace, line endings, indentation). Fix: add a single-line root `.editorconfig` with `root = true` plus indent/charset/EOL defaults.
- **Root-level Prettier config** — there's no root `.prettierrc`. Each app pulls in `eslint-config-prettier` separately, so formatting *does* run via ESLint, but there's no shared style declaration. Acceptable for a monorepo where the apps may want different conventions, but if you want one shared style across all three workspaces, lift Prettier config to the root.

Configuration confirmed present and good:
- `.nvmrc` pinning Node 22 (referenced by every CI workflow's `setup-node`)
- Comprehensive `.gitignore` (build outputs, generated Prisma clients, `.env`, terraform state, k8s secrets)
- `.env.example` in all three apps
- Strict TypeScript everywhere: web adds `noUnusedLocals`, `noUnusedParameters`, `verbatimModuleSyntax`, `erasableSyntaxOnly`, `noFallthroughCasesInSwitch`; backends add `noFallthroughCasesInSwitch`, `forceConsistentCasingInFileNames`
- ESLint config in all three apps (`eslint.config.js` for web, `eslint.config.mjs` for backends)
- `CLAUDE.md` present (content is the 10xDevs Lesson 3 scaffolding guide — project conventions come next lesson)

## Stack Assessment Cross-Reference

```
Stack assessment: context/foundation/stack-assessment.md
Agent readiness (from stack-assess): ready-with-compensation
```

The stack assessment flagged two soft gaps (training-data drift on Tailwind v4 and React Compiler 1.0) and five convention gaps the framework leaves to the project. Health-check status against those gaps:

| Quality Gate / Gap from stack-assess          | Health-Check Finding                                                          | Status     |
|-----------------------------------------------|-------------------------------------------------------------------------------|------------|
| Tailwind v4 vs v3 idiom drift (T-1)           | `CLAUDE.md` carries 10xDevs scaffolding only — no T-1 entry yet               | Reinforced |
| React Compiler 1.0 memo semantics (T-2)       | No T-2 entry in `CLAUDE.md`                                                   | Reinforced |
| Frontend code organization (F-1)              | No F-1 entry; `apps/web/src/` has only `lib/`, `routes/`, no `components/`    | Reinforced |
| Generated-file no-touch rule (F-2)            | ESLint already ignores `routeTree.gen.ts`; no `CLAUDE.md` rule yet            | Partial    |
| Backend conventions (B-1)                     | No B-1 entry; canonical NestJS skeleton in code, conventions undocumented     | Reinforced |
| Shared types / monorepo policy (M-1)          | `packages/*` workspace empty; no policy doc                                   | Reinforced |
| No AGENTS.md                                  | Confirmed missing                                                             | Reinforced |
| Backend major-version freshness (new)         | Backends are 1 major behind frontend on TS, ESLint, Jest, Prisma              | New gap    |

The seven "Reinforced" / "Partial" rows above are the compensation entries stack-assess recommends pasting into `CLAUDE.md` / `AGENTS.md`. They are not absent because of negligence — the agent-onboarding lesson is where the learner builds those files with the right content. Creating stubs now would be premature.

The "New gap" row (backend major-version drift) was below stack-assess's lens and surfaces here.

## Recommended Fixes

### Fix before agent work (Category A)

#### 1. Bring backend dependencies onto current majors (TypeScript 6, ESLint 10, Jest 30, Prisma 7)

**Impact**: The frontend already runs the latest majors of every tool in this list, while both backends sit one major behind. When the agent moves between `apps/web` and `apps/auth-api` / `apps/habits-api`, its default idioms will assume different majors in different workspaces — Prisma 7 query syntax in one place, Prisma 6 in another. The stack assessment already calls out frontend training-data drift (Tailwind v4, React Compiler); this finding is the same problem in the opposite direction for the backends. Aligning the majors removes that asymmetry.

**Severity**: medium
**Effort**: moderate (15–30 min per major if migrations are routine; significant if Prisma 7 forces query rewrites)

**Fix**: bump in two waves so failures isolate cleanly.

Wave 1 — tooling (low blast radius):
```bash
npm install -w @habitpair/auth-api -w @habitpair/habits-api \
  typescript@^6 eslint@^10 @eslint/js@^10 \
  @types/jest@^30 @types/supertest@^7
npm run lint -w @habitpair/auth-api && npm run build -w @habitpair/auth-api
npm run lint -w @habitpair/habits-api && npm run build -w @habitpair/habits-api
```

Wave 2 — runtime (read the changelog first):
```bash
# Jest 30 — review https://jestjs.io/blog before running
npm install -w @habitpair/auth-api -w @habitpair/habits-api jest@^30
npm test -w @habitpair/auth-api && npm test -w @habitpair/habits-api

# Prisma 7 — review https://www.prisma.io/docs/orm/more/upgrade-guides; touches the schema
npm install -w @habitpair/auth-api -w @habitpair/habits-api prisma@^7 @prisma/client@^7
npm run generate -w @habitpair/auth-api && npm run generate -w @habitpair/habits-api
```

The `@types/node` 22 → 25 gap is **not** in this fix. Bumping it implies bumping `engines.node` past the current LTS, which is a separate runtime decision.

#### 2. Grow the test surface to match the project state

**Impact**: All three test runners are wired and pass, but the actual coverage is 2 specs (1 unit, 2 e2e skeletons). The agent can run `npm test` against any workspace and get green output without validating anything meaningful — `--passWithNoTests` is set in every workspace's test script. As features land, this becomes a real correctness gap; right now it is a posture gap. Tests are the agent's main self-verification mechanism.

**Severity**: medium
**Effort**: significant (> 1 hour, ongoing — grows with the feature surface)

**Fix**: there is nothing to bulk-add at this stage — the apps don't have features yet. The discipline is per-feature, not a one-shot:
- Each new NestJS controller gets a `*.spec.ts` next to it.
- Each new React route or hook gets a Vitest counterpart in `apps/web/src/` next to the source.
- The first non-trivial feature should add at least one integration test that hits the real Postgres service container the CI already provides.

Track this as a convention in `CLAUDE.md` / `AGENTS.md` during agent onboarding — not as a backlog item to clear before agent work.

#### 3. Add a root `.editorconfig`

**Impact**: Low. Without one, mixed editor configurations across collaborators (or across the agent's output and yours) produce whitespace-only diffs.

**Severity**: low
**Effort**: quick (< 5 min)

**Fix**: create `/.editorconfig` at the repo root with:
```ini
root = true

[*]
charset = utf-8
end_of_line = lf
indent_style = space
indent_size = 2
insert_final_newline = true
trim_trailing_whitespace = true
```

#### 4. Decide on root-level Prettier configuration

**Impact**: Low. Each app currently runs Prettier via `eslint-config-prettier` with no shared declaration of style. If all three workspaces should format identically, lift the config; if they intentionally differ, document the decision so future contributors don't try to consolidate.

**Severity**: low
**Effort**: quick (< 5 min if lifting, no action if intentional)

**Fix**: either add `/.prettierrc.json` at the root and remove app-level overrides, or note in `CLAUDE.md` that each app owns its own style (the agent-onboarding lesson is a natural moment to capture this).

### Addressed in upcoming lessons (Category B)

#### Agent instruction files (AGENTS.md + the load-bearing CLAUDE.md compensation entries)

**Lesson**: [Agent Onboarding: Agents.md, AI Rules i feedback loops (M1L4)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l4)
**What you'll do there**: build the `CLAUDE.md` and `AGENTS.md` content with the right substance — including the seven entries the stack assessment recommends (T-1 Tailwind v4, T-2 React Compiler, F-1 frontend layout, F-2 generated files, B-1 backend conventions, M-1 shared types, M-2 workspace scripts). The current `CLAUDE.md` is the 10xDevs scaffolding guide, not project conventions; the upcoming lesson is where it gets replaced with the load-bearing content.

#### Dependabot / automated dependency updates

**Lesson**: [Sprint Zero z Agentem: infrastruktura, walking skeleton i pierwszy deploy (M1L5)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l5)
**What you'll do there**: stand up the operational concerns around the codebase. Automated dependency updates (Dependabot or Renovate) belong with the other CI/infra automation. The current CI already covers security scanning (CodeQL + gitleaks), so the gap is specifically version-currency automation, not security posture.

## Summary

Health status: **healthy**.

Zero audit findings, all three test runners wired and working, comprehensive CI already in place (per-app lint/test/build, weekly CodeQL, gitleaks, real-Postgres backend pipelines), strict TypeScript across every workspace, lockfile current. The two real friction sources are (1) backend major-version drift — TypeScript / ESLint / Jest / Prisma sit one major behind the frontend, which will create asymmetric agent behavior across the monorepo — and (2) test content that hasn't been grown yet, since the apps themselves have no feature surface yet. Neither blocks agent work; both are worth folding into the agent-onboarding pass.

Next step: address the Category A fixes (backend major bumps are the highest-leverage item — everything else is quick or naturally bound to feature work), then proceed to [Agent Onboarding: Agents.md, AI Rules i feedback loops (M1L4)](https://platforma.przeprogramowani.pl/external/10xdevs-3/m1-l4) — where the seven compensation entries the stack assessment recommends get translated into the load-bearing `CLAUDE.md` / `AGENTS.md` content.
