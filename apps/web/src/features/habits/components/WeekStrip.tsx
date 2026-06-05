import { localKey, todayLocalDate } from '../lib/today';
import type { MarkStatus, RecentMark } from '../types';

const DOW_LETTER = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

interface StripDay {
  iso: string;
  dow: string;
  status: MarkStatus | null;
  today: boolean;
}

// The last 7 calendar days ending today (oldest → newest), each resolved against
// the server's trailing-window recentMarks. The strip always shows 7 cells even
// when fewer marks exist, so it is built locally rather than mapped 1:1.
function last7(recentMarks: RecentMark[]): StripDay[] {
  const byDate = new Map(recentMarks.map((m) => [m.date, m.status]));
  const today = todayLocalDate();
  const out: StripDay[] = [];
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const iso = localKey(d);
    out.push({ iso, dow: DOW_LETTER[d.getDay()], status: byDate.get(iso) ?? null, today: i === 0 });
  }
  return out;
}

export function WeekStrip({ recentMarks }: { recentMarks: RecentMark[] }) {
  return (
    <div className="wkstrip" aria-hidden="true">
      {last7(recentMarks).map((d) => {
        const cls =
          d.status === 'COMPLETED' ? 'wkcell--done' : d.status === 'MISSED' ? 'wkcell--miss' : '';
        return (
          <span
            key={d.iso}
            className={`wkcell ${cls}${d.today ? ' wkcell--today' : ''}`}
            title={d.iso}
          >
            <span className="wkcell__dow">{d.dow}</span>
            <span className="wkcell__mk" />
          </span>
        );
      })}
    </div>
  );
}
