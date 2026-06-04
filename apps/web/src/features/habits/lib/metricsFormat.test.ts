import { describe, expect, it } from 'vitest';
import {
  percentLabel,
  recentCompletionLabel,
  rollingWindowLabel,
  streakDateLabel,
  streakLabel,
  streakRangeLabel,
} from './metricsFormat';

describe('streakLabel', () => {
  it('pluralizes except at 1', () => {
    expect(streakLabel(0, 'DAY')).toBe('0 days');
    expect(streakLabel(1, 'DAY')).toBe('1 day');
    expect(streakLabel(5, 'DAY')).toBe('5 days');
    expect(streakLabel(1, 'WEEK')).toBe('1 week');
    expect(streakLabel(2, 'WEEK')).toBe('2 weeks');
    expect(streakLabel(1, 'MONTH')).toBe('1 month');
    expect(streakLabel(3, 'MONTH')).toBe('3 months');
  });
});

describe('rollingWindowLabel', () => {
  it('maps each unit to its window size', () => {
    expect(rollingWindowLabel('DAY')).toBe('30 days');
    expect(rollingWindowLabel('WEEK')).toBe('8 weeks');
    expect(rollingWindowLabel('MONTH')).toBe('6 months');
  });
});

describe('percentLabel', () => {
  it('renders "—" for null and "Z%" otherwise', () => {
    expect(percentLabel(null)).toBe('—');
    expect(percentLabel(0)).toBe('0%');
    expect(percentLabel(73)).toBe('73%');
    expect(percentLabel(100)).toBe('100%');
  });
});

describe('recentCompletionLabel', () => {
  it('renders "—" when percent is null, even in the RATIO phase', () => {
    expect(
      recentCompletionLabel({ numerator: 0, denominator: 0, percent: null, phase: 'RATIO' }),
    ).toBe('—');
  });

  it('renders "X of Y" during the ratio phase', () => {
    expect(
      recentCompletionLabel({ numerator: 3, denominator: 5, percent: 60, phase: 'RATIO' }),
    ).toBe('3 of 5');
  });

  it('renders a percentage once past the ratio phase', () => {
    expect(
      recentCompletionLabel({ numerator: 18, denominator: 30, percent: 60, phase: 'PERCENT' }),
    ).toBe('60%');
  });
});

describe('streakDateLabel', () => {
  it('formats an ISO date as a short, locale-stable label', () => {
    expect(streakDateLabel('2026-01-05')).toBe('Jan 5, 2026');
    expect(streakDateLabel('2026-12-31')).toBe('Dec 31, 2026');
  });
});

describe('streakRangeLabel', () => {
  it('shares the year for a same-year range', () => {
    expect(streakRangeLabel('2026-04-21', '2026-04-30')).toBe('Apr 21 – Apr 30, 2026');
  });

  it('shows both years across a year boundary', () => {
    expect(streakRangeLabel('2025-12-28', '2026-01-03')).toBe('Dec 28, 2025 – Jan 3, 2026');
  });

  it('collapses a single-period run to one date', () => {
    expect(streakRangeLabel('2026-04-21', '2026-04-21')).toBe('Apr 21, 2026');
  });
});
