import { computePatterns } from './patterns';
import { type MetricsInput } from './metrics';
import { parseDateOnly, type MarkRow } from './period';
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

// Monday-first weekday indices. 2026-06-01 is a Monday.
const MON = 0;
const TUE = 1;
const WED = 2;

describe('computePatterns — mode and empty habit', () => {
  it('returns null when there is no anchor', () => {
    expect(computePatterns(input(DAILY, 1, '2026-06-15', []))).toBeNull();
  });

  it('derives RATE mode for daily, COUNT for weekly/monthly', () => {
    expect(computePatterns(input(DAILY, 1, '2026-06-15', [mark('2026-06-15')]))?.mode).toBe('RATE');
    expect(computePatterns(input(WEEKLY, 2, '2026-06-15', [mark('2026-06-15')]))?.mode).toBe(
      'COUNT',
    );
    expect(computePatterns(input(MONTHLY, 5, '2026-06-15', [mark('2026-06-15')]))?.mode).toBe(
      'COUNT',
    );
  });
});

describe('computePatterns — RATE mode (daily)', () => {
  it('counts computed misses: unmarked closed days lower their weekday rate', () => {
    // Mondays 06-01 and 06-08 completed; every other closed day up to 06-14 is
    // an unmarked (computed) miss. Today 06-15 (Monday) is unmarked → pending.
    const p = computePatterns(
      input(DAILY, 1, '2026-06-15', [mark('2026-06-01'), mark('2026-06-08')]),
    );
    expect(p?.weekday[MON]).toEqual({ done: 2, total: 2, partial: false });
    expect(p?.weekday[TUE]).toEqual({ done: 0, total: 2, partial: false });
  });

  it('excludes an unmarked today from every bucket', () => {
    // Anchor = today: the only classified period is a pending today.
    const p = computePatterns(input(DAILY, 1, '2026-06-16', [mark('2026-06-16', MISSED)]));
    // Explicit MISSED today is a definitive failure, so use an unmarked-today
    // fixture separately below; here the mark IS today's, and it's MISSED.
    expect(p?.weekday[TUE]).toEqual({ done: 0, total: 1, partial: false });

    // Unmarked today (anchor yesterday): today appears in no bucket.
    const q = computePatterns(input(DAILY, 1, '2026-06-16', [mark('2026-06-15')]));
    expect(q?.weekday[TUE]).toEqual({ done: 0, total: 0, partial: false });
    expect(q?.weekday[MON]).toEqual({ done: 1, total: 1, partial: false });
    expect(q?.year).toEqual([{ year: 2026, done: 1, total: 1, partial: true }]);
  });

  it('resolves partial flags conservatively when the first mark is today (inverted span)', () => {
    // Anchor = today → evaluated span [06-16, 06-15] is inverted, so no
    // calendar instance can be fully covered; buckets with data stay partial.
    const p = computePatterns(input(DAILY, 1, '2026-06-16', [mark('2026-06-16')]));
    expect(p?.weekday[TUE]).toEqual({ done: 1, total: 1, partial: false });
    expect(p?.month[5]).toEqual({ done: 1, total: 1, partial: true });
    expect(p?.year).toEqual([{ year: 2026, done: 1, total: 1, partial: true }]);
  });

  it('counts an explicit MISSED as a miss', () => {
    const p = computePatterns(
      input(DAILY, 1, '2026-06-15', [
        mark('2026-06-08'),
        mark('2026-06-09', MISSED), // Tuesday
      ]),
    );
    expect(p?.weekday[TUE]).toEqual({ done: 0, total: 1, partial: false });
  });

  it('never flags weekday buckets partial', () => {
    const p = computePatterns(input(DAILY, 1, '2026-06-15', [mark('2026-06-10')]));
    expect(p?.weekday.every((b) => b.partial === false)).toBe(true);
  });

  it('flags mid-month/mid-year anchored buckets partial', () => {
    // Anchored 06-10, today 06-15 → evaluated span 06-10..06-14 covers no full
    // June and no full 2026.
    const p = computePatterns(input(DAILY, 1, '2026-06-15', [mark('2026-06-10')]));
    expect(p?.month[5].partial).toBe(true); // June has data, not fully covered
    expect(p?.month[4].total).toBe(0); // May untouched…
    expect(p?.month[4].partial).toBe(false); // …and empty buckets are never partial
    expect(p?.year).toEqual([{ year: 2026, done: 1, total: 5, partial: true }]);
  });

  it('clears the partial flag once a full calendar instance is covered', () => {
    // Anchored 05-01, today 06-15 → span 05-01..06-14: May fully covered, June not.
    const p = computePatterns(input(DAILY, 1, '2026-06-15', [mark('2026-05-01')]));
    expect(p?.month[4].partial).toBe(false);
    expect(p?.month[5].partial).toBe(true);
  });

  it('clears a month partial when a later year covers a full instance', () => {
    // Anchored 2025-06-10, today 2026-07-01 → June 2025 is partial but June
    // 2026 is fully covered, so the all-years June bucket is not partial.
    const p = computePatterns(input(DAILY, 1, '2026-07-01', [mark('2025-06-10')]));
    expect(p?.month[5].partial).toBe(false);
  });

  it('excludes today from the evaluated span for partial flags', () => {
    // Today 2026-01-01: the evaluated span ends 2025-12-31, so 2025 is fully
    // covered even though the habit is "into" 2026; pending today adds no 2026
    // data, so 2026 does not appear in the year list at all.
    const p = computePatterns(input(DAILY, 1, '2026-01-01', [mark('2025-01-01')]));
    expect(p?.year).toEqual([{ year: 2025, done: 1, total: 365, partial: false }]);
  });

  it('lists years ascending, only years with history', () => {
    const p = computePatterns(input(DAILY, 1, '2026-01-03', [mark('2024-12-30')]));
    expect(p?.year.map((y) => y.year)).toEqual([2024, 2025, 2026]);
    expect(p?.year[0]).toEqual({ year: 2024, done: 1, total: 2, partial: true });
    expect(p?.year[1].total).toBe(365);
    expect(p?.year[1].partial).toBe(false);
    expect(p?.year[2]).toEqual({ year: 2026, done: 0, total: 2, partial: true });
  });
});

