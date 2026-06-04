import { HabitFrequency, MarkStatus } from '../../generated/prisma';
import {
  addUtcDays,
  endOfIsoWeek,
  endOfMonth,
  formatDateOnly,
  startOfIsoWeek,
  startOfMonth,
  type MarkRow,
} from './period';

// Pure habit-metrics engine. No Prisma, no Nest — mirrors period.ts so it is
// unit-testable in isolation. Every metric is derived from one chronological
// sequence of period classifications (success / failure / pending) built from
// the anchor period to the current (open) period, reusing period.ts's
// UTC-getter boundary helpers so the DST robustness NFR holds.
//
// Calendar-consistency invariant: a day/period the S-02 calendar colors as a
// failure MUST classify as `failure` here (and vice versa). Daily failures =
// explicit MISSED ∪ computed-missed (unmarked closed days); weekly/monthly
// failures = closed periods under target. This is asserted in metrics.spec.ts.

export type StreakUnit = 'DAY' | 'WEEK' | 'MONTH';

export interface BestStreak {
  start: string; // YYYY-MM-DD — first success period's start-of-period date
  end: string; // YYYY-MM-DD — last success period's end-of-period date, clamped to today
  length: number; // count of consecutive success periods, in the native unit
}

export interface MetricFraction {
  numerator: number;
  denominator: number;
  percent: number | null; // null when denominator === 0 (UI renders a neutral "—")
}

export interface RecentCompletion extends MetricFraction {
  phase: 'RATIO' | 'PERCENT';
}

export interface HabitMetrics {
  unit: StreakUnit;
  currentStreak: number;
  // The ongoing run's span (length === currentStreak), or null when there is no
  // active streak. Returned independently of bestStreaks so the UI can still pin
  // the active streak when it is too short to make the top 10.
  currentRun: BestStreak | null;
  rollingConsistency: MetricFraction;
  recentCompletion: RecentCompletion;
  bestStreaks: BestStreak[]; // top 10 by (length desc, start desc)
}

export interface MetricsInput {
  frequency: HabitFrequency;
  target: number; // 1 for daily (the implicit per-day target)
  anchor: Date | null; // earliest mark date (UTC midnight) — nothing before it is evaluable
  today: Date; // the client's local calendar day, as UTC midnight
  marks: MarkRow[]; // all of the habit's marks, ascending by date
}

export type PeriodStatus = 'success' | 'failure' | 'pending';

export interface ClassifiedPeriod {
  start: Date;
  end: Date;
  status: PeriodStatus;
}

const DAY_MS = 86_400_000;
const RATIO_PHASE_DAYS = 14;
const ROLLING_WINDOW: Record<HabitFrequency, number> = {
  [HabitFrequency.DAILY]: 30,
  [HabitFrequency.WEEKLY]: 8,
  [HabitFrequency.MONTHLY]: 6,
};

export function computeMetrics(input: MetricsInput): HabitMetrics {
  const unit = unitFor(input.frequency);

  // No marks → nothing is evaluable; surface neutral empties (no NaN, no "0 of 0").
  if (!input.anchor) {
    return {
      unit,
      currentStreak: 0,
      currentRun: null,
      rollingConsistency: { numerator: 0, denominator: 0, percent: null },
      recentCompletion: { numerator: 0, denominator: 0, percent: null, phase: 'RATIO' },
      bestStreaks: [],
    };
  }

  const periods = classifyPeriods(input);

  // The last period is always the in-progress current period (its end is on or
  // after today). Excluding it from every denominator is the "today /
  // in-progress never penalizes" rule — a still-winnable period can't drag the
  // percentage down, and a young habit isn't punished for periods it hasn't had.
  const closed = periods.slice(0, periods.length - 1);

  const window = closed.slice(Math.max(0, closed.length - ROLLING_WINDOW[input.frequency]));
  const ageDays = Math.round((input.today.getTime() - input.anchor.getTime()) / DAY_MS);

  // The ongoing run is the most recent run (runs are chronological); it is the
  // active streak iff currentStreak > 0 (a pending current period only ever sits
  // last, so nothing else can be ongoing). Its length equals currentStreak.
  const runs = collectRuns(periods, input.today);
  const cs = currentStreak(periods);

  return {
    unit,
    currentStreak: cs,
    currentRun: cs > 0 ? (runs[runs.length - 1] ?? null) : null,
    rollingConsistency: fraction(window),
    recentCompletion: {
      ...fraction(closed),
      phase: ageDays < RATIO_PHASE_DAYS ? 'RATIO' : 'PERCENT',
    },
    bestStreaks: topStreaksByLength(runs),
  };
}

