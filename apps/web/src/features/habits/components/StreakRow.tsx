import { Icon } from '../../../shared/components/Icon';
import { streakRangeLabel, unitNoun } from '../lib/metricsFormat';
import type { BestStreak, StreakUnit } from '../types';

// Minimum fill so a very short run still shows a visible nub without distorting
// the longer bars (whose ratios dominate).
const MIN_FILL_PERCENT = 5;

interface StreakRowProps {
  s: BestStreak;
  unit: StreakUnit;
  maxLen: number;
  // Leaderboard position (1-based); null for the pinned current run shown below
  // the divider, which gets a flame glyph instead of a number.
  rank: number | null;
  current: boolean;
}

// One run: rank/flame, date range + length, and a full-width track whose fill is
// proportional to the run's length vs. the longest shown. The active run is
// accented + badged "Current"; #1 gets the subtle highlight.
export function StreakRow({ s, unit, maxLen, rank, current }: StreakRowProps) {
  const fill = Math.max(MIN_FILL_PERCENT, Math.round((s.length / maxLen) * 100));
  const noun = unitNoun(unit);
  const cls = `streakrow${current ? ' streakrow--current' : ''}${rank === 1 ? ' streakrow--top' : ''}`;
  return (
    <div className={cls}>
      <span className="streakrow__rank">
        {rank == null ? <Icon name="flame" size={14} style={{ color: 'var(--accent)' }} /> : rank}
      </span>
      <div className="streakrow__main">
        <div className="streakrow__top">
          <span className="streakrow__range">{streakRangeLabel(s.start, s.end)}</span>
          <span className="streakrow__len">
            {s.length}
            <span className="streakrow__unit">
              {noun}
              {s.length === 1 ? '' : 's'}
            </span>
            {current ? <span className="streak__badge">Current</span> : null}
          </span>
        </div>
        <div className="streakrow__track">
          <div
            className={`streakrow__fill${current ? ' streakrow__fill--current' : ''}`}
            style={{ width: `${fill}%` }}
          />
        </div>
      </div>
    </div>
  );
}