describe('computePatterns — COUNT mode (weekly/monthly)', () => {
  it('buckets COMPLETED sessions by mark date with total === done', () => {
    const p = computePatterns(
      input(WEEKLY, 2, '2026-06-15', [
        mark('2026-05-20'), // Wednesday, May
        mark('2026-06-01'), // Monday, June
        mark('2026-06-04'), // Thursday, June
      ]),
    );
    expect(p?.mode).toBe('COUNT');
    expect(p?.weekday[MON]).toEqual({ done: 1, total: 1, partial: false });
    expect(p?.weekday[WED]).toEqual({ done: 1, total: 1, partial: false });
    expect(p?.month[4]).toEqual({ done: 1, total: 1, partial: true });
    expect(p?.month[5]).toEqual({ done: 2, total: 2, partial: true });
  });

  it('ignores MISSED marks as sessions', () => {
    const p = computePatterns(
      input(MONTHLY, 5, '2026-06-15', [mark('2026-06-01'), mark('2026-06-02', MISSED)]),
    );
    expect(p?.weekday[MON]).toEqual({ done: 1, total: 1, partial: false });
    expect(p?.weekday[TUE]).toEqual({ done: 0, total: 0, partial: false });
  });

  it('derives partial flags from the first→last mark span', () => {
    // Marks span 2025-01-01..2025-12-31 → 2025 fully covered, every month full.
    const p = computePatterns(
      input(WEEKLY, 1, '2026-06-15', [mark('2025-01-01'), mark('2025-12-31')]),
    );
    expect(p?.year).toEqual([{ year: 2025, done: 2, total: 2, partial: false }]);
    expect(p?.month[0].partial).toBe(false);
    expect(p?.month[11].partial).toBe(false);
  });
});
