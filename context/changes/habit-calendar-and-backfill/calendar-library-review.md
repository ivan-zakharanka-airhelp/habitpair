# Calendar library review — S-02 (habit-calendar-and-backfill)

> Captured 2026-06-03. Evaluates calendar libraries for the S-02 habit-detail
> calendar grid. Versions/peer-deps verified against npm on that date — re-check
> before install.

## Requirements (from roadmap.md S-02)

- Monthly **day-of-week grid**, Monday-first, ISO 8601.
- Per-day cell states: **completed (green ✓)**, **missed (red ✗)**, today, unmarked.
- **Streak highlighting** spanning multiple days *and* month boundaries.
- Retroactive marking (select any past day to change its status).

## Stack constraints

React 19.2, Vite 8, Tailwind v4 (no config; `@theme`/`@utility`), TS 6,
React Compiler 1.0. **No date library installed yet** — each candidate brings
its own, so the calendar choice doubles as the app's date-lib choice.

## Candidates (all verified React-19-compatible)

| Library | Version | React 19 peer | Bundled date lib | Fit |
|---|---|---|---|---|
| **react-day-picker** | 10.0.1 | `react >=16.8.0` ✓ | `date-fns@^4.1.0` + `@date-fns/tz@^1.4.1` | Best turnkey fit |
| **react-aria-components** (`Calendar`) | 1.18.0 | `^16.8 \|\| ^17 \|\| ^18 \|\| ^19.0.0-rc.1` ✓ | `@internationalized/date@3.12.2` | Headless, most control |
| Hand-rolled grid + `date-fns` | — | ✓ | add `date-fns` manually | Viable, most code |

Note: the `@daypicker/react` import seen in docs is an alias package that
re-exports `react-day-picker@10.0.1` — use the classic `react-day-picker`.

## Recommendation: react-day-picker v10

Maps almost one-to-one onto the three requirements:

- **Streaks across days *and* months** — `modifiers` accepts date *ranges*
  (`{ from, to }`); `numberOfMonths` renders consecutive months in one grid, so a
  streak range spans month boundaries visually. Pass computed streak ranges as a
  modifier; style via `modifiersClassNames` (Tailwind classes).
- **Green ✓ / red ✗ per day** — assign `completed` / `missed` modifiers to marked
  dates, then style via `modifiersClassNames` or override the `Day`/`DayButton`
  component to render an icon from the modifier.
- **Monday-first ISO 8601** — built-in `ISOWeek` prop (Monday start + ISO week
  numbers).
- **Bonus** — bundles `date-fns@4`, filling the missing app date library. WCAG
  2.1 AA, TypeScript-native, Tailwind-friendly.

## Main tradeoff vs. React Aria

react-day-picker is higher-level/opinionated (less code, you style around its
DOM). React Aria's `Calendar` is fully headless — you compute marked/missed/streak
state yourself and render each `CalendarCell` via render props (more code), but
get best-in-class a11y and `@internationalized/date`, whose `CalendarDate` model
is **DST-robust** — a real bonus for the **S-03 metrics slice**, where the roadmap
flags timezone/DST as an NFR.

Caveat: React Aria's *RangeCalendar* models only one contiguous selection. For
displaying multiple disjoint streaks, use the plain `Calendar` + custom cell
logic, not range selection.

If avoiding a calendar dependency entirely: a hand-rolled grid + `date-fns` is
feasible (fixed layout), but you reimplement keyboard nav, focus management, and
month paging that both libraries give for free.

## Open decision

Date-model choice is coupled to the calendar choice and will outlive S-02:
- `react-day-picker` → standardize on **`date-fns@4`** app-wide.
- `react-aria-components` → standardize on **`@internationalized/date`** (better
  DST story for S-03 metrics).

## Sources

- Context7: `/gpbl/react-day-picker`, `/websites/react-aria_adobe`.
- npm: peer-deps + bundled deps for `react-day-picker@10.0.1`,
  `react-aria-components@1.18.0`, `@internationalized/date@3.12.2`.
