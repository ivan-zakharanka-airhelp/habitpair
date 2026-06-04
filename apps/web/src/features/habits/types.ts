export type Modality = 'POSITIVE' | 'NEGATIVE';
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type MarkStatus = 'COMPLETED' | 'MISSED';

export interface CreateHabitInput {
  name: string;
  modality: Modality;
  frequency: Frequency;
  targetCount?: number;
}

export interface HabitListItem {
  id: string;
  name: string;
  modality: Modality;
  frequency: Frequency;
  targetCount: number | null;
  todayStatus: MarkStatus | null;
  currentPeriod: {
    kind: Frequency;
    completedCount: number;
    target: number;
  };
}

export interface FailedPeriod {
  start: string;
  end: string;
  completedCount: number;
  target: number;
}

// Mirrors habits-api HabitsService.getCalendar. Stored `marks` are the cycle's
// source of truth; `computedMissedDates` (daily) and `failedPeriods`
// (weekly/monthly) are coloring-only, computed server-side so the SPA never
// re-derives period logic.
export interface HabitCalendarResponse {
  habit: {
    id: string;
    name: string;
    modality: Modality;
    frequency: Frequency;
    targetCount: number | null;
  };
  firstMarkDate: string | null;
  marks: Record<string, MarkStatus>;
  computedMissedDates: string[];
  failedPeriods: FailedPeriod[];
}

export type CalendarSpan = '3' | '6' | '12' | 'all';

export type StreakUnit = 'DAY' | 'WEEK' | 'MONTH';

interface MetricFraction {
  numerator: number;
  denominator: number;
  percent: number | null; // null when denominator === 0 — UI renders a neutral "—"
}

export interface BestStreak {
  start: string; // YYYY-MM-DD
  end: string; // YYYY-MM-DD, clamped to today
  length: number; // consecutive success periods, in the native unit
}

// Mirrors habits-api computeMetrics (marks/metrics.ts). All four metrics are
// computed on read from the habit's stored marks; the SPA only formats them.
export interface HabitMetricsResponse {
  unit: StreakUnit;
  currentStreak: number;
  rollingConsistency: MetricFraction;
  recentCompletion: MetricFraction & { phase: 'RATIO' | 'PERCENT' };
  bestStreaks: BestStreak[];
}
