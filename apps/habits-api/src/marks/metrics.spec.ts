import { classifyPeriods, computeMetrics, type MetricsInput } from './metrics';
import {
  closedPeriodFailures,
  computedMissedDates,
  formatDateOnly,
  parseDateOnly,
  type MarkRow,
} from './period';
import { HabitFrequency, MarkStatus } from '../../generated/prisma';

const { DAILY, WEEKLY, MONTHLY } = HabitFrequency;
const { COMPLETED, MISSED } = MarkStatus;

const d = (s: string): Date => parseDateOnly(s);
const mark = (date: string, status: MarkStatus = COMPLETED): MarkRow => ({
  date: parseDateOnly(date),
  status,
});

// Anchor = earliest mark, exactly as HabitsService.getMetrics derives it.
function input(
  frequency: HabitFrequency,
  target: number,
  today: string,
  marks: MarkRow[],
): MetricsInput {
  const sorted = [...marks].sort((a, b) => a.date.getTime() - b.date.getTime());
  return {
    frequency,
    target,
    anchor: sorted.length ? sorted[0].date : null,
    today: d(today),
    marks: sorted,
  };
}

describe('computeMetrics — unit + empty habit', () => {
  it('derives the native streak unit from frequency', () => {
    expect(computeMetrics(input(DAILY, 1, '2026-06-15', [mark('2026-06-15')])).unit).toBe('DAY');
    expect(computeMetrics(input(WEEKLY, 2, '2026-06-15', [mark('2026-06-15')])).unit).toBe('WEEK');
    expect(computeMetrics(input(MONTHLY, 5, '2026-06-15', [mark('2026-06-15')])).unit).toBe(
      'MONTH',
    );
  });

  it('returns neutral empties for a never-marked habit', () => {
    const m = computeMetrics(input(DAILY, 1, '2026-06-15', []));
    expect(m.currentStreak).toBe(0);
    expect(m.bestStreaks).toEqual([]);
    expect(m.rollingConsistency).toEqual({ numerator: 0, denominator: 0, percent: null });
    expect(m.recentCompletion).toEqual({
      numerator: 0,
      denominator: 0,
      percent: null,
      phase: 'RATIO',
    });
  });
});

describe('currentStreak (daily)', () => {
  it('counts through today when today is COMPLETED', () => {
    const m = computeMetrics(
      input(DAILY, 1, '2026-06-15', [mark('2026-06-13'), mark('2026-06-14'), mark('2026-06-15')]),
    );
    expect(m.currentStreak).toBe(3);
  });

  it('shows through yesterday when today is unmarked (neither breaks nor extends)', () => {
    const m = computeMetrics(
      input(DAILY, 1, '2026-06-15', [mark('2026-06-13'), mark('2026-06-14')]),
    );
    expect(m.currentStreak).toBe(2);
  });

  it('breaks to 0 when today is explicitly MISSED', () => {
    const m = computeMetrics(
      input(DAILY, 1, '2026-06-15', [
        mark('2026-06-13'),
        mark('2026-06-14'),
        mark('2026-06-15', MISSED),
      ]),
    );
    expect(m.currentStreak).toBe(0);
  });

  it('breaks on an unmarked past-day gap', () => {
    // 11,12 done; 13 unmarked (gap); 14 done; today 15 unmarked.
    const m = computeMetrics(
      input(DAILY, 1, '2026-06-15', [mark('2026-06-11'), mark('2026-06-12'), mark('2026-06-14')]),
    );
    expect(m.currentStreak).toBe(1);
  });

  it('breaks on an explicit MISSED in the past', () => {
    const m = computeMetrics(
      input(DAILY, 1, '2026-06-15', [mark('2026-06-13'), mark('2026-06-14', MISSED)]),
    );
    expect(m.currentStreak).toBe(0);
  });
});

