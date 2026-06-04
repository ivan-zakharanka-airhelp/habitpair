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
