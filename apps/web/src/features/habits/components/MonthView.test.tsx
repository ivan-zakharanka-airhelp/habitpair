// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MonthView } from './MonthView';

afterEach(cleanup);

const marks = { '2026-06-01': 'COMPLETED', '2026-06-02': 'MISSED' } as const;

describe('MonthView', () => {
  it('cycles a past day on click and disables future days', () => {
    const onCycle = vi.fn();
    render(
      <MonthView
        ym="2026-06"
        today="2026-06-05"
        marks={{ ...marks }}
        failSet={new Set()}
        onCycle={onCycle}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Jun 1, completed' }));
    expect(onCycle).toHaveBeenCalledWith('2026-06-01');

    const future = screen.getByRole('button', { name: 'Jun 10' });
    expect(future).toBeDisabled();
    fireEvent.click(future);
    expect(onCycle).toHaveBeenCalledTimes(1); // future click ignored
  });

  it('tints done / miss / today cells by priority', () => {
    const onCycle = vi.fn();
    render(
      <MonthView
        ym="2026-06"
        today="2026-06-05"
        marks={{ ...marks }}
        failSet={new Set()}
        onCycle={onCycle}
      />,
    );

    expect(screen.getByRole('button', { name: 'Jun 1, completed' })).toHaveClass('cal-cell--done');
    expect(screen.getByRole('button', { name: 'Jun 2, missed' })).toHaveClass('cal-cell--miss');
    expect(screen.getByRole('button', { name: 'Jun 5' })).toHaveClass('cal-cell--today');
    expect(screen.getByRole('button', { name: 'Jun 10' })).toHaveClass('cal-cell--future');
  });
});
