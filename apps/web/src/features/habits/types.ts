export type Modality = 'POSITIVE' | 'NEGATIVE';
export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY';
export type MarkStatus = 'COMPLETED' | 'MISSED';

export interface CreateHabitInput {
  name: string;
  modality: Modality;
  frequency: Frequency;
  targetCount?: number;
}

export interface UpdateHabitInput {
  name?: string;
  modality?: Modality;
}

export interface RecentMark {
  date: string; // YYYY-MM-DD
  status: MarkStatus;
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
  // List enrichment (habits-api findByUser): the trailing 7-day mark window for
  // the week strip, the active streak for the chip, and the streak unit.
  recentMarks: RecentMark[];
  currentStreak: number;
  unit: StreakUnit;
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

export interface PatternBucket {
  done: number;
  total: number;
  partial: boolean;
}

// Mirrors habits-api computePatterns (marks/patterns.ts). Bucket facts only —
// normalization, tones, and insight copy are derived client-side.
export interface HabitPatterns {
  mode: 'RATE' | 'COUNT'; // RATE for DAILY, COUNT for WEEKLY/MONTHLY
  weekday: PatternBucket[]; // length 7, Monday-first; partial always false
  month: PatternBucket[]; // length 12, January-first
  year: Array<{ year: number } & PatternBucket>; // ascending, only years with history
}

// Mirrors habits-api computeMetrics (marks/metrics.ts). All four metrics are
// computed on read from the habit's stored marks; the SPA only formats them.
export interface HabitMetricsResponse {
  unit: StreakUnit;
  currentStreak: number;
  // The ongoing run's span (length === currentStreak), or null when no active
  // streak. Sent independently of bestStreaks so the UI can pin it when it's too
  // short to make the top 10.
  currentRun: BestStreak | null;
  rollingConsistency: MetricFraction;
  recentCompletion: MetricFraction & { phase: 'RATIO' | 'PERCENT' };
  bestStreaks: BestStreak[]; // top 10, longest-first (ties broken by recency)
  patterns: HabitPatterns | null; // null when the habit has no marks yet
}
