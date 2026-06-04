import { habitsApi } from '../../../shared/api/apiClient';
import type { CreateHabitInput, HabitListItem, MarkStatus, UpdateHabitInput } from '../types';

export async function errorMessage(response: Response): Promise<string> {
  try {
    const data: unknown = await response.json();
    const message = (data as { message?: unknown }).message;
    if (Array.isArray(message)) return message.join(', ');
    if (typeof message === 'string') return message;
  } catch {
    // Non-JSON body — fall through to the generic message.
  }
  return 'Something went wrong. Please try again.';
}

export function habitsQueryOptions(today: string) {
  return {
    queryKey: ['habits', today] as const,
    queryFn: async (): Promise<HabitListItem[]> => {
      const response = await habitsApi(`/habits?today=${today}`);
      if (!response.ok) {
        throw new Error(await errorMessage(response));
      }
      return response.json() as Promise<HabitListItem[]>;
    },
  };
}

export async function createHabit(input: CreateHabitInput): Promise<void> {
  const response = await habitsApi('/habits', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
}

export async function updateHabit(habitId: string, input: UpdateHabitInput): Promise<void> {
  const response = await habitsApi(`/habits/${habitId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
}

export async function deleteHabit(habitId: string): Promise<void> {
  const response = await habitsApi(`/habits/${habitId}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
}

export async function putMark(habitId: string, date: string, status: MarkStatus): Promise<void> {
  const response = await habitsApi(`/habits/${habitId}/marks/${date}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ status }),
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
}

export async function deleteMark(habitId: string, date: string): Promise<void> {
  const response = await habitsApi(`/habits/${habitId}/marks/${date}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    throw new Error(await errorMessage(response));
  }
}
