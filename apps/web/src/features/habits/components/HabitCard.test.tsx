// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HabitCard } from './HabitCard';
import { useHabits } from '../hooks/useHabits';
import { todayLocalISO } from '../lib/today';
import type { HabitListItem } from '../types';

// These tests exercise optimistic marking, not navigation; stub Link to a plain
// anchor so the card renders without a full router context.
vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ children, className }: { children: ReactNode; className?: string }) => (
      <a className={className}>{children}</a>
    ),
  };
});

function dailyHabit(overrides: Partial<HabitListItem> = {}): HabitListItem {
  return {
    id: 'h1',
    name: 'Meditate',
    modality: 'POSITIVE',
    frequency: 'DAILY',
    targetCount: null,
    todayStatus: null,
    currentPeriod: { kind: 'DAILY', completedCount: 0, target: 1 },
    recentMarks: [],
    currentStreak: 0,
    unit: 'DAY',
    ...overrides,
  };
}

// Reads the live list cache and renders the matching card, mirroring how the
// dashboard feeds HabitCard — so an optimistic cache write re-renders the card.
function Harness() {
  const { data } = useHabits();
  return data ? <HabitCard habit={data[0]} /> : null;
}

function renderCard(habit: HabitListItem) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } },
  });
  client.setQueryData(['habits', todayLocalISO()], [habit]);
  render(
    <QueryClientProvider client={client}>
      <Harness />
    </QueryClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('HabitCard marking', () => {
  it('optimistically marks a daily habit done before the request settles', async () => {
    // A request that never resolves, so the card can only be "done" optimistically.
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>(() => {})),
    );

    renderCard(dailyHabit());
    const dot = screen.getByRole('button', { name: /mark meditate done today/i });
    expect(dot).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(dot);

    await waitFor(() => expect(dot).toHaveAttribute('aria-pressed', 'true'));
  });

  it('rolls back the optimistic mark when the request fails', async () => {
    let rejectFetch: (reason: Error) => void = () => {};
    vi.stubGlobal(
      'fetch',
      vi.fn(() => new Promise<Response>((_, reject) => { rejectFetch = reject; })),
    );

    renderCard(dailyHabit());
    const dot = screen.getByRole('button', { name: /mark meditate done today/i });

    fireEvent.click(dot);
    await waitFor(() => expect(dot).toHaveAttribute('aria-pressed', 'true'));

    rejectFetch(new Error('network down'));
    await waitFor(() => expect(dot).toHaveAttribute('aria-pressed', 'false'));
  });
});
