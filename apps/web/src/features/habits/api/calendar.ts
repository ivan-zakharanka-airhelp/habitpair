import { keepPreviousData } from '@tanstack/react-query';
import { habitsApi } from '../../../shared/api/apiClient';
import { errorMessage } from './habits';
import type { HabitCalendarResponse } from '../types';

// Range-based read of one habit's calendar (?from=YYYY-MM&to=YYYY-MM). `today`
// is the client's local day so the server evaluates "past day"/"closed period"
// against the user's calendar, not the server clock; it's also in the key so the
// view refreshes across a local midnight. keepPreviousData holds the prior window
// while a new span/navigation range loads — no loading flash, and firstMarkDate
// (the global anchor) stays available so the 'All' window math never thrashes.
export function habitCalendarQueryOptions(
  habitId: string,
  from: string,
  to: string,
  today: string,
) {
  return {
    queryKey: ['habits', habitId, 'calendar', from, to, today] as const,
    queryFn: async (): Promise<HabitCalendarResponse> => {
      const response = await habitsApi(
        `/habits/${habitId}/calendar?from=${from}&to=${to}&today=${today}`,
      );
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
      return response.json() as Promise<HabitCalendarResponse>;
    },
    placeholderData: keepPreviousData,
  };
}
