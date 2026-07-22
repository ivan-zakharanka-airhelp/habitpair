import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../shared/components/Icon';
import { monthIndex } from '../lib/calendarRange';
import type { MarkStatus } from '../types';
import { CalLegend } from './CalLegend';
import { MonthView } from './MonthView';

const BATCH = 6;

interface HistorySheetProps {
  months: string[]; // YYYY-MM, newest-first, down to the oldest loaded month
  anchorMonth: string; // YYYY-MM of the first mark — the auto-load target
  marks: Record<string, MarkStatus>;
  failSet: Set<string>;
  today: string;
  onCycle: (iso: string) => void;
  onClose: () => void;
  isFetchingNextPage: boolean;
  onLoadMore: () => void; // fetch the next older 24-month page
}

// Full-history modal: renders months in batches of BATCH, growing as a sentinel
// scrolls into view (IntersectionObserver) so years of grid never mount at once.
// Two regimes keyed off the first-mark anchor: until the anchor month is shown,
// the sentinel auto-reveals months and auto-fetches older pages as needed; past
// the anchor it becomes a quiet "Load earlier months" button, so empty
// pre-anchor months (backfill) only appear on request. Backdrop press and
// Escape both close.
export function HistorySheet({
  months,
  anchorMonth,
  marks,
  failSet,
  today,
  onCycle,
  onClose,
  isFetchingNextPage,
  onLoadMore,
}: HistorySheetProps) {
  // How many months separate today from the first mark, inclusive — the point
  // where auto-loading stops and the manual regime takes over.
  const monthsToAnchor = monthIndex(months[0]) - monthIndex(anchorMonth) + 1;
  const [count, setCount] = useState(() => Math.min(monthsToAnchor, BATCH));
  const sentinel = useRef<HTMLDivElement>(null);
  const reachedAnchor = count >= monthsToAnchor;

  // Auto regime: the sentinel reveals BATCH more months per intersection, capped
  // at the anchor; when revealed months outrun the loaded pages, it fetches the
  // next page instead. The sentinel only renders while !reachedAnchor.
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (!entries[0].isIntersecting) return;
        if (count < months.length) {
          setCount((c) => Math.min(monthsToAnchor, months.length, c + BATCH));
        } else if (!isFetchingNextPage) {
          onLoadMore();
        }
      },
      { root: el.closest('.histsheet__scroll'), rootMargin: '240px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [count, months.length, monthsToAnchor, isFetchingNextPage, onLoadMore]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = months.slice(0, count);

  // Manual regime: reveal the next batch; when the reveal outruns the loaded
  // pages, also fetch the next older (pre-anchor) page so it lands ready.
  const loadEarlier = () => {
    const next = count + BATCH;
    setCount(next);
    if (next >= months.length) onLoadMore();
  };

  return (
    <div
      className="scrim"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="histsheet" role="dialog" aria-modal="true" aria-label="Full history">
        <div className="histsheet__head">
          <span className="histsheet__title">
            <Icon name="cal" size={18} style={{ color: 'var(--accent)' }} /> Full history
          </span>
          <button type="button" className="icon-btn" aria-label="Close" onClick={onClose}>
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="histsheet__scroll">
          <CalLegend />
          <div className="histsheet__grid" style={{ marginTop: 14 }}>
            {shown.map((ym) => (
              <MonthView
                key={ym}
                ym={ym}
                marks={marks}
                failSet={failSet}
                today={today}
                onCycle={onCycle}
                showTitle
              />
            ))}
          </div>
          {reachedAnchor ? (
            <div className="histsheet__more">
              <button
                type="button"
                className="hist__expand"
                disabled={isFetchingNextPage}
                onClick={loadEarlier}
              >
                {isFetchingNextPage ? 'Loading earlier months…' : 'Load earlier months'}
              </button>
            </div>
          ) : (
            <div ref={sentinel} className="histsheet__more">
              Loading earlier months…
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
