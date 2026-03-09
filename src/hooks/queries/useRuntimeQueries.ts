import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as runtimeService from '../../services/runtimeService';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationStore } from '../../stores/notificationStore';
import { scheduleLocalNotification } from '../../services/notificationService';
import { useRuntimeTransitionStore } from '../../stores/runtimeTransitionStore';

/**
 * Query key factory — scoped by org + env so tenant switches never
 * serve stale data from a previous context.
 */
function scopePrefix(): readonly string[] {
  const { currentOrganization, currentEnvironment } = useAuthStore.getState();
  return ['runtime', currentOrganization?.id ?? '_', currentEnvironment?.id ?? '_'] as const;
}

export const runtimeKeys = {
  all: () => scopePrefix(),
  applications: () => [...scopePrefix(), 'applications'] as const,
  application: (domain: string) => [...scopePrefix(), 'application', domain] as const,
  logs: (domain: string) => [...scopePrefix(), 'logs', domain] as const,
  metrics: (domain: string, metric: string) => [...scopePrefix(), 'metrics', domain, metric] as const,
  schedulers: (domain: string) => [...scopePrefix(), 'schedulers', domain] as const,
};

// ALL non-final statuses — only truly final states produce a polling notification.
const NON_FINAL_STATUSES = new Set([
  'DEPLOYING', 'UPDATING', 'UNDEPLOYING', 'STARTING', 'STOPPING',
  'deploying', 'updating', 'undeploying', 'starting', 'stopping',
  'APPLYING', 'applying',
  'Deploying', 'Updating', 'Undeploying', 'Starting', 'Stopping', 'Applying',
]);

// Final statuses mapped to user-friendly notification messages.
const FINAL_STATUS_MESSAGES: Record<string, { title: string; isNegative: boolean }> = {
  STARTED:     { title: 'Application Deployed', isNegative: false },
  Started:     { title: 'Application Deployed', isNegative: false },
  started:     { title: 'Application Deployed', isNegative: false },
  RUNNING:     { title: 'Application Deployed', isNegative: false },
  Running:     { title: 'Application Deployed', isNegative: false },
  running:     { title: 'Application Deployed', isNegative: false },
  STOPPED:     { title: 'Application Stopped', isNegative: false },
  Stopped:     { title: 'Application Stopped', isNegative: false },
  stopped:     { title: 'Application Stopped', isNegative: false },
  UNDEPLOYED:  { title: 'Application Stopped', isNegative: false },
  Undeployed:  { title: 'Application Stopped', isNegative: false },
  undeployed:  { title: 'Application Stopped', isNegative: false },
  NOT_RUNNING: { title: 'Application Stopped', isNegative: false },
  DEPLOY_FAILED: { title: 'Deployment Failed', isNegative: true },
  FAILED:        { title: 'Deployment Failed', isNegative: true },
  Failed:        { title: 'Deployment Failed', isNegative: true },
  failed:        { title: 'Deployment Failed', isNegative: true },
};

// Cooldown (ms) after a polling notification to suppress duplicates.
// Handles rapid transitions like STOPPED -> UNDEPLOYED.
const NOTIFICATION_COOLDOWN_MS = 90_000; // 90 seconds

// Module-level map: tracks when a lifecycle mutation was triggered per app.
// Polling notifications are delayed until this grace period expires, ensuring
// the mutation's "Starting/Stopping" notification always appears FIRST.
const _mutationGraceMap = new Map<string, number>();
const MUTATION_GRACE_MS = 5_000; // 5 seconds after mutation fires
const _previousStatusMap = new Map<string, string>();
const _lastNotifiedMap = new Map<string, number>();

/** Called by lifecycle mutations to suppress polling notifications briefly */
function setMutationGrace(domain: string) {
  _mutationGraceMap.set(domain, Date.now());
}

