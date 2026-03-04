// ============================================================
// Anypoint Mobile Platform - Runtime Manager Service
// Supports both CloudHub 1.0 and CloudHub 2.0 (AMC) APIs
// ============================================================

import api from './api';
import type {
  Application,
  AppLogEntry,
  DeploymentRequest,
  MetricSeries,
  PaginatedResponse,
} from '../types';

const CLOUDHUB_BASE = '/cloudhub/api/v2';
const CLOUDHUB_V1 = '/cloudhub/api';
const RUNTIME_BASE = '/armui/api/v1';
const AMC_BASE = '/amc/application-manager/api/v2';
const HYBRID_BASE = '/hybrid/api/v1';

// ---------- Helpers: read org/env from API headers ----------

function getOrgId(): string | undefined {
  return api.defaults.headers.common['X-ANYPNT-ORG-ID'] as string | undefined;
}

function getEnvId(): string | undefined {
  return api.defaults.headers.common['X-ANYPNT-ENV-ID'] as string | undefined;
}

/** Build the AMC base path for the current org/env (CloudHub 2.0) */
function amcDeploymentsPath(): string | null {
  const orgId = getOrgId();
  const envId = getEnvId();
  if (!orgId || !envId) return null;
  return `${AMC_BASE}/organizations/${orgId}/environments/${envId}/deployments`;
}

// ---------- CH2 Deployment → Application normalizer ----------

/** Format CH2 CPU/memory limits into a readable worker type name */
function formatCh2WorkerType(cpu: string, memory: string): string {
  if (!cpu && !memory) return 'worker';
  const parts: string[] = [];
  if (cpu) {
    // CH2 uses millicores like "1500m" = 1.5 vCores, or plain "1"
    if (cpu.endsWith('m')) {
      const cores = parseFloat(cpu) / 1000;
      parts.push(`${cores} vCores`);
    } else {
      parts.push(`${cpu} vCores`);
    }
  }
  if (memory) parts.push(memory);
  return parts.join(' / ') || 'worker';
}

/**
 * Normalize a CloudHub 2.0 deployment object into our Application interface
 * so the rest of the app can work with a unified shape.
 */
function normalizeDeployment(dep: any): Application {
  const app = dep?.application ?? {};
  const target = dep?.target ?? {};
  const ref = app?.ref ?? {};
  const replicasArr = dep?.replicas ?? [];

  // CH2 status mapping
  let status = app?.status ?? dep?.status ?? 'UNKNOWN';
  // Normalize CH2-specific statuses
  if (status === 'RUNNING') status = 'STARTED';
  else if (status === 'NOT_RUNNING' || status === 'UNDEPLOYED') status = 'STOPPED';
  else if (status === 'APPLYING' || status === 'DEPLOYING') status = 'DEPLOYING';
  else if (status === 'FAILED' || status === 'DEPLOYMENT_FAILED') status = 'DEPLOY_FAILED';

  // Runtime version — check multiple possible locations
  const runtimeVersion =
    target?.deploymentSettings?.runtimeVersion ??
    target?.deploymentSettings?.runtime?.version ??
    dep?.currentRuntimeVersion ??
    app?.configuration?.['mule.agent.application.properties.service']?.muleVersion ??
    app?.vcs?.tag ?? '';

  // Worker / replica info
  const cpuLimit = target?.deploymentSettings?.resources?.cpu?.limit ?? '';
  const memLimit = target?.deploymentSettings?.resources?.memory?.limit ?? '';
  const cpuReserved = target?.deploymentSettings?.resources?.cpu?.reserved ?? '';
  const memReserved = target?.deploymentSettings?.resources?.memory?.reserved ?? '';
  const replicaCount = typeof target?.replicas === 'number'
    ? target.replicas
    : (Array.isArray(replicasArr) && replicasArr.length > 0 ? replicasArr.length : 1);

  // Extract monitoring from replica statuses if available
  const firstReplica = Array.isArray(replicasArr) ? replicasArr[0] : null;
  const replicaState = firstReplica?.state ?? firstReplica?.status ?? '';

  return {
    id: dep.id ?? '',
    name: dep.name ?? ref.artifactId ?? '',
    domain: dep.name ?? dep.id ?? '',
    fullDomain: dep.name ?? '',
    status,
    deploymentTarget: 'cloudhub2',
    lastUpdateTime: dep.lastModifiedDate ?? dep.updatedDate ?? dep.createdDate ?? '',
    fileName: ref.artifactId ? `${ref.artifactId}-${ref.version}.jar` : '',
    muleVersion: runtimeVersion,
    region: target?.provider ?? target?.targetId ?? '',
    workers: {
      type: {
        name: formatCh2WorkerType(cpuLimit || cpuReserved, memLimit || memReserved),
        weight: 1,
        cpu: cpuLimit || cpuReserved,
        memory: memLimit || memReserved,
      },
      amount: replicaCount,
      remainingOrgWorkers: 0,
    },
    monitoring: {
      cpuUsage: 0,
      memoryUsage: 0,
      memoryTotal: 0,
      threadCount: 0,
    },
    properties: app?.configuration?.['mule.agent.application.properties.service']?.properties ?? {},
    persistentQueues: false,
    loggingEnabled: true,
    // Preserve the original CH2 object for lifecycle operations
    _ch2Deployment: dep,
  } as any;
}

