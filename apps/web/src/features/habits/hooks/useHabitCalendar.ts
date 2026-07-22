import { useInfiniteQuery } from '@tanstack/react-query';
import { habitCalendarInfiniteOptions } from '../api/calendar';

export function useHabitCalendar(habitId: string, today: string) {
  return useInfiniteQuery(habitCalendarInfiniteOptions(habitId, today));
}
