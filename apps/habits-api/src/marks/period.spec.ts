import { BadRequestException } from '@nestjs/common';
import {
  closedPeriodFailures,
  computedMissedDates,
  formatDateOnly,
  markRange,
  monthSpan,
  parseDateOnly,
  type MarkRow,
} from './period';
import { HabitFrequency, MarkStatus } from '../../generated/prisma';

const d = (s: string): Date => parseDateOnly(s);
const mark = (date: string, status: MarkStatus = MarkStatus.COMPLETED): MarkRow => ({
  date: parseDateOnly(date),
  status,
});

describe('monthSpan', () => {
  it('expands a single month to its first/last UTC day', () => {
    const { start, end } = monthSpan('2026-06', '2026-06');
    expect(formatDateOnly(start)).toBe('2026-06-01');
    expect(formatDateOnly(end)).toBe('2026-06-30');
  });

  it('expands a multi-month range to first-of-from … last-of-to', () => {
    const { start, end } = monthSpan('2026-01', '2026-03');
    expect(formatDateOnly(start)).toBe('2026-01-01');
    expect(formatDateOnly(end)).toBe('2026-03-31');
  });

  it('resolves the last day per month length, leap year included', () => {
    expect(formatDateOnly(monthSpan('2024-02', '2024-02').end)).toBe('2024-02-29');
    expect(formatDateOnly(monthSpan('2026-02', '2026-02').end)).toBe('2026-02-28');
    expect(formatDateOnly(monthSpan('2026-12', '2026-12').end)).toBe('2026-12-31');
  });

  it('rejects a "to" earlier than "from"', () => {
    expect(() => monthSpan('2026-06', '2026-05')).toThrow(BadRequestException);
  });

  it('allows exactly the max span but rejects one month more', () => {
    expect(() => monthSpan('2024-01', '2026-12')).not.toThrow(); // 36 months
    expect(() => monthSpan('2024-01', '2027-01')).toThrow(BadRequestException); // 37
  });

  it('rejects malformed or out-of-range months', () => {
    expect(() => monthSpan('2026-13', '2026-13')).toThrow(BadRequestException);
    expect(() => monthSpan('2026-00', '2026-06')).toThrow(BadRequestException);
    expect(() => monthSpan('2026-6', '2026-06')).toThrow(BadRequestException);
    expect(() => monthSpan('garbage', '2026-06')).toThrow(BadRequestException);
  });
});

describe('markRange', () => {
  it('widens the span to whole ISO weeks so straddling weeks count fully', () => {
    // April 1 2026 is a Wednesday → its ISO week starts Mon Mar 30; April 30 is
    // a Thursday → its ISO week ends Sun May 3.
    const { gte, lte } = markRange(monthSpan('2026-04', '2026-04'));
    expect(formatDateOnly(gte)).toBe('2026-03-30');
    expect(formatDateOnly(lte)).toBe('2026-05-03');
  });
});

describe('computedMissedDates (daily)', () => {
  const start = d('2026-06-01');
  const end = d('2026-06-30');
  const today = d('2026-06-15');

  it('returns unmarked gaps on/after the anchor and strictly before today', () => {
    const anchor = d('2026-06-10');
    const marks = [mark('2026-06-10', MarkStatus.COMPLETED), mark('2026-06-12', MarkStatus.MISSED)];
    expect(computedMissedDates(marks, anchor, start, end, today)).toEqual([
      '2026-06-11',
      '2026-06-13',
      '2026-06-14',
    ]);
  });

  it('never returns a day before the anchor', () => {
    const anchor = d('2026-06-10');
    const result = computedMissedDates([mark('2026-06-10')], anchor, start, end, today);
    expect(result.every((day) => day >= '2026-06-10')).toBe(true);
    expect(result).not.toContain('2026-06-09');
  });

  it('excludes today and the future (only up to today-1)', () => {
    const anchor = d('2026-06-10');
    const result = computedMissedDates([mark('2026-06-10')], anchor, start, end, today);
    expect(result).not.toContain('2026-06-15');
    expect(result).not.toContain('2026-06-16');
    expect(result[result.length - 1]).toBe('2026-06-14');
  });

  it('treats a day with any stored mark (completed or missed) as not a computed miss', () => {
    const anchor = d('2026-06-10');
    const marks = [
      mark('2026-06-10', MarkStatus.COMPLETED),
      mark('2026-06-11', MarkStatus.MISSED),
      mark('2026-06-12', MarkStatus.COMPLETED),
    ];
    const today13 = d('2026-06-13');
    expect(computedMissedDates(marks, anchor, start, end, today13)).toEqual([]);
  });

  it('returns nothing without an anchor (zero-mark habit)', () => {
    expect(computedMissedDates([], null, start, end, today)).toEqual([]);
  });

  it('returns nothing when the anchor is after the last evaluable day', () => {
    const anchor = d('2026-06-20'); // after today-1
    expect(computedMissedDates([mark('2026-06-20')], anchor, start, end, today)).toEqual([]);
  });

  it('keys off UTC and survives a DST-transition window with no off-by-one', () => {
    const anchor = d('2026-03-27');
    const dstStart = d('2026-03-01');
    const dstEnd = d('2026-03-31');
    const dstToday = d('2026-03-31'); // EU clocks spring forward Sun Mar 29 2026
    expect(computedMissedDates([mark('2026-03-27')], anchor, dstStart, dstEnd, dstToday)).toEqual([
      '2026-03-28',
      '2026-03-29',
      '2026-03-30',
    ]);
  });
});

