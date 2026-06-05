import { useEffect, useRef, useState } from 'react';
import { Icon } from '../../../shared/components/Icon';
import type { MarkStatus } from '../types';
import { CalLegend } from './CalLegend';
import { MonthView } from './MonthView';

const BATCH = 6;

interface HistorySheetProps {
  months: string[]; // YYYY-MM, newest-first
  marks: Record<string, MarkStatus>;
  failSet: Set<string>;
  today: string;
  onCycle: (iso: string) => void;
  onClose: () => void;
}

// Full-history modal: renders months in batches of BATCH, growing as a sentinel
// scrolls into view (IntersectionObserver) so years of grid never mount at once.
// Backdrop press and Escape both close.
export function HistorySheet({
  months,
  marks,
  failSet,
  today,
  onCycle,
  onClose,
}: HistorySheetProps) {
  const [count, setCount] = useState(() => Math.min(months.length, BATCH));
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || count >= months.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) setCount((c) => Math.min(months.length, c + BATCH));
      },
      { root: el.closest('.histsheet__scroll'), rootMargin: '240px' },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [count, months.length]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const shown = months.slice(0, count);

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
          {count < months.length ? (
            <div ref={sentinel} className="histsheet__more">
              Loading earlier months…
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
