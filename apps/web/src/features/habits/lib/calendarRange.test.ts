import { describe, expect, it } from 'vitest';
import {
  ALL_CAP_MONTHS,
  calendarPageRange,
  calendarQueryRange,
  currentMonth,
  monthIndex,
  pageIndexForMonth,
} from './calendarRange';

const PAGES = [0, 1, 2, 5, 10];

describe('calendarPageRange', () => {
  it('page 0 is byte-identical to calendarQueryRange', () => {
    expect(calendarPageRange(0)).toEqual(calendarQueryRange());
  });

  it('page 0 ends at the current month', () => {
    expect(calendarPageRange(0).toMonth).toBe(currentMonth());
  });

  it('each page spans exactly ALL_CAP_MONTHS months', () => {
    for (const p of PAGES) {
      const { fromMonth, toMonth } = calendarPageRange(p);
      expect(monthIndex(toMonth) - monthIndex(fromMonth)).toBe(ALL_CAP_MONTHS - 1);
    }
  });

  it('consecutive pages tile with no gap or overlap across year boundaries', () => {
    for (const p of PAGES) {
      const newer = calendarPageRange(p);
      const older = calendarPageRange(p + 1);
      expect(monthIndex(newer.fromMonth) - monthIndex(older.toMonth)).toBe(1);
    }
  });
});

describe('pageIndexForMonth', () => {
  it('inverts calendarPageRange at each page boundary month', () => {
    for (const p of PAGES) {
      const { fromMonth, toMonth } = calendarPageRange(p);
      expect(pageIndexForMonth(fromMonth)).toBe(p);
      expect(pageIndexForMonth(toMonth)).toBe(p);
    }
  });

  it('maps the current month to page 0', () => {
    expect(pageIndexForMonth(currentMonth())).toBe(0);
  });
});
