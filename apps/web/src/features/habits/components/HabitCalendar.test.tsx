// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, renderHook, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider, type InfiniteData } from '@tanstack/react-query';
import { HabitCalendar } from './HabitCalendar';
import { useCycleMark } from '../hooks/useCycleMark';
import { calendarPageRange } from '../lib/calendarRange';
import { todayLocalISO } from '../lib/today';
import type { HabitCalendarResponse } from '../types';

const HABIT_ID = 'h1';

function calData(overrides: Partial<HabitCalendarResponse> = {}): HabitCalendarResponse {
  return {
    habit: {
      id: HABIT_ID,
      name: 'Read a book',
      modality: 'POSITIVE',
      frequency: 'DAILY',
      targetCount: null,
    },
    firstMarkDate: '2020-01-05',
    marks: {},
    computedMissedDates: [],
    failedPeriods: [],
    ...overrides,
  };
}

function renderCalendar(props: {
  fetchNextPage?: () => void;
  isFetchingNextPage?: boolean;
  loadedPages?: number;
}) {
  return render(
    <HabitCalendar
      data={calData()}
      onCycle={() => {}}
      fetchNextPage={props.fetchNextPage ?? (() => {})}
      isFetchingNextPage={props.isFetchingNextPage ?? false}
      loadedPages={props.loadedPages ?? 1}
    />,
  );
}

// jsdom's default innerWidth (1024) renders 3 columns, so the prev arrow is
// the multi-month "Earlier months" button and each click steps one month back.
function stepBack(times: number) {
  const prev = screen.getByRole('button', { name: 'Earlier months' });
  for (let i = 0; i < times; i++) fireEvent.click(prev);
  return prev;
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('HabitCalendar paging navigation', () => {
  it('prefetches the next page only when the window nears the loaded floor', () => {
    const fetchNextPage = vi.fn();
    renderCalendar({ fetchNextPage, loadedPages: 1 });

    // Window starts at today — 21 months above the floor, no prefetch.
    expect(fetchNextPage).not.toHaveBeenCalled();

    // 14 steps back: window start is 7 months above the floor — still outside
    // the 6-month prefetch margin.
    stepBack(14);
    expect(fetchNextPage).not.toHaveBeenCalled();

    // One more step crosses the margin.
    stepBack(1);
    expect(fetchNextPage).toHaveBeenCalled();
  });

  it('disables the prev arrow at the loaded floor and re-enables when a page lands', () => {
    const { rerender } = renderCalendar({ isFetchingNextPage: true, loadedPages: 1 });

    // 24 loaded months, 3 shown: 21 steps put the window start on the floor.
    const prev = stepBack(21);
    expect(prev).toBeDisabled();

    // The prefetched page lands: the floor recedes by 24 months.
    rerender(
      <HabitCalendar
        data={calData()}
        onCycle={() => {}}
        fetchNextPage={() => {}}
        isFetchingNextPage={false}
        loadedPages={2}
      />,
    );
    expect(prev).not.toBeDisabled();
  });
});

describe('useCycleMark across pages', () => {
  it('optimistically patches the page whose window contains a >24-month-old date', async () => {
    const today = todayLocalISO();
    const calendarKey = ['habits', HABIT_ID, 'calendar', today];
    // A date inside page 1's window (24–47 months back).
    const oldDate = `${calendarPageRange(1).toMonth}-15`;

    const client = new QueryClient({
      defaultOptions: {
        queries: { staleTime: Infinity, retry: false },
        mutations: { retry: false },
      },
    });
    client.setQueryData(calendarKey, {
      pages: [calData(), calData()],
      pageParams: [0, 1],
    });
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, status: 204 }) as unknown as Response),
    );

    const wrapper = ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
    const { result } = renderHook(() => useCycleMark(HABIT_ID, today), { wrapper });

    result.current.mutate({ date: oldDate, storedStatus: null });

    await waitFor(() => {
      const data = client.getQueryData<InfiniteData<HabitCalendarResponse>>(calendarKey);
      expect(data?.pages[1].marks[oldDate]).toBe('COMPLETED');
    });
    const data = client.getQueryData<InfiniteData<HabitCalendarResponse>>(calendarKey);
    expect(data?.pages[0].marks[oldDate]).toBeUndefined();
  });
});
