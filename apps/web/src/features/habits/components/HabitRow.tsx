import { Link } from '@tanstack/react-router';
import { useToggleMark } from '../hooks/useToggleMark';
import type { HabitListItem } from '../types';

function progressText(habit: HabitListItem): string {
  if (habit.frequency === 'DAILY') {
    return habit.todayStatus === 'COMPLETED' ? 'Done today' : 'Not done';
  }
  const unit = habit.frequency === 'WEEKLY' ? 'this week' : 'this month';
  return `${habit.currentPeriod.completedCount} of ${habit.currentPeriod.target} ${unit}`;
}

export function HabitRow({ habit }: { habit: HabitListItem }) {
  const toggle = useToggleMark();
  const done = habit.todayStatus === 'COMPLETED';

  return (
    <li className="flex items-center justify-between gap-4 rounded border border-gray-200 p-3">
      <Link
        to="/habits/$habitId"
        params={{ habitId: habit.id }}
        className="flex flex-1 flex-col hover:underline"
      >
        <span className="font-medium">{habit.name}</span>
        <span className="text-sm text-gray-600">{progressText(habit)}</span>
      </Link>
      <button
        type="button"
        aria-pressed={done}
        aria-label={done ? `Mark ${habit.name} not done today` : `Mark ${habit.name} done today`}
        disabled={toggle.isPending}
        onClick={() => toggle.mutate(habit)}
        className={`rounded px-3 py-2 text-sm font-medium disabled:opacity-50 ${
          done ? 'bg-green-600 text-white' : 'border border-gray-300 text-gray-700'
        }`}
      >
        {done ? 'Done' : 'Mark done'}
      </button>
    </li>
  );
}
