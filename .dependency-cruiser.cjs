/**
 * dependency-cruiser configuration for the habitpair monorepo.
 *
 * Run with `npm run depcruise` (validate) or `npm run depcruise:graph` (visualize).
 * The rules below encode the architectural boundaries documented in CLAUDE.md;
 * the headline one is `no-cross-app-imports`.
 *
 * Full option reference: https://github.com/sverweij/dependency-cruiser/blob/main/doc/rules-reference.md
 */
module.exports = {
  forbidden: [
    {
      name: 'no-cross-app-imports',
      comment:
        'Each app under apps/* is an isolated deployable (auth-api, habits-api, web). ' +
        'They must never import each other directly — services communicate over HTTP + JWT, ' +
        'and shared code belongs in a packages/* workspace. See CLAUDE.md ("No deep imports across apps/*").',
      severity: 'error',
      from: { path: '^apps/([^/]+)/' },
      to: {
        path: '^apps/[^/]+/',
        pathNot: '^apps/$1/',
      },
    },
    {
      name: 'no-circular',
      comment:
        'Circular dependencies make code hard to reason about and break incremental builds. ' +
        'Extract the shared piece into its own module instead.',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
    {
      name: 'not-to-unresolvable',
      comment:
        "An import that can't be resolved is almost always a typo or a missing dependency.",
      severity: 'error',
      from: {},
      to: { couldNotResolve: true },
    },
    {
      name: 'no-orphans',
      comment:
        'A module that nothing imports and that imports nothing is usually dead code. ' +
        'Config/declaration files are excluded.',
      severity: 'warn',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$', // type declarations
          '(^|/)src/routes/', // TanStack file-based routes are wired by the generated tree, not direct imports
          '(^|/)src/test/', // test bootstrap (vitest setupFiles), referenced via config not imports
        ],
      },
      to: {},
    },
  ],
  options: {
    /* Treat TS type-only imports (`import type ...`) as real edges, so a sneaky
       cross-app *type* import is caught too. Requires the `typescript` module,
       which the workspaces already provide. */
    tsPreCompilationDeps: true,

    /* Only reason about application source. Build/tool config (vite.config,
       eslint.config, nest-cli.json) and generated trees (Prisma client,
       dev-dist PWA output) are not part of the architecture we police. */
    includeOnly: { path: '^apps/[^/]+/src/' },
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: [
        '\\.gen\\.ts$', // TanStack Router routeTree.gen.ts (generated, write-only)
        '\\.(spec|e2e-spec)\\.ts$', // colocated unit/e2e specs
      ],
    },

    reporterOptions: {
      dot: {
        /* Collapse each app to a single node for a readable high-level graph. */
        collapsePattern: '^apps/[^/]+',
      },
      archi: {
        collapsePattern: '^apps/[^/]+/(src/[^/]+|src)',
      },
    },
  },
};