describe('currentStreak (weekly / monthly) — in-progress never penalizes', () => {
  it('counts the current week once it meets target', () => {
    // Prior week Jun 8–14 satisfied; current week Jun 15–21 also has 2 → counts.
    const m = computeMetrics(
      input(WEEKLY, 2, '2026-06-17', [
        mark('2026-06-08'),
        mark('2026-06-09'),
        mark('2026-06-15'),
        mark('2026-06-16'),
      ]),
    );
    expect(m.currentStreak).toBe(2);
  });

  it('does not count the current week while it is under target (shows through last week)', () => {
    const m = computeMetrics(
      input(WEEKLY, 2, '2026-06-17', [mark('2026-06-08'), mark('2026-06-09'), mark('2026-06-15')]),
    );
    expect(m.currentStreak).toBe(1);
  });

  it('breaks on a closed under-target week', () => {
    // Jun 1–7 ok; Jun 8–14 under target (closed) → break; current week ok.
    const m = computeMetrics(
      input(WEEKLY, 2, '2026-06-17', [
        mark('2026-06-01'),
        mark('2026-06-02'),
        mark('2026-06-08'),
        mark('2026-06-15'),
        mark('2026-06-16'),
      ]),
    );
    expect(m.currentStreak).toBe(1);
  });

  it('counts the current month once it meets target', () => {
    const m = computeMetrics(
      input(MONTHLY, 2, '2026-06-15', [
        mark('2026-05-05'),
        mark('2026-05-10'),
        mark('2026-06-01'),
        mark('2026-06-02'),
      ]),
    );
    expect(m.currentStreak).toBe(2);
  });

  it('does not count the current month while it is under target', () => {
    const m = computeMetrics(
      input(MONTHLY, 2, '2026-06-15', [mark('2026-05-05'), mark('2026-05-10'), mark('2026-06-01')]),
    );
    expect(m.currentStreak).toBe(1);
  });
});

describe('rollingConsistency', () => {
  it('uses a denominator shorter than the window for a young habit', () => {
    // Anchor Jun 10, today Jun 15 → closed days [10..14] = 5; 10,11,12 done.
    const m = computeMetrics(
      input(DAILY, 1, '2026-06-15', [mark('2026-06-10'), mark('2026-06-11'), mark('2026-06-12')]),
    );
    expect(m.rollingConsistency).toEqual({ numerator: 3, denominator: 5, percent: 60 });
  });

  it('excludes the in-progress current period from the denominator', () => {
    // Jun 10–15 all done; today (15) must not inflate the denominator past 5.
    const m = computeMetrics(
      input(DAILY, 1, '2026-06-15', [
        mark('2026-06-10'),
        mark('2026-06-11'),
        mark('2026-06-12'),
        mark('2026-06-13'),
        mark('2026-06-14'),
        mark('2026-06-15'),
      ]),
    );
    expect(m.rollingConsistency.denominator).toBe(5);
    expect(m.rollingConsistency.percent).toBe(100);
    expect(m.currentStreak).toBe(6);
  });

  it('honors the exact 30-day window boundary (daily)', () => {
    // Anchor = earliest mark = May 15; today Jun 15 → 31 closed days [May 15..Jun 14].
    // The 30-window drops the oldest (May 15); May 16 is the oldest in-window day.
    const m = computeMetrics(
      input(DAILY, 1, '2026-06-15', [mark('2026-05-15'), mark('2026-05-16')]),
    );
    expect(m.rollingConsistency.denominator).toBe(30);
    expect(m.rollingConsistency.numerator).toBe(1); // only May 16 falls inside the window
    expect(m.recentCompletion.denominator).toBe(31); // unbounded counts every closed day
    expect(m.recentCompletion.numerator).toBe(2); // both May 15 and May 16
  });

  it('excludes the in-progress week from the weekly window', () => {
    const m = computeMetrics(
      input(WEEKLY, 1, '2026-06-17', [mark('2026-06-01'), mark('2026-06-08'), mark('2026-06-15')]),
    );
    expect(m.rollingConsistency).toEqual({ numerator: 2, denominator: 2, percent: 100 });
  });

  it('returns percent null when the only mark is today (denominator 0)', () => {
    const m = computeMetrics(input(DAILY, 1, '2026-06-15', [mark('2026-06-15')]));
    expect(m.rollingConsistency).toEqual({ numerator: 0, denominator: 0, percent: null });
    expect(m.recentCompletion).toEqual({
      numerator: 0,
      denominator: 0,
      percent: null,
      phase: 'RATIO',
    });
    expect(m.currentStreak).toBe(1); // today counts even with a zero denominator
  });
});

