import { useState } from 'react';
import { Card } from '../../../shared/components/Card';
import { Icon } from '../../../shared/components/Icon';
import { streakLabel } from '../lib/metricsFormat';
import type { HabitMetricsResponse } from '../types';
import { StreakRow } from './StreakRow';

const LIMIT = 5;

// The demoted best-streaks leaderboard: top runs longest-first as proportional
// bars, collapsed to the top 5 (expand to all). The active run is accented in
// place when it ranks, or pinned below a divider with a "N to crack the top N"
// nudge when it's too short to rank — so current progress stays visible without
// distorting the leaderboard. Renders nothing when there are no runs.
export function BestStreaks({ metrics }: { metrics: HabitMetricsResponse }) {
  const [showAll, setShowAll] = useState(false);
  const { bestStreaks, currentRun, unit } = metrics;
  if (bestStreaks.length === 0) return null;

  const maxLen = bestStreaks[0].length; // longest-first, so the first is the max
  const inList = currentRun != null && bestStreaks.some((s) => s.start === currentRun.start);
  const pinned = currentRun != null && !inList;
  // pinned ⇒ every shown run outranks currentRun (the most recent run); a more
  // recent run can only be outranked by a strictly longer one, so the gap is ≥ 1.
  const toBeat = pinned ? bestStreaks[bestStreaks.length - 1].length - currentRun.length : 0;
  const list = showAll ? bestStreaks : bestStreaks.slice(0, LIMIT);
  const hidden = bestStreaks.length - LIMIT;

  return (
    <section className="streaks">
      <div className="streaks__head">
        <Icon name="flame" size={17} style={{ color: 'var(--accent)' }} />
        <h3 className="streaks__title">Best streaks</h3>
      </div>
      <Card className="streaks__card">
        <div className="streaks__list">
          {list.map((s, i) => (
            <StreakRow
              key={`${s.start}:${s.end}`}
              s={s}
              unit={unit}
              maxLen={maxLen}
              rank={i + 1}
              current={currentRun != null && s.start === currentRun.start}
            />
          ))}
        </div>
        {hidden > 0 ? (
          <button type="button" className="streaks__more" onClick={() => setShowAll((v) => !v)}>
            {showAll ? 'Show less' : `Show all ${bestStreaks.length}`}
            <Icon name={showAll ? 'chevU' : 'chevD'} size={14} />
          </button>
        ) : null}
        {pinned ? (
          <div className="streaks__divider">
            <StreakRow s={currentRun} unit={unit} maxLen={maxLen} rank={null} current />
            <p className="streaks__nudge">
              {streakLabel(toBeat, unit)} to crack the top {bestStreaks.length}.
            </p>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
