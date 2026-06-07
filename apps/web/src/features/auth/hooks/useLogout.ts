import { useMutation, useQueryClient } from '@tanstack/react-query';
import { logoutRequest } from '../api/auth';
import { authStore } from '../../../shared/lib/authStore';

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (): Promise<void> => {
      const refreshToken = authStore.getRefreshToken();
      if (refreshToken) {
        await logoutRequest(refreshToken);
      }
    },
    // Clearing the store nulls the access token and flips the route guard to
    // redirect to /login; clearing the query cache then drops the signed-in
    // user's habits/metrics so the next account starts clean. Order matters —
    // the token is gone first, so any in-flight refetch 401s instead of
    // repopulating the cache we just wiped.
    onSuccess: () => {
      authStore.clear();
      queryClient.clear();
    },
  });
}
