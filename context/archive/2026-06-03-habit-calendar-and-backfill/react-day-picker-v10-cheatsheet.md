# react-day-picker v10 — API cheatsheet for S-02

> Captured 2026-06-03 from Context7 (`/gpbl/react-day-picker`, v10). Implementation
> reference for the S-02 habit-detail calendar (habit-calendar-and-backfill).
> Pairs with `calendar-library-review.md` (the why) — this is the how.

## Install & import

```bash
npm install react-day-picker   # bundles date-fns@4 + @date-fns/tz
```

```tsx
import { DayPicker } from "react-day-picker";
import "react-day-picker/style.css";
```

v10 also publishes an alias scope — `@daypicker/react` + `@daypicker/react/style.css`
is the "preferred new" import, but the `react-day-picker` package name stays valid
in v10, so either works.

## Requirement → API map

| S-02 / FR requirement | react-day-picker mechanism |
|---|---|
| Monthly grid, Monday-first ISO 8601 (FR-011) | `ISOWeek` prop (Monday start + ISO week numbers); or `weekStartsOn={1}` for Monday without ISO numbering |
| Month navigation | controlled `month` + `onMonthChange` |
| Cell states: completed/missed/today/unmarked (FR-012) | `modifiers` + `modifiersClassNames` (+ custom `DayButton` for icons) |
| Retroactive marking, any past day (FR-010) | `onDayClick(date, modifiers)` toggles status; `disabled={{ after: today }}` blocks only future |

## Building blocks

### 1. Mark days via custom modifiers

Modifier values accept `Date[]` *or* ranges `{ from, to }` (the latter is the streak pill).

```tsx
modifiers={{
  completed: completedDates,                     // Date[]
  missed: missedDates,                           // Date[]
  streak: { from: streakStart, to: streakEnd },  // range → spans the row(s)
}}
modifiersClassNames={{
  completed: "text-green-600",
  missed: "text-red-600",
  streak: "bg-green-100",
  today: "ring-1 ring-blue-500",                 // `today` modifier is automatic
}}
```

Sources: `guides/custom-modifiers.mdx`. `today` is auto-applied; override with the
`today` prop for tests.

### 2. Read status on click (retroactive marking)

`onDayClick` receives the date plus a `Modifiers` object — a record of booleans incl.
custom modifiers + built-ins (`today`, `disabled`, `selected`, `outside`, `hidden`).

```tsx
onDayClick={(date, modifiers) => {
  if (modifiers.disabled) return;       // future days
  // cycle: unmarked → completed → missed → unmarked
  cycleStatus(date, modifiers.completed, modifiers.missed);
}}
```

### 3. Render ✓ / ✗ icons via a custom DayButton

`components` overrides cell rendering. `DayButtonProps = { day: CalendarDay;
modifiers: Modifiers } & ButtonHTMLAttributes`; `day.date` is the JS `Date`.

```tsx
import { DayButton, type DayButtonProps } from "react-day-picker";

function HabitDayButton({ day, modifiers, children, ...props }: DayButtonProps) {
  const icon = modifiers.completed ? "✓" : modifiers.missed ? "✗" : null;
  return (
    <DayButton day={day} modifiers={modifiers} {...props}>
      {icon ?? children /* falls back to the day number */}
    </DayButton>
  );
}
// <DayPicker components={{ DayButton: HabitDayButton }} … />
```

Sources: `guides/custom-components.mdx`; `CustomComponents` + `DayButton()` API.
Other overridable slots: `Day`, `Week`, `Weekday`, `MonthCaption`, `Chevron`, etc.

### Assembled shape

```tsx
const [month, setMonth] = useState(new Date());

<DayPicker
  month={month}
  onMonthChange={setMonth}
  ISOWeek
  disabled={{ after: new Date() }}
  modifiers={{ completed: completedDates, missed: missedDates }}
  modifiersClassNames={{ completed: "text-green-600", missed: "text-red-600" }}
  components={{ DayButton: HabitDayButton }}
  onDayClick={(date, mods) => {
    if (mods.disabled) return;
    cycleStatus(date, mods.completed, mods.missed);
  }}
/>
```

## Design notes that matter for this slice

- **Don't use selection mode.** Habit marking isn't date-picking — omit
  `mode`/`selected`/`onSelect` entirely and drive everything through `modifiers` +
  `onDayClick`. `selected` is for pickers; you want a status toggle.
- **Date-only ↔ `Date` boundary.** Marks arrive from the API as `yyyy-mm-dd`; build
  them as **local-midnight** `Date`s before passing to `modifiers`, or cells go
  off-by-one near timezone boundaries. For habits with many marks, pass a matcher
  *function* `(date) => boolean` that checks a `Set` keyed by `yyyy-mm-dd` instead of
  a large `Date[]`.

## Relevant TypeScript types

`DayPickerProps`, `Modifiers` (record of booleans), `ModifiersClassNames`,
`Matcher` (`Date | Date[] | {from,to} | {after} | {before} | fn` — used by `disabled`
and modifier values), `DayButtonProps`, `CalendarDay` (`.date` is the JS Date),
`CustomComponents`.

## To confirm at wiring time

`ISOWeek` and the `disabled` matcher (`{ after }`) are long-standing core props but
weren't in the fetched snippet set — confirm exact spelling against the v10 API
reference (`docs/api/react/`) when you install.
