# PWA App-Shell Implementation Plan

## Overview

Make the `apps/web` SPA installable as a Progressive Web App **app shell**: add a web
manifest, install icons, and a service worker that **precaches the built static UI bundle**
so the app loads instantly and works offline. Habit **data still requires the network** — this
is the standard PWA baseline, not offline-first data. The work also fixes the deploy pipeline so
the service worker is never frozen for a year, adds a safe "update available → Reload" prompt,
and a discoverable install affordance with an iOS fallback.

## Current State Analysis

The SPA (`@habitpair/web`) is a Vite 8 + React 19 static site on S3 + CloudFront. It has **none**
of the three PWA pillars (no manifest, no service worker, no `vite-plugin-pwa`) but already has a
head start: `apple-touch-icon` (180×180), an SVG favicon, a `theme-color`, and `viewport-fit=cover`
([apps/web/index.html](apps/web/index.html)). CloudFront already has the correct SPA deep-link
fallback (`infra/terraform/frontend.tf:92-104`), which the SW's `navigateFallback` mirrors.

Key constraints discovered:

- **The deploy pipeline freezes everything for a year.** `aws-deploy-web` ([Makefile:106-115](Makefile)) and CI
  ([.github/workflows/web-deploy.yaml:167-185](.github/workflows/web-deploy.yaml)) stamp all of `dist/` (except
  `index.html`) with `Cache-Control: public, max-age=31536000, immutable`. A year-frozen `sw.js` means clients
  never receive updates.
- **The toast system has no action button.** `toast(message, duration)` is the only entry point;
  `ToastItem` is `{id, message, duration}`; `Toast` is `role="status"`, auto-dismiss
  ([apps/web/src/shared/lib/toast.ts](apps/web/src/shared/lib/toast.ts),
  [apps/web/src/shared/components/Toast.tsx](apps/web/src/shared/components/Toast.tsx)). An "update available → Reload"
  CTA needs an extended contract.
- **Tests run in `node` env.** Vitest has `environment: 'node'` ([apps/web/vite.config.ts:18](apps/web/vite.config.ts))
  with only `localStorage` stubbed — there is no `navigator.serviceWorker` or `matchMedia`. SW/PWA code must stay out
  of the tested React tree.
- **Icons are present.** The user added `favicon-192.png` (192×192) and `favicon-512.png` (512×512) to
  `apps/web/public/`, alongside the existing `favicon.svg` / `-32` / `-180`. No maskable variant.
- **A Playwright E2E harness already exists** at the repo root ([playwright.config.ts](playwright.config.ts),
  `e2e/*.spec.ts`, `npm run test:e2e`), running against the **`make up` dev server on `:5173`** — not a built preview.

### Key Discoveries:

- `vite-plugin-pwa@1.3.0` officially supports Vite 8 / Rolldown (peer range includes `^8.0.0`); pulls Workbox 7
  transitively. (research.md §2)
- For the manual prompt flow, set **`injectRegister: null`** so the plugin does no auto-registration and emits no
  `registerSW.js`; register via `registerSW({ onNeedRefresh, onOfflineReady })` from `virtual:pwa-register`, which
  returns `updateSW(reloadPage?)`. (Context7 `/vite-pwa/vite-plugin-pwa`, register-service-worker guide)
- `workbox.navigateFallback: '/index.html'` is required so TanStack deep routes (`/habits/123`) resolve offline —
  the SW-layer twin of CloudFront's existing 403/404→index.html rewrite. (research.md §2, §4)
- The Playwright harness serves the **dev** server, so the SW is only present under test when
  `devOptions.enabled: true`; that makes a manifest+SW-registration smoke reliable, but true offline precache stays a
  manual DevTools check (dev SW precaching is not production-faithful).

## Desired End State

A user on Chrome/Android/desktop can install Habitpair to their home screen/app launcher; it launches standalone
from a precached shell that loads instantly and renders offline (data shows its network-error/empty state). iOS users
get an "Add to Home Screen" hint and a proper standalone launch via apple meta tags. When a new version deploys, an
installed client auto-applies it on the next cold start (reloading once) but, during an active session, sees a
non-intrusive "new version available → Reload" toast — never a silent reload mid-task.
The deploy pipeline correctly serves `sw.js`/`manifest.webmanifest` as `no-cache` 200s and invalidates them on every
release. Verified by a Playwright smoke (manifest link + SW registration) in CI plus a manual DevTools/real-device pass.

