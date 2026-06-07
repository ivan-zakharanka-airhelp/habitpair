import { useMutation, useQueryClient } from '@tanstack/react-query';
import { updateHabit } from '../api/habits';
import type { UpdateHabitInput } from '../types';

export function useUpdateHabit(habitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateHabitInput) => updateHabit(habitId, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['habits'] }),
  });
}
