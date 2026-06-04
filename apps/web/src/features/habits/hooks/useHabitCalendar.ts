import { useQuery } from '@tanstack/react-query';
import { habitCalendarQueryOptions } from '../api/calendar';

export function useHabitCalendar(habitId: string, from: string, to: string, today: string) {
  return useQuery(habitCalendarQueryOptions(habitId, from, to, today));
}
