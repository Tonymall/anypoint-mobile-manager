import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as serverService from '../../services/serverService';
import { useAuthStore } from '../../stores/authStore';

/**
 * Query key factory -- scoped by org + env so tenant switches never
 * serve stale data from a previous context.
 */
function scopePrefix(domain: string): readonly string[] {
  const { currentOrganization, currentEnvironment } = useAuthStore.getState();
  return [domain, currentOrganization?.id ?? '_', currentEnvironment?.id ?? '_'] as const;
}

export const infraKeys = {
  all: () => scopePrefix('infrastructure'),
  servers: () => [...scopePrefix('infrastructure'), 'servers'] as const,
  server: (id: number) => [...scopePrefix('infrastructure'), 'server', id] as const,
  serverGroups: () => [...scopePrefix('infrastructure'), 'serverGroups'] as const,
  clusters: () => [...scopePrefix('infrastructure'), 'clusters'] as const,
  rtfDeployments: () => [...scopePrefix('infrastructure'), 'rtf'] as const,
};

// ---------- Queries ----------

export function useServers(
  params?: Parameters<typeof serverService.getServers>[2],
  options?: { enabled?: boolean },
) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: [...infraKeys.servers(), params],
    queryFn: () => serverService.getServers(orgId!, envId!, params),
    enabled: !!orgId && !!envId && (options?.enabled ?? true),
    retry: false,
  });
}

export function useServer(serverId: number) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: infraKeys.server(serverId),
    queryFn: () => serverService.getServer(orgId!, envId!, serverId),
    enabled: !!orgId && !!envId && !!serverId,
    retry: false,
  });
}

export function useServerGroups(options?: { enabled?: boolean }) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: infraKeys.serverGroups(),
    queryFn: () => serverService.getServerGroups(orgId!, envId!),
    enabled: !!orgId && !!envId && (options?.enabled ?? true),
    retry: false,
  });
}

export function useClusters(options?: { enabled?: boolean }) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: infraKeys.clusters(),
    queryFn: () => serverService.getClusters(orgId!, envId!),
    enabled: !!orgId && !!envId && (options?.enabled ?? true),
    retry: false,
  });
}

export function useRTFDeployments(
  params?: Parameters<typeof serverService.getRTFDeployments>[2],
  options?: { enabled?: boolean },
) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: infraKeys.rtfDeployments(),
    queryFn: () => serverService.getRTFDeployments(orgId!, envId!, params),
    enabled: !!orgId && !!envId && (options?.enabled ?? true),
    retry: false,
  });
}

// ---------- Mutations ----------

export function useRestartServer() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useMutation({
    mutationFn: (serverId: number) => serverService.restartServer(orgId!, envId!, serverId),
    onSuccess: (_data, serverId) => {
      queryClient.invalidateQueries({ queryKey: infraKeys.server(serverId) });
      queryClient.invalidateQueries({ queryKey: infraKeys.servers() });
    },
  });
}
