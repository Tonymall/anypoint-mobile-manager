import { useQuery } from '@tanstack/react-query';
import * as apiManagerService from '../../services/apiManagerService';
import { useAuthStore } from '../../stores/authStore';

export const apiManagerKeys = {
  all: ['apiManager'] as const,
  apis: (orgId: string, envId: string) => [...apiManagerKeys.all, 'apis', orgId, envId] as const,
  api: (orgId: string, envId: string, apiId: number) => [...apiManagerKeys.all, 'api', orgId, envId, apiId] as const,
};

export function useManagedAPIs(params?: { query?: string; offset?: number; limit?: number }) {
  const org = useAuthStore((s) => s.currentOrganization);
  const env = useAuthStore((s) => s.currentEnvironment);

  return useQuery({
    queryKey: [...apiManagerKeys.apis(org?.id ?? '', env?.id ?? ''), params],
    queryFn: () => apiManagerService.getManagedAPIs(org!.id, env!.id, params),
    enabled: !!org && !!env,
    refetchInterval: 60_000,
  });
}

export function useManagedAPI(apiId: number) {
  const org = useAuthStore((s) => s.currentOrganization);
  const env = useAuthStore((s) => s.currentEnvironment);

  return useQuery({
    queryKey: apiManagerKeys.api(org?.id ?? '', env?.id ?? '', apiId),
    queryFn: () => apiManagerService.getAPI(org!.id, env!.id, apiId),
    enabled: !!org && !!env && !!apiId,
  });
}
