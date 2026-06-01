import { useMutation } from '@tanstack/react-query';
import { loginRequest } from '../api/auth';
import { authStore } from '../../../shared/lib/authStore';

export function useLogin() {
  return useMutation({
    mutationFn: loginRequest,
    onSuccess: (data) => authStore.setSession(data),
  });
}
