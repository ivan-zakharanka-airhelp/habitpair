import { useEffect, useState } from 'react';
import { Icon } from '../../../shared/components/Icon';
import { ALL_CAP_MONTHS, indexToMonth, MONTH_NAMES, monthIndex } from '../lib/calendarRange';
import { localDateFromISO, localKey, todayLocalISO } from '../lib/today';
import type { HabitCalendarResponse, MarkStatus } from '../types';
import { CalLegend } from './CalLegend';
import { HistorySheet } from './HistorySheet';
import { MonthView } from './MonthView';

// Responsive month count: 3 wide, 2 medium, 1 on mobile.
function calcCols(): number {
  const w = window.innerWidth;
  if (w >= 980) return 3;
  if (w >= 640) return 2;
  return 1;
}

// Stored marks with daily computed-misses folded in as MISSED (stored marks win,
// so an optimistic write to `marks` recolors the cell on its own). Mirrors the
// old buildStatusSets logic; the design's mock had no computed-miss concept.
function buildMarksView(data: HabitCalendarResponse): Record<string, MarkStatus> {
  const view: Record<string, MarkStatus> = { ...data.marks };
  for (const iso of data.computedMissedDates) {
    if (!(iso in view)) view[iso] = 'MISSED';
  }
  return view;
}

// Weekly/monthly failed-period days → failtint set (the soft red behind unmarked
// days of a period that closed under target).
function buildFailSet(data: HabitCalendarResponse): Set<string> {
  const set = new Set<string>();
  for (const period of data.failedPeriods) {
    const end = localDateFromISO(period.end);
    for (let d = localDateFromISO(period.start); d <= end; d.setDate(d.getDate() + 1)) {
      set.add(localKey(d));
    }
  }
  return set;
}

// Start fetching the next older page when the display window's start is within
// this many months of the loaded floor, so stepping back rarely waits.
const PREFETCH_MONTHS = 6;

interface HabitCalendarProps {
  data: HabitCalendarResponse;
  onCycle: (iso: string) => void;
  // Paging controls from the parent's infinite query.
  fetchNextPage: () => void;
  isFetchingNextPage: boolean;
  loadedPages: number;
}

