import type { ReactNode } from 'react';
import { MONTH_NAMES } from '../lib/calendarRange';
import type { MarkStatus } from '../types';

const MONTH_ABBR = [
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
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

interface MonthViewProps {
  ym: string; // YYYY-MM
  // Stored marks with daily computed-misses already folded in as MISSED (stored
  // wins); see HabitCalendar.
  marks: Record<string, MarkStatus>;
  failSet: Set<string>; // weekly/monthly failed-period days (failtint)
  today: string; // YYYY-MM-DD local — future days are disabled
  onCycle: (iso: string) => void;
  showTitle?: boolean;
}

// A single Monday-first month grid. Leading pad cells align the 1st to its
// weekday; each day tints by priority done → miss → failtint → plain, with a
// today ring and future days disabled. Clicking a past/today cell cycles its
// mark via onCycle.
export function MonthView({ ym, marks, failSet, today, onCycle, showTitle }: MonthViewProps) {
  const [y, mo] = ym.split('-').map(Number);
  const lead = (new Date(y, mo - 1, 1).getDay() + 6) % 7; // Monday-first padding
  const days = new Date(y, mo, 0).getDate(); // day 0 of next month = last day

  const cells: ReactNode[] = [];
  for (let i = 0; i < lead; i++) {
    cells.push(<div key={`p${i}`} className="cal-cell cal-cell--pad" />);
  }
  for (let d = 1; d <= days; d++) {
    const iso = `${ym}-${String(d).padStart(2, '0')}`;
    const future = iso > today;
    const isToday = iso === today;
    const mark = marks[iso];

    let cls = 'cal-cell ';
    if (future) cls += 'cal-cell--future';
    else if (mark === 'COMPLETED') cls += 'cal-cell--done';
    else if (mark === 'MISSED') cls += 'cal-cell--miss';
    else if (failSet.has(iso)) cls += 'cal-cell--failtint cal-cell--unmarked';
    else cls += 'cal-cell--unmarked';
    if (isToday) cls += ' cal-cell--today';

    cells.push(
      <button
        key={iso}
        type="button"
        className={cls}
        disabled={future}
        aria-label={`${MONTH_ABBR[mo - 1]} ${d}${mark ? `, ${mark.toLowerCase()}` : ''}`}
        onClick={() => {
          if (!future) onCycle(iso);
        }}
      >
        <span className="cal-cell__num">{d}</span>
      </button>,
    );
  }

  return (
    <div className="mv">
      {showTitle ? (
        <h4 className="mv__title">
          {MONTH_NAMES[mo - 1]} {y}
        </h4>
      ) : null}
      <div className="mv__dow">
        {DOW.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>
      <div className="mv__grid">{cells}</div>
    </div>
  );
}
