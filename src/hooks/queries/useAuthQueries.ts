import { useQuery } from '@tanstack/react-query';
import * as authService from '../../services/authService';
import { useAuthStore } from '../../stores/authStore';

export const authKeys = {
  all: ['auth'] as const,
  user: () => [...authKeys.all, 'user'] as const,
  organizations: () => [...authKeys.all, 'organizations'] as const,
};

export function useCurrentUser() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: authKeys.user(),
    queryFn: authService.getCurrentUser,
    enabled: isAuthenticated,
  });
}

export function useOrganizations() {
  const user = useAuthStore((s) => s.user);
  return useQuery({
    queryKey: authKeys.organizations(),
    queryFn: authService.getOrganizations,
    enabled: !!user,
  });
}