/** Check if a mutation grace period is active for an app */
function isWithinMutationGrace(domain: string): boolean {
  const t = _mutationGraceMap.get(domain);
  if (!t) return false;
  if (Date.now() - t < MUTATION_GRACE_MS) return true;
  _mutationGraceMap.delete(domain);
  return false;
}

function clearMutationGrace(domain: string) {
  _mutationGraceMap.delete(domain);
}

function patchApplicationStatusInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  domain: string,
  status: string,
) {
  queryClient.setQueryData(runtimeKeys.application(domain), (current: any) =>
    current ? { ...current, status } : current,
  );

  queryClient.setQueryData(runtimeKeys.applications(), (current: any) => {
    if (!Array.isArray(current)) return current;
    return current.map((app: any) => {
      const appDomain = app.domain ?? app.name ?? '';
      return appDomain === domain ? { ...app, status } : app;
    });
  });
}

export function useApplications() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const addNotification = useNotificationStore((s) => s.addNotification);
  const hasActiveTransitions = useRuntimeTransitionStore((s) => Object.keys(s.transitions).length > 0);

  return useQuery({
    queryKey: runtimeKeys.applications(),
    queryFn: () => runtimeService.getApplications(),
    enabled: isAuthenticated,
    refetchInterval: hasActiveTransitions ? 5_000 : 30_000,
    select: (data) => {
      if (Array.isArray(data)) {
        const now = Date.now();
        const transitionStore = useRuntimeTransitionStore.getState();

        for (const app of data) {
          const appName = app.domain ?? app.name ?? '';
          const newStatus = app.status ?? '';
          const oldStatus = _previousStatusMap.get(appName);

          if (oldStatus && oldStatus !== newStatus) {
            const isNonFinal = NON_FINAL_STATUSES.has(newStatus);

            if (!isNonFinal) {
              const withinMutationGrace = isWithinMutationGrace(appName);
              clearMutationGrace(appName);
              transitionStore.clearTransition(appName);

              // Cooldown: suppress rapid duplicate notifications (STOPPED -> UNDEPLOYED)
              const lastNotifiedTime = _lastNotifiedMap.get(appName) ?? 0;
              const withinCooldown = (now - lastNotifiedTime) < NOTIFICATION_COOLDOWN_MS;

              if (!withinMutationGrace && !withinCooldown) {
                const statusMsg = FINAL_STATUS_MESSAGES[newStatus];
                const title = statusMsg?.title ?? `Application ${newStatus}`;

                addNotification({
                  type: 'deployment',
                  action: 'status_change',
                  title,
                  body: `${appName} — ${title.toLowerCase()}`,
                  applicationName: appName,
                  domain: appName,
                });

                scheduleLocalNotification(title, `${appName} — ${title.toLowerCase()}`);
                _lastNotifiedMap.set(appName, now);
              }
            } else {
              _lastNotifiedMap.delete(appName);
            }
          }

          _previousStatusMap.set(appName, newStatus);
        }
      }
      return data;
    },
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
  const hasActiveTransition = useRuntimeTransitionStore((s) => !!s.transitions[domain]);
  return useQuery({
    queryKey: runtimeKeys.application(domain),
    queryFn: () => runtimeService.getApplication(domain),
    enabled: !!domain,
    refetchInterval: options?.refetchInterval ?? (hasActiveTransition ? 5_000 : false),
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

/**
 * Fetch dashboard statistics for a single application (CPU, memory, threads, message count).
 * Uses the full discovery pipeline: dashboardStats -> monitoring API -> InfluxDB proxy.
 */
export function useDashboardStats(domain: string, periodMinutes: number = 60) {
  return useQuery({
    queryKey: [...runtimeKeys.all(), 'dashboardStats', domain, periodMinutes],
    queryFn: () => runtimeService.getDashboardStats(domain, periodMinutes),
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
// Each mutation:
// 1. Sets a "grace period" so the polling notification is delayed by 5s
// 2. Fires the initial "Starting/Stopping/Restarting" notification
// 3. The polling in useApplications() picks up the FINAL state later
//    and sends "Application Deployed" / "Application Stopped" (with cooldown)

export function useStartApp() {
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const setTransition = useRuntimeTransitionStore((s) => s.setTransition);
  const clearTransition = useRuntimeTransitionStore((s) => s.clearTransition);
  return useMutation({
    mutationFn: runtimeService.startApp,
    onSuccess: (data, domain) => {
      // Set grace period BEFORE invalidating queries — ensures polling
      // won't fire "Application Deployed" before "Application Starting"
      setMutationGrace(domain);
      setTransition(domain, 'starting');
      patchApplicationStatusInCache(queryClient, domain, 'STARTING');
      if (data) {
        queryClient.setQueryData(runtimeKeys.application(domain), data);
      }
      queryClient.invalidateQueries({ queryKey: runtimeKeys.applications() });
      addNotification({
        type: 'lifecycle',
        action: 'start',
        title: 'Application Starting',
        body: `${domain} is being started`,
        applicationName: domain,
        domain,
      });
      scheduleLocalNotification('Application Starting', `${domain} is being started`);
    },
    onError: (error: any, domain: string) => {
      clearTransition(domain);
      addNotification({
        type: 'lifecycle',
        action: 'start',
        title: 'Start Failed',
        body: `Failed to start ${domain}: ${(error as Error)?.message ?? 'Unknown error'}`,
        applicationName: domain,
        domain,
      });
    },
  });
}

export function useStopApp() {
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const setTransition = useRuntimeTransitionStore((s) => s.setTransition);
  const clearTransition = useRuntimeTransitionStore((s) => s.clearTransition);
  return useMutation({
    mutationFn: runtimeService.stopApp,
    onSuccess: (data, domain) => {
      setMutationGrace(domain);
      setTransition(domain, 'stopping');
      patchApplicationStatusInCache(queryClient, domain, 'STOPPING');
      if (data) {
        queryClient.setQueryData(runtimeKeys.application(domain), data);
      }
      queryClient.invalidateQueries({ queryKey: runtimeKeys.applications() });
      addNotification({
        type: 'lifecycle',
        action: 'stop',
        title: 'Application Stopping',
        body: `${domain} is being stopped`,
        applicationName: domain,
        domain,
      });
      scheduleLocalNotification('Application Stopping', `${domain} is being stopped`);
    },
    onError: (error: any, domain: string) => {
      clearTransition(domain);
      addNotification({
        type: 'lifecycle',
        action: 'stop',
        title: 'Stop Failed',
        body: `Failed to stop ${domain}: ${(error as Error)?.message ?? 'Unknown error'}`,
        applicationName: domain,
        domain,
      });
    },
  });
}

export function useRestartApp() {
  const queryClient = useQueryClient();
  const addNotification = useNotificationStore((s) => s.addNotification);
  const setTransition = useRuntimeTransitionStore((s) => s.setTransition);
  const clearTransition = useRuntimeTransitionStore((s) => s.clearTransition);
  return useMutation({
    mutationFn: runtimeService.restartApp,
    onSuccess: (data, domain) => {
      setMutationGrace(domain);
      setTransition(domain, 'restarting');
      patchApplicationStatusInCache(queryClient, domain, 'STARTING');
      if (data) {
        queryClient.setQueryData(runtimeKeys.application(domain), data);
      }
      queryClient.invalidateQueries({ queryKey: runtimeKeys.applications() });
      addNotification({
        type: 'lifecycle',
        action: 'restart',
        title: 'Application Restarting',
        body: `${domain} is being restarted`,
        applicationName: domain,
        domain,
      });
      scheduleLocalNotification('Application Restarting', `${domain} is being restarted`);
    },
    onError: (error: any, domain: string) => {
      clearTransition(domain);
      addNotification({
        type: 'lifecycle',
        action: 'restart',
        title: 'Restart Failed',
        body: `Failed to restart ${domain}: ${(error as Error)?.message ?? 'Unknown error'}`,
        applicationName: domain,
        domain,
      });
    },
  });
}
