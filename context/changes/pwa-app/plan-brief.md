# PWA App-Shell — Plan Brief

> Full plan: `context/changes/pwa-app/plan.md`
> Research: `context/changes/pwa-app/research.md`

## What & Why

Make the `apps/web` SPA installable as a PWA **app shell**: a manifest, install icons, and a service worker that
precaches the static UI bundle so the app loads instantly and works offline. The motivation is delivery/packaging —
home-screen presence, standalone launch, instant loads — *not* a data-architecture change. Habit data stays
network-backed, so this threads (rather than violates) the PRD's parked "offline-first / on-device storage" non-goal.

## Starting Point

The SPA has none of the three PWA pillars (no manifest, SW, or `vite-plugin-pwa`) but already ships an
`apple-touch-icon`, an SVG favicon, a `theme-color`, and `viewport-fit=cover`. CloudFront already serves the correct
SPA deep-link fallback. The user has already added `favicon-192.png` and `favicon-512.png` to `public/`.

## Desired End State

A user can install Habitpair from Chrome/Android/desktop and launch it standalone from a precached shell that renders
offline (data shows its network-error state). iOS users get an "Add to Home Screen" hint and a proper standalone
launch. New deploys auto-apply on a cold start (reload once) but surface a non-intrusive "new version → Reload" toast
during an active session — never a silent reload mid-task — and the pipeline serves `sw.js`/`manifest.webmanifest` as
`no-cache` 200s, invalidated on every release.

## Key Decisions Made

| Decision                | Choice                                                              | Why (1 sentence)                                                      | Source   |
| ----------------------- | ------------------------------------------------------------------- | --------------------------------------------------------------------- | -------- |
| Plugin & mode           | `vite-plugin-pwa@1.3.0`, `generateSW`, `registerType: 'prompt'`     | Officially supports Vite 8; declarative shell precache, no custom SW. | Research |
| Deep-link offline       | `workbox.navigateFallback: '/index.html'`                           | TanStack routes are JS-only; mirrors CloudFront's existing fallback.  | Research |
| SW registration         | Manual `registerSW` in `main.tsx` (`injectRegister: null`)          | Keeps PWA code out of the node-env tested React tree.                 | Plan     |
| Update UX               | Hybrid: auto-apply on cold start, "Reload" toast in active session  | Latest version on open; no surprise reload mid-task. Toast reuses the calm queue. | Plan     |
| Install UI              | Navbar `beforeinstallprompt` button + iOS "Add to Home Screen" hint | Discoverable install on Chromium; iOS still guided.                   | Plan     |
| Icons                   | Hand-added 192 + 512 (`any` purpose); maskable deferred             | User produced them; maskable is polish, not an install requirement.   | Plan     |
| iOS launch              | `apple-mobile-web-app-*` meta tags; **no** splash images            | Meta tags are cheap/high-value; splash is disproportionate for v1.    | Plan     |
| theme-color             | Split light (`#2e7d5b`) / dark (`#262320`) now                      | Small self-contained edit; chrome tint tracks the theme.              | Plan     |
| Verification            | Manual DevTools + a Playwright smoke (manifest + SW registration)   | Matches the repo's browser-E2E investment; guards regressions in CI.  | Plan     |

## Scope

**In scope:** manifest + icons wiring, precaching SW, deep-link fallback, SW registration + update prompt, install
button + iOS hint, iOS/theme meta tags, deploy/caching fixes (Makefile + CI), a Playwright smoke.

**Out of scope:** push notifications; offline-first data / on-device storage / sync; `/api/*` runtime caching;
`injectManifest`/custom SW; maskable icon; iOS splash screens; Terraform/CloudFront changes; Lighthouse CI gate;
`@vite-pwa/assets-generator`.

## Architecture / Approach

`vite-plugin-pwa` (last in the Vite plugin chain) generates `manifest.webmanifest` + `sw.js` at build. The SW
precaches the hashed shell assets + `index.html`; `navigateFallback` serves `index.html` for deep routes offline. The
app registers the SW manually in `main.tsx` and routes `onNeedRefresh`/`onOfflineReady` to the toast system. A
`pwaInstall` store captures `beforeinstallprompt` (at module load, before React mounts) to drive a Navbar button. The
deploy pipeline excludes the PWA files from the year-long immutable cache, re-uploads them `no-cache`, and invalidates
them — in both the Makefile and CI.

## Phases at a Glance

| Phase                  | What it delivers                                          | Key risk                                                     |
| ---------------------- | -------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Installable core    | Plugin + manifest + icons wiring + iOS/theme meta        | `VitePWA` in the shared Vitest config; precache bloat        |
| 2. Update strategy     | Hybrid SW updates (cold-start auto-apply / session toast) | Auto-reload timing (grace window); shared Toast a11y/contract  |
| 3. Install affordance  | Navbar install button + iOS hint                         | `beforeinstallprompt` timing; node-safe browser-API guards   |
| 4. Deploy & caching    | Makefile + CI no-cache + invalidation for SW/manifest    | Drift between Makefile and CI; `.webmanifest` content-type   |
| 5. Verification        | Playwright smoke + manual DevTools/real-device pass      | Dev-server SW (not production-faithful for offline precache) |

**Prerequisites:** the 192/512 icons exist in `public/` (done); a running local stack (`make up`) for Playwright;
AWS/CloudFront access for the Phase 4 manual `curl` check.
**Estimated effort:** ~2–3 sessions across the 5 phases (Phases 1–2 are the bulk; 4 is mechanical but doubled across two files).

## Open Risks & Assumptions

- No maskable icon → Android shows the `any` icon on a generated background (slight letterbox); deferred polish.
- The Playwright smoke depends on `devOptions.enabled` (dev SW); true offline precache is verified manually, not in CI.
- `VitePWA` is expected to be inert under node-env Vitest; mitigation is to gate it behind `!process.env.VITEST`.

## Success Criteria (Summary)

- The app is installable (Lighthouse "Installable" passes) and launches standalone from a precached shell that renders
  offline; data stays network-backed.
- A new deploy surfaces an explicit "Reload" prompt to installed clients; the SW is never frozen for a year.
- `sw.js` + `manifest.webmanifest` are served `no-cache` with correct content-types and invalidated on every release.
