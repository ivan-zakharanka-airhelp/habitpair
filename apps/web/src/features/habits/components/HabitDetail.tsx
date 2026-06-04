import { useState } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { ConfirmDialog } from '../../../shared/components/ConfirmDialog';
import { useCycleMark } from '../hooks/useCycleMark';
import { useDeleteHabit } from '../hooks/useDeleteHabit';
import { useHabitCalendar } from '../hooks/useHabitCalendar';
import { useHabitMetrics } from '../hooks/useHabitMetrics';
import { useUpdateHabit } from '../hooks/useUpdateHabit';
import { calendarDisplay, calendarQueryRange, currentMonth } from '../lib/calendarRange';
import { todayLocalISO } from '../lib/today';
import type { CalendarSpan, Modality } from '../types';
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

  const navigate = useNavigate();
  const updateHabit = useUpdateHabit(habitId);
  const deleteHabit = useDeleteHabit(habitId);
  const [editing, setEditing] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [editName, setEditName] = useState('');
  const [editModality, setEditModality] = useState<Modality>('POSITIVE');

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

      {editing ? (
        <form
          className="mt-2 flex max-w-sm flex-col gap-3"
          aria-label="Edit habit"
          onSubmit={(event) => {
            event.preventDefault();
            updateHabit.mutate(
              { name: editName, modality: editModality },
              { onSuccess: () => setEditing(false) },
            );
          }}
        >
          <label className="flex flex-col gap-1">
            Name
            <input
              type="text"
              name="name"
              required
              value={editName}
              onChange={(event) => setEditName(event.target.value)}
              className="rounded border border-gray-300 p-2"
            />
          </label>
          <label className="flex flex-col gap-1">
            Type
            <select
              name="modality"
              value={editModality}
              onChange={(event) => setEditModality(event.target.value as Modality)}
              className="rounded border border-gray-300 p-2"
            >
              <option value="POSITIVE">Build (positive)</option>
              <option value="NEGATIVE">Break (negative)</option>
            </select>
          </label>
          <p className="text-sm text-gray-500">
            {frequencyText(habit.frequency, habit.targetCount)} · frequency can&rsquo;t be changed
          </p>
          {updateHabit.isError ? (
            <p role="alert" className="text-sm text-red-600">
              {updateHabit.error.message}
            </p>
          ) : null}
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={updateHabit.isPending}
              className="rounded bg-black p-2 text-white disabled:opacity-50"
            >
              Save
            </button>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="rounded border border-gray-300 p-2"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <div className="mt-2 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">{habit.name}</h1>
            <p className="text-sm text-gray-600">
              {habit.modality === 'POSITIVE' ? 'Building' : 'Breaking'} ·{' '}
              {frequencyText(habit.frequency, habit.targetCount)}
            </p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              type="button"
              onClick={() => {
                setEditName(habit.name);
                setEditModality(habit.modality);
                setEditing(true);
              }}
              className="rounded border border-gray-300 p-2 text-sm"
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded border border-red-300 p-2 text-sm text-red-600"
            >
              Delete
            </button>
          </div>
        </div>
      )}

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

      <ConfirmDialog
        open={confirmingDelete}
        title="Delete habit"
        message={`Delete “${habit.name}” and all its marks? This can’t be undone.`}
        confirmLabel="Delete"
        isPending={deleteHabit.isPending}
        onConfirm={() =>
          deleteHabit.mutate(undefined, {
            onSuccess: () => navigate({ to: '/app' }),
          })
        }
        onCancel={() => setConfirmingDelete(false)}
      />
    </main>
  );
}
