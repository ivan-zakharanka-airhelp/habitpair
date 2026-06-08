---
date: 2026-06-08T15:07:54+0200
researcher: Ivan Zakharanka
git_commit: 599f40ba496cb4212766eb99cf5cbce6a5cf20f6
branch: pwa-app
repository: habitpair
topic: "Make the web SPA installable as a PWA (app shell)"
tags: [research, codebase, web, pwa, vite-plugin-pwa, service-worker, cloudfront, deploy]
status: complete
last_updated: 2026-06-08
last_updated_by: Ivan Zakharanka
---

# Research: Make the web SPA installable as a PWA (app shell)

**Date**: 2026-06-08T15:07:54+0200
**Researcher**: Ivan Zakharanka
**Git Commit**: 599f40ba496cb4212766eb99cf5cbce6a5cf20f6
**Branch**: pwa-app
**Repository**: habitpair

## Research Question

"I would like to make this app installable like a PWA, but don't know how to do this."

Scope agreed before research (via clarifying questions):

- **Target = installable _app shell_.** Manifest + icons + a minimal service worker that
  **precaches the built static app shell** so the UI loads offline / instantly. Habit **data**
  still requires the network. This is the standard PWA baseline — _not_ offline-first data.
- **Also in scope:** deploy/caching fixes (S3 + CloudFront), install + update UX, iOS/Safari caveats.
- **Out of scope:** push notifications (conflicts with the product's stated "no notifications" stance),
  offline-first data / on-device storage / sync (a separate, larger architecture).

## Summary

The SPA (`apps/web`, `@habitpair/web`) is a Vite 8 + React 19 static site deployed to S3 + CloudFront.
It has **none** of the three PWA pillars yet (no manifest, no service worker, no `vite-plugin-pwa`), but
it _does_ already have a head start: `apple-touch-icon` (180×180), an SVG favicon, a `theme-color`, and a
`viewport-fit=cover` viewport (`apps/web/index.html:5-9`). CloudFront already has the correct SPA deep-link
fallback (`infra/terraform/frontend.tf:92-104`).

**Recommended approach: add `vite-plugin-pwa@1.3.0`** (officially supports Vite 8 / Rolldown — its peer range
includes `^8.0.0`), in **`generateSW`** mode with **`registerType: 'prompt'`**, a manifest, three new icon
sizes (192 / 512 / 512-maskable), and **`workbox.navigateFallback: '/index.html'`** (critical for TanStack
client-side routing). Register the SW once at app startup (`apps/web/src/main.tsx:22`, next to
`authStore.bootstrap()`) and surface "update available → reload" through the existing toast system
(`ToastHost`, `apps/web/src/routes/__root.tsx:31`).

**The one non-obvious trap** is the deploy pipeline: `aws-deploy-web` stamps **all** of `dist/` with
`Cache-Control: public, max-age=31536000, immutable` (`Makefile:106-109`) and only special-cases
`index.html`. A service worker frozen for a year means clients never get updates. The build's new `sw.js`
and `manifest.webmanifest` must be excluded from the immutable sync, re-uploaded with `no-cache`, and added
to the CloudFront invalidation list — in **both** the Makefile and `.github/workflows/web-deploy.yaml`.

**Product-fit note (important):** the PRD explicitly parks **"offline-first / on-device-only storage"** as a
non-goal (`context/foundation/prd.md:225`). An installable **app shell** does **not** violate this — it
caches the _static UI bundle_, not _habit data_; the data layer stays backend-backed and network-dependent.
See [Architecture Insights](#architecture-insights). This change is a delivery/packaging enhancement, not a
data-architecture change.

## Detailed Findings

### 1. Current state & gap analysis

**App boot / where to register the SW.** The app mounts in `apps/web/src/main.tsx` — root lookup at
`main.tsx:10-13`, providers nest `StrictMode > QueryClientProvider > App`, rendered at `main.tsx:40-46`. The
router is a singleton (`apps/web/src/router.tsx:4-11`). A one-time auth bootstrap already runs at module load
(`main.tsx:22`, `void authStore.bootstrap()`) — **that is the natural home for SW registration** (a one-time
startup side-effect, outside React render).

**Existing PWA-ish signals in `index.html`** (`apps/web/index.html`):

- `viewport-fit=cover` already set — `index.html:8`.
- `theme-color` = single hardcoded `#2e7d5b` — `index.html:9` (**no light/dark split**).
- SVG favicon `index.html:5`, `favicon-32.png` `index.html:6`, `apple-touch-icon` 180×180 `index.html:7`.
- Inline pre-mount dark/light bootstrap script `index.html:125-144` (reads `localStorage 'hp_theme'`, sets
  `data-theme` + bg; light bg `#faf8f4`, dark bg `#262320` at `index.html:141`).
- **No `<link rel="manifest">`** — confirmed absent.

**Icon inventory** (`apps/web/public/`): `favicon.svg` (scalable, green square + white circle),
`favicon-32.png` (32×32), `favicon-180.png` (180×180), plus marketing screenshots `product/detail.png` /
`product/list.png` (1100×643, not icons). **Missing for install:** `192×192`, `512×512`, and a `512×512`
**maskable** variant. No `favicon.ico`.

**Where install/update UI belongs.** Navbar `nav__right` block — `apps/web/src/shared/components/Navbar.tsx:14-22`
— is the slot for a custom "Install app" button. A toast system already exists: `<ToastHost />` is mounted
once in the root layout (`apps/web/src/routes/__root.tsx:31`), backed by `toastStore`; but `Toast`
(`apps/web/src/shared/components/Toast.tsx:9-20`) is `role="status"`, auto-dismisses, and **has no action
button** — an "update available → Reload" CTA needs an extended Toast variant (or a dedicated component).

**Tests.** Vitest runs in **`node`** environment (`apps/web/vite.config.ts:18`) with only `localStorage`
stubbed (`apps/web/src/test/setup.ts:24-26`) — there is no `navigator.serviceWorker`. Implications: keep the
SW `registerSW(...)` call isolated to `main.tsx` (which is untested), so test code never touches
`navigator.serviceWorker`. If a `ReloadPrompt` component using `virtual:pwa-register/react` is added to the
React tree and tested, the test must `vi.mock('virtual:pwa-register/react')` (the virtual module won't
resolve under Vitest unless the plugin is in the Vitest pipeline). `jsdom@29` is already a devDependency but
is not the active env.

**Build / gitignore.** Build = `tsc -b && vite build` (`apps/web/package.json:8`), output to `apps/web/dist/`
(gitignored, `apps/web/.gitignore:11`). The `virtual:pwa-register` import needs a TypeScript type reference
or `tsc -b` fails (see §2). `vite-plugin-pwa` dev artifacts (`dev-dist/`, `dev-sw.js`) are **not** gitignored
yet.

### 2. Recommended approach — `vite-plugin-pwa`

**Source:** Context7 (`/vite-pwa/vite-plugin-pwa` + official docs), npm registry for the peer range.

**Version & compatibility.** Latest is **`vite-plugin-pwa@1.3.0`**. Its `peerDependencies.vite` is
`^3.1.0 || ^4.0.0 || ^5.0.0 || ^6.0.0 || ^7.0.0 || ^8.0.0` — **Vite 8 (Rolldown) is officially supported, no
shims/flags required.** It transitively pulls Workbox `^7.4` (you don't add Workbox yourself). Install as a
single devDependency: `npm i -D vite-plugin-pwa -w @habitpair/web` (then re-run root `npm install` per the
monorepo lockfile rule in the root CLAUDE.md). Optional: `@vite-pwa/assets-generator` to produce the
192/512/maskable icons from one source SVG.

**Mode: `generateSW` (default).** Fits "precache the app shell, no custom SW logic" exactly — declare the
glob patterns + fallback and the plugin writes the whole SW. `injectManifest` is only for hand-authored
`sw.ts` (custom fetch handlers, push, background sync) — not needed here.

**`registerType: 'prompt'` (recommended over `'autoUpdate'`).** A new SW installs but waits; the user keeps
the current version until they opt in. `'autoUpdate'` silently reloads — risky mid-form (habitpair has
create/mark forms). `'prompt'` pairs with the existing toast for an explicit "Reload" CTA.

**Plugin placement: last in the `plugins` array** (after `tailwindcss()`), so its build hooks see the final
emitted assets to precache. No ordering conflict with `@vitejs/plugin-react`, the React Compiler babel
plugin, or Tailwind. Current plugin chain is `apps/web/vite.config.ts:9-14`.

Concrete config (values tuned to habitpair — `theme_color` matches `index.html:9`, `background_color` matches
the light bg at `index.html:141`):

```ts
import { VitePWA } from 'vite-plugin-pwa';

// plugins: [ TanStackRouterVite(...), react(), babel(...), tailwindcss(),
VitePWA({
  registerType: 'prompt',
  includeAssets: ['favicon.svg', 'favicon-32.png', 'favicon-180.png'],
  manifest: {
    name: 'Habitpair',
    short_name: 'Habitpair',
    description: 'The calm habit tracker that shows you why you slip.',
    theme_color: '#2e7d5b',
    background_color: '#faf8f4',
    display: 'standalone',
    start_url: '/',
    scope: '/',
    icons: [
      { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
      { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    navigateFallback: '/index.html',
  },
  devOptions: { enabled: true }, // serve the SW under `vite dev` for local testing
})
```

**Why `navigateFallback: '/index.html'` is critical.** TanStack Router routes (`/habits/123`, etc.) exist
only in JS, not as files. The precache holds hashed assets + `index.html`. When the SW handles a navigation
to a deep route, there's no matching precache entry — `navigateFallback` makes Workbox serve cached
`index.html`, and the SPA router resolves the path. Without it, an offline hard-refresh on any non-root URL
fails. (This mirrors CloudFront's existing 403/404→index.html fallback — see §4.)

**TypeScript types.** Add `"vite-plugin-pwa/react"` to `compilerOptions.types` (in `tsconfig.app.json`) or add
`/// <reference types="vite-plugin-pwa/react" />` to a `.d.ts`, so the `virtual:pwa-register/react` import
type-checks under `tsc -b`. (Plain variant = `vite-plugin-pwa/client`.)

### 3. SW registration & update UX integration

Two viable wirings; both end at the existing toast system.

**Option A — React hook (`virtual:pwa-register/react`).** A small `ReloadPrompt` component mounted once near
the root (e.g. in `__root.tsx` alongside `<ToastHost />` at `routes/__root.tsx:31`):

```tsx
import { useRegisterSW } from 'virtual:pwa-register/react';

const {
  offlineReady: [offlineReady, setOfflineReady],
  needRefresh: [needRefresh, setNeedRefresh],
  updateServiceWorker,
} = useRegisterSW();
// needRefresh → show a toast with a "Reload" button → updateServiceWorker(true)
```

**Option B — plain (`virtual:pwa-register`) in `main.tsx:22`.** Keeps SW code out of the React tree (better
for the node-env tests):

```ts
import { registerSW } from 'virtual:pwa-register';
const updateSW = registerSW({
  onNeedRefresh() { /* toastStore → "New version available" + Reload → updateSW(true) */ },
  onOfflineReady() { /* toastStore → "Ready to work offline" */ },
});
```

Either way, the existing `Toast` needs an **action-button variant** (it currently has none —
`Toast.tsx:9-20`) to carry the "Reload" CTA. Recommendation: **Option B** for registration (isolated to the
untested `main.tsx`) feeding `toastStore`, with a one-off extended toast that has a button.

**Custom install button** (`beforeinstallprompt`, standard web API, not plugin-specific) — capture the
deferred event, show a button in Navbar `nav__right` (`Navbar.tsx:14-22`), call `prompt()` on click:

```ts
let deferred: BeforeInstallPromptEvent | null = null;
window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; /* reveal button */ });
// onClick: await deferred?.prompt(); deferred = null;
```

### 4. Deploy & caching changes (S3 + CloudFront)

**Current `aws-deploy-web`** (`Makefile:102-115`):

1. Build with prod API URLs — `Makefile:105`.
2. `aws s3 sync apps/web/dist/ ... --delete --exclude "index.html" --cache-control "public, max-age=31536000, immutable"` — `Makefile:106-109`. **Everything except `index.html` is frozen for a year.**
3. Re-upload `index.html` with `--cache-control "no-cache, no-store, must-revalidate"` — `Makefile:110-112`.
4. CloudFront invalidation, paths `"/index.html" "/"` only — `Makefile:113-115`.

**CI mirrors this exactly** in `.github/workflows/web-deploy.yaml`: immutable sync `web-deploy.yaml:167-172`,
`index.html` override `web-deploy.yaml:175-179`, invalidation `web-deploy.yaml:181-185` (build env URLs at
`:34-35`, build step `:47`). **Both files need the same fix.**

**CloudFront / S3** (`infra/terraform/frontend.tf`):

- Default root object `index.html` — `frontend.tf:79`.
- **SPA fallback present & correct:** 403→`/index.html` (200) `frontend.tf:92-97`, 404→`/index.html` (200)
  `frontend.tf:99-104`, both `error_caching_min_ttl = 0`. This already serves deep links today and is
  sufficient for the SW's `navigateFallback` — **no Terraform change needed.**
- Default cache behavior `frontend.tf:106-118` uses managed **CachingOptimized** policy
  (`cache_policy_id` at `frontend.tf:116`): **Min TTL 1s / Default TTL 24h / Max TTL 365d**. CloudFront honors
  the origin `Cache-Control` but clamps it into `[MinTTL, MaxTTL]`, so a `no-cache` SW is effectively ~1s at
  the edge — **fine, _provided_ stale edge copies are invalidated.** Invalidation is the only reliable
  eviction; a sync alone does not evict the edge.

**Caveat:** the SW (`sw.js`) and `manifest.webmanifest` must be real **200**s from S3 with correct
content-types, or a missing object would hit the 404→index.html rewrite and the browser would receive HTML
for a script/manifest request (SW registration fails). The "upload + invalidate" steps below guarantee this.

#### REQUIRED DEPLOY CHANGES (minimal)

- `Makefile:106-109` — add `--exclude "sw.js" --exclude "workbox-*.js" --exclude "manifest.webmanifest"` to the immutable sync.
- `Makefile` (after `:112`) — upload those three with `--cache-control "no-cache, no-store, must-revalidate"` and content-types (`application/javascript` for the JS, `application/manifest+json` for the manifest).
- `Makefile:113-115` — extend invalidation paths to `"/index.html" "/" "/sw.js" "/manifest.webmanifest"` (+ `/workbox-*.js`, `/registerSW.js` if emitted).
- `.github/workflows/web-deploy.yaml:167-172` — same `--exclude` additions.
- `.github/workflows/web-deploy.yaml:175-179` — add a step uploading SW + manifest with `no-cache` (mirror the index.html step).
- `.github/workflows/web-deploy.yaml:181-185` — extend `--paths` identically.
- **Terraform:** no change. Set Workbox `navigateFallback: '/index.html'` in the plugin instead.
- `apps/web/.gitignore` — add `dev-dist/` (vite-plugin-pwa dev artifacts).

> Note: content-hashed `workbox-<hash>.js` could safely stay immutable (the SW references it by exact name),
> but the simplest correct rule is to treat `sw.js` + `workbox-*.js` + `manifest.webmanifest` together as
> `no-cache`. The must-fix items are `sw.js` and `manifest.webmanifest`.

### 5. iOS / Safari caveats

- **No `beforeinstallprompt` on iOS Safari** — install is manual (Share → "Add to Home Screen"). The custom
  install button never fires there; show iOS users instructions instead (detect via absence of the event /
  `display-mode: standalone`).
- **`apple-touch-icon` still required** (iOS ignores manifest `icons` for the home-screen icon). Already
  present at `index.html:7` (180×180) — good.
- **Add `apple-mobile-web-app-*` meta tags** to `index.html` for proper standalone launch / status bar /
  title: `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`.
- **Splash screens** aren't generated from the manifest on iOS; they need per-device
  `apple-touch-startup-image` links (the assets-generator can emit these) or you accept a blank launch screen.
- **Storage eviction:** iOS evicts SW caches for sites unused for ~7 days (ITP). Treat the offline app shell
  as **best-effort**, not durable — a returning user may re-download. Habit data correctly stays server-side,
  so nothing important is lost.
- Optional polish: split `theme-color` into light/dark via `<meta name="theme-color" media="...">` (currently
  one hardcoded value at `index.html:9`).

## Code References

- `apps/web/src/main.tsx:22` — `authStore.bootstrap()` startup hook; register the SW here (Option B).
- `apps/web/src/main.tsx:10-13`, `:40-46` — root mount + render.
- `apps/web/src/routes/__root.tsx:31` — `<ToastHost />` mount point (Option A `ReloadPrompt` lives here).
- `apps/web/src/shared/components/Toast.tsx:9-20` — `role="status"`, auto-dismiss, **no action button** (needs a variant).
- `apps/web/src/shared/components/Navbar.tsx:14-22` — `nav__right`, slot for the install button.
- `apps/web/index.html:5-9` — existing icons, `theme-color`, viewport.
- `apps/web/index.html:141` — light/dark bg values (`#faf8f4` / `#262320`).
- `apps/web/vite.config.ts:9-14` — plugin chain (add `VitePWA()` last); `:18` Vitest `environment: 'node'`.
- `apps/web/package.json:8` — `build: tsc -b && vite build`.
- `apps/web/.gitignore:11` — `dist` ignored; add `dev-dist/`.
- `Makefile:102-115` — `aws-deploy-web`; immutable sync at `:106-109`, invalidation at `:113-115`.
- `.github/workflows/web-deploy.yaml:167-185` — CI deploy (immutable sync / index.html / invalidation).
- `infra/terraform/frontend.tf:79` — default root object; `:92-104` — SPA 403/404→index.html fallback; `:106-118` — default behavior + CachingOptimized policy (`:116`).

## Architecture Insights

- **App-shell PWA ≠ offline-first (the PRD non-goal).** `prd.md:225` parks "offline-first / on-device-only
  storage" because that would be "a meaningfully different product architecture." An installable app shell
  caches only the **static UI bundle** (JS/CSS/HTML/icons/fonts). All habit **data** still flows over
  HTTP + JWT to the backend (the two API origins in `apps/web/src/shared/api/`), unchanged. So this change is
  compatible with the non-goal — it improves _delivery/packaging_ (instant loads, home-screen presence,
  standalone window), not the data model. Worth stating explicitly in the plan so a reviewer doesn't read it
  as scope creep into offline-first.
- **The deploy caching pattern is already "SPA-correct," just not "PWA-correct."** Hashed assets immutable +
  `index.html` no-cache is right for a plain SPA; a PWA simply adds two more never-cache files (`sw.js`,
  `manifest.webmanifest`). The fix is additive, not a redesign.
- **CloudFront fallback and Workbox `navigateFallback` are two layers of the same idea.** Before the SW
  controls the page (first visit, or SW disabled), CloudFront's 403/404→index.html (`frontend.tf:92-104`)
  serves deep links. After the SW controls the page, Workbox's `navigateFallback` does. Both must point at
  `index.html`; they already align.
- **`generateSW` keeps the SW declarative.** No `/api/*` runtime caching is wanted (data must be fresh), so
  the SW only precaches the shell — minimal surface, minimal risk. Switching to `injectManifest` is a future
  step _if_ offline data or push is ever reconsidered.

## Historical Context (from prior changes & foundation)

- **PWA/installability was never an original goal — but it doesn't conflict with the stated non-goals.**
  - `context/foundation/prd.md:158` — mobile is "responsive mobile-web"; "Native mobile applications are out of MVP scope."
  - `context/foundation/prd.md:224` — "No native mobile applications … Mobile use is supported via responsive web."
  - `context/foundation/prd.md:225` — "No offline-first or on-device-only storage … backend-backed product for multi-device sync."
  - `context/foundation/roadmap.md:142-143` — native mobile and offline-first both explicitly **parked** (no PWA milestone exists).
  - `context/foundation/shape-notes.md:270-271`, `:289` — same non-goals; also lists "no notifications" (confirms excluding push).
  - `context/foundation/test-plan.md` — **no** offline/PWA/SW test coverage planned (consistent with non-goal status).
- **Product positioning already implies app-like multi-platform use.** `apps/web/index.html:51` JSON-LD
  declares `"operatingSystem": "Web, iOS, Android"`. An installable PWA makes that claim _more_ truthful
  (home-screen, standalone) **without** building native apps — i.e. it threads the "no native mobile" non-goal
  rather than violating it.
- **`pwa-app` is a fresh workstream.** `context/changes/pwa-app/change.md` is a stub (created 2026-06-08, empty
  notes). No prior change touched manifest/icons/SW/offline (`"install"` hits elsewhere are all `npm install`).

## Related Research

- None. This is the first research artifact for the `pwa-app` change; no related `research.md` exists under
  `context/changes/**` or `context/archive/**`.

## Open Questions

1. **Icon source.** Generate `pwa-192/512/maskable` from `favicon.svg` via `@vite-pwa/assets-generator`, or
   hand-produce them? The current favicon (green square + white circle) may need padding to be a good
   _maskable_ icon (safe-zone). Decide before implementation.
2. **Update UX shape.** Extend the existing `Toast` with an action-button variant, or build a dedicated
   `ReloadPrompt` component? (Affects whether registration uses Option A vs B.)
3. **Should `index.html`'s `theme-color` gain a light/dark split** as part of this change, or is that a
   separate polish?
4. **Verification plan.** How to test installability/offline in CI vs manually — Lighthouse PWA audit, a
   Playwright check for the manifest + registered SW, or manual DevTools "Application" tab only? (The
   foundation test-plan has no PWA coverage yet.)
5. **iOS splash screens** — worth the per-device `apple-touch-startup-image` set, or accept the blank launch
   screen for v1?