describe('closedPeriodFailures (weekly)', () => {
  const start = d('2026-06-01'); // Monday
  const end = d('2026-06-30');
  const today = d('2026-06-15'); // Monday — start of the in-progress week

  it('flags only closed under-target weeks; a satisfied week is absent', () => {
    const anchor = d('2026-06-01');
    const marks = [
      mark('2026-06-01'),
      mark('2026-06-02'), // week Jun 1–7 → 2 completed → meets target 2
      mark('2026-06-08'), // week Jun 8–14 → 1 completed → under target
    ];
    expect(
      closedPeriodFailures(HabitFrequency.WEEKLY, 2, marks, anchor, start, end, today),
    ).toEqual([{ start: '2026-06-08', end: '2026-06-14', completedCount: 1, target: 2 }]);
  });

  it('never flags the in-progress week even with zero completions', () => {
    const anchor = d('2026-06-01');
    const result = closedPeriodFailures(
      HabitFrequency.WEEKLY,
      2,
      [mark('2026-06-01')],
      anchor,
      start,
      end,
      today,
    );
    expect(result.some((p) => p.start === '2026-06-15')).toBe(false);
  });

  it('does not flag a week before the anchor’s week', () => {
    const anchor = d('2026-06-08'); // first mark lands in week Jun 8–14
    const result = closedPeriodFailures(
      HabitFrequency.WEEKLY,
      2,
      [mark('2026-06-08')],
      anchor,
      start,
      end,
      today,
    );
    expect(result.some((p) => p.start === '2026-06-01')).toBe(false);
  });

  it('counts completions across a month-straddling week (cross-boundary marks)', () => {
    // Window April only, but the first ISO week is Mar 30–Apr 5. Marks on both
    // sides must count together — otherwise the week falsely reads as failed.
    const aprStart = d('2026-04-01');
    const aprEnd = d('2026-04-30');
    const anchor = d('2026-01-01');
    const marks = [mark('2026-03-31'), mark('2026-04-02')]; // straddling week → 2 completed
    const result = closedPeriodFailures(
      HabitFrequency.WEEKLY,
      2,
      marks,
      anchor,
      aprStart,
      aprEnd,
      today,
    );
    expect(result.some((p) => p.start === '2026-03-30')).toBe(false);
  });

  it('returns nothing without an anchor', () => {
    expect(closedPeriodFailures(HabitFrequency.WEEKLY, 2, [], null, start, end, today)).toEqual([]);
  });
});

describe('closedPeriodFailures (monthly)', () => {
  const start = d('2026-03-01');
  const end = d('2026-06-30');
  const today = d('2026-06-15'); // June is the in-progress month

  it('flags closed under-target months; met months and the current month are absent', () => {
    const anchor = d('2026-03-01');
    const marks = [
      mark('2026-03-05'),
      mark('2026-03-10'),
      mark('2026-03-15', MarkStatus.MISSED), // MISSED must not count → March completed = 2
      mark('2026-04-01'),
      mark('2026-04-02'),
      mark('2026-04-03'),
      mark('2026-04-04'),
      mark('2026-04-05'), // April completed = 5 → meets target
      mark('2026-06-01'), // June is in-progress → never evaluated
    ];
    expect(
      closedPeriodFailures(HabitFrequency.MONTHLY, 5, marks, anchor, start, end, today),
    ).toEqual([
      { start: '2026-03-01', end: '2026-03-31', completedCount: 2, target: 5 },
      { start: '2026-05-01', end: '2026-05-31', completedCount: 0, target: 5 },
    ]);
  });

  it('returns nothing for a daily frequency (defensive guard)', () => {
    expect(
      closedPeriodFailures(
        HabitFrequency.DAILY,
        1,
        [mark('2026-03-01')],
        d('2026-03-01'),
        start,
        end,
        today,
      ),
    ).toEqual([]);
  });
});