// ---------- Applications ----------

/**
 * List all applications for the current environment.
 * Tries CloudHub 1.0 first, then falls back to CloudHub 2.0 (AMC API).
 */
export async function getApplications(params?: {
  environmentId?: string;
  offset?: number;
  limit?: number;
}): Promise<Application[]> {
  // --- Try CloudHub 1.0 first ---
  let ch1Apps: Application[] = [];
  try {
    const { data } = await api.get(`${CLOUDHUB_BASE}/applications`, { params });
    if (Array.isArray(data)) ch1Apps = data;
    else if (data && typeof data === 'object') {
      const d = data as any;
      ch1Apps = d.data ?? d.applications ?? d.items ?? [];
    }
  } catch (_) { /* CH1 not available */ }

  // --- Try CloudHub 2.0 (AMC Application Manager API) ---
  let ch2Apps: Application[] = [];
  const amcPath = amcDeploymentsPath();
  if (amcPath) {
    try {
      const { data } = await api.get(amcPath);
      const items = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);
      ch2Apps = items.map(normalizeDeployment);
    } catch (_) { /* CH2 not available */ }
  }

  // --- Try Hybrid API (Runtime Manager) ---
  if (ch1Apps.length === 0 && ch2Apps.length === 0) {
    try {
      const { data } = await api.get(`${HYBRID_BASE}/applications`);
      const items = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
      if (items.length > 0) return items;
    } catch (_) { /* not available */ }
  }

  // Merge both lists (deduplicate by domain/name)
  if (ch2Apps.length > 0 && ch1Apps.length > 0) {
    const ch1Domains = new Set(ch1Apps.map((a: any) => a.domain ?? a.name));
    for (const ch2App of ch2Apps) {
      if (!ch1Domains.has(ch2App.domain) && !ch1Domains.has(ch2App.name)) {
        ch1Apps.push(ch2App);
      }
    }
    return ch1Apps;
  }

  return ch1Apps.length > 0 ? ch1Apps : ch2Apps;
}

/**
 * Get details for a specific application by domain name.
 * Tries CloudHub 1.0 first, then CloudHub 2.0.
 */
export async function getApplication(domain: string): Promise<Application> {
  // Try CH1
  try {
    const { data } = await api.get<Application>(`${CLOUDHUB_BASE}/applications/${domain}`);
    return data;
  } catch (err: any) {
    if (err?.response?.status === 401) throw err;
  }

  // Try CH2 — search deployments by name
  const amcPath = amcDeploymentsPath();
  if (amcPath) {
    try {
      const { data } = await api.get(amcPath);
      const items = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);
      const match = items.find((d: any) => d.name === domain || d.id === domain);
      if (match) return normalizeDeployment(match);
    } catch (_) { /* not available */ }
  }

  // Final fallback — try CH1 v1
  const { data } = await api.get<Application>(`${CLOUDHUB_V1}/applications/${domain}`);
  return data;
}

// ---------- Application Lifecycle ----------

/**
 * Try multiple API call strategies sequentially.
 * Returns the first successful response data.
 * Only bails immediately on 401 (expired token). Everything else
 * (including 403) continues to the next attempt because different
 * endpoint paths may have different permissions.
 */
