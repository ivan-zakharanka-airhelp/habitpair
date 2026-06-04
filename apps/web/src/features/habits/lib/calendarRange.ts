import { todayLocalISO } from './today';
import type { CalendarSpan } from '../types';

export interface CalendarRange {
  fromMonth: string; // YYYY-MM — backend query lower bound
  toMonth: string; // YYYY-MM — backend query upper bound
}

export interface CalendarDisplay {
  numberOfMonths: number; // months react-day-picker renders
  startMonth: Date; // local first-of-month for the earliest displayed month
}

// 'All' is a convenience view, soft-capped so an old anchor can't mount a huge
// grid. Unbounded back-reach comes from navigating the fixed 3/6/12 spans, never
// from 'All'. Backend monthSpan rejects > 36 months per request regardless.
const ALL_CAP_MONTHS = 24;

function monthIndex(month: string): number {
  const [year, mon] = month.split('-').map(Number);
  return year * 12 + (mon - 1);
}

function indexToMonth(index: number): string {
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return `${year}-${String(mon).padStart(2, '0')}`;
}

function monthToLocalDate(month: string): Date {
  const [year, mon] = month.split('-').map(Number);
  return new Date(year, mon - 1, 1);
}

// The user's current month (YYYY-MM), local — the forward clamp for navigation.
export function currentMonth(): string {
  return todayLocalISO().slice(0, 7);
}

// The month range to FETCH. Deliberately independent of the first-mark anchor so
// the query key never depends on server data (which would feed back into itself
// and thrash). 3/6/12 fetch exactly the shown window — backward unbounded,
// forward clamped at the current month. 'all' fetches the most recent
// ALL_CAP_MONTHS ending at the current month; the display is trimmed to
// first-mark→today afterwards (see calendarDisplay).
export function calendarQueryRange(span: CalendarSpan, endMonth: string): CalendarRange {
  const currentIdx = monthIndex(currentMonth());
  if (span === 'all') {
    return {
      fromMonth: indexToMonth(currentIdx - (ALL_CAP_MONTHS - 1)),
      toMonth: indexToMonth(currentIdx),
    };
  }
  const count = Number(span);
  const toIdx = Math.min(monthIndex(endMonth), currentIdx);
  return {
    fromMonth: indexToMonth(toIdx - (count - 1)),
    toMonth: indexToMonth(toIdx),
  };
}

// How many months react-day-picker renders and where it starts — derived during
// render from the fetched range + the (global) first-mark anchor, so no effect
// syncs server state into React state. 3/6/12 render the whole fetched range;
// 'all' renders first-mark→today (so empty months before the anchor aren't
// shown). With no anchor it falls back to the full fetched range.
export function calendarDisplay(
  span: CalendarSpan,
  range: CalendarRange,
  firstMarkDate: string | null,
): CalendarDisplay {
  const fromIdx = monthIndex(range.fromMonth);
  const toIdx = monthIndex(range.toMonth);
  if (span === 'all' && firstMarkDate != null) {
    const startIdx = Math.max(fromIdx, monthIndex(firstMarkDate.slice(0, 7)));
    return {
      numberOfMonths: toIdx - startIdx + 1,
      startMonth: monthToLocalDate(indexToMonth(startIdx)),
    };
  }
  return {
    numberOfMonths: toIdx - fromIdx + 1,
    startMonth: monthToLocalDate(range.fromMonth),
  };
}
