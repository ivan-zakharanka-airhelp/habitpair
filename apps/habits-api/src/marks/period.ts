import { BadRequestException } from '@nestjs/common';
import { HabitFrequency } from '../../generated/prisma';

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

function startOfIsoWeek(d: Date): Date {
  const daysSinceMonday = (d.getUTCDay() + 6) % 7; // getUTCDay: Sun=0..Sat=6
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - daysSinceMonday));
}

function startOfMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}
