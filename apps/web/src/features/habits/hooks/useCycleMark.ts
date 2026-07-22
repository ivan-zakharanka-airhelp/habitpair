import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { deleteMark, putMark } from '../api/habits';
import { pageIndexForMonth } from '../lib/calendarRange';
import { todayLocalISO } from '../lib/today';
import type { HabitCalendarResponse, MarkStatus } from '../types';

// Stored-status cycle: absent → COMPLETED → MISSED → absent. Keyed off the
// *stored* mark, never the displayed color — so a daily computed-missed day (red
// but unmarked) cycles absent → COMPLETED on first click.
function nextStatus(stored: MarkStatus | null): MarkStatus | null {
  if (stored === null) return 'COMPLETED';
  if (stored === 'COMPLETED') return 'MISSED';
  return null;
}

interface CycleVars {
  date: string; // YYYY-MM-DD, local key
  storedStatus: MarkStatus | null;
}

// Advances a past day's stored status via the existing write endpoints, mirroring
// useToggleMark's cancel/snapshot/rollback/invalidate shape. The optimistic write
// touches `marks` only: daily ✓/✗ recolors instantly because stored marks win over
// computed coloring (HabitCalendar.buildStatusSets), while weekly/monthly period
// tint reconciles on the settle refetch. onSettled also invalidates the list key
// (a retroactive change can shift the current-period progress shown on the list)
// and the metrics key (it can shift the streak/consistency/completion numbers).
export function useCycleMark(habitId: string, today: string) {
  const queryClient = useQueryClient();
  const calendarKey = ['habits', habitId, 'calendar', today] as const;
  const listKey = ['habits', todayLocalISO()] as const;
  // Prefix match across the `today` segment of the metrics key.
  const metricsKey = ['habits', habitId, 'metrics'] as const;

  return useMutation({
    mutationFn: ({ date, storedStatus }: CycleVars): Promise<void> => {
      const next = nextStatus(storedStatus);
      return next === null ? deleteMark(habitId, date) : putMark(habitId, date, next);
    },
    onMutate: async ({ date, storedStatus }: CycleVars) => {
      await queryClient.cancelQueries({ queryKey: calendarKey });
      const previous = queryClient.getQueryData<InfiniteData<HabitCalendarResponse>>(calendarKey);
      const next = nextStatus(storedStatus);
      // Patch only the page whose window contains the date: each page's `marks`
      // record holds dates inside its own span, and the merged view folds pages
      // oldest→newest, so writing into the wrong page could be masked or doubled.
      const pageIndex = pageIndexForMonth(date.slice(0, 7));
      queryClient.setQueryData<InfiniteData<HabitCalendarResponse>>(calendarKey, (old) => {
        if (!old || pageIndex < 0 || pageIndex >= old.pages.length) return old;
        const pages = old.pages.map((page, i) => {
          if (i !== pageIndex) return page;
          const marks = { ...page.marks };
          if (next === null) delete marks[date];
          else marks[date] = next;
          return { ...page, marks };
        });
        return { ...old, pages };
      });
      return { previous };
    },
    onError: (_error, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(calendarKey, context.previous);
      }
    },
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: calendarKey }),
        queryClient.invalidateQueries({ queryKey: listKey }),
        queryClient.invalidateQueries({ queryKey: metricsKey }),
      ]),
  });
}

export type CycleMarkMutation = ReturnType<typeof useCycleMark>;
