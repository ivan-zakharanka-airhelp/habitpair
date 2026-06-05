import { localDateFromISO } from './today';
import type { HabitMetricsResponse, StreakUnit } from '../types';

const UNIT_NOUN: Record<StreakUnit, string> = {
  DAY: 'day',
  WEEK: 'week',
  MONTH: 'month',
};

// Trailing-window sizes mirror the backend ROLLING_WINDOW (habits-api
// marks/metrics.ts) — keep the two in sync.
const WINDOW_SIZE: Record<StreakUnit, number> = {
  DAY: 30,
  WEEK: 8,
  MONTH: 6,
};

function pluralize(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

// The bare unit noun ("day"/"week"/"month") — for UI that renders the count and
// its unit in separate type styles (e.g. the best-streak rows).
export function unitNoun(unit: StreakUnit): string {
  return UNIT_NOUN[unit];
}

// "5 days" / "2 weeks" / "1 month" — a streak length in its native unit.
export function streakLabel(length: number, unit: StreakUnit): string {
  return pluralize(length, UNIT_NOUN[unit]);
}

// "30 days" / "8 weeks" / "6 months" — the rolling-consistency window label.
export function rollingWindowLabel(unit: StreakUnit): string {
  return pluralize(WINDOW_SIZE[unit], UNIT_NOUN[unit]);
}

// A percentage figure, or a neutral "—" when there's nothing to divide
// (denominator 0 → percent null). Covers rolling consistency.
export function percentLabel(percent: number | null): string {
  return percent === null ? '—' : `${percent}%`;
}

// Recent completion shows a raw "X of Y" ratio for the habit's first 14 days of
// tracking, then a percentage. "—" when no closed period exists yet (the null
// check wins over the phase so a brand-new habit never renders "0 of 0").
export function recentCompletionLabel(recent: HabitMetricsResponse['recentCompletion']): string {
  if (recent.percent === null) return '—';
  if (recent.phase === 'RATIO') return `${recent.numerator} of ${recent.denominator}`;
  return `${recent.percent}%`;
}

// Parse via localDateFromISO (not new Date(iso)) so the displayed day matches the
// server's date key — new Date('YYYY-MM-DD') is UTC and would shift west of GMT.
// 'en-US' is explicit (the UI is English-only) so the format is deterministic.
function fmtDate(iso: string, opts: Intl.DateTimeFormatOptions): string {
  return localDateFromISO(iso).toLocaleDateString('en-US', opts);
}

// A best-streak boundary date as "Jun 4, 2026".
export function streakDateLabel(iso: string): string {
  return fmtDate(iso, { year: 'numeric', month: 'short', day: 'numeric' });
}

// A best-streak's date range. Collapses a single-period run to one date, and
// drops the redundant start-year when both ends share a year:
// "Apr 21 – Apr 30, 2026", but "Dec 28, 2025 – Jan 3, 2026" across a boundary.
export function streakRangeLabel(start: string, end: string): string {
  if (start === end) return streakDateLabel(start);
  const startLabel =
    start.slice(0, 4) === end.slice(0, 4)
      ? fmtDate(start, { month: 'short', day: 'numeric' })
      : streakDateLabel(start);
  return `${startLabel} – ${streakDateLabel(end)}`;
}