async function tryEndpoints<T>(
  attempts: Array<() => Promise<{ data: T }>>,
  errorLabel: string,
): Promise<T> {
  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const { data } = await attempt();
      return data;
    } catch (err: any) {
      const status = err?.response?.status;
      const msg = err?.response?.data?.message ?? err?.message ?? 'Unknown';
      errors.push(`${status ?? 'ERR'}: ${msg}`);
      // Only bail immediately on unauthenticated (token expired)
      if (status === 401) {
        throw err;
      }
      continue; // try the next endpoint
    }
  }
  throw new Error(`${errorLabel} failed — ${errors.join(' | ')}`);
}

/**
 * Start a stopped application.
 * Tries CH1 (POST /status, PUT), then CH2 (PATCH deployment).
 */
export async function startApp(domain: string): Promise<Application> {
  // Try CH1 endpoints first
  try {
    return await tryEndpoints<Application>(
      [
        () => api.post(`${CLOUDHUB_V1}/applications/${domain}/status`, { status: 'start' }),
        () => api.post(`${CLOUDHUB_BASE}/applications/${domain}/status`, { status: 'start' }),
        () => api.put(`${CLOUDHUB_BASE}/applications/${domain}`, { status: 'STARTED' }),
        () => api.put(`${CLOUDHUB_V1}/applications/${domain}`, { status: 'STARTED' }),
      ],
      'Start application (CH1)',
    );
  } catch (_) { /* try CH2 */ }

  // CH2 fallback: PATCH deployment
  const amcPath = amcDeploymentsPath();
  if (amcPath) {
    const { data: deps } = await api.get(amcPath);
    const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
    const match = items.find((d: any) => d.name === domain || d.id === domain);
    if (match) {
      const { data } = await api.patch(`${amcPath}/${match.id}`, {
        application: { desiredState: 'STARTED' },
      });
      return normalizeDeployment(data);
    }
  }
  throw new Error('Start application failed — no working endpoint found');
}

/**
 * Stop a running application.
 * The correct CloudHub endpoint is POST /cloudhub/api/applications/{domain}/status
 * with body { "status": "stop" }.
 * Falls back to PUT-based approaches if POST /status is not available.
 */
export async function stopApp(domain: string): Promise<Application> {
  const errors: string[] = [];

  // ---- Primary: POST /status endpoint (official CloudHub API) ----
  const statusEndpoints = [
    () => api.post(`${CLOUDHUB_V1}/applications/${domain}/status`, { status: 'stop' }),
    () => api.post(`${CLOUDHUB_BASE}/applications/${domain}/status`, { status: 'stop' }),
  ];

  for (const attempt of statusEndpoints) {
    try {
      const { data } = await attempt();
      // POST /status returns 200 on success — re-fetch the app to get current state
      if (data != null) {
        // Give the backend a moment then return the updated app
        try {
          const { data: updated } = await api.get(`${CLOUDHUB_BASE}/applications/${domain}`);
          return updated as Application;
        } catch (_) {
          return (typeof data === 'object' ? data : { domain, status: 'STOPPING' }) as Application;
        }
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) throw err;
      const msg = err?.response?.data?.message ?? err?.message ?? 'Unknown';
      errors.push(`POST /status ${status ?? 'ERR'}: ${msg}`);
    }
  }

  // ---- Fallback: PUT with full body ----
  let fullBody: Record<string, any> | null = null;
  try {
    const { data } = await api.get(`${CLOUDHUB_BASE}/applications/${domain}`);
    if (data && typeof data === 'object') {
      const body: Record<string, any> = { ...data, status: 'STOPPED' };
      for (const key of [
        'lastUpdateTime', 'workerStatuses', 'deploymentUpdateStatus',
        'lastReportedStatus', 'monitoringAutoRestart', 'serverGroupId',
        'serverArtifactId', 'lastSuccessfulUpdateTime', 'logLevels',
        'ipAddresses', 'previousPackageHash', 'deploymentGroup',
      ]) {
        delete body[key];
      }
      fullBody = body;
    }
  } catch (_) { /* proceed without full body */ }

  const putAttempts: Array<() => Promise<{ data: any }>> = [];
  if (fullBody) {
    putAttempts.push(() => api.put(`${CLOUDHUB_BASE}/applications/${domain}`, fullBody!));
  }
  putAttempts.push(
    () => api.put(`${CLOUDHUB_BASE}/applications/${domain}`, { status: 'STOPPED' }),
    () => api.put(`${CLOUDHUB_V1}/applications/${domain}`, { status: 'STOPPED' }),
    () => api.patch(`${CLOUDHUB_BASE}/applications/${domain}`, { status: 'STOPPED' }),
  );

  for (const attempt of putAttempts) {
    try {
      const { data } = await attempt();
      if (!data) continue;
      const returnedStatus = data?.status ?? '';
      if (returnedStatus === 'STARTED') {
        errors.push('PUT 200: status still STARTED');
        continue;
      }
      return data as Application;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) throw err;
      const msg = err?.response?.data?.message ?? err?.message ?? 'Unknown';
      errors.push(`PUT ${status ?? 'ERR'}: ${msg}`);
    }
  }

  // ---- CH2 fallback: PATCH deployment to stop ----
  const amcPath = amcDeploymentsPath();
  if (amcPath) {
    try {
      // Find the deployment first
      const { data: deps } = await api.get(amcPath);
      const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
      const match = items.find((d: any) => d.name === domain || d.id === domain);
      if (match) {
        const depId = match.id;
        // PATCH to stop — set replicas to 0 or desiredState to STOPPED
        try {
          const { data } = await api.patch(`${amcPath}/${depId}`, {
            application: { desiredState: 'STOPPED' },
          });
          if (data) return normalizeDeployment(data);
        } catch (_) { /* try alternative body */ }
        try {
          const { data } = await api.patch(`${amcPath}/${depId}`, {
            target: { replicas: 0 },
          });
          if (data) return normalizeDeployment(data);
        } catch (e2: any) {
          errors.push(`CH2 PATCH: ${e2?.response?.data?.message ?? e2?.message ?? 'Unknown'}`);
        }
      }
    } catch (_) { /* CH2 not available */ }
  }

  throw new Error(`Stop application failed — ${errors.join(' | ')}`);
}