## What We're NOT Doing

- **No push notifications** — conflicts with the product's stated "no notifications" stance.
- **No offline-first data, on-device storage, or sync** — the PRD parks this (`prd.md:225`); habit data stays
  backend-backed over HTTP + JWT, unchanged.
- **No runtime caching of `/api/*`** — data must always be fresh; the SW only precaches the static shell.
- **No `injectManifest` / hand-authored SW** — `generateSW` only (declarative precache). Switching is a future step
  if offline data/push is ever reconsidered.
- **No maskable / adaptive icon** in v1 — deferred polish (see Open Risks).
- **No iOS splash screens** — `apple-mobile-web-app-*` meta tags only; accept the brief blank launch.
- **No Terraform / CloudFront changes** — the existing 403/404→index.html fallback and CachingOptimized policy suffice.
- **No Lighthouse CI gate and no `@vite-pwa/assets-generator`** — verification is manual DevTools + a Playwright smoke;
  icons were produced by hand.

## Implementation Approach

Add `vite-plugin-pwa` in `generateSW` mode with `registerType: 'prompt'`, wiring it last in the Vite plugin chain.
Layer the change in five incremental, independently verifiable phases: (1) make it installable (plugin + manifest +
meta), (2) register the SW with a hybrid update strategy (cold-start auto-apply, active-session toast), (3) add a discoverable install
button with an iOS hint, (4) fix the deploy/caching pipeline in both the Makefile and CI, (5) verify with a Playwright
smoke + manual DevTools/real-device pass. Each phase has a manual-verification gate before the next begins.

## Critical Implementation Details

- **Hybrid update strategy (cold start vs active session).** `onNeedRefresh` fires only when an old SW already controls
  the page (a real update — never a first install), so first-time visitors are never auto-reloaded. Discriminate cold
  start from active session by a short grace window after module load: an update surfacing within it auto-applies
  (`updateSW(true)` activates + reloads once — the plugin guards the single reload via `controllerchange`); one surfacing
  later shows the toast. An hourly `registration.update()` in `onRegisteredSW` is what makes the active-session case fire
  (the SW does not otherwise poll). Keep the grace short (~3s, overlapping the auth-bootstrap loading screen) so an
  auto-reload can't land mid-edit.
- **`beforeinstallprompt` can fire before React mounts.** The `pwaInstall` store must attach its `window` listener at
  module load, and be imported at startup (alongside `authStore.bootstrap()` in `main.tsx`) so an early event isn't
  missed.
- **Node-env test safety.** Vitest runs `environment: 'node'` — no `navigator.serviceWorker`, no `matchMedia`. Keep the
  `virtual:pwa-register` import confined to `main.tsx` (the untested entry). The `pwaInstall` store must guard every
  browser-API access (`typeof window !== 'undefined'`, feature-detect `matchMedia`) so it is import-safe. If adding
  `VitePWA` to the shared `vite.config.ts` breaks the Vitest run, gate the plugin behind `!process.env.VITEST`.
- **Keep the precache lean.** Add `workbox.globIgnores` for the marketing screenshots under `public/product/**` so they
  are not baked into the app-shell precache (they stay network-fetched — fine for a shell).
- **Manifest content-type on S3.** When re-uploading `manifest.webmanifest`, set `Content-Type: application/manifest+json`
  explicitly — S3's extension guess does not cover `.webmanifest`, and a wrong type makes the browser reject the manifest.
  The hashed `workbox-*.js` needs a wildcard `--include` sync (a plain `cp` cannot match it).

---

## Phase 1: Installable core

### Overview

Add the plugin and everything needed for the browser to consider the app installable: a generated manifest + service
worker, icon wiring, the virtual-module TypeScript type, the dev-artifact gitignore, and `index.html` meta (iOS
standalone tags + light/dark `theme-color`). No custom registration yet (Phase 2).

### Changes Required:

#### 1. Add the plugin dependency

**File**: [apps/web/package.json](apps/web/package.json)

**Intent**: Bring in `vite-plugin-pwa` (transitively Workbox 7) as a dev dependency.

