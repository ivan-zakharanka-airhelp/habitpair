import { useMutation, useQueryClient } from '@tanstack/react-query';
import { deleteHabit } from '../api/habits';

export function useDeleteHabit(habitId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => deleteHabit(habitId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['habits'] }),
  });
}
