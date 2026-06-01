import { useMutation } from '@tanstack/react-query';
import { logoutRequest } from '../api/auth';
import { authStore } from '../../../shared/lib/authStore';

export function useLogout() {
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const refreshToken = authStore.getRefreshToken();
      if (refreshToken) {
        await logoutRequest(refreshToken);
      }
    },
    onSuccess: () => authStore.clear(),
  });
}
