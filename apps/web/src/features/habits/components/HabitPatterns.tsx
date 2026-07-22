import { useState, type CSSProperties, type ReactNode } from 'react';
import { Card } from '../../../shared/components/Card';
import { Icon } from '../../../shared/components/Icon';
import { Segmented } from '../../../shared/components/Segmented';
import { MONTH_NAMES } from '../lib/calendarRange';
import type { HabitMetricsResponse, HabitPatterns as PatternBuckets } from '../types';

type PatView = 'weekday' | 'month' | 'year';

const PAT_VIEWS: Array<{ value: PatView; label: string }> = [
  { value: 'weekday', label: 'Weekday' },
  { value: 'month', label: 'Month' },
  { value: 'year', label: 'Year' },
];

const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];
const DOW_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const MONTH_ABBR = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

// One global key (not per habit) — the chart period is a viewing preference.
const VIEW_KEY = 'hp_pat_view';

function loadView(): PatView {
  try {
    const v = localStorage.getItem(VIEW_KEY);
    return PAT_VIEWS.some((p) => p.value === v) ? (v as PatView) : 'weekday';
  } catch {
    return 'weekday';
  }
}

function saveView(view: PatView): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // Storage unavailable (private mode) — the choice just won't persist.
  }
}

interface Bar {
  key: string;
  lbl: string;
  full: string;
  has: boolean;
  value: number;
  display: string;
  tip: string;
  partial: boolean;
  frac: number;
  tone?: 'miss';
  peak?: boolean;
}

interface PatViewData {
  bars: Bar[];
  rateMode: boolean;
  hasPartial: boolean;
}

const sessions = (n: number) => `${n} session${n === 1 ? '' : 's'}`;

// Turn the server's bucket facts into chart bars: value/display per mode,
// normalized fractions, the weakest solid slot tinted miss, the peak marked.
function buildPatView(patterns: PatternBuckets, view: PatView): PatViewData {
  const rateMode = patterns.mode === 'RATE';
  let bars: Bar[];
  if (view === 'weekday') {
    bars = patterns.weekday.map((b, i) => {
      const rate = b.total ? b.done / b.total : 0;
      return {
        key: `w${i}`,
        lbl: DOW[i],
        full: DOW_FULL[i],
        has: b.total > 0,
        value: rateMode ? rate : b.done,
        display: rateMode ? (b.total ? `${Math.round(rate * 100)}%` : '–') : String(b.done),
        tip: rateMode
          ? `${DOW_FULL[i]} · ${b.done} of ${b.total} completed`
          : `${DOW_FULL[i]} · ${sessions(b.done)}`,
        partial: false,
        frac: 0,
      };
    });
  } else if (view === 'month') {
    bars = patterns.month.map((b, i) => {
      const rate = b.total ? b.done / b.total : 0;
      return {
        key: `m${i}`,
        lbl: MONTH_ABBR[i],
        full: MONTH_NAMES[i],
        has: b.total > 0,
        value: rateMode ? rate : b.done,
        display: b.total ? (rateMode ? `${Math.round(rate * 100)}%` : String(b.done)) : '–',
        tip: rateMode
          ? `${MONTH_NAMES[i]} · ${b.done} of ${b.total} completed (all years)`
          : `${MONTH_NAMES[i]} · ${sessions(b.done)} (all years)`,
        partial: b.partial,
        frac: 0,
      };
    });
  } else {
    bars = patterns.year.map((b) => {
      const rate = b.total ? b.done / b.total : 0;
      const yk = String(b.year);
      return {
        key: yk,
        lbl: yk,
        full: yk,
        has: b.total > 0,
        value: rateMode ? rate : b.done,
        display: b.total ? (rateMode ? `${Math.round(rate * 100)}%` : String(b.done)) : '–',
        tip: rateMode ? `${yk} · ${b.done} of ${b.total} completed` : `${yk} · ${sessions(b.done)}`,
        partial: b.partial,
        frac: 0,
      };
    });
  }

  const max = rateMode ? 1 : Math.max(1, ...bars.map((b) => b.value));
  for (const b of bars) b.frac = max ? b.value / max : 0;

  // Only complete periods are eligible to be called strongest/weakest — a
  // partial first or current period shouldn't win or lose on thin data.
  const solid = bars.filter((b) => b.has && !b.partial);
  // Surface the recurring slip slot — weakest weekday/month for daily habits.
  // (Not years: a year is a trajectory point, not a recurring pattern to fix.)
  if (rateMode && (view === 'weekday' || view === 'month') && solid.length >= 2) {
    const lo = solid.reduce((a, b) => (b.value < a.value ? b : a));
    const hi = solid.reduce((a, b) => (b.value > a.value ? b : a));
    if (lo.value < hi.value) lo.tone = 'miss';
  }
  if (solid.length) {
    const peak = solid.reduce((a, b) => (b.value > a.value ? b : a));
    peak.peak = true;
  }
  return { bars, rateMode, hasPartial: bars.some((b) => b.partial) };
}

