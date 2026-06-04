import { describe, expect, it } from 'vitest';
import {
  percentLabel,
  recentCompletionLabel,
  rollingWindowLabel,
  streakLabel,
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
