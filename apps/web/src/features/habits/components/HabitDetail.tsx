import { useState } from 'react';
import { Link } from '@tanstack/react-router';
import { useCycleMark } from '../hooks/useCycleMark';
import { useHabitCalendar } from '../hooks/useHabitCalendar';
import { useHabitMetrics } from '../hooks/useHabitMetrics';
import { calendarDisplay, calendarQueryRange, currentMonth } from '../lib/calendarRange';
import { todayLocalISO } from '../lib/today';
import type { CalendarSpan } from '../types';
import { BestStreaks } from './BestStreaks';
import { CalendarNav } from './CalendarNav';
import { HabitCalendar } from './HabitCalendar';
import { HabitMetrics } from './HabitMetrics';
import { SpanControl } from './SpanControl';

function frequencyText(frequency: string, targetCount: number | null): string {
  if (frequency === 'DAILY') return 'Daily';
  const unit = frequency === 'WEEKLY' ? 'week' : 'month';
  return `${targetCount ?? 1}× per ${unit}`;
}

export function HabitDetail({ habitId }: { habitId: string }) {
  const today = todayLocalISO();
  const [span, setSpan] = useState<CalendarSpan>('3');
  const [endMonth, setEndMonth] = useState<string>(() => currentMonth());

  // The fetch range doesn't depend on the anchor, so the query key is stable; the
  // anchor (firstMarkDate) comes back with the data and only shapes the display.
  const range = calendarQueryRange(span, endMonth);
  const query = useHabitCalendar(habitId, range.fromMonth, range.toMonth, today);
  // Window-bound so optimistic writes + invalidation target the active calendar key.
  const cycleMark = useCycleMark(habitId, range.fromMonth, range.toMonth, today);
  // One metrics query feeds both the strip and the best-streaks disclosure.
  const metricsQuery = useHabitMetrics(habitId, today);

  if (query.isPending) {
    return <p className="mt-6 text-gray-600">Loading calendar…</p>;
  }
  if (query.isError) {
    return (
      <p role="alert" className="mt-6 text-sm text-red-600">
        {query.error.message}
      </p>
    );
  }

  const data = query.data;
  const { habit, firstMarkDate } = data;
  const display = calendarDisplay(span, range, firstMarkDate);

  return (
    <main className="p-4">
      <Link to="/app" className="text-sm text-blue-600 hover:underline">
        ‹ Back to habits
      </Link>
      <h1 className="mt-2 text-2xl font-bold">{habit.name}</h1>
      <p className="text-sm text-gray-600">
        {habit.modality === 'POSITIVE' ? 'Building' : 'Breaking'} ·{' '}
        {frequencyText(habit.frequency, habit.targetCount)}
      </p>

      <HabitMetrics query={metricsQuery} />

      <div className="mt-4 flex flex-wrap items-center gap-4">
        <SpanControl value={span} onChange={setSpan} allEnabled={firstMarkDate != null} />
        {span === 'all' ? null : (
          <CalendarNav endMonth={endMonth} onChange={setEndMonth} max={currentMonth()} />
        )}
      </div>

      {firstMarkDate == null ? (
        <p className="mt-3 text-sm text-gray-500">No marks yet — mark a day to start tracking.</p>
      ) : null}

      <div className="mt-4">
        <HabitCalendar
          data={data}
          numberOfMonths={display.numberOfMonths}
          startMonth={display.startMonth}
          cycleMark={cycleMark}
        />
      </div>

      {metricsQuery.data ? (
        <BestStreaks
          bestStreaks={metricsQuery.data.bestStreaks}
          unit={metricsQuery.data.unit}
          currentRun={metricsQuery.data.currentRun}
        />
      ) : null}
    </main>
  );
}