**Contract**: Add `"vite-plugin-pwa": "^1.3.0"` to `devDependencies`. Install with
`npm i -D vite-plugin-pwa -w @habitpair/web`, then re-run `npm install` at the repo root (the lockfile lives there per
the root CLAUDE.md monorepo rule).

#### 2. Configure VitePWA

**File**: [apps/web/vite.config.ts](apps/web/vite.config.ts)

**Intent**: Generate the manifest + precaching SW; declare the install metadata, the deep-link fallback, and serve the
SW in dev so the existing Playwright harness can exercise it.

**Contract**: Import `{ VitePWA }` and append it **last** in the `plugins` array (after `tailwindcss()`). Manifest icons
point at the existing `favicon-192.png` / `favicon-512.png` (`purpose: 'any'`). `injectRegister: null` (manual
registration in Phase 2). Snippet (load-bearing — icon names differ from research, and several options are
counterintuitive):

```ts
import { VitePWA } from 'vite-plugin-pwa';

// plugins: [ TanStackRouterVite(...), react(), babel(...), tailwindcss(),
VitePWA({
  registerType: 'prompt',
  injectRegister: null, // we call registerSW() ourselves in main.tsx (Phase 2)
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
      { src: 'favicon-192.png', sizes: '192x192', type: 'image/png' },
      { src: 'favicon-512.png', sizes: '512x512', type: 'image/png' },
    ],
  },
  workbox: {
    globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
    globIgnores: ['**/product/**'], // keep marketing screenshots out of the shell precache
    navigateFallback: '/index.html',
  },
  devOptions: { enabled: true }, // serve the SW under `vite dev` (make up) for Playwright + local testing
})
```

#### 3. Type the virtual module

**File**: [apps/web/tsconfig.app.json](apps/web/tsconfig.app.json)

**Intent**: Make the `virtual:pwa-register` import (Phase 2) type-check under `tsc -b`.

**Contract**: Add `"vite-plugin-pwa/client"` to `compilerOptions.types` (currently `["vite/client"]`). Use `/client`
(plain) — not `/react` — because registration is the plain `registerSW` variant.

#### 4. Ignore dev artifacts

**File**: [apps/web/.gitignore](apps/web/.gitignore)

**Intent**: Keep `vite-plugin-pwa`'s dev output out of git.

**Contract**: Append `dev-dist/`.

#### 5. iOS standalone meta + light/dark theme-color

**File**: [apps/web/index.html](apps/web/index.html)

**Intent**: Proper iOS standalone launch/title, and a browser-chrome tint that tracks light/dark.

**Contract**: In `<head>`, add `mobile-web-app-capable` + `apple-mobile-web-app-capable` (`content="yes"`),
`apple-mobile-web-app-status-bar-style` (`default`), and `apple-mobile-web-app-title` (`Habitpair`). Replace the single
`<meta name="theme-color" content="#2e7d5b">` (index.html:9) with two media-scoped tags: light → `#2e7d5b` (preserve the
current value), dark → `#262320`. The dark value must stay in sync with the inline bootstrap script's dark bg
(index.html:141).

#### 6. Icons (already in place)

**Files**: `apps/web/public/favicon-192.png`, `apps/web/public/favicon-512.png`

