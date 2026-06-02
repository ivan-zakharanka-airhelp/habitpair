import { useQuery } from '@tanstack/react-query';
import { habitsQueryOptions } from '../api/habits';
import { todayLocalISO } from '../lib/today';

export function useHabits() {
  return useQuery(habitsQueryOptions(todayLocalISO()));
}
