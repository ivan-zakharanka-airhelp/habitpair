import { BadRequestException } from '@nestjs/common';
import { HabitFrequency, MarkStatus } from '../../generated/prisma';

// `@db.Date` round-trips through JS as a UTC-midnight Date. All parsing,
// formatting, and boundary math here uses UTC getters only — applying local
// timezone (getDate / new Date('YYYY-MM-DD') without the explicit Z) would
// shift the stored/returned day by one on a server whose TZ is behind UTC.

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

export function parseDateOnly(s: string): Date {
  if (!DATE_ONLY.test(s)) {
    throw new BadRequestException(`Invalid date "${s}" — expected YYYY-MM-DD`);
  }
  const date = new Date(`${s}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || formatDateOnly(date) !== s) {
    throw new BadRequestException(`Invalid date "${s}" — not a real calendar date`);
  }
  return date;
}

export function formatDateOnly(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface PeriodRange {
  start: Date;
  end: Date;
}

// Current period runs from its start up to and including `today`:
// daily = [today, today]; weekly = [ISO Monday, today]; monthly = [1st, today].
export function currentPeriodRange(frequency: HabitFrequency, today: Date): PeriodRange {
  if (frequency === HabitFrequency.WEEKLY) {
    return { start: startOfIsoWeek(today), end: today };
  }
  if (frequency === HabitFrequency.MONTHLY) {
    return { start: startOfMonth(today), end: today };
  }
  return { start: today, end: today };
}

const MONTH_ONLY = /^\d{4}-\d{2}$/;
const MAX_SPAN_MONTHS = 36;

export interface MonthSpan {
  start: Date;
  end: Date;
}

export interface MarkRow {
  date: Date;
  status: MarkStatus;
}

export interface FailedPeriod {
  start: string;
  end: string;
  completedCount: number;
  target: number;
}

// Validate a YYYY-MM..YYYY-MM range and expand it to a UTC day span:
// first-day-of-`from` … last-day-of-`to`. Caps the span so one request can't
// pull unbounded history — the SPA pages with fixed-size windows instead.
export function monthSpan(fromMonth: string, toMonth: string): MonthSpan {
  const from = parseMonth(fromMonth);
  const to = parseMonth(toMonth);
  const start = new Date(Date.UTC(from.year, from.month - 1, 1));
  const end = new Date(Date.UTC(to.year, to.month, 0)); // day 0 of next month = last day of `to`
  if (end.getTime() < start.getTime()) {
    throw new BadRequestException(
      `Invalid range — "to" (${toMonth}) is before "from" (${fromMonth})`,
    );
  }
  const spanMonths = (to.year - from.year) * 12 + (to.month - from.month) + 1;
  if (spanMonths > MAX_SPAN_MONTHS) {
    throw new BadRequestException(
      `Range too large — max ${MAX_SPAN_MONTHS} months, got ${spanMonths}`,
    );
  }
  return { start, end };
}

// The mark query backing a calendar must cover whole ISO weeks around the
// span: a week straddling the window edge would otherwise under-count its
// COMPLETED marks and report a false period failure when paging into the
// past. Daily/monthly computations read the same (slightly wider) set safely.
export function markRange(span: MonthSpan): { gte: Date; lte: Date } {
  return { gte: startOfIsoWeek(span.start), lte: endOfIsoWeek(span.end) };
}

// Daily habits only. Every day in [max(anchor, start) … min(end, today-1)]
// that carries no stored mark (of either status) is a computed miss. Days
// before the anchor stay neutral; today and the future are never missed.
export function computedMissedDates(
  marks: MarkRow[],
  anchor: Date | null,
  start: Date,
  end: Date,
  today: Date,
): string[] {
  if (!anchor) return [];
  const lower = maxDate(anchor, start);
  const upper = minDate(end, addUtcDays(today, -1));
  if (upper.getTime() < lower.getTime()) return [];

  const marked = new Set(marks.map((m) => formatDateOnly(m.date)));
  const out: string[] = [];
  for (let d = lower; d.getTime() <= upper.getTime(); d = addUtcDays(d, 1)) {
    const key = formatDateOnly(d);
    if (!marked.has(key)) out.push(key);
  }
  return out;
}

// Weekly/monthly habits only. For each period (ISO-Monday week / calendar
// month) that is on/after the anchor's period and closed (ends strictly
// before today), reports a failure when fewer than `target` COMPLETED marks
// landed in it. In-progress periods never fail.
export function closedPeriodFailures(
  frequency: HabitFrequency,
  target: number,
  marks: MarkRow[],
  anchor: Date | null,
  start: Date,
  end: Date,
  today: Date,
): FailedPeriod[] {
  if (!anchor) return [];
  if (frequency !== HabitFrequency.WEEKLY && frequency !== HabitFrequency.MONTHLY) {
    return [];
  }
  const isWeekly = frequency === HabitFrequency.WEEKLY;
  const startOfPeriod = isWeekly ? startOfIsoWeek : startOfMonth;
  const endOfPeriod = isWeekly ? endOfIsoWeek : endOfMonth;
  const nextStart = isWeekly
    ? (d: Date) => addUtcDays(d, 7)
    : (d: Date) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));

  const completed = marks.filter((m) => m.status === MarkStatus.COMPLETED);
  const out: FailedPeriod[] = [];

  for (
    let pStart = maxDate(startOfPeriod(anchor), startOfPeriod(start));
    pStart.getTime() <= end.getTime();
    pStart = nextStart(pStart)
  ) {
    const pEnd = endOfPeriod(pStart);
    if (pEnd.getTime() >= today.getTime()) break; // open period (holds today/future) — never fails
    // Re-scan per period is O(periods×marks) — fine under the 36-month cap; bucket by period if it grows.
    const count = completed.filter(
      (m) => m.date.getTime() >= pStart.getTime() && m.date.getTime() <= pEnd.getTime(),
    ).length;
    if (count < target) {
      out.push({
        start: formatDateOnly(pStart),
        end: formatDateOnly(pEnd),
        completedCount: count,
        target,
      });
    }
  }
  return out;
}

function parseMonth(s: string): { year: number; month: number } {
  if (!MONTH_ONLY.test(s)) {
    throw new BadRequestException(`Invalid month "${s}" — expected YYYY-MM`);
  }
  const year = Number(s.slice(0, 4));
  const month = Number(s.slice(5, 7));
  if (month < 1 || month > 12) {
    throw new BadRequestException(`Invalid month "${s}" — month must be 01–12`);
  }
  return { year, month };
}

function startOfIsoWeek(d: Date): Date {
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // getUTCDay: Sun=0..Sat=6
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday));
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

function endOfIsoWeek(d: Date): Date {
  return addUtcDays(startOfIsoWeek(d), 6);
}

function endOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0));
}

function addUtcDays(d: Date, n: number): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + n));
}

function maxDate(a: Date, b: Date): Date {
  return a.getTime() >= b.getTime() ? a : b;
}

function minDate(a: Date, b: Date): Date {
  return a.getTime() <= b.getTime() ? a : b;
}