function patInsight(view: PatView, vd: PatViewData): ReactNode {
  const solid = vd.bars.filter((b) => b.has && !b.partial);
  const withData = solid.length ? solid : vd.bars.filter((b) => b.has);
  if (!withData.length) return null;
  if (vd.rateMode) {
    const sorted = [...withData].sort((a, b) => a.value - b.value);
    const worst = sorted[0];
    const best = sorted[sorted.length - 1];
    if (view === 'year') {
      if (sorted.length < 2 || worst.value === best.value)
        return (
          <>
            <strong>{best.full}</strong>: {best.display} completion.
          </>
        );
      return (
        <>
          Most consistent in <strong>{best.full}</strong> ({best.display}); least in{' '}
          <strong>{worst.full}</strong> ({worst.display}).
        </>
      );
    }
    const prep = view === 'weekday' ? 'on' : 'in';
    if (sorted.length < 2 || worst.value === best.value)
      return (
        <>
          You complete <strong>{best.display}</strong>{' '}
          {view === 'weekday' ? `of ${best.full}s` : `in ${best.full}`}.
        </>
      );
    return (
      <>
        Strongest {prep} <strong>{best.full}</strong> ({best.display}); you slip most {prep}{' '}
        <strong>{worst.full}</strong> ({worst.display}).
      </>
    );
  }
  const top = [...withData].sort((a, b) => b.value - a.value)[0];
  if (view === 'weekday')
    return (
      <>
        Most often a <strong>{top.full}</strong> — {top.display} session
        {top.value === 1 ? '' : 's'} logged.
      </>
    );
  if (view === 'month')
    return (
      <>
        Most active in <strong>{top.full}</strong> — {top.display} session
        {top.value === 1 ? '' : 's'} logged.
      </>
    );
  return (
    <>
      Strongest year: <strong>{top.full}</strong>, with {top.display} completed.
    </>
  );
}

// Completion bucketed by weekday, month, or year — the rhythm behind the marks.
// Buckets come server-computed on the metrics response (so daily rates include
// computed misses); this component only normalizes, tones, and phrases them.
// Renders nothing until the habit has its first mark.
export function HabitPatterns({
  metrics,
  firstMarkDate,
}: {
  metrics: HabitMetricsResponse;
  firstMarkDate: string | null;
}) {
  const [view, setView] = useState<PatView>(loadView);
  const patterns = metrics.patterns;
  if (firstMarkDate == null || !patterns) return null;

  const setV = (v: PatView) => {
    setView(v);
    saveView(v);
  };
  const vd = buildPatView(patterns, view);
  const insight = patInsight(view, vd);

  const metricLabel =
    view === 'month'
      ? vd.rateMode
        ? 'Completion rate by month · all years'
        : 'Sessions by month · all years'
      : view === 'weekday'
        ? vd.rateMode
          ? 'Completion rate by weekday'
          : 'Sessions logged by weekday'
        : vd.rateMode
          ? 'Completion rate by year'
          : 'Sessions completed per year';

  return (
    <section className="patterns">
      <div className="patterns__head">
        <div className="streaks__head">
          <Icon name="spark" size={17} style={{ color: 'var(--accent)' }} />
          <h3 className="streaks__title">Patterns</h3>
        </div>
        <Segmented value={view} options={PAT_VIEWS} onChange={setV} ariaLabel="Chart period" />
      </div>
      <Card className="patterns__card">
        {insight ? <p className="pat__insight">{insight}</p> : null}
        <div className="pat__chart" style={{ '--cols': vd.bars.length } as CSSProperties}>
          {vd.bars.map((b) => {
            const h = Math.max(b.has ? 6 : 0, Math.round(b.frac * 130));
            let cls = 'pat__bar';
            if (!b.has) cls += ' pat__bar--empty';
            if (b.tone === 'miss') cls += ' pat__bar--miss';
            if (b.partial) cls += ' pat__bar--partial';
            return (
              <div
                key={b.key}
                className={`pat__col${b.peak ? ' pat__col--peak' : ''}`}
                title={b.tip}
              >
                <div className="pat__track">
                  <div className={cls} style={{ height: `${h}px` }}>
                    <span className="pat__val">{b.display}</span>
                  </div>
                </div>
                <div className="pat__lbl">{b.lbl}</div>
              </div>
            );
          })}
        </div>
        <p className="pat__cap">
          <span>{metricLabel}</span>
          {vd.hasPartial ? <i className="pat__swatch">Partial</i> : null}
        </p>
      </Card>
    </section>
  );
}
