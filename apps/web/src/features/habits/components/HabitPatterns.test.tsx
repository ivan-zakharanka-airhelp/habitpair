// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { HabitMetricsResponse, PatternBucket } from '../types';
import { HabitPatterns } from './HabitPatterns';

afterEach(cleanup);

const bucket = (done: number, total: number, partial = false): PatternBucket => ({
  done,
  total,
  partial,
});

// Daily habit: Monday strongest (80%), Wednesday weakest (40%), July partial.
const metrics: HabitMetricsResponse = {
  unit: 'DAY',
  currentStreak: 3,
  currentRun: null,
  rollingConsistency: { numerator: 5, denominator: 7, percent: 71 },
  recentCompletion: { numerator: 37, denominator: 70, percent: 53, phase: 'PERCENT' },
  bestStreaks: [],
  patterns: {
    mode: 'RATE',
    weekday: [
      bucket(8, 10),
      bucket(5, 10),
      bucket(4, 10),
      bucket(5, 10),
      bucket(5, 10),
      bucket(5, 10),
      bucket(5, 10),
    ],
    month: [
      ...Array.from({ length: 5 }, () => bucket(0, 0)),
      bucket(20, 30),
      bucket(17, 40, true),
      ...Array.from({ length: 5 }, () => bucket(0, 0)),
    ],
    year: [{ year: 2026, done: 37, total: 70, partial: true }],
  },
};

describe('HabitPatterns', () => {
  it('renders the weekday chart with bars and an insight sentence', () => {
    render(<HabitPatterns metrics={metrics} firstMarkDate="2026-06-01" />);

    expect(screen.getByRole('heading', { name: 'Patterns' })).toBeInTheDocument();
    expect(screen.getByRole('radiogroup', { name: 'Chart period' })).toBeInTheDocument();
    expect(screen.getByText(/Strongest on/)).toHaveTextContent(
      'Strongest on Monday (80%); you slip most on Wednesday (40%).',
    );
    expect(screen.getByText('80%')).toBeInTheDocument();
    expect(screen.getByText('40%')).toBeInTheDocument();
    expect(screen.getByText('Mo')).toBeInTheDocument();
    expect(screen.getByText('Completion rate by weekday')).toBeInTheDocument();
  });

  it('switches to the month view and persists the choice', () => {
    render(<HabitPatterns metrics={metrics} firstMarkDate="2026-06-01" />);

    fireEvent.click(screen.getByRole('radio', { name: 'Month' }));

    expect(screen.getByText('Jan')).toBeInTheDocument();
    expect(screen.getByText('Jul')).toBeInTheDocument();
    expect(screen.getByText('Completion rate by month · all years')).toBeInTheDocument();
    expect(screen.getByText('Partial')).toBeInTheDocument(); // July is partial → legend swatch
    expect(localStorage.getItem('hp_pat_view')).toBe('month');
  });

  it('renders nothing before the first mark', () => {
    const { container } = render(<HabitPatterns metrics={metrics} firstMarkDate={null} />);
    expect(container).toBeEmptyDOMElement();
  });
});
