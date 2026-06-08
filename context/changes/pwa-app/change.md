---
change_id: pwa-app
title: PWA app shell
status: implementing
created: 2026-06-08
updated: 2026-06-08
archived_at: null
---

## Notes

<!-- Free-form notes for this change: links, ad-hoc context, decisions that don't belong in research/frame/plan. -->

- 2026-06-08 — Scope trimmed after implementation, by user decision: removed the
  in-app **install affordance** (Phase 3: `InstallButton` + `pwaInstall` store +
  Navbar mount + startup import) and the **"Ready to work offline" toast**
  (`onOfflineReady`, part of Phase 2). Rationale: an install button and an
  offline notification add UI/notification noise the user doesn't want — installs
  go through the browser's own affordance (e.g. Safari "Add to Home Screen"). The
  manifest, icons, iOS meta, service worker, and the "new version → Reload" update
  flow (silent auto-reload on open + mid-session toast) are kept.