// Builds the chronological sequence from the anchor period to the current
// period. Returns [] when there is no anchor.
export function classifyPeriods(input: MetricsInput): ClassifiedPeriod[] {
  const { frequency, target, anchor, today, marks } = input;
  if (!anchor) return [];

  if (frequency === HabitFrequency.DAILY) {
    const statusByDay = new Map<string, MarkStatus>();
    for (const m of marks) statusByDay.set(formatDateOnly(m.date), m.status);

    const out: ClassifiedPeriod[] = [];
    for (let day = anchor; day.getTime() <= today.getTime(); day = addUtcDays(day, 1)) {
      const status = statusByDay.get(formatDateOnly(day));
      const isToday = day.getTime() === today.getTime();
      let cls: PeriodStatus;
      if (status === MarkStatus.COMPLETED) {
        cls = 'success';
      } else if (isToday) {
        // Today only counts if explicitly COMPLETED. An explicit MISSED is a
        // definitive failure (the daily period is atomic); an unmarked today
        // is pending — it neither breaks nor extends the streak.
        cls = status === MarkStatus.MISSED ? 'failure' : 'pending';
      } else {
        // A closed day that is not COMPLETED is a failure (explicit MISSED or
        // an unmarked, fully-elapsed day).
        cls = 'failure';
      }
      out.push({ start: day, end: day, status: cls });
    }
    return out;
  }

  const isWeekly = frequency === HabitFrequency.WEEKLY;
  const startOfPeriod = isWeekly ? startOfIsoWeek : startOfMonth;
  const endOfPeriod = isWeekly ? endOfIsoWeek : endOfMonth;
  const nextStart = isWeekly
    ? (d: Date) => addUtcDays(d, 7)
    : (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

  const completed = marks.filter((m) => m.status === MarkStatus.COMPLETED);
  const out: ClassifiedPeriod[] = [];

  for (
    let pStart = startOfPeriod(anchor);
    pStart.getTime() <= today.getTime();
    pStart = nextStart(pStart)
  ) {
    const pEnd = endOfPeriod(pStart);
    // Re-scan per period is O(periods×marks) — fine at MVP scale (see plan's
    // Performance Considerations); bucket marks by period if history grows.
    const count = completed.filter(
      (m) => m.date.getTime() >= pStart.getTime() && m.date.getTime() <= pEnd.getTime(),
    ).length;
    const isClosed = pEnd.getTime() < today.getTime();
    let cls: PeriodStatus;
    if (count >= target) {
      // Meeting target is a success even for the current open period — the
      // streak can tick up mid-period.
      cls = 'success';
    } else {
      // Under target: a closed period failed; an open one is still winnable.
      cls = isClosed ? 'failure' : 'pending';
    }
    out.push({ start: pStart, end: pEnd, status: cls });
  }
  return out;
}

// Walk backward from the current period: skip a pending current period, count
// consecutive successes, stop at the first failure.
function currentStreak(periods: ClassifiedPeriod[]): number {
  let streak = 0;
  for (let i = periods.length - 1; i >= 0; i--) {
    const status = periods[i].status;
    if (status === 'pending') continue;
    if (status === 'failure') break;
    streak++;
  }
  return streak;
}

// Every maximal success-run in chronological order (ascending start). The
// ongoing run, if any, is the last element. Its end is clamped to today so an
// ongoing weekly/monthly run never shows a future period boundary.
function collectRuns(periods: ClassifiedPeriod[], today: Date): BestStreak[] {
  const runs: BestStreak[] = [];
  let runStart = -1;
  for (let i = 0; i <= periods.length; i++) {
    const isSuccess = i < periods.length && periods[i].status === 'success';
    if (isSuccess) {
      if (runStart === -1) runStart = i;
    } else if (runStart !== -1) {
      const last = i - 1;
      runs.push({
        start: formatDateOnly(periods[runStart].start),
        end: formatDateOnly(minDate(periods[last].end, today)),
        length: last - runStart + 1,
      });
      runStart = -1;
    }
  }
  return runs;
}

// Top 10 by (length desc, start desc): longest first, length-ties broken toward
// recency. This is both the selection rule and the display order.
function topStreaksByLength(runs: BestStreak[]): BestStreak[] {
  return [...runs]
    .sort((a, b) => b.length - a.length || compareDateDesc(a.start, b.start))
    .slice(0, 10);
}

function fraction(periods: ClassifiedPeriod[]): MetricFraction {
  const denominator = periods.length;
  const numerator = periods.filter((p) => p.status === 'success').length;
  const percent = denominator === 0 ? null : Math.round((100 * numerator) / denominator);
  return { numerator, denominator, percent };
}

function unitFor(frequency: HabitFrequency): StreakUnit {
  if (frequency === HabitFrequency.WEEKLY) return 'WEEK';
  if (frequency === HabitFrequency.MONTHLY) return 'MONTH';
  return 'DAY';
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}

// YYYY-MM-DD strings sort lexicographically the same as chronologically.
function compareDateDesc(a: string, b: string): number {
  if (a < b) return 1;
  if (a > b) return -1;
  return 0;
}
