import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../src/prisma/prisma.service';
import { createHabit, createTestApp, getCalendar, getMetrics, putMark, TODAY } from './helpers';

// Risk #2 (persisted correctness + calendar<->metrics agreement) + Risk #5
// (retroactive backfill into a CLOSED period recomputes both read-models). One
// seeded mark set must read back correct and mutually-agreeing across
// /calendar and /metrics over a real DB. See test-plan.md §2 #2/#5 and the
// "calendar-consistency invariant" header at src/marks/metrics.ts:18-21.
//
// ORACLE DISCIPLINE: every `expectedFailures` below is hand-derived from the
// seeded marks + TODAY against the documented Business-Logic rule — NEVER read
// from either endpoint's output. A shared bug that makes both endpoints wrong
// the same way still fails the oracle assertion.

interface CalendarBody {
  marks: Record<string, string>;
  computedMissedDates: string[];
  failedPeriods: { start: string; end: string; completedCount: number; target: number }[];
}

interface MetricsBody {
  currentStreak: number;
  currentRun: { start: string; end: string; length: number } | null;
  rollingConsistency: { numerator: number; denominator: number; percent: number | null };
  bestStreaks: { start: string; end: string; length: number }[];
}

// The calendar's failure set in its native shape: for daily, explicit MISSED on
// a CLOSED day (date < today; a MISSED-today is pending and excluded from the
// metrics denominator, so it must not enter the set) unioned with the computed
// unmarked-closed-day misses. For weekly/monthly, the failed closed periods,
// keyed by period-start.
function calendarFailureSet(calendar: CalendarBody, frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY') {
  if (frequency === 'DAILY') {
    const explicitMissedClosed = Object.entries(calendar.marks)
      .filter(([date, status]) => status === 'MISSED' && date < TODAY)
      .map(([date]) => date);
    return new Set<string>([...calendar.computedMissedDates, ...explicitMissedClosed]);
  }
  return new Set<string>(calendar.failedPeriods.map((p) => p.start));
}

// Encodes the calendar-consistency invariant as a reusable assertion:
//   (b) ORACLE — the calendar's failure set equals `expectedFailures`, the
//       caller's hand-derived set from the rule + TODAY.
//   (a) MUTUAL — the count of failures metrics charges against its rolling
//       window (denominator − numerator, with fixtures kept inside the window)
//       equals that same expected failure count, so the two read-models cannot
//       silently disagree.
function assertCalendarAgreesWithMetrics(args: {
  calendar: CalendarBody;
  metrics: MetricsBody;
  frequency: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  expectedFailures: string[];
}) {
  const { calendar, metrics, frequency, expectedFailures } = args;
  const expected = [...expectedFailures].sort();

  const calFailures = [...calendarFailureSet(calendar, frequency)].sort();
  expect(calFailures).toEqual(expected); // (b) oracle

  const metricsFailures =
    metrics.rollingConsistency.denominator - metrics.rollingConsistency.numerator;
  expect(metricsFailures).toBe(expectedFailures.length); // (a) mutual
}

