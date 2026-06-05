// Static hero mock — a real month calendar from the app. Weekdays run in columns,
// so misses on the same weekday line up vertically. No invented analytics: the
// pattern is something you SEE in the grid, exactly as in the app. The numbers are
// fixed to March 2026 (a Sunday-start month → six leading pad cells), where the
// missed days 4/11/18/25 fall on Wednesdays and stack into one column.
const LEAD = 6;
const DAYS = 31;
const MISSED = new Set([2, 4, 8, 11, 13, 18, 25]);
const DOW = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'];

type Cell =
  | { kind: 'pad'; key: string }
  | { kind: 'day'; key: string; d: number; status: 'miss' | 'done' };

const CELLS: Cell[] = [
  ...Array.from({ length: LEAD }, (_, i) => ({ kind: 'pad', key: `p${i}` }) as Cell),
  ...Array.from({ length: DAYS }, (_, i) => {
    const d = i + 1;
    return { kind: 'day', key: `d${d}`, d, status: MISSED.has(d) ? 'miss' : 'done' } as Cell;
  }),
];

export function DowInsight() {
  return (
    <div
      className="lp-mock"
      aria-label="A month of the habit Read a book shown as a calendar grid, where the missed Wednesdays line up in one column"
    >
      <div className="lp-mock__head">
        <span className="lp-mock__name">Read a book</span>
        <span className="lp-mock__tag">Building</span>
      </div>
      <p className="lp-mock__cap">March 2026 · marked day by day</p>
      <div className="mv__dow" aria-hidden="true">
        {DOW.map((x, i) => (
          <span key={x} className={i === 2 ? 'lp-cal__wk' : undefined}>
            {x}
          </span>
        ))}
      </div>
      <div className="mv__grid">
        {CELLS.map((c) =>
          c.kind === 'pad' ? (
            <div key={c.key} className="cal-cell cal-cell--pad" />
          ) : (
            <div key={c.key} className={`cal-cell cal-cell--${c.status}`}>
              <span className="cal-cell__num">{c.d}</span>
            </div>
          ),
        )}
      </div>
      <div className="lp-mock__foot">
        <span className="lp-mock__leg">
          <i className="lp-mock__sw lp-mock__sw--done" /> Done
        </span>
        <span className="lp-mock__leg">
          <i className="lp-mock__sw lp-mock__sw--miss" /> Missed
        </span>
        <span className="lp-mock__hint">Weekdays sit in columns, so your misses line up.</span>
      </div>
    </div>
  );
}
