import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as runtimeService from '../../services/runtimeService';
import { useAuthStore } from '../../stores/authStore';

export const runtimeKeys = {
  all: ['runtime'] as const,
  applications: () => [...runtimeKeys.all, 'applications'] as const,
  application: (domain: string) => [...runtimeKeys.all, 'application', domain] as const,
  logs: (domain: string) => [...runtimeKeys.all, 'logs', domain] as const,
  metrics: (domain: string, metric: string) => [...runtimeKeys.all, 'metrics', domain, metric] as const,
  schedulers: (domain: string) => [...runtimeKeys.all, 'schedulers', domain] as const,
};

export function useApplications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: runtimeKeys.applications(),
    queryFn: () => runtimeService.getApplications(),
    enabled: isAuthenticated,
    refetchInterval: 30_000,
  });
}

/**
 * Fetch a single application by domain.
 * Accepts an optional refetchInterval for polling after lifecycle actions.
 */
export function useApplication(
  domain: string,
  options?: { refetchInterval?: number | false },
) {
  return useQuery({
    queryKey: runtimeKeys.application(domain),
    queryFn: () => runtimeService.getApplication(domain),
    enabled: !!domain,
    refetchInterval: options?.refetchInterval,
  });
}

export function useAppLogs(domain: string, params?: Parameters<typeof runtimeService.getAppLogs>[1]) {
  return useQuery({
    queryKey: [...runtimeKeys.logs(domain), params],
    queryFn: () => runtimeService.getAppLogs(domain, params),
    enabled: !!domain,
  });
}

export function useAppMetrics(domain: string, params: {
  metricName: string;
  startDate: string;
  endDate: string;
  interval?: string;
}) {
  return useQuery({
    queryKey: runtimeKeys.metrics(domain, params.metricName),
    queryFn: () => runtimeService.getAppMetrics(domain, params),
    enabled: !!domain,
    refetchInterval: 60_000,
  });
}

// --- Schedulers ---

export function useSchedulers(domain: string) {
  return useQuery({
    queryKey: runtimeKeys.schedulers(domain),
    queryFn: () => runtimeService.getSchedulers(domain),
    enabled: !!domain,
  });
}

export function useUpdateScheduler() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, scheduleId, enabled }: { domain: string; scheduleId: string; enabled: boolean }) =>
      runtimeService.updateScheduler(domain, scheduleId, enabled),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: runtimeKeys.schedulers(variables.domain) });
    },
  });
}

export function useRunScheduler() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ domain, scheduleId }: { domain: string; scheduleId: string }) =>
      runtimeService.runScheduler(domain, scheduleId),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: runtimeKeys.schedulers(variables.domain) });
    },
  });
}

// --- Lifecycle mutations ---
// Each mutation updates the query cache immediately with the response
// (which may contain a transitional status like UPDATING/DEPLOYING)
// and then invalidates the list query.

export function useStartApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runtimeService.startApp,
    onSuccess: (data, domain) => {
      if (data) {
        queryClient.setQueryData(runtimeKeys.application(domain), data);
      }
      queryClient.invalidateQueries({ queryKey: runtimeKeys.applications() });
    },
  });
}

export function useStopApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runtimeService.stopApp,
    onSuccess: (data, domain) => {
      if (data) {
        queryClient.setQueryData(runtimeKeys.application(domain), data);
      }
      queryClient.invalidateQueries({ queryKey: runtimeKeys.applications() });
    },
  });
}

export function useRestartApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runtimeService.restartApp,
    onSuccess: (data, domain) => {
      if (data) {
        queryClient.setQueryData(runtimeKeys.application(domain), data);
      }
      queryClient.invalidateQueries({ queryKey: runtimeKeys.applications() });
    },
  });
}