describe('recentCompletion', () => {
  it('renders a ratio while the habit is younger than 14 days', () => {
    // Anchor Jun 2, today Jun 15 → ageDays 13 → RATIO; closed [Jun 2..14] = 13.
    const m = computeMetrics(
      input(DAILY, 1, '2026-06-15', [
        mark('2026-06-02'),
        mark('2026-06-03'),
        mark('2026-06-04'),
        mark('2026-06-05'),
        mark('2026-06-06'),
        mark('2026-06-07'),
        mark('2026-06-08'),
      ]),
    );
    expect(m.recentCompletion.phase).toBe('RATIO');
    expect(m.recentCompletion.numerator).toBe(7);
    expect(m.recentCompletion.denominator).toBe(13);
    expect(m.recentCompletion.percent).toBe(54);
  });

  it('switches to a percentage at exactly 14 days of tracking', () => {
    const day13 = computeMetrics(input(DAILY, 1, '2026-06-15', [mark('2026-06-02')])); // ageDays 13
    const day14 = computeMetrics(input(DAILY, 1, '2026-06-15', [mark('2026-06-01')])); // ageDays 14
    expect(day13.recentCompletion.phase).toBe('RATIO');
    expect(day14.recentCompletion.phase).toBe('PERCENT');
  });

  it('counts every closed period since the anchor (unbounded), not just the window', () => {
    // Anchor Jun 1, today Jun 15 → ageDays 14 → PERCENT; closed [Jun 1..14] = 14, 7 done.
    const m = computeMetrics(
      input(DAILY, 1, '2026-06-15', [
        mark('2026-06-01'),
        mark('2026-06-02'),
        mark('2026-06-03'),
        mark('2026-06-04'),
        mark('2026-06-05'),
        mark('2026-06-06'),
        mark('2026-06-07'),
      ]),
    );
    expect(m.recentCompletion).toEqual({
      numerator: 7,
      denominator: 14,
      percent: 50,
      phase: 'PERCENT',
    });
  });
});

describe('bestStreaks', () => {
  it('enumerates every run and displays them most-recent-first', () => {
    // Runs: Jun 1–3 (3), Jun 5–9 (5), Jun 11–12 (2); today far ahead, all closed.
    const marks = [1, 2, 3, 5, 6, 7, 8, 9, 11, 12].map((n) =>
      mark(`2026-06-${String(n).padStart(2, '0')}`),
    );
    const m = computeMetrics(input(DAILY, 1, '2026-06-30', marks));
    expect(m.bestStreaks).toEqual([
      { start: '2026-06-11', end: '2026-06-12', length: 2 },
      { start: '2026-06-05', end: '2026-06-09', length: 5 },
      { start: '2026-06-01', end: '2026-06-03', length: 3 },
    ]);
  });

  it('keeps the 10 longest with ties broken toward recency', () => {
    // 11 isolated single-day runs (odd days). All length 1, so the oldest (Jun 1)
    // is dropped by the recency tie-break; the rest display newest-first.
    const marks = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 21].map((n) =>
      mark(`2026-06-${String(n).padStart(2, '0')}`),
    );
    const m = computeMetrics(input(DAILY, 1, '2026-07-01', marks));
    expect(m.bestStreaks).toHaveLength(10);
    expect(m.bestStreaks[0]).toEqual({ start: '2026-06-21', end: '2026-06-21', length: 1 });
    expect(m.bestStreaks[9].start).toBe('2026-06-03');
    expect(m.bestStreaks.map((s) => s.start)).not.toContain('2026-06-01');
  });

  it('includes the ongoing daily run with end clamped to today', () => {
    const m = computeMetrics(
      input(DAILY, 1, '2026-06-15', [mark('2026-06-13'), mark('2026-06-14'), mark('2026-06-15')]),
    );
    expect(m.bestStreaks).toEqual([{ start: '2026-06-13', end: '2026-06-15', length: 3 }]);
  });

  it('clamps an ongoing weekly run end to today, not the future period boundary', () => {
    // Current week ends Sun Jun 21, but today is Wed Jun 17 — end must read Jun 17.
    const m = computeMetrics(
      input(WEEKLY, 1, '2026-06-17', [mark('2026-06-08'), mark('2026-06-15')]),
    );
    expect(m.bestStreaks).toEqual([{ start: '2026-06-08', end: '2026-06-17', length: 2 }]);
  });

  it('measures length in the native unit for monthly habits', () => {
    const m = computeMetrics(
      input(MONTHLY, 1, '2026-06-15', [mark('2026-04-01'), mark('2026-05-01'), mark('2026-06-01')]),
    );
    expect(m.bestStreaks).toEqual([{ start: '2026-04-01', end: '2026-06-15', length: 3 }]);
  });
});