**Intent**: Manifest install icons. No change — verify they exist at the expected sizes; the manifest (change #2)
references them.

**Contract**: 192×192 and 512×512 PNGs present in `public/`. (Maskable variant intentionally omitted — see Open Risks.)

### Success Criteria:

#### Automated Verification:

- `npm install` at the repo root succeeds and the lockfile records `vite-plugin-pwa`
- `npm run build -w @habitpair/web` succeeds and emits `apps/web/dist/manifest.webmanifest` + `apps/web/dist/sw.js`
- `npm run typecheck -w @habitpair/web` passes (the `virtual:pwa-register` type resolves)
- `npm run lint -w @habitpair/web` passes
- `npm run test -w @habitpair/web` passes (node-env suite unaffected by the plugin)

#### Manual Verification:

- DevTools → Application → Manifest shows name/short_name/icons with no errors; the 192 & 512 icons load (no 404)
- DevTools → Application → Service Workers shows the SW registered & activated (dev, via `devOptions`)
- Lighthouse "Installable" check passes
- The iOS standalone meta tags are present; `theme-color` tracks light vs dark (toggle the theme to confirm)

**Implementation Note**: After this phase and all automated verification passes, pause for human confirmation of the
manual checks before proceeding.

---

## Phase 2: Hybrid update strategy (Option B)

### Overview

Register the service worker from `main.tsx` with a **hybrid update strategy**: on a **cold start**, auto-apply a pending
update and reload once (no in-progress work, so the app should feel like the latest version); during an **active
session**, surface a non-intrusive "new version available → Reload" toast instead of a surprise reload. A periodic update
check makes the active-session case actually fire. The toast is delivered by extending the existing Toast with an
optional action button.

### Changes Required:

#### 1. Extend the toast contract with an optional action

**File**: [apps/web/src/shared/lib/toast.ts](apps/web/src/shared/lib/toast.ts)

**Intent**: Let a toast carry an action button without breaking existing `toast(message)` / `toast(message, duration)`
callers.

**Contract**: Add an exported `ToastAction = { label: string; onClick: () => void }`; add optional `action?: ToastAction`
to `ToastItem`; add an optional third parameter `action?` to `toast(message, duration?, action?)` (backward compatible).

#### 2. Render the action variant

**File**: [apps/web/src/shared/components/Toast.tsx](apps/web/src/shared/components/Toast.tsx)

**Intent**: Show a button when an action is present, and keep the CTA reachable.

**Contract**: Accept an optional `action` prop. When present, render an action `<button>` (label → `onClick`), use
`role="alert"` (assertive) instead of `role="status"`, and do **not** auto-dismiss on the short default duration (persist
or use a long duration) so the "Reload" CTA stays clickable. When absent, behavior is unchanged (`role="status"`,
auto-dismiss). Reuse existing button classes (e.g. `btn btn--ghost btn--sm` as in Navbar).

#### 3. Forward the action through the host

**File**: [apps/web/src/shared/components/ToastHost.tsx](apps/web/src/shared/components/ToastHost.tsx)

**Intent**: Pass the queue head's action to the Toast.

**Contract**: Forward `current.action` to `<Toast action={...} />`.

#### 4. Cover the action variant in tests

**File**: [apps/web/src/shared/components/Toast.test.tsx](apps/web/src/shared/components/Toast.test.tsx)

**Intent**: Lock the new behavior.

**Contract**: Add cases: action toast renders a button with the label, clicking it fires `onClick`, the role is `alert`
(vs `status` for a plain toast), and an action toast does not auto-dismiss on the short default.

#### 5. Register the SW + wire the hybrid update strategy

**File**: [apps/web/src/main.tsx](apps/web/src/main.tsx)

**Intent**: Register the service worker once at startup; auto-apply updates that surface at/near app open (cold start),
prompt for updates that surface during an active session, and poll so the active-session case is actually detected.

**Contract**: Near `void authStore.bootstrap()` (main.tsx:22), register via `virtual:pwa-register`. Capture an app-start
timestamp at module load. In `onNeedRefresh`, branch on a short cold-start grace window: within it → `updateSW(true)`
(auto-activate + reload once); after it → an action toast whose button calls `updateSW(true)`. `onOfflineReady` → a plain
informational toast. `onRegisteredSW` → an hourly `registration.update()` so a deploy during an open session is detected.
`onNeedRefresh` fires only when an old SW already controls the page, so first-time visitors are never auto-reloaded; the
plugin guards the reload to fire once. Snippet (core wiring — the cold-start branch and the periodic check are the
non-obvious parts):

```ts
import { registerSW } from 'virtual:pwa-register';

const APP_STARTED_AT = Date.now();
const COLD_START_GRACE_MS = 3_000; // an update surfacing this soon after open = cold start (tunable)
const UPDATE_CHECK_INTERVAL_MS = 60 * 60 * 1000;

const updateSW = registerSW({
  onNeedRefresh() {
    if (Date.now() - APP_STARTED_AT < COLD_START_GRACE_MS) {
      void updateSW(true); // cold start: no in-progress work — activate + reload once
    } else {
      toast('A new version is available.', 10_000, { label: 'Reload', onClick: () => void updateSW(true) });
    }
  },
  onOfflineReady() {
    toast('Ready to work offline.');
  },
  onRegisteredSW(_swUrl, registration) {
    if (registration) setInterval(() => void registration.update(), UPDATE_CHECK_INTERVAL_MS);
  },
});
```

### Success Criteria:

#### Automated Verification:

- `npm run test -w @habitpair/web` passes, including the updated `Toast.test.tsx` action-variant cases
- `npm run typecheck -w @habitpair/web` and `npm run lint -w @habitpair/web` pass
- `npm run build -w @habitpair/web` succeeds (the `main.tsx` `virtual:pwa-register` import resolves in the build)

#### Manual Verification:

- **Cold start**: with an update already waiting (deploy, then reopen the app), the new SW auto-activates and the page
  reloads **once** to the new version — no toast
- **Active session**: with the app left open, deploying a new build surfaces the "new version available" action toast
  (within the update-check interval); clicking **Reload** loads the new version, and it never reloads on its own
- First-ever load surfaces the "ready to work offline" toast once and does **not** reload (no prior controller)
- The update action toast persists (does not vanish at the short default) until clicked

**Implementation Note**: Pause for human confirmation of the manual checks before proceeding.

---

## Phase 3: Install affordance

### Overview

Add a discoverable in-app install path: capture `beforeinstallprompt`, show an "Install" button in the Navbar when the
browser supports it, and show an "Add to Home Screen" hint on iOS where the event never fires.

### Changes Required:

#### 1. `beforeinstallprompt` store

**File**: `apps/web/src/shared/lib/pwaInstall.ts` (new)

**Intent**: A framework-agnostic singleton (mirroring `authStore` / `toastStore`) that captures the deferred install
event, exposes installability state, and triggers the native prompt.

**Contract**: Attach a `beforeinstallprompt` listener at module load (`preventDefault()` + stash the event); expose
`subscribe` / `getSnapshot` returning installability state (`canInstall`, and an `isStandalone` derived from
`matchMedia('(display-mode: standalone)')`) and a `promptInstall()` that calls the deferred event's `prompt()`, awaits
the choice, and clears it. **Guard all browser-API access** (`typeof window`, feature-detect `matchMedia`) so the module
is import-safe under the node-env test runner.

#### 2. Install button component

**File**: `apps/web/src/shared/components/InstallButton.tsx` (new)

**Intent**: Render the install affordance, with an iOS fallback.

**Contract**: Subscribe to the `pwaInstall` store. When `canInstall` and not standalone → render an "Install" button
(reuse `btn btn--ghost btn--sm`) that calls `promptInstall()` on click. On iOS Safari (no event, not standalone) → render
an "Add to Home Screen" hint affordance instead (a minimal explanation: Share → Add to Home Screen — a toast or small
popover is acceptable). Render nothing when already installed or unsupported.

#### 3. Mount in the Navbar + import the store at startup

**Files**: [apps/web/src/shared/components/Navbar.tsx](apps/web/src/shared/components/Navbar.tsx),
[apps/web/src/main.tsx](apps/web/src/main.tsx)

**Intent**: Place the button in the existing nav slot, and ensure the store's listener is attached early enough to catch
the event.

**Contract**: Render `<InstallButton />` inside the `nav__right` block (Navbar.tsx:14-22). Import the `pwaInstall` store
in `main.tsx` at startup (side-effect import alongside `authStore`) so its `beforeinstallprompt` listener is registered
before React mounts.

### Success Criteria:

#### Automated Verification:

- `npm run typecheck -w @habitpair/web`, `npm run lint -w @habitpair/web`, and `npm run test -w @habitpair/web` pass —
  the `pwaInstall` store is import-safe under node (browser APIs guarded)
- `npm run build -w @habitpair/web` succeeds

#### Manual Verification:

- Desktop/Android Chrome: the "Install" button appears in the Navbar when installable; clicking it opens the native
  install prompt; the button disappears once installed (`display-mode: standalone`)
- iOS Safari: no install event → an "Add to Home Screen" hint is shown instead
- No install button is shown when already installed or in an unsupported browser

**Implementation Note**: Pause for human confirmation of the manual checks before proceeding.

---

## Phase 4: Deploy & caching

### Overview

Stop freezing the service worker and manifest for a year. In **both** the Makefile and the CI workflow: exclude the
PWA files from the immutable sync, re-upload them `no-cache` with correct content-types, and add them to the CloudFront
invalidation. No Terraform change.

### Changes Required:

#### 1. Makefile deploy target

**File**: [Makefile](Makefile) (`aws-deploy-web`, lines 102-115)

**Intent**: Treat `sw.js` / `workbox-*.js` / `manifest.webmanifest` as never-cache, and invalidate them on deploy.

**Contract**: (a) Add `--exclude "sw.js" --exclude "workbox-*.js" --exclude "manifest.webmanifest"` to the immutable
`aws s3 sync` (Makefile:106-109). (b) After the `index.html` upload (Makefile:112), upload the three PWA files
`no-cache` with explicit content-types. (c) Extend the invalidation paths (Makefile:113-115). Snippet (content-type +
wildcard handling is non-obvious):

```make
	# PWA files: never cache, explicit content-types (S3 mis-guesses .webmanifest)
	aws s3 cp apps/web/dist/sw.js s3://$(BUCKET)/sw.js \
		--cache-control "no-cache, no-store, must-revalidate" \
		--content-type "application/javascript"
	aws s3 cp apps/web/dist/manifest.webmanifest s3://$(BUCKET)/manifest.webmanifest \
		--cache-control "no-cache, no-store, must-revalidate" \
		--content-type "application/manifest+json"
	aws s3 sync apps/web/dist/ s3://$(BUCKET)/ \
		--exclude "*" --include "workbox-*.js" \
		--cache-control "no-cache, no-store, must-revalidate" \
		--content-type "application/javascript"
	aws cloudfront create-invalidation --distribution-id $(DIST_ID) \
		--paths "/index.html" "/" "/sw.js" "/manifest.webmanifest" "/workbox-*.js"
```

#### 2. CI deploy workflow (mirror)

**File**: [.github/workflows/web-deploy.yaml](.github/workflows/web-deploy.yaml) (lines 167-185)

**Intent**: Keep CI byte-for-byte equivalent to the Makefile so manual and automated deploys behave identically.

**Contract**: Add the same `--exclude` flags to the "Sync hashed assets" step (167-172); add a new "Sync service worker
+ manifest" step uploading the three PWA files `no-cache` with the same explicit content-types (after the index.html
step, 175-179); extend the invalidation `--paths` identically (181-185).

