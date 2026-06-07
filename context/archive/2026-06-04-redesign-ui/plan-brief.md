# UI Redesign — Plan Brief

> Full plan: `context/changes/redesign-ui/plan.md`
> Research: `context/changes/redesign-ui/research.md`

## What & Why

Re-skin the shipped habitpair SPA to match the Claude Design handoff (`Habitpair.html`) — canonical look only: `soft` + `green` (#2e7d5b) + `muted` + a real light/dark/system theme. Per research, this is overwhelmingly a **frontend re-skin**: the domain model and every derived metric the design renders already exist server-side (they descend from the same PRD).

## Starting Point

The app today ships all roadmap slices F-01–S-04, but the frontend is unstyled scaffolding: `styles.css` is 9 lines (no tokens, no dark mode, light-pinned), only two shared components exist (`Navbar`, `ConfirmDialog`), the calendar fights `react-day-picker`, and there's no `/settings` route. The backend is feature-complete for everything the design shows except data export + delete-account.

## Desired End State

Every screen — landing, login/register, dashboard, detail, settings — renders pixel-faithfully to the design in both light and dark (system-aware, no reload flash), responsive mobile→desktop. All shipped behavior is preserved (optimistic marking, immutable frequency, name+modality edit, hard confirm-dialog delete, demoted best-streaks) along with the calm/no-nudge PRD philosophy. Settings is visually complete with a working theme toggle; Export/Delete-account are inert "coming soon" placeholders.

## Key Decisions Made

| Decision | Choice | Why (1 sentence) | Source |
| --- | --- | --- | --- |
| Backend scope (export + delete-account) | Split out to a follow-up | Cross-service, riskiest non-visual work; shouldn't gate the visual win | Plan |
| Landing page | Full pixel-faithful port | It's the public face + confirmed in scope; the DowInsight mock frames the differentiator | Plan |
| Toast system | Build a lightweight host | Design uses toasts for create/save/delete success; small, calm-UX-compatible | Plan |
| Responsive | Full mobile + desktop parity | Porting the CSS classes brings responsiveness mostly for free | Plan |
| Token delivery | Port CSS classes wholesale + `@theme` palette | Fastest path to pixel-perfect; keeps the design's semantics intact | Research + Plan |
| Calendar | Hand-roll the design's grid; drop react-day-picker | Pixel-perfect with less effort than bending rdp; removes a fought dependency | Plan |
| Theme boot | Adopt the pre-mount anti-flash inline script | Prevents the light→dark flash on reload; design provides the script | Plan |
| Dark-mode coverage | Public surface follows theme too | Coherent with full-landing + full-responsive; respects OS preference | Plan |
| Dashboard list data | Enrich `GET /habits` (recentMarks + currentStreak + unit) | One round-trip; fits the existing per-habit block + metrics engine | Research + Plan |
| Edit surface | Name + modality only (no targetCount) | Matches the design AND the shipped backend whitelist — zero backend change | Research + Plan |
| Test depth | Primitives + key-flow smoke tests | Locks the widely-reused pieces + catches flow regressions without chasing pixels | Plan |

## Scope

**In scope:** Token/theming layer (light/dark/system + anti-flash); shared primitive library (Icon, Button, Field/Input/Select/Textarea, Segmented, Dialog, Toast+host, Skeleton, Card); redesigned Navbar + AccountMenu; dashboard re-skin + a small additive `GET /habits` enrichment; detail re-skin with a hand-rolled calendar; new `/settings` route; full landing + auth re-skin; SEO/head parity.

**Out of scope:** Export + delete-account backend (follow-up); targetCount editing; `GET /auth/me`; any new metric / `startDate`; the Tweaks panel + accent/direction/status switcher; the `Switch` primitive; root-docs cleanup.

## Architecture / Approach

Port the design's complete CSS system into `styles.css` (collapsed to one light `:root` + one `[data-theme=dark]` block, dead direction/status branches removed), exposing the palette via Tailwind v4 `@theme`. Build primitives against those classes, then recompose each screen as a thin renderer over the existing TanStack Query layer — preserving the optimistic-marking hooks and never reintroducing the mock's period math or delays. A theme store (`hp_theme` + `matchMedia`) sets `data-theme` on the `.app` root; an `index.html` inline script sets the html background pre-mount to kill the flash.

## Phases at a Glance

| Phase | What it delivers | Key risk |
| --- | --- | --- |
| 1. Design foundation | Ported tokens + classes; light/dark/system; anti-flash; font | Token-collapse / dark-mode correctness (the substrate everything sits on) |
| 2. Primitives + shell | Icon/Button/Field/Segmented/Dialog/Toast/Skeleton/Card + Navbar/AccountMenu | Getting primitive APIs right — every screen depends on them |
| 3. Dashboard + list enrichment | TodayHero + Building/Breaking HabitCards + week strip/streak; create modal; `GET /habits` enrich | List contract + preserving optimistic marking through the new card |
| 4. Detail re-skin | Metric rings; hand-rolled multi-month calendar; demoted Best Streaks; kebab edit/delete | Hand-rolled calendar correctness (tints, today ring, lazy sheet, a11y) |
| 5. Settings | New `/settings`: working theme toggle; inert export/delete | Low — mostly wiring |
| 6. Landing + auth | Full landing port (incl. DowInsight mock) + themed AuthCard + SEO | Largest markup volume; static-mock fidelity |

**Prerequisites:** None beyond the current `redesign-ui` branch; the design bundle is persisted under `context/changes/redesign-ui/design/`.
**Estimated effort:** ~6 sessions (one per phase); Phases 1, 2, and 4 are the heaviest.

## Open Risks & Assumptions

- **`currentStreak` on the list** reuses the metrics engine's per-habit mark-history read (extends the existing N+1). Assumed acceptable at this app's scale; bound the read if habit counts grow.
- **Hand-rolled calendar** must re-implement month nav + keyboard a11y that `react-day-picker` gave for free — the heaviest single component.
- **Pixel-perfect fidelity** is verified manually against the renders (no visual-regression tooling); both themes + mobile widths must be walked each phase.
- **Auth-form tests** will need selector updates after the `AuthCard` rewrite (Phase 6).

## Success Criteria (Summary)

- Every screen matches the design in light and dark, mobile and desktop, with no reload flash.
- All shipped behavior preserved: instant optimistic marking, immutable frequency, confirm-dialog delete, demoted best-streaks, calm/no-nudge tone.
- `make lint`, backend tests, FE typecheck/tests, and the web build all pass; Settings' theme toggle works and export/delete read as inert.
