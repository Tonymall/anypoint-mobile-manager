import { useQuery } from '@tanstack/react-query';
import * as exchangeService from '../../services/exchangeService';
import { useAuthStore } from '../../stores/authStore';

/**
 * Query key factory -- scoped by org + env so tenant switches never
 * serve stale data from a previous context.
 */
function scopePrefix(domain: string): readonly string[] {
  const { currentOrganization, currentEnvironment } = useAuthStore.getState();
  return [domain, currentOrganization?.id ?? '_', currentEnvironment?.id ?? '_'] as const;
}

export const exchangeKeys = {
  all: () => scopePrefix('exchange'),
  search: (params?: Parameters<typeof exchangeService.searchAssets>[0]) =>
    [...scopePrefix('exchange'), 'search', params] as const,
  asset: (groupId: string, assetId: string, version: string) =>
    [...scopePrefix('exchange'), 'asset', groupId, assetId, version] as const,
  versions: (groupId: string, assetId: string) =>
    [...scopePrefix('exchange'), 'versions', groupId, assetId] as const,
};

// ---------- Queries ----------

export function useExchangeSearch(params?: Parameters<typeof exchangeService.searchAssets>[0]) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: exchangeKeys.search(params),
    queryFn: () => exchangeService.searchAssets(params),
    enabled: !!orgId && !!envId,
  });
}

export function useExchangeAsset(groupId: string, assetId: string, version: string) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: exchangeKeys.asset(groupId, assetId, version),
    queryFn: () => exchangeService.getAsset(groupId, assetId, version),
    enabled: !!orgId && !!envId && !!groupId && !!assetId && !!version,
  });
}

export function useExchangeVersions(groupId: string, assetId: string) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: exchangeKeys.versions(groupId, assetId),
    queryFn: () => exchangeService.getAssetVersions(groupId, assetId),
    enabled: !!orgId && !!envId && !!groupId && !!assetId,
  });
}
