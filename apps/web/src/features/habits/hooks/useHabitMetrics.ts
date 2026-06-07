import { useQuery } from '@tanstack/react-query';
import { habitMetricsQueryOptions } from '../api/metrics';

export function useHabitMetrics(habitId: string, today: string) {
  return useQuery(habitMetricsQueryOptions(habitId, today));
}
