import {
  percentLabel,
  recentCompletionLabel,
  rollingWindowLabel,
  streakLabel,
} from '../lib/metricsFormat';
import type { HabitMetricsResponse } from '../types';
import { MetricCard } from './MetricCard';

// Three metric cards: current streak (flame, with a personal-best sub-line),
// rolling consistency (spark + ring), and all-time completion (target + ring).
// Renders nothing until the habit has at least one mark — the calendar's
// "No marks yet" hint covers the empty surface. Fractional metrics with no
// closed period render "—" (via metricsFormat), never "0%".
export function HabitMetrics({
  metrics,
  firstMarkDate,
}: {
  metrics: HabitMetricsResponse;
  firstMarkDate: string | null;
}) {
  if (firstMarkDate == null) return null;

  // streakLabel → "2 days"; split so the unit can render in the smaller `.u` face.
  const [streakValue, streakUnit] = streakLabel(metrics.currentStreak, metrics.unit).split(' ');
  const best = metrics.bestStreaks[0]?.length ?? 0;
  const streakSub =
    metrics.currentStreak === 0
      ? 'No active streak'
      : metrics.currentStreak >= best
        ? 'Your personal best'
        : `Best · ${streakLabel(best, metrics.unit)}`;

  return (
    <div className="metrics">
      <MetricCard
        ico="flame"
        label="Current streak"
        value={streakValue}
        unit={streakUnit}
        sub={streakSub}
      />
      <MetricCard
        ico="spark"
        label="Consistency"
        value={percentLabel(metrics.rollingConsistency.percent)}
        sub={`last ${rollingWindowLabel(metrics.unit)}`}
        ringPct={metrics.rollingConsistency.percent}
      />
      <MetricCard
        ico="target"
        label="Completion"
        value={recentCompletionLabel(metrics.recentCompletion)}
        sub="all time"
        ringPct={metrics.recentCompletion.percent}
      />
    </div>
  );
}
