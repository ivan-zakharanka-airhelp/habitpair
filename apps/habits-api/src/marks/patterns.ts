import { HabitFrequency, MarkStatus } from '../../generated/prisma';
import { classifyPeriods, type MetricsInput } from './metrics';
import { addUtcDays, formatDateOnly } from './period';

// Pure pattern-bucket engine. No Prisma, no Nest — mirrors metrics.ts and rides
// the same MetricsInput / Prisma read in HabitsService.getMetrics.
//
// Daily habits aggregate classifyPeriods output (RATE mode), so the
// calendar-consistency invariant extends to patterns: a day the calendar colors
// as a miss (explicit MISSED or computed-missed) lowers its weekday's rate, and
// a pending (unmarked) today appears in no bucket. Weekly/monthly habits count
// COMPLETED sessions by mark date (COUNT mode) — showing up is the signal, so
// total === done and failedPeriods stays out of it.

export interface PatternBucket {
  done: number;
  total: number;
  partial: boolean;
}

export interface HabitPatterns {
  mode: 'RATE' | 'COUNT'; // RATE for DAILY, COUNT for WEEKLY/MONTHLY
  weekday: PatternBucket[]; // length 7, Monday-first; partial always false
  month: PatternBucket[]; // length 12, January-first
  year: Array<{ year: number } & PatternBucket>; // ascending, only years with history
}

export function computePatterns(input: MetricsInput): HabitPatterns | null {
  const { frequency, anchor, today, marks } = input;
  if (!anchor) return null;

  const isDaily = frequency === HabitFrequency.DAILY;
  const weekday = Array.from({ length: 7 }, emptyBucket);
  const month = Array.from({ length: 12 }, emptyBucket);
  const yearMap = new Map<number, PatternBucket>();

  const add = (date: Date, done: boolean) => {
    bump(weekday[(date.getUTCDay() + 6) % 7], done); // Monday-first (ISO convention)
    bump(month[date.getUTCMonth()], done);
    const y = date.getUTCFullYear();
    let bucket = yearMap.get(y);
    if (!bucket) {
      bucket = emptyBucket();
      yearMap.set(y, bucket);
    }
    bump(bucket, done);
  };

  // The evaluated span drives the partial flags: RATE mode evaluates every
  // closed day [anchor, today − 1] (today is pending and never counts); COUNT
  // mode evaluates the recorded span [first mark, last mark].
  let spanFirst: string;
  let spanLast: string;

  if (isDaily) {
    for (const p of classifyPeriods(input)) {
      if (p.status === 'pending') continue;
      add(p.start, p.status === 'success');
    }
    spanFirst = formatDateOnly(anchor);
    spanLast = formatDateOnly(addUtcDays(today, -1));
  } else {
    for (const m of marks) {
      if (m.status !== MarkStatus.COMPLETED) continue;
      add(m.date, true);
    }
    // Invariant: marks is non-empty here — anchor is the earliest mark date,
    // so the !anchor early return above already yielded null.
    spanFirst = formatDateOnly(marks[0].date);
    spanLast = formatDateOnly(marks[marks.length - 1].date);
  }

  // A bucket is "partial" unless the span fully covers at least one calendar
  // instance of it — a habit anchored Dec 31 must not show that year (or
  // month) as a clean 100%. YYYY-MM-DD strings compare chronologically.
  const yearFull = (y: number) => spanFirst <= `${y}-01-01` && spanLast >= `${y}-12-31`;
  const monthFull = (m1: number) => {
    const mm = String(m1).padStart(2, '0');
    for (let y = Number(spanFirst.slice(0, 4)); y <= Number(spanLast.slice(0, 4)); y++) {
      const lastDay = new Date(Date.UTC(y, m1, 0)).getUTCDate();
      if (spanFirst <= `${y}-${mm}-01` && spanLast >= `${y}-${mm}-${lastDay}`) return true;
    }
    return false;
  };

  month.forEach((b, i) => {
    b.partial = b.total > 0 && !monthFull(i + 1);
  });

  const year = [...yearMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([y, b]) => ({ year: y, ...b, partial: !yearFull(y) }));

  return { mode: isDaily ? 'RATE' : 'COUNT', weekday, month, year };
}

function emptyBucket(): PatternBucket {
  return { done: 0, total: 0, partial: false };
}

function bump(b: PatternBucket, done: boolean): void {
  b.total++;
  if (done) b.done++;
}