describe('DST robustness', () => {
  it('survives a spring-forward window with no off-by-one (EU DST Sun 2026-03-29)', () => {
    const m = computeMetrics(
      input(DAILY, 1, '2026-03-31', [
        mark('2026-03-27'),
        mark('2026-03-28'),
        mark('2026-03-29'),
        mark('2026-03-30'),
      ]),
    );
    expect(m.currentStreak).toBe(4);
    expect(m.bestStreaks).toEqual([{ start: '2026-03-27', end: '2026-03-30', length: 4 }]);
    expect(m.rollingConsistency).toEqual({ numerator: 4, denominator: 4, percent: 100 });
  });
});

describe('calendar-consistency invariant', () => {
  it('daily failures equal computedMissedDates ∪ explicit MISSED over the closed range', () => {
    const today = '2026-06-15';
    const marks = [mark('2026-06-10'), mark('2026-06-11', MISSED), mark('2026-06-12')];
    const inp = input(DAILY, 1, today, marks);
    const periods = classifyPeriods(inp);
    const closedFailures = periods
      .slice(0, periods.length - 1)
      .filter((p) => p.status === 'failure')
      .map((p) => formatDateOnly(p.start))
      .sort();
    const fromCalendar = [
      ...computedMissedDates(inp.marks, inp.anchor, d('2026-06-10'), d('2026-06-15'), d(today)),
      ...inp.marks
        .filter((mk) => mk.status === MISSED && mk.date.getTime() < d(today).getTime())
        .map((mk) => formatDateOnly(mk.date)),
    ].sort();
    expect(closedFailures).toEqual(fromCalendar);
    expect(closedFailures).toEqual(['2026-06-11', '2026-06-13', '2026-06-14']);
  });

  it('weekly failures equal closedPeriodFailures over a shared range', () => {
    const today = '2026-06-17';
    const marks = [mark('2026-06-01'), mark('2026-06-02'), mark('2026-06-08')];
    const inp = input(WEEKLY, 2, today, marks);
    const mine = classifyPeriods(inp)
      .filter((p) => p.status === 'failure')
      .map((p) => formatDateOnly(p.start));
    const calendar = closedPeriodFailures(
      WEEKLY,
      2,
      inp.marks,
      inp.anchor,
      d('2026-06-01'),
      d(today),
      d(today),
    ).map((p) => p.start);
    expect(mine).toEqual(calendar);
    expect(mine).toEqual(['2026-06-08']);
  });

  it('monthly failures equal closedPeriodFailures over a shared range', () => {
    const today = '2026-06-15';
    const marks = [
      mark('2026-03-05'),
      mark('2026-03-10'),
      mark('2026-03-15', MISSED),
      mark('2026-04-01'),
      mark('2026-04-02'),
      mark('2026-04-03'),
      mark('2026-04-04'),
      mark('2026-04-05'),
      mark('2026-06-01'),
    ];
    const inp = input(MONTHLY, 5, today, marks);
    const mine = classifyPeriods(inp)
      .filter((p) => p.status === 'failure')
      .map((p) => formatDateOnly(p.start));
    const calendar = closedPeriodFailures(
      MONTHLY,
      5,
      inp.marks,
      inp.anchor,
      d('2026-03-01'),
      d(today),
      d(today),
    ).map((p) => p.start);
    expect(mine).toEqual(calendar);
    expect(mine).toEqual(['2026-03-01', '2026-05-01']);
  });
});
