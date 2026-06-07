import { todayLocalDate } from '../lib/today';
import type { HabitListItem } from '../types';
import { Ring } from './Ring';

// The dashboard's hero band: weekday + date on the left, today's daily
// completion ring on the right. Only daily habits count toward the ring —
// weekly/monthly progress lives on their own cards.
export function TodayHero({ habits }: { habits: HabitListItem[] }) {
  const td = todayLocalDate();
  const weekday = td.toLocaleDateString('en-US', { weekday: 'long' });
  const dateStr = td.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  const dailies = habits.filter((h) => h.frequency === 'DAILY');
  const done = dailies.filter((h) => h.todayStatus === 'COMPLETED').length;
  const total = dailies.length;
  const allDone = total > 0 && done === total;
  return (
    <div className="today">
      <div className="today__l">
        <span className="today__eyebrow">Today</span>
        <h1 className="today__title">{weekday}</h1>
        <span className="today__sub">{dateStr}</span>
      </div>
      {total > 0 ? (
        <div className="today__r">
          <div className="today__count">
            <b>{allDone ? 'All done' : `${done} of ${total}`}</b>
            <span>{allDone ? 'for today' : 'done today'}</span>
          </div>
          <Ring value={done} total={total} />
        </div>
      ) : null}
    </div>
  );
}