/**
 * Restart an application.
 * Tries CH1 (POST /status, PUT with updateStrategy), then CH2 (PATCH deployment).
 */
export async function restartApp(domain: string): Promise<Application> {
  // Try CH1 endpoints first
  try {
    return await tryEndpoints<Application>(
      [
        () => api.post(`${CLOUDHUB_V1}/applications/${domain}/status`, { status: 'restart' }),
        () => api.post(`${CLOUDHUB_BASE}/applications/${domain}/status`, { status: 'restart' }),
        () => api.put(`${CLOUDHUB_BASE}/applications/${domain}`, { status: 'STARTED', updateStrategy: 'restart' }),
        () => api.put(`${CLOUDHUB_V1}/applications/${domain}`, { status: 'STARTED', updateStrategy: 'restart' }),
      ],
      'Restart application (CH1)',
    );
  } catch (_) { /* try CH2 */ }

  // CH2 fallback: PATCH deployment to trigger restart
  const amcPath = amcDeploymentsPath();
  if (amcPath) {
    const { data: deps } = await api.get(amcPath);
    const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
    const match = items.find((d: any) => d.name === domain || d.id === domain);
    if (match) {
      // CH2 restart: set lastModifiedDate to trigger redeploy
      const { data } = await api.patch(`${amcPath}/${match.id}`, {
        application: { desiredState: 'STARTED' },
      });
      return normalizeDeployment(data);
    }
  }
  throw new Error('Restart application failed — no working endpoint found');
}

// ---------- Logs ----------

/**
 * Retrieve application log entries.
 * CloudHub API docs say:
 *   GET /cloudhub/api/applications/{domain}/log  — download log file
 *   GET /cloudhub/api/v2/applications/{domain}/instances/{instanceId}/log
 * Also tries POST /logs for structured search.
 */
