import { habitsApi } from '../../../shared/api/apiClient';
import { errorMessage } from './habits';
import type { HabitMetricsResponse } from '../types';

// As-of-today read of one habit's insight metrics (current streak, rolling
// consistency, recent completion, best streaks). `today` is the client's local
// day so the server evaluates "closed period" against the user's calendar, and
// it lives in the key so the numbers refresh across a local midnight. No
// keepPreviousData: the key only changes when the day rolls over, not on
// navigation, so there's no prior window worth holding.
export function habitMetricsQueryOptions(habitId: string, today: string) {
  return {
    queryKey: ['habits', habitId, 'metrics', today] as const,
    queryFn: async (): Promise<HabitMetricsResponse> => {
      const response = await habitsApi(`/habits/${habitId}/metrics?today=${today}`);
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
      return response.json() as Promise<HabitMetricsResponse>;
    },
  };
}
