import type { UseQueryResult } from '@tanstack/react-query';
import {
  percentLabel,
  recentCompletionLabel,
  rollingWindowLabel,
  streakLabel,
} from '../lib/metricsFormat';
import type { HabitMetricsResponse } from '../types';

// A never-marked habit returns all-zero/null metrics; so does a habit whose only
// mark is a missed today. In both cases there is no meaningful number to show —
// the detail page's "No marks yet" hint covers the empty surface — so the strip
// renders nothing rather than "0 of 0" / "0 days". A single completed today
// gives currentStreak 1 (denominators still null), which is real and shows.
function hasNoData(m: HabitMetricsResponse): boolean {
  return (
    m.currentStreak === 0 &&
    m.rollingConsistency.percent === null &&
    m.recentCompletion.percent === null &&
    m.bestStreaks.length === 0
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded border border-gray-200 bg-gray-50 px-3 py-2">
      <dt className="text-xs font-medium tracking-wide text-gray-500 uppercase">{label}</dt>
      <dd className="mt-0.5 text-lg font-semibold text-gray-900">{value}</dd>
      {sub ? <p className="text-xs text-gray-400">{sub}</p> : null}
    </div>
  );
}

// The query is owned by HabitDetail and shared with BestStreaks so a single
// useHabitMetrics call feeds both surfaces (no duplicate fetch).
export function HabitMetrics({ query }: { query: UseQueryResult<HabitMetricsResponse> }) {
  if (query.isPending) {
    return <div aria-hidden className="mt-3 h-16 animate-pulse rounded bg-gray-100" />;
  }
  if (query.isError) {
    return <p className="mt-3 text-sm text-gray-500">Stats unavailable right now.</p>;
  }

  const metrics = query.data;
  if (hasNoData(metrics)) return null;

  return (
    <dl className="mt-3 grid grid-cols-3 gap-2 sm:gap-4">
      <Stat label="Current streak" value={streakLabel(metrics.currentStreak, metrics.unit)} />
      <Stat
        label="Consistency"
        value={percentLabel(metrics.rollingConsistency.percent)}
        sub={`last ${rollingWindowLabel(metrics.unit)}`}
      />
      <Stat
        label="Completion"
        value={recentCompletionLabel(metrics.recentCompletion)}
        sub="all time"
      />
    </dl>
  );
}
