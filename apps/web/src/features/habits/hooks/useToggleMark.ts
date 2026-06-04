import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteMark, putMark } from '../api/habits';
import { todayLocalISO } from '../lib/today';
import type { HabitListItem } from '../types';

// Toggling today flips the habit's todayStatus and shifts its current-period
// completedCount by ±1. The optimistic update lands instantly (<300 ms NFR);
// onError rolls back; onSettled reconciles the list with the server and
// invalidates the habit's metrics key (today's mark shifts its streak/numbers).
export function useToggleMark() {
  const queryClient = useQueryClient();
  const today = todayLocalISO();
  const queryKey = ['habits', today] as const;

  return useMutation({
    mutationFn: (habit: HabitListItem): Promise<void> =>
      habit.todayStatus === 'COMPLETED'
        ? deleteMark(habit.id, today)
        : putMark(habit.id, today, 'COMPLETED'),
    onMutate: async (habit: HabitListItem) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<HabitListItem[]>(queryKey);
      queryClient.setQueryData<HabitListItem[]>(queryKey, (old) =>
        old?.map((h): HabitListItem => {
          if (h.id !== habit.id) return h;
          const willComplete = h.todayStatus !== 'COMPLETED';
          return {
            ...h,
            todayStatus: willComplete ? 'COMPLETED' : null,
            currentPeriod: {
              ...h.currentPeriod,
              completedCount: h.currentPeriod.completedCount + (willComplete ? 1 : -1),
            },
          };
        }),
      );
      return { previous };
    },
    onError: (_error, _habit, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKey, context.previous);
      }
    },
    onSettled: (_data, _error, habit) =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey }),
        queryClient.invalidateQueries({ queryKey: ['habits', habit.id, 'metrics'] }),
      ]),
  });
}