export async function getAppLogs(
  domain: string,
  params?: {
    startDate?: string;
    endDate?: string;
    priority?: string;
    search?: string;
    limit?: number;
    offset?: number;
  },
): Promise<AppLogEntry[]> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const startMs = params?.startDate
    ? new Date(params.startDate).getTime()
    : oneDayAgo.getTime();
  const endMs = params?.endDate
    ? new Date(params.endDate).getTime()
    : now.getTime();

  const limit = params?.limit ?? 200;

  // GET query params — used by the official /log endpoint
  const getParams: Record<string, any> = {
    startDate: startMs,
    endDate: endMs,
    limit,
    descending: true,
  };
  if (params?.priority) getParams.priority = params.priority;
  if (params?.search) getParams.search = params.search;

  // POST body — used by the /logs search endpoint
  const postBody: Record<string, any> = {
    startDate: startMs,
    endDate: endMs,
    limit,
    descending: true,
    lowPriority: true,
  };
  if (params?.priority) postBody.priority = params.priority;
  if (params?.search) postBody.search = params.search;

  // First try to get instance IDs for instance-specific log download
  let instanceIds: string[] = [];
  try {
    const { data: instances } = await api.get(`${CLOUDHUB_BASE}/applications/${domain}/instances`);
    if (Array.isArray(instances)) {
      instanceIds = instances.map((i: any) => i.instanceId ?? i.id).filter(Boolean);
    }
  } catch (_) { /* no instances endpoint */ }

  const attempts: Array<() => Promise<any>> = [
    // 1) GET /log — official CloudHub v1 log download endpoint
    () => api.get(`${CLOUDHUB_V1}/applications/${domain}/log`, { params: getParams }),
    // 2) GET /log — v2 path
    () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/log`, { params: getParams }),
    // 3) GET /logs — v2 (some deployments use plural)
    () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/logs`, { params: getParams }),
    // 4) GET /logs — v1
    () => api.get(`${CLOUDHUB_V1}/applications/${domain}/logs`, { params: getParams }),
    // 5) POST /logs search — v2
    () => api.post(`${CLOUDHUB_BASE}/applications/${domain}/logs`, postBody),
    // 6) POST /logs search — v1
    () => api.post(`${CLOUDHUB_V1}/applications/${domain}/logs`, postBody),
  ];

  // Instance-specific log endpoints (if we found instances)
  for (const instanceId of instanceIds.slice(0, 2)) {
    attempts.push(
      () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/instances/${instanceId}/log`, { params: getParams }),
      () => api.get(`${CLOUDHUB_V1}/applications/${domain}/instances/${instanceId}/log`, { params: getParams }),
    );
  }

  // CloudHub 2.0 (AMC) log endpoints
  const amcPath = amcDeploymentsPath();
  if (amcPath) {
    attempts.push(
      // CH2 deployment logs
      () => api.get(`${amcPath}/${domain}/logs`, { params: getParams }),
      // Try searching all deployments for a matching name
      async () => {
        const { data: deps } = await api.get(amcPath!);
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => d.name === domain || d.id === domain);
        if (!match) throw new Error('No CH2 deployment found');
        return api.get(`${amcPath}/${match.id}/logs`, { params: getParams });
      },
    );
  }

  // Anypoint Monitoring log search (works for both CH1 and CH2)
  const orgId = getOrgId();
  const envId = getEnvId();
  if (orgId && envId) {
    attempts.push(
      // Elasticsearch-like query format (Anypoint Monitoring Log Search API)
      () => api.post(`/monitoring/log/api/v1/organizations/${orgId}/environments/${envId}/search`, {
        query: {
          query_string: {
            query: `applicationName:"${domain}"`,
          },
        },
        from: 0,
        size: limit,
        sort: [{ timestamp: { order: 'desc' } }],
      }),
      // Alternative: simpler query format (some versions support this)
      () => api.post(`/monitoring/log/api/v1/organizations/${orgId}/environments/${envId}/search`, {
        query: domain,
        from: startMs,
        to: endMs,
        limit,
      }),
      // ARM log endpoint
      () => api.get(`${RUNTIME_BASE}/applications/${domain}/logs`, { params: getParams }),
    );
  }

  for (const attempt of attempts) {
    try {
      const { data } = await attempt();
      const entries = extractLogEntries(data);
      if (entries.length > 0) return entries;
    } catch (_) {
      // try next endpoint
    }
  }

  return [];
}

/** Extract log entries from various CloudHub response shapes. */
function extractLogEntries(data: any): AppLogEntry[] {
  if (Array.isArray(data)) return data;

  // Handle plain text log responses (GET /log returns raw text)
  if (typeof data === 'string' && data.trim().length > 0) {
    const lines = data.split('\n').filter((l: string) => l.trim());
    if (lines.length > 0) {
      return lines.map((line: string, idx: number) => {
        // Try to parse structured log lines: [timestamp] PRIORITY message
        const match = line.match(/^\[?(\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}[^\]]*)\]?\s*(ERROR|WARN|INFO|DEBUG|TRACE|FATAL|SYSTEM)?\s*(.*)/i);
        if (match) {
          return {
            timestamp: match[1],
            priority: (match[2] ?? 'INFO').toUpperCase(),
            message: match[3] ?? line,
          } as AppLogEntry;
        }
        return {
          timestamp: new Date().toISOString(),
          priority: 'INFO',
          message: line,
        } as AppLogEntry;
      });
    }
  }

  if (data && typeof data === 'object') {
    // Try all known response wrapper fields
    const candidates = [
      data.data, data.logs, data.items, data.entries,
      data.records, data.results, data.logEntries,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length > 0) return candidate;
    }
    // If the response has a total/count field, look for any array value
    if (data.total !== undefined || data.count !== undefined) {
      for (const val of Object.values(data)) {
        if (Array.isArray(val) && val.length > 0) return val as AppLogEntry[];
      }
    }
  }
  return [];
}

// ---------- Schedulers ----------

export interface Schedule {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
  flowName: string;
  cronExpression?: string;
  frequency?: string;
  timeUnit?: string;
  startDelay?: string;
  lastRun?: string;
  nextRun?: string;
}

/**
 * List all schedulers for an application.
 * Tries v2 first, then falls back to v1 path.
 */
export async function getSchedulers(domain: string): Promise<Schedule[]> {
  const extractSchedules = (data: any): Schedule[] => {
    if (Array.isArray(data)) return data;
    if (data && typeof data === 'object') {
      const d = data as any;
      return d.data ?? d.schedules ?? d.items ?? [];
    }
    return [];
  };

  try {
    const { data } = await api.get(
      `${CLOUDHUB_BASE}/applications/${domain}/schedules`,
    );
    return extractSchedules(data);
  } catch (err: any) {
    if (err?.response?.status === 404) {
      try {
        const { data } = await api.get(
          `/cloudhub/api/applications/${domain}/schedules`,
        );
        return extractSchedules(data);
      } catch (v1Err: any) {
        if (v1Err?.response?.status === 404) {
          return [];
        }
        throw v1Err;
      }
    }
    throw err;
  }
}

/**
 * Enable or disable a scheduler. Tries v2, falls back to v1.
 */
export async function updateScheduler(
  domain: string,
  scheduleId: string,
  enabled: boolean,
): Promise<void> {
  try {
    await api.put(
      `${CLOUDHUB_BASE}/applications/${domain}/schedules/${scheduleId}`,
      { enabled },
    );
  } catch (err: any) {
    if (err?.response?.status === 404) {
      await api.put(
        `/cloudhub/api/applications/${domain}/schedules/${scheduleId}`,
        { enabled },
      );
      return;
    }
    throw err;
  }
}

/**
 * Run a scheduler immediately. Tries v2, falls back to v1.
 */
export async function runScheduler(
  domain: string,
  scheduleId: string,
): Promise<void> {
  try {
    await api.post(
      `${CLOUDHUB_BASE}/applications/${domain}/schedules/${scheduleId}/run`,
    );
  } catch (err: any) {
    if (err?.response?.status === 404) {
      await api.post(
        `/cloudhub/api/applications/${domain}/schedules/${scheduleId}/run`,
      );
      return;
    }
    throw err;
  }
}

// ---------- Deployment ----------

export async function deployApplication(
  request: DeploymentRequest,
): Promise<Application> {
  const { data } = await api.post<Application>(
    `${CLOUDHUB_BASE}/applications`,
    request,
  );
  return data;
}

export async function deleteApplication(domain: string): Promise<void> {
  await api.delete(`${CLOUDHUB_BASE}/applications/${domain}`);
}

// ---------- Workers ----------

export async function scaleWorkers(
  domain: string,
  workers: { amount: number; typeId?: string },
): Promise<Application> {
  const { data } = await api.put<Application>(
    `${CLOUDHUB_BASE}/applications/${domain}`,
    { workers },
  );
  return data;
}

// ---------- Metrics / Dashboard Stats ----------

/**
 * Retrieve application dashboard statistics (CPU, memory, threads, etc.).
 * Tries CloudHub dashboardStats, worker statistics, Anypoint Monitoring archive,
 * and the Observability Metrics API (/observability/api/v1/metrics:search).
 */
export async function getDashboardStats(
  domain: string,
  periodMinutes: number = 60,
  context?: { organizationId?: string; environmentId?: string },
): Promise<any> {
  const now = Date.now();
  const startMs = now - periodMinutes * 60 * 1000;

  const attempts: Array<() => Promise<any>> = [
    // CloudHub v2 dashboardStats (most common)
    () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/dashboardStats`, {
      params: { startDate: startMs, endDate: now },
    }),
    // CloudHub v1 dashboardStats
    () => api.get(`${CLOUDHUB_V1}/applications/${domain}/dashboardStats`, {
      params: { startDate: startMs, endDate: now },
    }),
    // CloudHub v2 statistics
    () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/statistics`, {
      params: { startDate: startMs, endDate: now },
    }),
    // CloudHub v1 statistics
    () => api.get(`${CLOUDHUB_V1}/applications/${domain}/statistics`, {
      params: { startDate: startMs, endDate: now },
    }),
  ];

  // Anypoint Monitoring / Observability APIs (require orgId and envId)
  if (context?.organizationId && context?.environmentId) {
    const orgId = context.organizationId;
    const envId = context.environmentId;
    const fromIso = new Date(startMs).toISOString();
    const toIso = new Date(now).toISOString();

    attempts.push(
      // Anypoint Monitoring archive query
      () => api.post(`/monitoring/archive/api/v1/organizations/${orgId}/environments/${envId}/query`, {
        targets: [
          { target: 'worker-cpu-usage', type: 'timeserie' },
          { target: 'worker-memory-usage', type: 'timeserie' },
          { target: 'worker-thread-count', type: 'timeserie' },
        ],
        range: { from: fromIso, to: toIso },
        app: domain,
      }),
      // Observability Metrics API — AMQL query for CPU
      () => api.post('/observability/api/v1/metrics:search', {
        query: `SELECT avg(cpuUsage), avg(memoryUsage), avg(threadCount) FROM mulesoft.cloudhub.worker WHERE timestamp BETWEEN '${fromIso}' AND '${toIso}' AND applicationName = '${domain}' AND organizationId = '${orgId}' AND environmentId = '${envId}'`,
      }),
      // Alternative Observability query format
      () => api.post('/observability/api/v1/metrics:search', {
        query: `SELECT avg(cpuPercentageUsed), avg(memoryPercentageUsed), avg(threadCount) FROM mulesoft.app.request WHERE timestamp BETWEEN '${fromIso}' AND '${toIso}' AND applicationName = '${domain}'`,
      }),
      // Monitoring metrics endpoint
      () => api.get(`/monitoring/api/v1/organizations/${orgId}/environments/${envId}/applications/${domain}/metrics`, {
        params: { from: startMs, to: now },
      }),
    );

    // CloudHub 2.0 deployment metrics (AMC API)
    const amcPath = amcDeploymentsPath();
    if (amcPath) {
      attempts.push(
        // CH2 deployment statistics
        async () => {
          const { data: deps } = await api.get(amcPath!);
          const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
          const match = items.find((d: any) => d.name === domain || d.id === domain);
          if (!match) throw new Error('No CH2 deployment');
          // The deployment itself may contain monitoring/metrics data
          const detail = await api.get(`${amcPath}/${match.id}`);
          return detail;
        },
      );
    }
  }

  for (const attempt of attempts) {
    try {
      const { data } = await attempt();
      if (data) return data;
    } catch (_) {
      // try next
    }
  }
  return null;
}

/**
 * Retrieve application metrics (CPU, memory, etc.).
 */
export async function getAppMetrics(
  domain: string,
  params: {
    metricName: string;
    startDate: string;
    endDate: string;
    interval?: string;
  },
): Promise<any> {
  const startMs = new Date(params.startDate).getTime();
  const endMs = new Date(params.endDate).getTime();

  try {
    const { data } = await api.get(
      `${CLOUDHUB_BASE}/applications/${domain}/dashboardStats`,
      {
        params: {
          startDate: startMs,
          endDate: endMs,
          interval: params.interval,
        },
      },
    );
    return data;
  } catch (err: any) {
    if (err?.response?.status === 404) {
      return null;
    }
    throw err;
  }
}

// ---------- Properties ----------

export async function updateProperties(
  domain: string,
  properties: Record<string, string>,
): Promise<Application> {
  return tryEndpoints<Application>(
    [
      () => api.put(`${CLOUDHUB_BASE}/applications/${domain}`, { properties }),
      () => api.put(`${CLOUDHUB_V1}/applications/${domain}`, { properties }),
    ],
    'Update properties',
  );
}
