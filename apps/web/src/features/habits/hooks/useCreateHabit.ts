import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createHabit } from '../api/habits';
import { todayLocalISO } from '../lib/today';

export function useCreateHabit() {
  const queryClient = useQueryClient();
  const today = todayLocalISO();
  return useMutation({
    mutationFn: createHabit,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['habits', today] }),
  });
}
