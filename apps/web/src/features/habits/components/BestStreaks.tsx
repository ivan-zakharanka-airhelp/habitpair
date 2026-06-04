import { streakLabel, streakRangeLabel } from '../lib/metricsFormat';
import type { BestStreak, StreakUnit } from '../types';

// Floor the rendered fill so a very short run still shows a visible nub without
// distorting the larger bars (whose ratios dominate anyway).
const MIN_FILL_PERCENT = 4;

// One run: a label line (date range · length, with a "Current" badge for the
// active run) above a full-width track whose fill width is proportional to the
// run's length vs. the longest run shown. Stacking the bar on its own full-width
// line (rather than wedged between the dates) keeps proportions readable on
// narrow screens and makes the fill *exactly* proportional — the length text no
// longer floors the bar width.
function StreakRow({
  streak,
  unit,
  maxLength,
  variant,
}: {
  streak: BestStreak;
  unit: StreakUnit;
  maxLength: number;
  variant: 'plain' | 'current';
}) {
  const fillPercent = Math.max(MIN_FILL_PERCENT, Math.round((streak.length / maxLength) * 100));
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2 text-xs sm:text-sm">
        <span className="text-gray-500 tabular-nums">
          {streakRangeLabel(streak.start, streak.end)}
        </span>
        <span className="flex items-center gap-1.5 font-semibold text-gray-900">
          {streakLabel(streak.length, unit)}
          {variant === 'current' ? (
            <span className="rounded bg-green-600 px-1 text-[10px] tracking-wide text-white uppercase">
              Current
            </span>
          ) : null}
        </span>
      </div>
      <div className="mt-1 h-2.5 w-full overflow-hidden rounded bg-gray-100">
        <div
          className={`h-full rounded ${variant === 'current' ? 'bg-green-600' : 'bg-green-400'}`}
          style={{ width: `${fillPercent}%` }}
        />
      </div>
    </div>
  );
}

// A collapsed-by-default disclosure of the habit's top-10 longest runs, ordered
// longest-first (ties by recency — see computeMetrics). Each run is a labelled,
// full-width proportional bar so magnitudes compare at a glance. The active run is
// accented + badged "Current": in place when it makes the top 10, or pinned below
// the leaderboard (after a dashed divider, with a "N to crack the top 10" nudge)
// when it's too short to rank — so immediate progress stays visible without
// distorting the leaderboard. Native <details>/<summary> keeps it keyboard-operable
// and honors the NFR. Fed from the metrics query already loaded by the strip (no
// extra fetch); an empty list (never-marked or only-missed habit) renders nothing.
export function BestStreaks({
  bestStreaks,
  unit,
  currentRun,
}: {
  bestStreaks: BestStreak[];
  unit: StreakUnit;
  currentRun: BestStreak | null;
}) {
  // A currentRun is itself a run, so an empty leaderboard implies no active run.
  if (bestStreaks.length === 0) return null;

  const maxLength = bestStreaks[0].length; // longest-first, so the first is the max
  const currentInList = currentRun != null && bestStreaks.some((s) => s.start === currentRun.start);
  const pinned = currentRun != null && !currentInList;
  // pinned ⇒ every top-10 run outranks currentRun, which is the most recent run;
  // a more-recent run can only be outranked by a strictly longer one, so #10
  // (the shortest shown) is strictly longer — the gap is always ≥ 1.
  const toBeat = pinned ? bestStreaks[bestStreaks.length - 1].length - currentRun.length : 0;

  return (
    <details className="mt-6">
      <summary className="cursor-pointer text-sm font-medium text-gray-700 select-none">
        Best streaks
      </summary>
      <ol className="mt-3 space-y-2.5">
        {bestStreaks.map((streak) => (
          <li key={`${streak.start}:${streak.end}`}>
            <StreakRow
              streak={streak}
              unit={unit}
              maxLength={maxLength}
              variant={
                currentRun != null && streak.start === currentRun.start ? 'current' : 'plain'
              }
            />
          </li>
        ))}
      </ol>
      {pinned ? (
        <div className="mt-2.5 border-t border-dashed border-gray-200 pt-2.5">
          <StreakRow streak={currentRun} unit={unit} maxLength={maxLength} variant="current" />
          <p className="mt-1 text-xs text-gray-500">
            {streakLabel(toBeat, unit)} to crack the top 10
          </p>
        </div>
      ) : null}
    </details>
  );
}
