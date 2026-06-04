import { streakDateLabel, streakLabel } from '../lib/metricsFormat';
import type { BestStreak, StreakUnit } from '../types';

const ROW_GRID =
  'grid grid-cols-[5rem_1fr_5rem] items-center gap-2 text-xs leading-tight text-gray-500 sm:grid-cols-[6.5rem_1fr_6.5rem] sm:gap-3 sm:text-sm';

// One run row: start date · centered proportional bar (width ∝ length vs. the
// longest run shown) · end date. `variant` drives emphasis: a plain leaderboard
// run, the active run when it's on the leaderboard ("current"), or the active run
// pinned below it ("pinned", dashed outline).
function StreakRow({
  streak,
  unit,
  widthPercent,
  variant,
}: {
  streak: BestStreak;
  unit: StreakUnit;
  widthPercent: number;
  variant: 'plain' | 'current' | 'pinned';
}) {
  const barClass =
    variant === 'current'
      ? 'bg-green-600 text-white'
      : variant === 'pinned'
        ? 'border border-dashed border-green-600 text-green-800'
        : 'bg-green-200 text-green-900';
  return (
    <div className={ROW_GRID}>
      <span className="text-right tabular-nums">{streakDateLabel(streak.start)}</span>
      <div className="flex justify-center">
        <div
          className={`flex h-7 min-w-fit items-center justify-center gap-1.5 rounded px-2.5 font-semibold whitespace-nowrap ${barClass}`}
          style={{ width: `${widthPercent}%` }}
        >
          <span>{streakLabel(streak.length, unit)}</span>
          {variant !== 'plain' ? (
            <span
              className={`rounded px-1 text-[10px] tracking-wide uppercase ${
                variant === 'pinned' ? 'bg-green-600 text-white' : 'bg-white/25 text-white'
              }`}
            >
              Current
            </span>
          ) : null}
        </div>
      </div>
      <span className="text-left tabular-nums">{streakDateLabel(streak.end)}</span>
    </div>
  );
}

// A collapsed-by-default disclosure of the habit's top-10 longest runs, ordered
// longest-first (ties broken by recency — see computeMetrics). Each run is a
// centered bar whose width is proportional to its length so magnitudes compare at
// a glance, flanked by its start/end dates. The active run is accented + labelled
// "Current": in place when it makes the top 10, or pinned below the leaderboard
// (dashed, with a "N to crack the top 10" nudge) when it's too short to rank — so
// immediate progress stays visible without polluting the leaderboard. Native
// <details>/<summary> keeps it keyboard-operable and honors the NFR. Fed from the
// metrics query already loaded by the strip (no extra fetch); an empty list
// (never-marked or only-missed habit) renders nothing.
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
      <ol className="mt-3 space-y-1.5">
        {bestStreaks.map((streak) => (
          <li key={`${streak.start}:${streak.end}`}>
            <StreakRow
              streak={streak}
              unit={unit}
              widthPercent={Math.round((streak.length / maxLength) * 100)}
              variant={
                currentRun != null && streak.start === currentRun.start ? 'current' : 'plain'
              }
            />
          </li>
        ))}
      </ol>
      {pinned ? (
        <div className="mt-2 border-t border-dashed border-gray-200 pt-2">
          <StreakRow
            streak={currentRun}
            unit={unit}
            widthPercent={Math.round((currentRun.length / maxLength) * 100)}
            variant="pinned"
          />
          <p className="mt-1 text-center text-xs text-gray-500">
            {streakLabel(toBeat, unit)} to crack the top 10
          </p>
        </div>
      ) : null}
    </details>
  );
}