### Success Criteria:

#### Automated Verification:

- `make -n aws-deploy-web` (dry run) shows: the immutable sync excludes `sw.js`/`workbox-*.js`/`manifest.webmanifest`,
  a `no-cache` upload of those three with correct content-types, and the extended invalidation paths
- The `web-deploy.yaml` diff mirrors the Makefile edits (same excludes, the new upload step, the same invalidation paths)

#### Manual Verification:

- After a deploy, `curl -I <cloudfront>/sw.js` and `curl -I <cloudfront>/manifest.webmanifest` return **200** with
  `Cache-Control: no-cache, no-store, must-revalidate` and the correct `Content-Type`
  (`application/javascript`, `application/manifest+json`) — not the HTML index.html fallback
- A subsequent deploy is picked up by an installed client (the "new version" toast appears) — confirming the SW is no
  longer frozen by the year-long immutable header

**Implementation Note**: Pause for human confirmation of the manual checks before proceeding.

---

## Phase 5: Verification

### Overview

Add an automated Playwright smoke (manifest link + SW registration) that fits the existing dev-server harness and runs
in CI, plus a manual DevTools/real-device pass for the parts that can't be reliably automated against a dev SW.

### Changes Required:

#### 1. PWA smoke spec

**File**: `e2e/pwa-install.spec.ts` (new)