describe('Persisted correctness + calendar/metrics agreement (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let jwt: JwtService;

  const userA = randomUUID();
  let tokenA: string;

  beforeAll(async () => {
    ({ app, prisma, jwt } = await createTestApp());
    tokenA = await jwt.signAsync({ sub: userA });
    await prisma.habit.deleteMany({ where: { userId: userA } });
  });

  afterAll(async () => {
    await prisma.habit.deleteMany({ where: { userId: userA } });
    await app.close();
  });

  it('daily: marks round-trip under their date and calendar agrees with metrics (#2)', async () => {
    const id = await createHabit(app, tokenA, {
      name: 'daily agree',
      modality: 'POSITIVE',
      frequency: 'DAILY',
    });
    // anchor 06-10; closed days 06-10..06-14; today 06-15 pending.
    await putMark(app, tokenA, id, '2026-06-10', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-11', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-12', 'MISSED'); // explicit failure
    await putMark(app, tokenA, id, '2026-06-13', 'COMPLETED');
    // 06-14 left unmarked → a computed miss (closed day).

    const calendar = (await getCalendar(app, tokenA, id, {
      from: '2026-06',
      to: '2026-06',
      today: TODAY,
    })) as CalendarBody;
    const metrics = (await getMetrics(app, tokenA, id, TODAY)) as MetricsBody;

    // Round-trip: each seeded mark reads back under its exact calendar date.
    expect(calendar.marks).toEqual({
      '2026-06-10': 'COMPLETED',
      '2026-06-11': 'COMPLETED',
      '2026-06-12': 'MISSED',
      '2026-06-13': 'COMPLETED',
    });

    // Oracle: closed days NOT completed = {06-12 explicit MISSED, 06-14 unmarked}.
    const expectedFailures = ['2026-06-12', '2026-06-14'];
    assertCalendarAgreesWithMetrics({ calendar, metrics, frequency: 'DAILY', expectedFailures });

    // The most recent closed day (06-14) is a failure → streak broken at 0.
    expect(metrics.currentStreak).toBe(0);
  });

  it('weekly: closed under-target week fails in both read-models and they agree (#2)', async () => {
    const id = await createHabit(app, tokenA, {
      name: 'weekly agree',
      modality: 'POSITIVE',
      frequency: 'WEEKLY',
      targetCount: 2,
    });
    // anchor week Jun 1–7 (2 COMPLETED → satisfied); week Jun 8–14 (1 → under target);
    // week Jun 15–21 is the current open period (today 06-15).
    await putMark(app, tokenA, id, '2026-06-01', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-02', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-08', 'COMPLETED');

    const calendar = (await getCalendar(app, tokenA, id, {
      from: '2026-06',
      to: '2026-06',
      today: TODAY,
    })) as CalendarBody;
    const metrics = (await getMetrics(app, tokenA, id, TODAY)) as MetricsBody;

    // Round-trip: each seeded mark reads back under its exact calendar date.
    expect(calendar.marks).toEqual({
      '2026-06-01': 'COMPLETED',
      '2026-06-02': 'COMPLETED',
      '2026-06-08': 'COMPLETED',
    });

    // Oracle: the one closed under-target week is Jun 8–14 (start 06-08).
    assertCalendarAgreesWithMetrics({
      calendar,
      metrics,
      frequency: 'WEEKLY',
      expectedFailures: ['2026-06-08'],
    });
    expect(calendar.failedPeriods).toEqual([
      { start: '2026-06-08', end: '2026-06-14', completedCount: 1, target: 2 },
    ]);
  });

  it('daily: backfilling a closed gap flips both read-models together (#5)', async () => {
    const id = await createHabit(app, tokenA, {
      name: 'daily backfill',
      modality: 'POSITIVE',
      frequency: 'DAILY',
    });
    // A run broken by one unmarked closed day (06-12) before TODAY.
    await putMark(app, tokenA, id, '2026-06-10', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-11', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-13', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-14', 'COMPLETED');

    const before = (await getCalendar(app, tokenA, id, {
      from: '2026-06',
      to: '2026-06',
      today: TODAY,
    })) as CalendarBody;
    const beforeMetrics = (await getMetrics(app, tokenA, id, TODAY)) as MetricsBody;

    // Oracle (before): 06-12 is the lone closed failure; streak counts only the
    // post-break run 06-13..06-14.
    assertCalendarAgreesWithMetrics({
      calendar: before,
      metrics: beforeMetrics,
      frequency: 'DAILY',
      expectedFailures: ['2026-06-12'],
    });
    expect(beforeMetrics.currentStreak).toBe(2);

    // Backfill the gap.
    await putMark(app, tokenA, id, '2026-06-12', 'COMPLETED');

    const after = (await getCalendar(app, tokenA, id, {
      from: '2026-06',
      to: '2026-06',
      today: TODAY,
    })) as CalendarBody;
    const afterMetrics = (await getMetrics(app, tokenA, id, TODAY)) as MetricsBody;

    // Oracle (after): no failures; the run now spans 06-10..06-14 (length 5).
    assertCalendarAgreesWithMetrics({
      calendar: after,
      metrics: afterMetrics,
      frequency: 'DAILY',
      expectedFailures: [],
    });
    expect(after.computedMissedDates).not.toContain('2026-06-12');
    expect(afterMetrics.currentStreak).toBe(5);
    expect(afterMetrics.bestStreaks).toEqual([
      { start: '2026-06-10', end: '2026-06-14', length: 5 },
    ]);
  });

  it('weekly: backfilling a closed under-target week clears its failure (#5)', async () => {
    const id = await createHabit(app, tokenA, {
      name: 'weekly backfill',
      modality: 'POSITIVE',
      frequency: 'WEEKLY',
      targetCount: 2,
    });
    // anchor week Jun 8–14 with one COMPLETED (1 < target 2 → closed failure).
    await putMark(app, tokenA, id, '2026-06-08', 'COMPLETED');

    const before = (await getCalendar(app, tokenA, id, {
      from: '2026-06',
      to: '2026-06',
      today: TODAY,
    })) as CalendarBody;
    const beforeMetrics = (await getMetrics(app, tokenA, id, TODAY)) as MetricsBody;

    assertCalendarAgreesWithMetrics({
      calendar: before,
      metrics: beforeMetrics,
      frequency: 'WEEKLY',
      expectedFailures: ['2026-06-08'],
    });
    expect(beforeMetrics.rollingConsistency.numerator).toBe(0);

    // Backfill a second COMPLETED into the same week → hits target 2.
    await putMark(app, tokenA, id, '2026-06-09', 'COMPLETED');

    const after = (await getCalendar(app, tokenA, id, {
      from: '2026-06',
      to: '2026-06',
      today: TODAY,
    })) as CalendarBody;
    const afterMetrics = (await getMetrics(app, tokenA, id, TODAY)) as MetricsBody;

    // Oracle (after): the week now satisfied; no failed periods, numerator rises.
    assertCalendarAgreesWithMetrics({
      calendar: after,
      metrics: afterMetrics,
      frequency: 'WEEKLY',
      expectedFailures: [],
    });
    expect(after.failedPeriods).toEqual([]);
    expect(afterMetrics.rollingConsistency.numerator).toBe(1);
  });

  it('daily: a MISSED into a successful closed run breaks it in both read-models (#5)', async () => {
    const id = await createHabit(app, tokenA, {
      name: 'daily symmetric break',
      modality: 'POSITIVE',
      frequency: 'DAILY',
    });
    // A contiguous closed run 06-10..06-14, all COMPLETED, ending before TODAY.
    await putMark(app, tokenA, id, '2026-06-10', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-11', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-12', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-13', 'COMPLETED');
    await putMark(app, tokenA, id, '2026-06-14', 'COMPLETED');

    const before = (await getCalendar(app, tokenA, id, {
      from: '2026-06',
      to: '2026-06',
      today: TODAY,
    })) as CalendarBody;
    const beforeMetrics = (await getMetrics(app, tokenA, id, TODAY)) as MetricsBody;

    // Oracle (before): no failures; streak spans the whole run (length 5).
    assertCalendarAgreesWithMetrics({
      calendar: before,
      metrics: beforeMetrics,
      frequency: 'DAILY',
      expectedFailures: [],
    });
    expect(beforeMetrics.currentStreak).toBe(5);

    // Flip one closed day inside the run to MISSED.
    await putMark(app, tokenA, id, '2026-06-12', 'MISSED');

    const after = (await getCalendar(app, tokenA, id, {
      from: '2026-06',
      to: '2026-06',
      today: TODAY,
    })) as CalendarBody;
    const afterMetrics = (await getMetrics(app, tokenA, id, TODAY)) as MetricsBody;

    // Oracle (after): 06-12 is now a failure; streak counts only the post-break
    // run 06-13..06-14.
    expect(after.marks['2026-06-12']).toBe('MISSED');
    assertCalendarAgreesWithMetrics({
      calendar: after,
      metrics: afterMetrics,
      frequency: 'DAILY',
      expectedFailures: ['2026-06-12'],
    });
    expect(afterMetrics.currentStreak).toBe(2);
  });
});
