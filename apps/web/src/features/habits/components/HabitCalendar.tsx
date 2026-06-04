import { DayPicker, type DayProps } from 'react-day-picker';
import { localDateFromISO, localKey, todayLocalDate } from '../lib/today';
import type { HabitCalendarResponse } from '../types';

// Turn the read-model into Set<YYYY-MM-DD> matchers keyed by *local* date.
// Stored marks always win over computed coloring: a computed-missed date that
// already carries a stored mark is dropped from `missed`, so a Phase-3
// optimistic write to `marks` recolors the cell on its own.
function buildStatusSets(data: HabitCalendarResponse) {
  const completed = new Set<string>();
  const missed = new Set<string>();
  for (const [key, status] of Object.entries(data.marks)) {
    if (status === 'COMPLETED') completed.add(key);
    else missed.add(key);
  }
  for (const key of data.computedMissedDates) {
    if (!(key in data.marks)) missed.add(key);
  }
  const failedPeriod = new Set<string>();
  for (const period of data.failedPeriods) {
    const end = localDateFromISO(period.end);
    for (let d = localDateFromISO(period.start); d <= end; d.setDate(d.getDate() + 1)) {
      failedPeriod.add(localKey(d));
    }
  }
  return { completed, missed, failedPeriod };
}

// react-day-picker v10 only renders the interactive DayButton when a selection
// `mode` or `onDayClick` is set (DayPicker.js: isInteractive). This calendar is
// read-only until Phase 3, so days render as plain <td> text and a DayButton
// override would be dead. We therefore style the cell itself: a custom `Day`
// (which always renders) tints the cell + paints the today ring, and stacks the
// ✓/✗ beneath the date so the day number stays visible. Once Phase 3 adds
// onDayClick, `children` becomes the DayButton and still carries the click.
function HabitDay({ day: _day, modifiers, className, children, ...tdProps }: DayProps) {
  const status = modifiers.completed ? 'completed' : modifiers.missed ? 'missed' : null;
  const statusBg =
    status === 'completed' ? 'bg-green-100' : status === 'missed' ? 'bg-red-100' : '';
  const statusText =
    status === 'completed' ? 'text-green-700' : status === 'missed' ? 'text-red-700' : '';
  const cellClass = [
    className,
    statusBg,
    // Period tint only behind days without their own ✓/✗ (weekly/monthly).
    !status && modifiers.failedPeriod ? 'bg-red-50' : '',
    modifiers.today ? 'rounded ring-2 ring-inset ring-blue-500' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <td {...tdProps} className={cellClass}>
      <span className={`flex flex-col items-center justify-center leading-tight ${statusText}`}>
        <span>{children}</span>
        {status ? (
          <span aria-hidden="true" className="text-xs font-bold">
            {status === 'completed' ? '✓' : '✗'}
          </span>
        ) : null}
      </span>
    </td>
  );
}

interface HabitCalendarProps {
  data: HabitCalendarResponse;
  numberOfMonths: number;
  startMonth: Date;
}

// Read-only this phase — no onDayClick wiring yet (Phase 3). The window is driven
// externally via `startMonth` (controlled `month`), so built-in nav is hidden.
export function HabitCalendar({ data, numberOfMonths, startMonth }: HabitCalendarProps) {
  const today = todayLocalDate();
  const { completed, missed, failedPeriod } = buildStatusSets(data);

  return (
    <DayPicker
      ISOWeek
      month={startMonth}
      numberOfMonths={numberOfMonths}
      hideNavigation
      showOutsideDays={false}
      today={today}
      disabled={{ after: today }}
      modifiers={{
        completed: (date: Date) => completed.has(localKey(date)),
        missed: (date: Date) => missed.has(localKey(date)),
        failedPeriod: (date: Date) => failedPeriod.has(localKey(date)),
      }}
      components={{ Day: HabitDay }}
    />
  );
}
