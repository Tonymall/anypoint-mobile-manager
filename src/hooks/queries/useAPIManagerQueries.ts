import { useQuery } from '@tanstack/react-query';
import * as apiManagerService from '../../services/apiManagerService';
import { useAuthStore } from '../../stores/authStore';

export const apiManagerKeys = {
  all: ['apiManager'] as const,
  apis: (orgId: string, envId: string) => [...apiManagerKeys.all, 'apis', orgId, envId] as const,
  api: (orgId: string, envId: string, apiId: number) => [...apiManagerKeys.all, 'api', orgId, envId, apiId] as const,
  policies: (orgId: string, envId: string, apiId: number) => [...apiManagerKeys.all, 'policies', orgId, envId, apiId] as const,
  policyTemplates: (orgId: string, envId: string, apiId: number) => [...apiManagerKeys.all, 'policyTemplates', orgId, envId, apiId] as const,
  slaTiers: (orgId: string, envId: string, apiId: number) => [...apiManagerKeys.all, 'slaTiers', orgId, envId, apiId] as const,
  contracts: (orgId: string, envId: string, apiId: number) => [...apiManagerKeys.all, 'contracts', orgId, envId, apiId] as const,
  apiAsset: (orgId: string, envId: string, apiId: number) => [...apiManagerKeys.all, 'apiAsset', orgId, envId, apiId] as const,
  governanceReport: (orgId: string, envId: string, apiId: number) => [...apiManagerKeys.all, 'governanceReport', orgId, envId, apiId] as const,
};

export function useManagedAPIs(
  params?: { query?: string; offset?: number; limit?: number },
  options?: { enabled?: boolean },
) {
  const org = useAuthStore((s) => s.currentOrganization);
  const env = useAuthStore((s) => s.currentEnvironment);
  const isEnabled = options?.enabled ?? true;

  return useQuery({
    queryKey: [...apiManagerKeys.apis(org?.id ?? '', env?.id ?? ''), params],
    queryFn: () => apiManagerService.getManagedAPIs(org!.id, env!.id, params),
    enabled: !!org && !!env && isEnabled,
    refetchInterval: isEnabled ? 60_000 : false,
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

export function useAPIPolicies(apiId: number) {
  const org = useAuthStore((s) => s.currentOrganization);
  const env = useAuthStore((s) => s.currentEnvironment);

  return useQuery({
    queryKey: apiManagerKeys.policies(org?.id ?? '', env?.id ?? '', apiId),
    queryFn: () => apiManagerService.getPolicies(org!.id, env!.id, apiId),
    enabled: !!org && !!env && !!apiId,
  });
}

export function useAPIPolicyTemplates(apiId: number) {
  const org = useAuthStore((s) => s.currentOrganization);
  const env = useAuthStore((s) => s.currentEnvironment);

  return useQuery({
    queryKey: apiManagerKeys.policyTemplates(org?.id ?? '', env?.id ?? '', apiId),
    queryFn: () => apiManagerService.getPolicyTemplates(org!.id, env!.id, apiId),
    enabled: !!org && !!env && !!apiId,
  });
}

export function useAPISLATiers(apiId: number) {
  const org = useAuthStore((s) => s.currentOrganization);
  const env = useAuthStore((s) => s.currentEnvironment);

  return useQuery({
    queryKey: apiManagerKeys.slaTiers(org?.id ?? '', env?.id ?? '', apiId),
    queryFn: () => apiManagerService.getSLATiers(org!.id, env!.id, apiId),
    enabled: !!org && !!env && !!apiId,
  });
}

export function useAPIContracts(apiId: number) {
  const org = useAuthStore((s) => s.currentOrganization);
  const env = useAuthStore((s) => s.currentEnvironment);

  return useQuery({
    queryKey: apiManagerKeys.contracts(org?.id ?? '', env?.id ?? '', apiId),
    queryFn: () => apiManagerService.getContracts(org!.id, env!.id, apiId, { limit: 20, offset: 0 }),
    enabled: !!org && !!env && !!apiId,
  });
}

export function useAPIAssetSummary(apiId: number) {
  const org = useAuthStore((s) => s.currentOrganization);
  const env = useAuthStore((s) => s.currentEnvironment);

  return useQuery({
    queryKey: apiManagerKeys.apiAsset(org?.id ?? '', env?.id ?? '', apiId),
    queryFn: () => apiManagerService.getApiAssetSummary(org!.id, env!.id, apiId),
    enabled: !!org && !!env && !!apiId,
  });
}

export function useAPIGovernanceReport(apiId: number) {
  const org = useAuthStore((s) => s.currentOrganization);
  const env = useAuthStore((s) => s.currentEnvironment);

  return useQuery({
    queryKey: apiManagerKeys.governanceReport(org?.id ?? '', env?.id ?? '', apiId),
    queryFn: () => apiManagerService.getApiGovernanceReport(org!.id, env!.id, apiId),
    enabled: !!org && !!env && !!apiId,
  });
}
