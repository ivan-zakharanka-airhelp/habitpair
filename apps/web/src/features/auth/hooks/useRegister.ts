import { useMutation } from '@tanstack/react-query';
import { registerRequest } from '../api/auth';
import { authStore } from '../../../shared/lib/authStore';

export function useRegister() {
  return useMutation({
    mutationFn: registerRequest,
    onSuccess: (data) => authStore.setSession(data),
  });
}