**Intent**: Guard installability against regressions (e.g., a future caching change breaking the SW) without flakiness.

**Contract**: Navigate to `/`; assert a `<link rel="manifest">` is present and fetching its href returns JSON with the
expected `name` and `icons`; assert `navigator.serviceWorker.ready` resolves (SW registered + active) — waiting on state,
never a timeout. Authoring must follow [e2e/E2E_RULES.md](e2e/E2E_RULES.md): role/label/text locators, wait-for-state not
time, test independence + self-cleanup. **Author this spec via the `/10x-e2e` skill** and review it against the five
anti-patterns. Depends on Phase 1's `devOptions.enabled` (the harness serves `make up` / Vite dev) and Phase 2's
`registerSW` call.

### Success Criteria:

#### Automated Verification:

- `npm run test:e2e` runs `e2e/pwa-install.spec.ts` green: manifest link present + manifest fetch returns the expected
  name/icons; `navigator.serviceWorker.ready` resolves
- The spec passes review against the five `/10x-e2e` anti-patterns (locators, no `waitForTimeout`, independence + cleanup)
- The e2e GitHub Actions workflow runs the new spec green

#### Manual Verification:

- DevTools → Application → Service Workers → check "Offline" → reload: the app shell renders offline (including a deep
  route, via `navigateFallback`); habit data shows its network-error/empty state (data stays network-backed)
