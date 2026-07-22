// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HabitDetail } from './HabitDetail';
import { todayLocalISO } from '../lib/today';
import type { HabitCalendarResponse, HabitMetricsResponse } from '../types';

// These tests exercise the kebab → edit/delete wiring, not routing; stub Link to
// a plain anchor and capture navigate.
const { mockNavigate } = vi.hoisted(() => ({ mockNavigate: vi.fn() }));

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>();
  return {
    ...actual,
    Link: ({ children, className }: { children: ReactNode; className?: string }) => (
      <a className={className}>{children}</a>
    ),
    useNavigate: () => mockNavigate,
  };
});

const HABIT_ID = 'h1';

function calData(): HabitCalendarResponse {
  return {
    habit: {
      id: HABIT_ID,
      name: 'Read a book',
      modality: 'POSITIVE',
      frequency: 'DAILY',
      targetCount: null,
    },
    firstMarkDate: null,
    marks: {},
    computedMissedDates: [],
    failedPeriods: [],
  };
}

function metricsData(): HabitMetricsResponse {
  return {
    unit: 'DAY',
    currentStreak: 0,
    currentRun: null,
    rollingConsistency: { numerator: 0, denominator: 0, percent: null },
    recentCompletion: { numerator: 0, denominator: 0, percent: null, phase: 'RATIO' },
    bestStreaks: [],
    patterns: null,
  };
}

// Seed both reads so the screen renders immediately and no GET hits the fetch
// stub — only the edit/delete mutations do.
function renderDetail() {
  const today = todayLocalISO();
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: Infinity, retry: false }, mutations: { retry: false } },
  });
  // Infinite-query cache shape: one loaded page (page 0).
  client.setQueryData(['habits', HABIT_ID, 'calendar', today], {
    pages: [calData()],
    pageParams: [0],
  });
  client.setQueryData(['habits', HABIT_ID, 'metrics', today], metricsData());
  render(
    <QueryClientProvider client={client}>
      <HabitDetail habitId={HABIT_ID} />
    </QueryClientProvider>,
  );
}

function okFetch() {
  return vi.fn(
    async (_url: string, _init?: RequestInit) => ({ ok: true, status: 204 }) as unknown as Response,
  );
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  mockNavigate.mockReset();
});

describe('HabitDetail edit/delete', () => {
  it('saves name + modality via PATCH', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    renderDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Habit actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /edit habit/i }));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Read 30 min' } });
    fireEvent.submit(document.getElementById('edit-habit-form') as HTMLFormElement);

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/habits/h1');
    expect(init?.method).toBe('PATCH');
    expect(JSON.parse(init?.body as string)).toEqual({ name: 'Read 30 min', modality: 'POSITIVE' });
  });

  it('deletes via DELETE and returns to the dashboard', async () => {
    const fetchMock = okFetch();
    vi.stubGlobal('fetch', fetchMock);

    renderDetail();

    fireEvent.click(screen.getByRole('button', { name: 'Habit actions' }));
    fireEvent.click(screen.getByRole('menuitem', { name: /delete habit/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete habit' }));

    await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith({ to: '/app' }));
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/habits/h1');
    expect(init?.method).toBe('DELETE');
  });
});
