import { Link } from '@tanstack/react-router';
import { Icon } from '../../../shared/components/Icon';
import { useToggleMark } from '../hooks/useToggleMark';
import type { HabitListItem } from '../types';
import { StreakChip } from './StreakChip';
import { WeekStrip } from './WeekStrip';

// A single habit row. The body links to the detail page; the trailing control
// marks today via useToggleMark (optimistic — the markdot/logbtn flips before
// the request settles). For daily habits "done" is today's status; for
// weekly/monthly it's whether the current period hit its target.
export function HabitCard({ habit }: { habit: HabitListItem }) {
  const toggle = useToggleMark();
  const daily = habit.frequency === 'DAILY';
  const cp = habit.currentPeriod;
  const done = daily ? habit.todayStatus === 'COMPLETED' : cp.completedCount >= cp.target;
  const neg = habit.modality === 'NEGATIVE';

  return (
    <div className={`hcard${done ? ' hcard--done' : ''}`}>
      <Link to="/habits/$habitId" params={{ habitId: habit.id }} className="hcard__body">
        <span className="hcard__name">{habit.name}</span>
        <span className="hcard__meta">
          {daily ? (
            <WeekStrip recentMarks={habit.recentMarks} />
          ) : (
            <>
              {cp.target <= 7 ? (
                <span className="pips" aria-hidden="true">
                  {Array.from({ length: cp.target }).map((_, i) => (
                    <span key={i} className={`pip${i < cp.completedCount ? ' pip--on' : ''}`} />
                  ))}
                </span>
              ) : (
                <span className="hcard__pmeta">
                  {cp.completedCount} of {cp.target}
                </span>
              )}
              <span className="hcard__pmeta">
                {habit.frequency === 'WEEKLY' ? 'this week' : 'this month'}
              </span>
            </>
          )}
          {habit.currentStreak > 0 ? (
            <StreakChip streak={habit.currentStreak} unit={habit.unit} />
          ) : null}
        </span>
      </Link>

      <div className="hcard__action">
        {daily ? (
          <button
            type="button"
            className="markdot"
            data-done={done}
            disabled={toggle.isPending}
            aria-pressed={done}
            aria-label={
              done
                ? `Mark ${habit.name} not ${neg ? 'clean' : 'done'} today`
                : `Mark ${habit.name} ${neg ? 'clean' : 'done'} today`
            }
            title={done ? 'Undo today' : neg ? 'Stayed clean today' : 'Mark done today'}
            onClick={() => toggle.mutate(habit)}
          >
            <Icon name="check" className="markdot__ico" size={done ? 22 : 19} />
          </button>
        ) : (
          <button
            type="button"
            className="logbtn"
            data-met={done}
            disabled={toggle.isPending}
            aria-label={`Log a ${habit.name} session`}
            onClick={() => toggle.mutate(habit)}
          >
            {done ? <Icon name="check" size={16} /> : <Icon name="plus" size={15} />}
            {done ? 'Met' : 'Log one'}
          </button>
        )}
      </div>
    </div>
  );
}