- Install the PWA on at least one real device (Android Chrome install + iOS Safari "Add to Home Screen") and confirm a
  standalone launch with the correct icon

**Implementation Note**: This is the final phase — confirm both the automated smoke and the manual/real-device pass.

---

## Testing Strategy

### Unit Tests (Vitest, node env):

- `Toast.test.tsx`: action-button variant renders, click fires `onClick`, `role="alert"` vs `status`, no short-default
  auto-dismiss for action toasts.
- `pwaInstall` store: import-safe under node (browser APIs guarded); state transitions are exercised where feasible
  without a DOM.

### Integration / E2E (Playwright, against `make up`):

- `e2e/pwa-install.spec.ts`: manifest link present + valid; SW registers and becomes active.

### Manual Testing Steps:

1. `npm run build -w @habitpair/web && npm run preview -w @habitpair/web` (or `make up` with `devOptions`) → DevTools →
   Application: manifest valid, SW activated, Lighthouse "Installable" passes.
2. DevTools → Service Workers → Offline → reload a deep route → shell renders; data shows network-error state.
3. Trigger an update (re-build/serve) → "new version" toast → Reload → new version loads.
4. Install on desktop/Android Chrome (button) and iOS Safari (Add to Home Screen hint) → standalone launch + icon.
5. Post-deploy: `curl -I` the CloudFront `/sw.js` and `/manifest.webmanifest` for `no-cache` + correct content-types.

## Performance Considerations

- The precache holds only the static shell (JS/CSS/HTML/icons/fonts); marketing screenshots under `public/product/**`
  are excluded via `globIgnores` to keep the shell small.
- No `/api/*` runtime caching — data fetches are unchanged and always hit the network.
- `theme-color`/meta and the install store add negligible weight; the install store attaches a single window listener.

## Migration Notes

- The first deploy after this change must invalidate `/sw.js` and `/manifest.webmanifest` (handled by the Phase 4
  invalidation paths) so the edge serves the new files immediately.
- Existing visitors get the SW on their next load; there is no data migration (data layer is untouched).

## References

- Research: [context/changes/pwa-app/research.md](context/changes/pwa-app/research.md)
- Plugin docs: Context7 `/vite-pwa/vite-plugin-pwa` (register-service-worker, prompt-for-update guides)
- Deploy pipeline: [Makefile:102-115](Makefile), [.github/workflows/web-deploy.yaml:167-185](.github/workflows/web-deploy.yaml)
- SPA fallback (no change): [infra/terraform/frontend.tf:92-104](infra/terraform/frontend.tf)
- E2E conventions: [playwright.config.ts](playwright.config.ts), [e2e/seed.spec.ts](e2e/seed.spec.ts), `e2e/E2E_RULES.md`
- Toast system: [apps/web/src/shared/lib/toast.ts](apps/web/src/shared/lib/toast.ts),
  [apps/web/src/shared/components/Toast.tsx](apps/web/src/shared/components/Toast.tsx)

## Open Risks & Assumptions

- **Cold-start auto-reload grace window.** A pending update surfacing within ~3s of app open auto-reloads; the window is
  a heuristic for "cold start," kept short and overlapping the auth-bootstrap loading screen so it can't reload mid-task.
  It is tunable — lengthen to treat more opens as cold starts, shorten to be more conservative. (An interaction-gated
  variant — auto-apply only before the first pointer/key event — is a possible hardening if the timer proves too blunt.)
- **No maskable icon.** With only `any`-purpose icons, Android renders the icon on a platform-generated background
  (slight letterbox) rather than a full-bleed adaptive icon. Acceptable for v1; add a full-bleed 512 maskable variant
  later if a polished adaptive icon is wanted. The current art (full-bleed green rounded-rect, centered white circle
  inside the safe zone) would adapt well once exported without the transparent rounded corners.
