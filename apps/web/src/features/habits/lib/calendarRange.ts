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

// The detail calendar fetches this many months up front (ending the current
// month) and slides a display window over them client-side, so navigation never
// refetches. Within the backend's 36-month-per-request cap (marks/period.ts).
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

// The month range to FETCH: the most recent ALL_CAP_MONTHS ending at the current
// month. Deliberately independent of the first-mark anchor so the query key never
// depends on server data (which would feed back into itself and thrash). The
// display window is trimmed to first-mark→today afterwards by the calendar component.
export function calendarQueryRange(): CalendarRange {
  const currentIdx = monthIndex(currentMonth());
  return {
    fromMonth: indexToMonth(currentIdx - (ALL_CAP_MONTHS - 1)),
    toMonth: indexToMonth(currentIdx),
  };
}
