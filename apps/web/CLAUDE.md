# CLAUDE.md — apps/web

Guidance for the web SPA (`@habitpair/web`). Monorepo-wide rules live in the [root CLAUDE.md](../../CLAUDE.md); this file records the frontend folder-structure decision, how to follow it, and the lint exemptions it requires.

## Folder structure: Feature-Based + shared (decided)

Code is organized **by feature/domain**, not by file kind. Each feature is a self-contained slice; only genuinely cross-cutting code lives in `shared/`. This mirrors the NestJS feature-module convention on the backend, so both sides share one mental model.

```
src/
  routes/                  # TanStack Router (file-based) — keep thin; import from features/
  features/
    <feature>/             # e.g. auth, habits
      components/          # PascalCase .tsx, colocated *.test.tsx
      hooks/               # useFoo.ts — all React hooks, incl. query/mutation hooks
      api/                 # request functions + query-option factories (React-free)
      types.ts             # promote to types/ only when it outgrows one file
  shared/
    api/                   # apiClient, queryClient
    components/            # cross-feature UI (Navbar, ui primitives)
    lib/                   # framework-agnostic singletons/helpers (authStore)
    types/
```

### Placement rules

- **Group by feature first.** A file belongs to the feature that owns it. Reach for `shared/` only when 2+ features use it — don't pre-share.
- **`api/` is React-free.** Transport only: fetch wrappers, request functions, query-option factories — no hooks, no components. The `apiClient`/`queryClient` singletons live in `shared/api/`.
- **`hooks/` holds every React hook**, including TanStack Query `useQuery`/`useMutation` wrappers. Test: *calls a React hook → `hooks/`; pure function → `api/` or `shared/lib/`.*
- **`routes/` stays thin.** A route file wires params/loaders and renders a feature component — it holds no feature logic. The TanStack Router plugin regenerates `routeTree.gen.ts` on save; never edit it (already ESLint-ignored).
- **Naming:** components `PascalCase.tsx`, hooks `useFoo.ts` exporting `useFoo`, tests colocated as `*.test.ts(x)` (Vitest). Styles stay in `src/styles.css` only — no CSS modules.

### Reference example: the `auth` feature

The codebase is fully migrated to this layout; `auth` is the worked example to copy:

- `features/auth/components/` — `LoginForm`, `RegisterForm` (+ colocated `*.test.tsx`)
- `features/auth/hooks/` — `useAuth`, `useLogin`, `useRegister`, `useLogout`
- `features/auth/api/auth.ts` — request functions (React-free)
- `features/auth/types.ts` — `Credentials` (the feature's own input type)
- `shared/api/` — `apiClient`, `queryClient`
- `shared/lib/authStore.ts`, `shared/components/Navbar.tsx`
- `shared/types/auth.ts` — `User`, `AuthResponse`, `AuthContext` (session shape consumed by shared infra + routes)

**Dependency direction:** `shared/*` must never import from `features/*`. Session types that shared infra (`authStore`, `apiClient`) depends on therefore live in `shared/types/`, while feature-only input types (`Credentials`) live in the feature. Routes and `main.tsx` may import from both layers.

### ESLint exemptions

`react-refresh/only-export-components` is turned **off** for two boundary files in [eslint.config.js](eslint.config.js): `src/main.tsx` (the entry point has no exports — it just calls `createRoot`) and `src/routes/**` (each route pairs a non-component `export const Route` with a local route component). The rule can't be satisfied for these without fighting the framework, and HMR for both is handled by the Vite / TanStack Router plugins — so **don't "fix" the warnings by splitting route components into separate files.** The rule stays active everywhere real components live (`features/`, `shared/`).