- **Dev-server SW under Playwright.** The smoke relies on `devOptions.enabled` because the harness serves `make up`
  (Vite dev). The dev SW is not production-faithful for precaching, so true offline-shell behavior is verified manually,
  not in CI.
- **`VitePWA` in the shared Vitest config.** Expected to be inert under `node`-env tests (no build/serve). If it isn't,
  the documented mitigation is to gate the plugin behind `!process.env.VITEST`.
- **`apple-mobile-web-app-status-bar-style: default`** is the safe choice; `black-translucent` (more immersive) would
  require verifying safe-area insets against `viewport-fit=cover` — out of scope for v1.

## Progress

> Convention: `- [ ]` pending, `- [x]` done. Append ` — <commit sha>` when a step lands. Do not rename step titles. See `references/progress-format.md`.

### Phase 1: Installable core

#### Automated

- [x] 1.1 `npm install` at repo root succeeds; lockfile records `vite-plugin-pwa` — 4058d2f
- [x] 1.2 `npm run build -w @habitpair/web` emits `dist/manifest.webmanifest` + `dist/sw.js` — 4058d2f
- [x] 1.3 `npm run typecheck -w @habitpair/web` passes (virtual:pwa-register type resolves) — 4058d2f
- [x] 1.4 `npm run lint -w @habitpair/web` passes — 4058d2f
- [x] 1.5 `npm run test -w @habitpair/web` passes (node-env suite unaffected) — 4058d2f

#### Manual

- [ ] 1.6 DevTools → Application → Manifest valid; 192 & 512 icons load (no 404)
- [ ] 1.7 DevTools → Application → Service Workers shows SW registered & activated (dev)
- [ ] 1.8 Lighthouse "Installable" check passes
- [ ] 1.9 iOS standalone meta present; theme-color tracks light/dark

### Phase 2: Hybrid update strategy

#### Automated

- [x] 2.1 `npm run test -w @habitpair/web` passes incl. Toast action-variant cases — bf87e4d
- [x] 2.2 `npm run typecheck` + `npm run lint -w @habitpair/web` pass — bf87e4d
- [x] 2.3 `npm run build -w @habitpair/web` succeeds (main.tsx virtual import resolves) — bf87e4d

#### Manual

- [x] 2.4 Cold start: a pending update auto-activates and reloads once (no toast) — bf87e4d
- [x] 2.5 Active session: a deploy surfaces the action toast; Reload loads it; never self-reloads — bf87e4d
- [x] 2.6 First-ever load shows "ready to work offline" once and does not reload (no prior controller) — bf87e4d
- [x] 2.7 The update action toast persists until clicked — bf87e4d

### Phase 3: Install affordance

#### Automated

- [x] 3.1 `typecheck`/`lint`/`test -w @habitpair/web` pass; pwaInstall store import-safe under node — dcdb6a5
- [x] 3.2 `npm run build -w @habitpair/web` succeeds — dcdb6a5

#### Manual

- [x] 3.3 Chrome: Install button appears when installable; click prompts; hides once installed — dcdb6a5
- [x] 3.4 iOS Safari: "Add to Home Screen" hint shown instead — dcdb6a5
- [x] 3.5 No install button when already installed / unsupported — dcdb6a5

### Phase 4: Deploy & caching

#### Automated

- [x] 4.1 `make -n aws-deploy-web` shows excludes + no-cache upload + extended invalidation — 95d785c
- [x] 4.2 `web-deploy.yaml` mirrors the Makefile edits (excludes, upload step, invalidation paths) — 95d785c

#### Manual

- [x] 4.3 `curl -I` CloudFront `/sw.js` + `/manifest.webmanifest`: 200, no-cache, correct content-types — 95d785c
- [x] 4.4 A later deploy is picked up by an installed client (new-version toast appears) — 95d785c

### Phase 5: Verification

#### Automated

- [x] 5.1 `npm run test:e2e` passes `e2e/pwa-install.spec.ts` (manifest link + SW ready)
- [x] 5.2 Spec passes review against the five /10x-e2e anti-patterns
- [ ] 5.3 The e2e GitHub Actions workflow runs the new spec green

#### Manual

- [ ] 5.4 DevTools offline reload: shell renders offline (deep route too); data shows network-error state
- [ ] 5.5 Install on a real device (Android Chrome + iOS Add to Home Screen); standalone launch + icon
