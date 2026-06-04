const MONTH_LABELS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// How far back the year jump reaches. Prev stays unbounded for older months;
// this only bounds the direct-jump dropdown.
const JUMP_YEARS_BACK = 20;

function shiftMonth(month: string, delta: number): string {
  const [year, mon] = month.split('-').map(Number);
  const index = year * 12 + (mon - 1) + delta;
  const newYear = Math.floor(index / 12);
  const newMon = (index % 12) + 1;
  return `${newYear}-${String(newMon).padStart(2, '0')}`;
}

interface CalendarNavProps {
  endMonth: string; // YYYY-MM — the latest month in the window
  onChange: (month: string) => void;
  max: string; // YYYY-MM — the current month (forward clamp)
}

// Positions the fixed-size window: prev/next shift the anchor (backward
// unbounded, forward clamped at `max`) and a month/year jump reaches a far-back
// month directly. Calendar-anchored, never mark-anchored — so a month before the
// first mark is reachable for first-time backfill.
export function CalendarNav({ endMonth, onChange, max }: CalendarNavProps) {
  const [yearStr, monthStr] = endMonth.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const maxYear = Number(max.slice(0, 4));
  const atMax = endMonth >= max;

  const years: number[] = [];
  for (let y = maxYear; y >= maxYear - JUMP_YEARS_BACK; y--) years.push(y);

  const clamp = (candidate: string) => (candidate > max ? max : candidate);

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label="Earlier months"
        onClick={() => onChange(shiftMonth(endMonth, -1))}
        className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-700"
      >
        ‹
      </button>
      <select
        aria-label="Month"
        value={month}
        onChange={(event) =>
          onChange(clamp(`${year}-${String(Number(event.target.value)).padStart(2, '0')}`))
        }
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      >
        {MONTH_LABELS.map((label, index) => (
          <option key={label} value={index + 1}>
            {label}
          </option>
        ))}
      </select>
      <select
        aria-label="Year"
        value={year}
        onChange={(event) => onChange(clamp(`${event.target.value}-${monthStr}`))}
        className="rounded border border-gray-300 px-2 py-1 text-sm"
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <button
        type="button"
        aria-label="Later months"
        disabled={atMax}
        onClick={() => onChange(shiftMonth(endMonth, 1))}
        className="rounded border border-gray-300 px-2 py-1 text-sm text-gray-700 disabled:opacity-40"
      >
        ›
      </button>
    </div>
  );
}
