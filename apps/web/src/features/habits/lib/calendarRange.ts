import { todayLocalISO } from './today';

export interface CalendarRange {
  fromMonth: string; // YYYY-MM — backend query lower bound
  toMonth: string; // YYYY-MM — backend query upper bound
}

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

// One calendar page spans this many months. Page 0 ends at the current month;
// older pages tile backward in fixed-size windows the detail view pages through
// (useHabitCalendar). Within the backend's 36-month-per-request cap
// (marks/period.ts).
export const ALL_CAP_MONTHS = 24;

export function monthIndex(month: string): number {
  const [year, mon] = month.split('-').map(Number);
  return year * 12 + (mon - 1);
}

export function indexToMonth(index: number): string {
  const year = Math.floor(index / 12);
  const mon = (index % 12) + 1;
  return `${year}-${String(mon).padStart(2, '0')}`;
}

// The user's current month (YYYY-MM), local — the forward clamp for navigation.
export function currentMonth(): string {
  return todayLocalISO().slice(0, 7);
}

// The month range to FETCH for a given page. Page 0 is the most recent
// ALL_CAP_MONTHS ending at the current month; page p is the ALL_CAP_MONTHS window
// immediately before page p−1 (older). Deliberately independent of the first-mark
// anchor so the query key never depends on server data (which would feed back into
// itself and thrash). The display window is trimmed by the calendar component.
export function calendarPageRange(page: number): CalendarRange {
  const toIdx = monthIndex(currentMonth()) - ALL_CAP_MONTHS * page;
  return {
    fromMonth: indexToMonth(toIdx - (ALL_CAP_MONTHS - 1)),
    toMonth: indexToMonth(toIdx),
  };
}

// Page 0 window — the most recent ALL_CAP_MONTHS ending at the current month.
export function calendarQueryRange(): CalendarRange {
  return calendarPageRange(0);
}

// Inverse of calendarPageRange: which page's window contains this month. Used by
// the optimistic mutation to patch only the page that holds the edited date.
export function pageIndexForMonth(month: string): number {
  const offset = monthIndex(currentMonth()) - monthIndex(month);
  // Page 0 ends at the current month, so a future month belongs to no page.
  // Return a sentinel the caller reads as "not loaded" rather than a bogus
  // negative index that varies with how far ahead the month is.
  if (offset < 0) return -1;
  return Math.floor(offset / ALL_CAP_MONTHS);
}