// The detail centerpiece: a 1–3 month sliding window over the paged marks, with
// calm month-step navigation and a lazy-loading full-history sheet. Navigation
// is calendar-anchored and unbounded backward: nearing the oldest loaded month
// prefetches the next 24-month page, so the floor keeps receding ahead of the
// user.
export function HabitCalendar({
  data,
  onCycle,
  fetchNextPage,
  isFetchingNextPage,
  loadedPages,
}: HabitCalendarProps) {
  const today = todayLocalISO();
  const { firstMarkDate } = data;
  const marks = buildMarksView(data);
  const failSet = buildFailSet(data);

  const [cols, setCols] = useState(calcCols);
  const [endMonth, setEndMonth] = useState(() => today.slice(0, 7));
  const [sheetOpen, setSheetOpen] = useState(false);

  // window resize is an external subscription, so the cols listener lives here.
  useEffect(() => {
    const onResize = () => setCols(calcCols());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  const curIdx = monthIndex(today.slice(0, 7));
  // Navigation floor = the oldest *loaded* month, NOT the first mark. This keeps
  // the window a full `cols` wide even for a brand-new habit, and lets the user
  // page back before the first mark to backfill old days (calendar-anchored).
  // The floor recedes as older pages land.
  const loadedFloorIdx = curIdx - loadedPages * ALL_CAP_MONTHS + 1;
  const endIdx = Math.min(curIdx, Math.max(loadedFloorIdx, monthIndex(endMonth)));
  const startIdx = Math.max(loadedFloorIdx, endIdx - (cols - 1));
  // Near the start of history, slide the window forward so it stays full when possible.
  const realEnd = realEndIdx(startIdx, endIdx, curIdx, cols);

  // Prefetch the next older page before the display window reaches the loaded
  // edge. The query layer always has a next page (history is unbounded backward),
  // so the only guard is an in-flight fetch.
  useEffect(() => {
    if (startIdx - loadedFloorIdx <= PREFETCH_MONTHS && !isFetchingNextPage) fetchNextPage();
  }, [startIdx, loadedFloorIdx, isFetchingNextPage, fetchNextPage]);

  const shownIdxs: number[] = [];
  for (let i = startIdx; i <= realEnd; i++) shownIdxs.push(i);
  const single = shownIdxs.length === 1;

  const step = (delta: number) =>
    setEndMonth(indexToMonth(Math.min(curIdx, Math.max(loadedFloorIdx, endIdx + delta))));

  // Newest-first months for the full-history sheet, down to the loaded floor.
  // The sheet itself caps its initial view at the first-mark anchor, so loaded
  // pre-anchor months only show after an explicit "Load earlier months".
  const allMonths: string[] = [];
  for (let i = curIdx; i >= loadedFloorIdx; i--) allMonths.push(indexToMonth(i));

  // Disabled only while sitting at the loaded floor — the prefetch effect has
  // already requested the next page, so it re-enables when that page lands.
  const prevDisabled = startIdx <= loadedFloorIdx;
  const nextDisabled = realEnd >= curIdx;

  return (
    <section className="hist">
      <div className="hist__head">
        <div className="streaks__head">
          <Icon name="cal" size={17} style={{ color: 'var(--accent)' }} />
          <h3 className="streaks__title">History</h3>
        </div>
        {firstMarkDate != null ? (
          <button type="button" className="hist__expand" onClick={() => setSheetOpen(true)}>
            View full history <Icon name="chevR" size={14} />
          </button>
        ) : null}
      </div>

      {firstMarkDate == null ? (
        <p className="muted" style={{ fontSize: '.9rem', marginTop: 0 }}>
          No marks yet. Tap a day to start tracking.
        </p>
      ) : null}

      <div className={`monthcard${single ? '' : ' monthcard--multi'}`}>
        {single ? (
          <>
            <div className="monthcard__nav">
              <button
                type="button"
                className="histnavbtn"
                aria-label="Previous month"
                disabled={prevDisabled}
                onClick={() => step(-1)}
              >
                <Icon name="chevL" size={16} />
              </button>
              <span className="monthcard__label">
                {MONTH_NAMES[realEnd % 12]} {Math.floor(realEnd / 12)}
              </span>
              <button
                type="button"
                className="histnavbtn"
                aria-label="Next month"
                disabled={nextDisabled}
                onClick={() => step(1)}
              >
                <Icon name="chevR" size={16} />
              </button>
            </div>
            <MonthView
              ym={indexToMonth(realEnd)}
              marks={marks}
              failSet={failSet}
              today={today}
              onCycle={onCycle}
            />
          </>
        ) : (
          <>
            <button
              type="button"
              className="histnavbtn monthcard__arrow monthcard__arrow--prev"
              aria-label="Earlier months"
              disabled={prevDisabled}
              onClick={() => step(-1)}
            >
              <Icon name="chevL" size={16} />
            </button>
            <button
              type="button"
              className="histnavbtn monthcard__arrow monthcard__arrow--next"
              aria-label="Later months"
              disabled={nextDisabled}
              onClick={() => step(1)}
            >
              <Icon name="chevR" size={16} />
            </button>
            <div
              className="monthcard__grid"
              style={{ gridTemplateColumns: `repeat(${shownIdxs.length}, 1fr)` }}
            >
              {shownIdxs.map((i) => (
                <MonthView
                  key={indexToMonth(i)}
                  ym={indexToMonth(i)}
                  marks={marks}
                  failSet={failSet}
                  today={today}
                  onCycle={onCycle}
                  showTitle
                />
              ))}
            </div>
          </>
        )}
        <CalLegend />
      </div>

      {sheetOpen && firstMarkDate != null ? (
        <HistorySheet
          months={allMonths}
          anchorMonth={firstMarkDate.slice(0, 7)}
          marks={marks}
          failSet={failSet}
          today={today}
          onCycle={onCycle}
          onClose={() => setSheetOpen(false)}
          isFetchingNextPage={isFetchingNextPage}
          onLoadMore={fetchNextPage}
        />
      ) : null}
    </section>
  );
}

// Keeps the visible window full when the requested end sits near the start of
// history: shift the right edge forward to fill `cols` months without exceeding
// the current month.
function realEndIdx(startIdx: number, endIdx: number, curIdx: number, cols: number): number {
  if (endIdx - startIdx < cols - 1) return Math.min(curIdx, startIdx + (cols - 1));
  return endIdx;
}
