import { habitsApi } from '../../../shared/api/apiClient';
import { errorMessage } from './habits';
import { calendarPageRange } from '../lib/calendarRange';
import type { FailedPeriod, HabitCalendarResponse, MarkStatus } from '../types';

// Paged (infinite) read of one habit's calendar. Each page is one fixed-size
// ALL_CAP_MONTHS window (calendarPageRange); page 0 is byte-identical to the old
// single-window fetch. The key drops from/to so navigation and paging never
// change it — no cache churn. `today` is the client's local day so the server
// evaluates "past day"/"closed period" against the user's calendar, not the
// server clock; it's also in the key so the view refreshes across a local
// midnight. getNextPageParam always returns the next index: history is
// calendar-anchored and unbounded backward, so the *consumers* decide when to
// stop paging, not the query layer.
export function habitCalendarInfiniteOptions(habitId: string, today: string) {
  return {
    queryKey: ['habits', habitId, 'calendar', today] as const,
    initialPageParam: 0,
    queryFn: async ({ pageParam }: { pageParam: number }): Promise<HabitCalendarResponse> => {
      const { fromMonth, toMonth } = calendarPageRange(pageParam);
      const response = await habitsApi(
        `/habits/${habitId}/calendar?from=${fromMonth}&to=${toMonth}&today=${today}`,
      );
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
      return response.json() as Promise<HabitCalendarResponse>;
    },
    getNextPageParam: (_lastPage: HabitCalendarResponse, pages: HabitCalendarResponse[]) =>
      pages.length,
  };
}

// Folds the loaded pages (newest = page 0, then older) into the single response
// shape components already consume. `habit`/`firstMarkDate` come from page 0 (the
// global anchor from an unbounded findFirst). `marks` union into one record;
// `computedMissedDates`/`failedPeriods` concatenate — no dedupe needed since a
// period straddling a page boundary collapses harmlessly downstream (Set/record
// folding in HabitCalendar is idempotent).
export function mergeCalendarPages(pages: HabitCalendarResponse[]): HabitCalendarResponse {
  const [first] = pages;
  const marks: Record<string, MarkStatus> = {};
  const computedMissedDates: string[] = [];
  const failedPeriods: FailedPeriod[] = [];
  for (const page of pages) {
    Object.assign(marks, page.marks);
    computedMissedDates.push(...page.computedMissedDates);
    failedPeriods.push(...page.failedPeriods);
  }
  return {
    habit: first.habit,
    firstMarkDate: first.firstMarkDate,
    marks,
    computedMissedDates,
    failedPeriods,
  };
}
