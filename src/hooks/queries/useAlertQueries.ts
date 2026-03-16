import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as alertService from '../../services/alertService';
import { useAuthStore } from '../../stores/authStore';

/**
 * Query key factory -- scoped by org + env so tenant switches never
 * serve stale data from a previous context.
 */
function scopePrefix(domain: string): readonly string[] {
  const { currentOrganization, currentEnvironment } = useAuthStore.getState();
  return [domain, currentOrganization?.id ?? '_', currentEnvironment?.id ?? '_'] as const;
}

export const alertKeys = {
  all: () => scopePrefix('alerts'),
  list: (params?: Parameters<typeof alertService.getAlerts>[2]) =>
    [...scopePrefix('alerts'), 'list', JSON.stringify(params)] as const,
  detail: (id: string) => [...scopePrefix('alerts'), 'detail', id] as const,
  rules: () => [...scopePrefix('alerts'), 'rules'] as const,
};

// ---------- Queries ----------

export function usePlatformAlerts(
  params?: Parameters<typeof alertService.getAlerts>[2],
  options?: { enabled?: boolean },
) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);
  const isEnabled = options?.enabled ?? true;

  return useQuery({
    queryKey: alertKeys.list(params),
    queryFn: () => alertService.getAlerts(orgId!, envId!, params),
    enabled: !!orgId && !!envId && isEnabled,
    refetchInterval: isEnabled ? 30_000 : false,
  });
}

export function usePlatformAlert(alertId: string) {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: alertKeys.detail(alertId),
    queryFn: () => alertService.getAlert(orgId!, envId!, alertId),
    enabled: !!orgId && !!envId && !!alertId,
  });
}

export function useAlertRules() {
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useQuery({
    queryKey: alertKeys.rules(),
    queryFn: () => alertService.getAlertRules(orgId!, envId!),
    enabled: !!orgId && !!envId,
  });
}

// ---------- Alert Action Mutations ----------

export function useAcknowledgeAlert() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useMutation({
    mutationFn: (alertId: string) => alertService.acknowledgeAlert(orgId!, envId!, alertId),
    onSuccess: (_data, alertId) => {
      queryClient.invalidateQueries({ queryKey: alertKeys.list() });
      queryClient.invalidateQueries({ queryKey: alertKeys.detail(alertId) });
    },
  });
}

export function useResolveAlert() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useMutation({
    mutationFn: (alertId: string) => alertService.resolveAlert(orgId!, envId!, alertId),
    onSuccess: (_data, alertId) => {
      queryClient.invalidateQueries({ queryKey: alertKeys.list() });
      queryClient.invalidateQueries({ queryKey: alertKeys.detail(alertId) });
    },
  });
}

export function useDismissAlert() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useMutation({
    mutationFn: (alertId: string) => alertService.dismissAlert(orgId!, envId!, alertId),
    onSuccess: (_data, alertId) => {
      queryClient.invalidateQueries({ queryKey: alertKeys.list() });
      queryClient.invalidateQueries({ queryKey: alertKeys.detail(alertId) });
    },
  });
}

// ---------- Alert Rule Mutations ----------

export function useCreateAlertRule() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useMutation({
    mutationFn: (rule: Parameters<typeof alertService.createAlertRule>[2]) =>
      alertService.createAlertRule(orgId!, envId!, rule),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.rules() });
    },
  });
}

export function useUpdateAlertRule() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useMutation({
    mutationFn: (variables: { ruleId: string; updates: Parameters<typeof alertService.updateAlertRule>[3] }) =>
      alertService.updateAlertRule(orgId!, envId!, variables.ruleId, variables.updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.rules() });
    },
  });
}

export function useDeleteAlertRule() {
  const queryClient = useQueryClient();
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);

  return useMutation({
    mutationFn: (ruleId: string) => alertService.deleteAlertRule(orgId!, envId!, ruleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: alertKeys.rules() });
    },
  });
}
