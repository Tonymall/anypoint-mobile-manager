import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as runtimeService from '../../services/runtimeService';
import { useAuthStore } from '../../stores/authStore';

export const runtimeKeys = {
  all: ['runtime'] as const,
  applications: () => [...runtimeKeys.all, 'applications'] as const,
  application: (domain: string) => [...runtimeKeys.all, 'application', domain] as const,
  logs: (domain: string) => [...runtimeKeys.all, 'logs', domain] as const,
  metrics: (domain: string, metric: string) => [...runtimeKeys.all, 'metrics', domain, metric] as const,
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

export function useApplication(domain: string) {
  return useQuery({
    queryKey: runtimeKeys.application(domain),
    queryFn: () => runtimeService.getApplication(domain),
    enabled: !!domain,
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

export function useStartApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runtimeService.startApp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: runtimeKeys.applications() });
    },
  });
}

export function useStopApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runtimeService.stopApp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: runtimeKeys.applications() });
    },
  });
}

export function useRestartApp() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runtimeService.restartApp,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: runtimeKeys.applications() });
    },
  });
}
