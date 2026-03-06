import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as deploymentService from '../../services/deploymentService';
import { useAuthStore } from '../../stores/authStore';

/**
 * Query key factory -- scoped by org + env so tenant switches never
 * serve stale data from a previous context.
 */
function scopePrefix(domain: string): readonly string[] {
  const { currentOrganization, currentEnvironment } = useAuthStore.getState();
  return [domain, currentOrganization?.id ?? '_', currentEnvironment?.id ?? '_'] as const;
}

export const deploymentKeys = {
  all: () => scopePrefix('deployments'),
  history: (params?: Parameters<typeof deploymentService.getDeploymentHistory>[2]) =>
    [...scopePrefix('deployments'), 'history', JSON.stringify(params)] as const,
  status: (id: string) => [...scopePrefix('deployments'), 'status', id] as const,
};

// ---------- Queries ----------

export function useDeploymentHistory(params?: Parameters<typeof deploymentService.getDeploymentHistory>[2]) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: deploymentKeys.history(params),
    queryFn: () => deploymentService.getDeploymentHistory(orgId!, envId!, params),
    enabled: !!orgId && !!envId,
  });
}

export function useDeploymentStatus(id: string) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: deploymentKeys.status(id),
    queryFn: () => deploymentService.getDeploymentStatus(orgId!, envId!, id),
    enabled: !!orgId && !!envId && !!id,
  });
}

// ---------- Mutations ----------

export function useRedeploy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (domain: string) => deploymentService.triggerRedeployment(domain),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deploymentKeys.all() });
    },
  });
}

export function useRollback() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useMutation({
    mutationFn: (variables: { applicationName: string; deploymentId: string }) =>
      deploymentService.rollback(orgId!, envId!, variables.applicationName, variables.deploymentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deploymentKeys.all() });
    },
  });
}

export function usePromote() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useMutation({
    mutationFn: (variables: {
      applicationName: string;
      targetEnvironmentId: string;
      overrides?: {
        workerCount?: number;
        workerType?: string;
        properties?: Record<string, string>;
      };
    }) =>
      deploymentService.promoteEnvironment(
        orgId!,
        envId!,
        variables.applicationName,
        variables.targetEnvironmentId,
        variables.overrides,
      ),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deploymentKeys.all() });
    },
  });
}
