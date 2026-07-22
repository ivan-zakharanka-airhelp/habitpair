// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { HistorySheet } from './HistorySheet';
import { indexToMonth, monthIndex } from '../lib/calendarRange';

// Controllable IntersectionObserver stub: the sheet re-creates its observer on
// every dep change, so the last-registered callback is the live one.
type IOCallback = (entries: Array<{ isIntersecting: boolean }>) => void;
const observers: IOCallback[] = [];

class MockIntersectionObserver {
  constructor(callback: IntersectionObserverCallback) {
    observers.push(callback as unknown as IOCallback);
  }
  observe() {}
  disconnect() {}
}

function triggerSentinel() {
  act(() => {
    observers[observers.length - 1]([{ isIntersecting: true }]);
  });
}

const CUR = '2026-07';
const TODAY = '2026-07-15';

function monthsBack(n: number): string[] {
  const curIdx = monthIndex(CUR);
  return Array.from({ length: n }, (_, i) => indexToMonth(curIdx - i));
}

function anchorAt(monthsAgo: number): string {
  return indexToMonth(monthIndex(CUR) - monthsAgo);
}

function renderSheet(props: {
  months: string[];
  anchorMonth: string;
  isFetchingNextPage?: boolean;
  onLoadMore?: () => void;
}) {
  render(
    <HistorySheet
      months={props.months}
      anchorMonth={props.anchorMonth}
      marks={{}}
      failSet={new Set()}
      today={TODAY}
      onCycle={() => {}}
      onClose={() => {}}
      isFetchingNextPage={props.isFetchingNextPage ?? false}
      onLoadMore={props.onLoadMore ?? (() => {})}
    />,
  );
}

function shownMonthCount(): number {
  return screen.getAllByRole('heading', { level: 4 }).length;
}

beforeEach(() => {
  vi.stubGlobal('IntersectionObserver', MockIntersectionObserver);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  observers.length = 0;
});

describe('HistorySheet auto regime (anchor not yet shown)', () => {
  it('reveals months in batches, then fetches when loaded months run out', () => {
    const onLoadMore = vi.fn();
    // One 24-month page loaded, anchor 29 months back → auto target is 30 months.
    renderSheet({ months: monthsBack(24), anchorMonth: anchorAt(29), onLoadMore });

    expect(shownMonthCount()).toBe(6);
    expect(screen.getByText('Loading earlier months…')).toBeInTheDocument();

    triggerSentinel();
    triggerSentinel();
    triggerSentinel();
    expect(shownMonthCount()).toBe(24);
    expect(onLoadMore).not.toHaveBeenCalled();

    // All loaded months shown but the anchor is still older: fetch the next page.
    triggerSentinel();
    expect(onLoadMore).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Loading earlier months…')).toBeInTheDocument();
  });

  it('does not fetch again while a page is in flight', () => {
    const onLoadMore = vi.fn();
    renderSheet({
      months: monthsBack(24),
      anchorMonth: anchorAt(29),
      isFetchingNextPage: true,
      onLoadMore,
    });

    triggerSentinel();
    triggerSentinel();
    triggerSentinel();
    expect(shownMonthCount()).toBe(24);

    triggerSentinel();
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it('switches to the manual button once the anchor month is shown', () => {
    // Two pages loaded (48 months), anchor 29 months back → auto stops at 30.
    renderSheet({ months: monthsBack(48), anchorMonth: anchorAt(29) });

    triggerSentinel();
    triggerSentinel();
    triggerSentinel();
    triggerSentinel();

    expect(shownMonthCount()).toBe(30);
    expect(screen.getByRole('button', { name: 'Load earlier months' })).toBeInTheDocument();
    expect(screen.queryByText('Loading earlier months…')).not.toBeInTheDocument();
  });
});

describe('HistorySheet manual regime (pre-anchor backfill)', () => {
  it('caps the initial view at the anchor and reveals older months per press', () => {
    const onLoadMore = vi.fn();
    // Anchor only 3 months back: the 21 loaded pre-anchor months stay hidden.
    renderSheet({ months: monthsBack(24), anchorMonth: anchorAt(3), onLoadMore });

    expect(shownMonthCount()).toBe(4);
    expect(screen.queryByText('Loading earlier months…')).not.toBeInTheDocument();

    const button = screen.getByRole('button', { name: 'Load earlier months' });
    fireEvent.click(button);
    expect(shownMonthCount()).toBe(10);
    expect(onLoadMore).not.toHaveBeenCalled();

    fireEvent.click(button);
    fireEvent.click(button);
    expect(shownMonthCount()).toBe(22);

    // This reveal outruns the 24 loaded months → fetch the next page too.
    fireEvent.click(button);
    expect(shownMonthCount()).toBe(24);
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('shows a quiet loading state on the button while fetching', () => {
    renderSheet({
      months: monthsBack(24),
      anchorMonth: anchorAt(3),
      isFetchingNextPage: true,
    });

    const button = screen.getByRole('button', { name: 'Loading earlier months…' });
    expect(button).toBeDisabled();
  });
});
