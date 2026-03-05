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
  const errors: string[] = [];

  // --- Try CloudHub 1.0 first ---
  let ch1Apps: Application[] = [];
  try {
    const { data } = await api.get(`${CLOUDHUB_BASE}/applications`, { params });
    if (Array.isArray(data)) ch1Apps = data;
    else if (data && typeof data === 'object') {
      const d = data as any;
      ch1Apps = d.data ?? d.applications ?? d.items ?? [];
    }
  } catch (err: any) {
    errors.push(`CH1: ${err?.response?.status ?? 'ERR'} ${err?.response?.data?.message ?? err?.message ?? ''}`);
  }

  // --- Try CloudHub 2.0 (AMC Application Manager API) ---
  let ch2Apps: Application[] = [];
  const amcPath = amcDeploymentsPath();
  if (amcPath) {
    try {
      const { data } = await api.get(amcPath);
      const items = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);
      ch2Apps = items.map(normalizeDeployment);
    } catch (err: any) {
      errors.push(`CH2: ${err?.response?.status ?? 'ERR'} ${err?.response?.data?.message ?? err?.message ?? ''}`);
    }
  }

  // --- Try Hybrid API (Runtime Manager) ---
  if (ch1Apps.length === 0 && ch2Apps.length === 0) {
    try {
      const { data } = await api.get(`${HYBRID_BASE}/applications`);
      const items = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
      if (items.length > 0) return items;
    } catch (err: any) {
      errors.push(`Hybrid: ${err?.response?.status ?? 'ERR'}`);
    }
  }

  // If ALL endpoints failed, throw a descriptive error so the UI can show it
  // instead of silently showing "No applications found"
  if (ch1Apps.length === 0 && ch2Apps.length === 0 && errors.length > 0) {
    const orgId = getOrgId();
    const envId = getEnvId();
    const hasToken = !!(api.defaults.headers.common['Authorization']);
    const debugInfo = [
      `Token: ${hasToken ? 'present' : 'MISSING'}`,
      `OrgID: ${orgId ?? 'MISSING'}`,
      `EnvID: ${envId ?? 'MISSING'}`,
      `BaseURL: ${api.defaults.baseURL ?? 'NOT SET'}`,
    ].join(', ');
    const errMsg = `${errors.join(' | ')}\n[Debug: ${debugInfo}]`;
    console.error('[getApplications] All endpoints failed:', errMsg);
    throw new Error(errMsg);
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
 * Module-level flag: skip log endpoints known to 404.
 * Prevents spamming API calls that always fail.
 */
let _logEndpointsAvailable = true;
let _logEndpointsChecked = false;

/**
 * Cache the working log strategy so subsequent polls skip straight to it.
 * 'post-no-deplid' = POST without deploymentId (the one that works on EU1)
 * 'post-with-deplid' = POST with deploymentId
 * null = not yet determined, try all endpoints
 */
let _workingLogStrategy: string | null = null;

/**
 * Cache whether /instances endpoint is available.
 * Once it 404s, we never try again — saves 2 x 404 per poll cycle.
 */
let _instancesEndpointAvailable = true;

/**
 * Check if log endpoints are known to be unavailable.
 * When true, the UI should disable live polling to avoid spamming
 * failing API calls every 5 seconds.
 */
export function areLogEndpointsAvailable(): boolean {
  return _logEndpointsAvailable || !_logEndpointsChecked;
}

/**
 * Retrieve application log entries.
 *
 * Tries multiple CloudHub / Anypoint Monitoring endpoints because the available
 * API varies by region, deployment target (CH1/CH2), and subscription level.
 *
 * IMPORTANT: On EU1 CloudHub 1.0:
 * - GET /logs returns 405 (Method Not Allowed) → we try POST instead
 * - Most /instances endpoints return 404
 * - Monitoring log search endpoints require Titanium subscription
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

  // POST body — used by the CloudHub /logs POST endpoint.
  //
  // The server told us the EXACT 14 valid fields via a 400 error:
  //   "deploymentId", "priority", "tenantId", "endTime", "text",
  //   "startTime", "instanceId", "threadName", "descending",
  //   "loggerName", "lowerId", "upperId", "limitMsgLen", "limit"
  //
  // NOTE: "lowPriority" and "search" are NOT valid and cause 400.
  //       The text search field is "text", not "search".
  const postBody: Record<string, any> = {
    deploymentId: domain,
    startTime: startMs,
    endTime: endMs,
    limit,
    descending: true,
  };
  if (params?.priority) postBody.priority = params.priority;
  if (params?.search) postBody.text = params.search; // field is "text", NOT "search"

  // GET query params — used by some older /log endpoints
  const getParams: Record<string, any> = {
    startDate: startMs,
    endDate: endMs,
    limit,
    descending: true,
  };
  if (params?.priority) getParams.priority = params.priority;
  if (params?.search) getParams.search = params.search;

  const orgId = getOrgId();
  const envId = getEnvId();

  // If we already know ALL log endpoints fail, skip the expensive enumeration
  if (!_logEndpointsAvailable && _logEndpointsChecked) {
    return [];
  }

  // POST body WITHOUT deploymentId — the domain is already in the URL path.
  // Including a deploymentId that doesn't match the actual internal deployment ID
  // can cause the server to return 200 OK with zero results (no error, just empty).
  const postBodyNoDeplId: Record<string, any> = {
    startTime: startMs,
    endTime: endMs,
    limit,
    descending: true,
  };
  if (params?.priority) postBodyNoDeplId.priority = params.priority;
  if (params?.search) postBodyNoDeplId.text = params.search;

  // ── FAST PATH: if we already know which strategy works, use it directly ──
  // This eliminates ALL the /instances 404 spam and unnecessary fallback attempts.
  if (_workingLogStrategy) {
    try {
      const { data } = await _getLogsByStrategy(_workingLogStrategy, domain, postBodyNoDeplId, postBody, getParams, orgId, envId);
      const entries = extractLogEntries(data);
      if (entries.length > 0) return entries;
    } catch (_) {
      // Working strategy failed (maybe different app) — fall through to full scan
      _workingLogStrategy = null;
    }
  }

  // ── Named strategies for the attempt loop ──
  const strategies: Array<{ name: string; fn: () => Promise<any> }> = [];

  // ---------------------------------------------------------------
  // 1) POST /logs — this is the CORRECT method for CloudHub log search
  // ---------------------------------------------------------------
  strategies.push(
    { name: 'post-v2-no-deplid', fn: () => api.post(`${CLOUDHUB_BASE}/applications/${domain}/logs`, postBodyNoDeplId) },
    { name: 'post-v2-with-deplid', fn: () => api.post(`${CLOUDHUB_BASE}/applications/${domain}/logs`, postBody) },
    { name: 'post-v1-no-deplid', fn: () => api.post(`${CLOUDHUB_V1}/applications/${domain}/logs`, postBodyNoDeplId) },
    { name: 'post-v1-with-deplid', fn: () => api.post(`${CLOUDHUB_V1}/applications/${domain}/logs`, postBody) },
  );

  // ---------------------------------------------------------------
  // 2) Deployment-based GET /logs (real browser flow)
  //    The Anypoint web UI fetches logs via:
  //      GET .../applications/{domain}/deployments?orderByDate=DESC&loggingVersion=VERSION_2
  //      GET .../applications/{domain}/deployments/{deploymentId}/logs?tail=true&limitMsgLen=5000
  //    The deployment ID (e.g. "69959c9d64b87b16e38cdb96") is NOT the domain name.
  // ---------------------------------------------------------------
  strategies.push(
    { name: 'ch1-deploy-lookup', fn: async () => {
      // Step 1: Get the real deployment ID
      const { data: deploymentsData } = await api.get(
        `${CLOUDHUB_BASE}/applications/${domain}/deployments`,
        { params: { orderByDate: 'DESC', loggingVersion: 'VERSION_2' } },
      );
      const deployments = Array.isArray(deploymentsData)
        ? deploymentsData
        : (deploymentsData?.data ?? deploymentsData?.items ?? []);
      if (deployments.length === 0) throw new Error('No deployments found');

      const deploymentId = deployments[0]?.deploymentId ?? deployments[0]?.id ?? deployments[0]?._id;
      if (!deploymentId) throw new Error('No deploymentId in deployments response');

      // Cache for fast path
      _cachedCh1DeploymentId = deploymentId;
      _cachedCh1Domain = domain;
      console.log(`[getAppLogs] CH1 deployment discovered: ${deploymentId}`);

      // Step 2: Get logs using the real deployment ID
      return api.get(
        `${CLOUDHUB_BASE}/applications/${domain}/deployments/${deploymentId}/logs`,
        { params: { tail: true, limitMsgLen: 5000 } },
      );
    }},
    // Fallback: try with domain as deployment ID (older API pattern)
    { name: 'get-deploy-v2', fn: () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/deployments/${domain}/logs`, { params: getParams }) },
    { name: 'get-deploy-v1', fn: () => api.get(`${CLOUDHUB_V1}/applications/${domain}/deployments/${domain}/logs`, { params: getParams }) },
  );

  // ---------------------------------------------------------------
  // 3) Instance-specific endpoints (only if /instances hasn't failed before)
  // ---------------------------------------------------------------
  if (_instancesEndpointAvailable) {
    let instanceIds: string[] = [];
    try {
      const { data: instances } = await api.get(`${CLOUDHUB_BASE}/applications/${domain}/instances`);
      if (Array.isArray(instances)) {
        instanceIds = instances.map((i: any) => i.instanceId ?? i.id).filter(Boolean);
      }
    } catch (_) { /* no instances endpoint */ }

    if (instanceIds.length === 0) {
      try {
        const { data: instances } = await api.get(`${CLOUDHUB_V1}/applications/${domain}/instances`);
        if (Array.isArray(instances)) {
          instanceIds = instances.map((i: any) => i.instanceId ?? i.id).filter(Boolean);
        }
      } catch (_) { /* not available */ }
    }

    // If both /instances calls returned nothing, cache the failure
    if (instanceIds.length === 0) {
      _instancesEndpointAvailable = false;
      console.log('[getAppLogs] /instances endpoints returned nothing — skipping for session');
    }

    for (const instanceId of instanceIds.slice(0, 2)) {
      strategies.push(
        { name: `get-instance-logfile-v2-${instanceId}`, fn: () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/instances/${instanceId}/log-file`, {
          params: { startDate: startMs, endDate: endMs },
          transformResponse: [(data: any) => data],
        })},
        { name: `get-instance-logfile-v1-${instanceId}`, fn: () => api.get(`${CLOUDHUB_V1}/applications/${domain}/instances/${instanceId}/log-file`, {
          params: { startDate: startMs, endDate: endMs },
          transformResponse: [(data: any) => data],
        })},
        { name: `get-instance-log-v2-${instanceId}`, fn: () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/instances/${instanceId}/log`, { params: getParams }) },
      );
    }
  }

  // ---------------------------------------------------------------
  // 4) Application-level log endpoints (CH1 fallbacks)
  // ---------------------------------------------------------------
  strategies.push(
    { name: 'get-logfile-v1', fn: () => api.get(`${CLOUDHUB_V1}/applications/${domain}/log-file`, {
      params: { startDate: startMs, endDate: endMs },
      transformResponse: [(data: any) => data],
    })},
    { name: 'get-log-v1', fn: () => api.get(`${CLOUDHUB_V1}/applications/${domain}/log`, { params: getParams }) },
    { name: 'get-log-v2', fn: () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/log`, { params: getParams }) },
  );

  // ---------------------------------------------------------------
  // 5) Anypoint Monitoring / Observability log search (CH1 + CH2)
  // ---------------------------------------------------------------
  if (orgId && envId && monitoringApiAvailable) {
    strategies.push(
      { name: 'monitoring-query', fn: () => api.post(`/monitoring/query/api/v2/organizations/${orgId}/environments/${envId}/logs`, {
        query: `*${domain}*`,
        from: new Date(startMs).toISOString(),
        to: new Date(endMs).toISOString(),
        limit,
        ascending: false,
      })},
      { name: 'monitoring-es', fn: () => api.post(`/monitoring/log/api/v1/organizations/${orgId}/environments/${envId}/search`, {
        query: { query_string: { query: `applicationName:"${domain}"` } },
        from: 0,
        size: limit,
        sort: [{ timestamp: { order: 'desc' } }],
      })},
    );
  }

  // ---------------------------------------------------------------
  // 6) CloudHub 2.0 (AMC) deployment log endpoints
  // ---------------------------------------------------------------
  const amcPath = amcDeploymentsPath();
  if (amcPath) {
    strategies.push(
      { name: 'amc-direct', fn: () => api.get(`${amcPath}/${domain}/logs`, { params: getParams }) },
      { name: 'amc-lookup', fn: async () => {
        const { data: deps } = await api.get(amcPath!);
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => d.name === domain || d.id === domain);
        if (!match) throw new Error('No CH2 deployment found');
        return api.get(`${amcPath}/${match.id}/logs`, { params: getParams });
      }},
    );

    // ── AMC specs-based logs (the REAL CH2/AMC log endpoint) ──
    // The actual Anypoint web UI fetches logs via:
    //   GET .../deployments/{deploymentId}/specs?limit=1000  → get specId
    //   GET .../deployments/{deploymentId}/specs/{specId}/logs?descending=true
    strategies.push(
      { name: 'amc-specs-logs', fn: async () => {
        // Step 1: Find the deployment
        const { data: deps } = await api.get(amcPath!);
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => d.name === domain || d.id === domain);
        if (!match) throw new Error('No CH2 deployment found');
        const deploymentId = match.id;

        // Step 2: Get specs for this deployment
        const { data: specsData } = await api.get(
          `${amcPath}/${deploymentId}/specs`,
          { params: { limit: 1000 } },
        );
        const specs = Array.isArray(specsData)
          ? specsData
          : (specsData?.items ?? specsData?.data ?? specsData?.specs ?? []);
        if (specs.length === 0) throw new Error('No specs found for deployment');

        // Use the first (most recent) spec
        const specId = specs[0]?.id ?? specs[0]?.specId;
        if (!specId) throw new Error('No specId found in specs response');

        // Cache for fast path on subsequent polls
        _cachedAmcDeploymentId = deploymentId;
        _cachedAmcSpecId = specId;
        _cachedAmcDomain = domain;

        console.log(`[getAppLogs] AMC specs discovered: deploymentId=${deploymentId}, specId=${specId}`);

        // Step 3: Get logs using specId
        return api.get(
          `${amcPath}/${deploymentId}/specs/${specId}/logs`,
          { params: { descending: true, limit } },
        );
      }},
    );
  }

  const logErrors: string[] = [];
  for (let i = 0; i < strategies.length; i++) {
    const { name, fn } = strategies[i];
    try {
      const { data } = await fn();
      const entries = extractLogEntries(data);
      if (entries.length > 0) {
        _logEndpointsAvailable = true;
        _logEndpointsChecked = true;
        _workingLogStrategy = name; // ← Cache this for next poll
        console.log(`[getAppLogs] ✅ Got ${entries.length} log entries via "${name}"`);
        return entries;
      }

      // Diagnostic: endpoint returned 200 but no entries extracted
      if (!_logEndpointsChecked) {
        const preview = typeof data === 'string'
          ? data.slice(0, 800)
          : JSON.stringify(data).slice(0, 800);
        console.log(`[getAppLogs] "${name}" returned 200 OK but extractLogEntries found nothing. Response:`, preview);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status) logErrors.push(String(status));
      if (status === 400 && !_logEndpointsChecked) {
        const respBody = err?.response?.data;
        const url = err?.config?.url ?? 'unknown';
        console.warn(`[getAppLogs] 400 from ${url}:`,
          typeof respBody === 'object' ? JSON.stringify(respBody).slice(0, 500) : String(respBody ?? '').slice(0, 500));
      }
    }
  }

  // Log summary (only once per session)
  if (!_logEndpointsChecked) {
    if (logErrors.length > 0) {
      console.warn(`[getAppLogs] All ${strategies.length} strategies failed for ${domain}. Statuses: ${logErrors.join(', ')}`);
    } else {
      console.warn(`[getAppLogs] All ${strategies.length} strategies returned empty results for ${domain}`);
    }
    const allPermanent = logErrors.length > 0 && logErrors.every((s) => s === '400' || s === '404' || s === '405');
    if (allPermanent) {
      _logEndpointsAvailable = false;
      console.log('[getAppLogs] All log endpoints return 400/404/405 — disabling live polling for session');
    }
    _logEndpointsChecked = true;
  }

  return [];
}

/**
 * Execute a specific log strategy by name (fast path for cached strategies).
 */
async function _getLogsByStrategy(
  strategy: string,
  domain: string,
  postBodyNoDeplId: Record<string, any>,
  postBody: Record<string, any>,
  getParams: Record<string, any>,
  orgId: string | undefined,
  envId: string | undefined,
): Promise<{ data: any }> {
  switch (strategy) {
    case 'post-v2-no-deplid':
      return api.post(`${CLOUDHUB_BASE}/applications/${domain}/logs`, postBodyNoDeplId);
    case 'post-v2-with-deplid':
      return api.post(`${CLOUDHUB_BASE}/applications/${domain}/logs`, postBody);
    case 'post-v1-no-deplid':
      return api.post(`${CLOUDHUB_V1}/applications/${domain}/logs`, postBodyNoDeplId);
    case 'post-v1-with-deplid':
      return api.post(`${CLOUDHUB_V1}/applications/${domain}/logs`, postBody);
    case 'ch1-deploy-lookup': {
      // Fast path: use cached CH1 deployment ID (skip the deployment lookup)
      if (!_cachedCh1DeploymentId || _cachedCh1Domain !== domain) {
        throw new Error('CH1 deployment not cached for this domain — need re-discovery');
      }
      return api.get(
        `${CLOUDHUB_BASE}/applications/${domain}/deployments/${_cachedCh1DeploymentId}/logs`,
        { params: { tail: true, limitMsgLen: 5000 } },
      );
    }
    case 'get-deploy-v2':
      return api.get(`${CLOUDHUB_BASE}/applications/${domain}/deployments/${domain}/logs`, { params: getParams });
    case 'get-deploy-v1':
      return api.get(`${CLOUDHUB_V1}/applications/${domain}/deployments/${domain}/logs`, { params: getParams });
    case 'get-logfile-v1':
      return api.get(`${CLOUDHUB_V1}/applications/${domain}/log-file`, {
        params: { startDate: getParams.startDate, endDate: getParams.endDate },
        transformResponse: [(data: any) => data],
      });
    case 'get-log-v1':
      return api.get(`${CLOUDHUB_V1}/applications/${domain}/log`, { params: getParams });
    case 'get-log-v2':
      return api.get(`${CLOUDHUB_BASE}/applications/${domain}/log`, { params: getParams });
    case 'amc-specs-logs': {
      // Fast path: use cached deployment/spec IDs (skip the 3-step lookup)
      if (!_cachedAmcDeploymentId || !_cachedAmcSpecId || _cachedAmcDomain !== domain) {
        throw new Error('AMC specs not cached for this domain — need re-discovery');
      }
      const amcP = amcDeploymentsPath();
      if (!amcP) throw new Error('No AMC path available');
      return api.get(
        `${amcP}/${_cachedAmcDeploymentId}/specs/${_cachedAmcSpecId}/logs`,
        { params: { descending: true, limit: getParams.limit ?? 200 } },
      );
    }
    default:
      // Instance-specific or monitoring strategies — just re-discover
      throw new Error(`Strategy "${strategy}" requires re-discovery`);
  }
}

/** Extract log entries from various CloudHub response shapes. */
function extractLogEntries(data: any): AppLogEntry[] {
  if (Array.isArray(data)) return normalizeLogArray(data);

  // Handle plain text log responses (GET /log-file returns raw text)
  if (typeof data === 'string' && data.trim().length > 0) {
    return parseRawLogText(data);
  }

  if (data && typeof data === 'object') {
    // Elasticsearch / Monitoring response: { hits: { hits: [ { _source: {...} } ] } }
    if (data.hits?.hits && Array.isArray(data.hits.hits)) {
      const entries = data.hits.hits.map((hit: any) => {
        const src = hit._source ?? hit;
        return {
          timestamp: src.timestamp ?? src['@timestamp'] ?? src.instant ?? '',
          priority: (src.priority ?? src.level ?? src.logLevel ?? 'INFO').toUpperCase(),
          message: src.message ?? src.msg ?? src.log ?? JSON.stringify(src),
          threadName: src.threadName ?? src.thread ?? '',
          loggerName: src.loggerName ?? src.logger ?? '',
        } as AppLogEntry;
      });
      if (entries.length > 0) return entries;
    }

    // Try all known response wrapper fields
    const candidates = [
      data.data, data.logs, data.items, data.entries,
      data.records, data.results, data.logEntries,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length > 0) {
        return normalizeLogArray(candidate);
      }
    }
    // If the response has a total/count field, look for any array value
    if (data.total !== undefined || data.count !== undefined) {
      for (const val of Object.values(data)) {
        if (Array.isArray(val) && val.length > 0) return normalizeLogArray(val as any[]);
      }
    }
  }
  return [];
}

/** Normalize an array of log objects (could be raw API shape or pre-formatted) */
function normalizeLogArray(arr: any[]): AppLogEntry[] {
  if (arr.length === 0) return [];

  const first = arr[0];

  // ── CH1 POST /logs response: entries have a nested `event` wrapper ──
  // Shape: { recordId, deploymentId, instanceId, line (number),
  //          event: { message, priority, timestamp, loggerName, threadName, instanceId } }
  if (first?.event?.message !== undefined || first?.event?.msg !== undefined) {
    return arr.map((e) => {
      const ev = e.event ?? {};
      return {
        timestamp: ev.timestamp ?? e.timestamp ?? e['@timestamp'] ?? '',
        priority: (ev.priority ?? ev.level ?? e.priority ?? 'INFO').toUpperCase(),
        message: ev.message ?? ev.msg ?? ev.log ?? JSON.stringify(ev),
        threadName: ev.threadName ?? ev.thread ?? '',
        loggerName: ev.loggerName ?? ev.logger ?? '',
        // Preserve extra fields for the detail sheet
        recordId: e.recordId ?? e.docId ?? '',
        deploymentId: e.deploymentId ?? '',
        instanceId: ev.instanceId ?? e.instanceId ?? '',
      } as AppLogEntry;
    });
  }

  // Check if already in our format (top-level message/msg)
  if (first?.message !== undefined || first?.msg !== undefined) {
    return arr.map((e) => ({
      timestamp: e.timestamp ?? e['@timestamp'] ?? e.instant ?? e.date ?? '',
      priority: (e.priority ?? e.level ?? e.logLevel ?? 'INFO').toUpperCase(),
      message: e.message ?? e.msg ?? e.log ?? JSON.stringify(e),
      threadName: e.threadName ?? e.thread ?? '',
      loggerName: e.loggerName ?? e.logger ?? '',
      recordId: e.recordId ?? e.docId ?? '',
      deploymentId: e.deploymentId ?? '',
      instanceId: e.instanceId ?? '',
    } as AppLogEntry));
  }

  // Fallback: if entries have `line` (number) with no message, still normalize
  // This covers edge cases where CH1 returns entries without event wrapper
  if (first?.line !== undefined && first?.recordId !== undefined) {
    return arr.map((e) => {
      const ev = e.event ?? {};
      return {
        timestamp: ev.timestamp ?? e.timestamp ?? '',
        priority: (ev.priority ?? e.priority ?? 'INFO').toUpperCase(),
        message: ev.message ?? ev.msg ?? (typeof e.line === 'string' ? e.line : JSON.stringify(e)),
        threadName: ev.threadName ?? '',
        loggerName: ev.loggerName ?? '',
        recordId: e.recordId ?? '',
        deploymentId: e.deploymentId ?? '',
        instanceId: e.instanceId ?? '',
      } as AppLogEntry;
    });
  }

  return arr;
}

/** Parse raw text log output (from GET /log-file or /log endpoints) */
function parseRawLogText(text: string): AppLogEntry[] {
  const lines = text.split('\n').filter((l: string) => l.trim());
  if (lines.length === 0) return [];

  const entries: AppLogEntry[] = [];
  let currentEntry: AppLogEntry | null = null;

  for (const line of lines) {
    // Match common Mule log patterns:
    // [2024-01-15 10:30:45.123] INFO  org.mule.runtime - message
    // 2024-01-15T10:30:45.123Z  INFO [thread-1] org.mule.runtime: message
    const match = line.match(
      /^\[?(\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}[^\]]*)\]?\s*(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL|SYSTEM)\s+(.*)/i,
    );
    if (match) {
      // Save previous entry
      if (currentEntry) entries.push(currentEntry);
      currentEntry = {
        timestamp: match[1].trim(),
        priority: match[2].toUpperCase().replace('WARNING', 'WARN'),
        message: match[3].trim(),
      } as AppLogEntry;
    } else if (currentEntry) {
      // Continuation of multi-line log (stack trace, etc.)
      currentEntry.message += '\n' + line;
    } else {
      // No pattern match and no current entry — standalone line
      entries.push({
        timestamp: new Date().toISOString(),
        priority: 'INFO',
        message: line,
      } as AppLogEntry);
    }
  }
  // Don't forget the last entry
  if (currentEntry) entries.push(currentEntry);

  return entries;
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
 * Module-level flags to remember which monitoring endpoints are unavailable.
 * Once an endpoint returns 404, we stop retrying it for the session.
 * This prevents spamming the console with 404s (common on EU1 CloudHub 1.0).
 */
let dashboardStatsAvailable = true; // /dashboardStats, /statistics
let monitoringApiAvailable = true;  // /monitoring/*, /observability/*
let _dashStatsCheckDone = false;

/**
 * Promise-based gate for the first stats/monitoring endpoint discovery.
 * When multiple getDashboardStats calls fire in parallel (via useQueries),
 * the first one checks all endpoints and resolves this promise. Subsequent
 * calls await it instead of making redundant 404 requests.
 *
 * The discovery covers BOTH dashboardStats AND monitoring endpoints so
 * all parallel callers wait for a single set of API calls.
 */
let _statsDiscoveryPromise: Promise<void> | null = null;

/**
 * ── InfluxDB Monitoring (Grafana-style datasource proxy) ──
 * The REAL Anypoint Monitoring endpoint uses an InfluxDB proxy:
 *   GET /monitoring/api/visualizer/api/datasources/proxy/{datasourceId}/query
 *     ?db=hybrid_metric_{region}&q=SELECT...&epoch=ms
 *
 * We discover the datasource ID once, then cache it for the session.
 */
let _influxDatasourceId: number | null = null;
let _influxDbName: string | null = null;
let _influxAvailable: boolean | null = null; // null = not checked yet

/**
 * ── AMC specs-based log retrieval cache ──
 * CH2/AMC logs require: deployments → specs (specId) → logs
 * We cache the deployment ID and spec ID per domain to avoid repeated lookups.
 */
let _cachedAmcDeploymentId: string | null = null;
let _cachedAmcSpecId: string | null = null;
let _cachedAmcDomain: string | null = null;

/**
 * ── CH1 deployment-based log retrieval cache ──
 * The browser UI fetches logs via:
 *   GET /cloudhub/api/v2/applications/{domain}/deployments?orderByDate=DESC&loggingVersion=VERSION_2
 *   GET /cloudhub/api/v2/applications/{domain}/deployments/{deploymentId}/logs?tail=true&limitMsgLen=5000
 * We cache the deployment ID per domain so subsequent polls skip the lookup.
 */
let _cachedCh1DeploymentId: string | null = null;
let _cachedCh1Domain: string | null = null;

/**
 * Check if monitoring endpoints are known to be unavailable.
 * Returns true when discovery is done AND both stats + monitoring APIs
 * AND InfluxDB proxy all failed.
 * The UI uses this to show a "monitoring requires subscription" banner.
 */
export function isMonitoringUnavailable(): boolean {
  return _dashStatsCheckDone && !dashboardStatsAvailable && !monitoringApiAvailable && _influxAvailable === false;
}

export function resetSessionFlags(): void {
  dashboardStatsAvailable = true;
  monitoringApiAvailable = true;
  _dashStatsCheckDone = false;
  _statsDiscoveryPromise = null;
  _logEndpointsAvailable = true;
  _logEndpointsChecked = false;
  _workingLogStrategy = null;
  _instancesEndpointAvailable = true;
  _influxDatasourceId = null;
  _influxDbName = null;
  _influxAvailable = null;
  _cachedAmcDeploymentId = null;
  _cachedAmcSpecId = null;
  _cachedAmcDomain = null;
  _cachedCh1DeploymentId = null;
  _cachedCh1Domain = null;
  console.log('[runtimeService] Session flags reset');
}

// ---------- InfluxDB Monitoring Helpers ----------

/**
 * Extract the region slug from the API base URL.
 * e.g. "https://eu1.anypoint.mulesoft.com" → "eu1"
 *      "https://anypoint.mulesoft.com" → "us" (default region has no prefix)
 */
function getRegionSlug(): string {
  const baseUrl = api.defaults.baseURL ?? '';
  const match = baseUrl.match(/https?:\/\/(\w+)\.anypoint\.mulesoft\.com/);
  if (match && match[1] !== 'anypoint') return match[1];
  return 'us';
}

/**
 * Discover the InfluxDB datasource for Anypoint Monitoring.
 * The Anypoint Monitoring visualizer uses a Grafana-style datasource proxy.
 * Returns true if an InfluxDB datasource was found.
 */
async function discoverInfluxDatasource(): Promise<boolean> {
  console.log('[Monitoring] discoverInfluxDatasource() called, current state:', _influxAvailable);
  if (_influxAvailable !== null) return _influxAvailable;

  try {
    const { data } = await api.get('/monitoring/api/visualizer/api/datasources');
    if (Array.isArray(data)) {
      // Find an InfluxDB datasource — prefer ones with 'hybrid_metric' in the DB name
      const influxDs = data.find((ds: any) =>
        (ds.type === 'influxdb' || ds.typeName === 'InfluxDB') &&
        (ds.database?.includes('hybrid_metric') || ds.jsonData?.database?.includes('hybrid_metric'))
      ) ?? data.find((ds: any) =>
        ds.type === 'influxdb' || ds.typeName === 'InfluxDB'
      );

      if (influxDs) {
        _influxDatasourceId = influxDs.id;
        _influxDbName = influxDs.database ?? influxDs.jsonData?.database ?? null;

        // If database name not found in datasource config, try to construct it
        if (!_influxDbName) {
          const region = getRegionSlug();
          _influxDbName = region === 'us' ? 'hybrid_metric' : `hybrid_metric_${region}`;
        }

        _influxAvailable = true;
        console.log(`[Monitoring] InfluxDB datasource found: id=${_influxDatasourceId}, db=${_influxDbName}`);
        return true;
      }
    }
  } catch (err: any) {
    console.log(`[Monitoring] Datasource discovery failed: ${err?.response?.status ?? err?.message}`);
  }

  // Fallback: try with a constructed database name and common datasource ID patterns
  const region = getRegionSlug();
  _influxDbName = region === 'us' ? 'hybrid_metric' : `hybrid_metric_${region}`;

  // Try a few common datasource IDs (these are assigned by the platform)
  for (const tryId of [7513, 1, 2, 3]) {
    try {
      console.log(`[Monitoring] Trying fallback datasource ID ${tryId} with db=${_influxDbName}`);
      const testQ = 'SHOW MEASUREMENTS LIMIT 1';
      const { data } = await api.get(
        `/monitoring/api/visualizer/api/datasources/proxy/${tryId}/query`,
        { params: { db: _influxDbName, q: testQ, epoch: 'ms' } },
      );
      if (data?.results) {
        _influxDatasourceId = tryId;
        _influxAvailable = true;
        console.log(`[Monitoring] InfluxDB found via fallback: id=${tryId}, db=${_influxDbName}`);
        return true;
      }
    } catch (_) {
      continue;
    }
  }

  _influxAvailable = false;
  console.log('[Monitoring] No InfluxDB datasource found');
  return false;
}

/**
 * Run an InfluxDB query via the Grafana proxy endpoint.
 */
async function queryInfluxDB(query: string): Promise<any> {
  if (!_influxDatasourceId || !_influxDbName) return null;

  const { data } = await api.get(
    `/monitoring/api/visualizer/api/datasources/proxy/${_influxDatasourceId}/query`,
    {
      params: {
        db: _influxDbName,
        q: query,
        epoch: 'ms',
      },
    },
  );

  return data;
}

/**
 * Parse an InfluxDB query response into a monitoring metrics format.
 * InfluxDB returns: { results: [{ series: [{ columns, values }] }] }
 */
function parseInfluxDBResults(data: any): {
  cpuPercent: number | null;
  memoryPercent: number | null;
  timeSeries: Array<{ timestamp: number; cpu: number | null; memory: number | null }>;
} | null {
  const results = data?.results;
  if (!Array.isArray(results)) return null;

  let cpuPercent: number | null = null;
  let memoryPercent: number | null = null;
  const timeSeriesMap = new Map<number, { cpu: number | null; memory: number | null }>();

  for (const result of results) {
    const seriesList = result?.series;
    if (!Array.isArray(seriesList)) continue;

    for (const s of seriesList) {
      const columns: string[] = s.columns ?? [];
      const values: any[][] = s.values ?? [];
      const name = (s.name ?? '').toLowerCase();

      // Determine what metric this series represents
      const isCpu = name.includes('cpu') || columns.some((c: string) => c.toLowerCase().includes('cpu'));
      const isMem = name.includes('memory') || name.includes('mem') || columns.some((c: string) => c.toLowerCase().includes('mem'));

      const timeIdx = columns.indexOf('time');

      for (const row of values) {
        if (!Array.isArray(row)) continue;
        const ts = timeIdx >= 0 ? row[timeIdx] : row[0];
        // Get the first non-time, non-null value
        for (let ci = 0; ci < columns.length; ci++) {
          if (columns[ci] === 'time') continue;
          const val = row[ci];
          if (val == null) continue;

          if (isCpu) {
            cpuPercent = val;
            const entry = timeSeriesMap.get(ts) ?? { cpu: null, memory: null };
            entry.cpu = val;
            timeSeriesMap.set(ts, entry);
          } else if (isMem) {
            memoryPercent = val;
            const entry = timeSeriesMap.get(ts) ?? { cpu: null, memory: null };
            entry.memory = val;
            timeSeriesMap.set(ts, entry);
          }
          break; // only first data column per row
        }
      }
    }
  }

  if (cpuPercent == null && memoryPercent == null && timeSeriesMap.size === 0) return null;

  const timeSeries = Array.from(timeSeriesMap.entries())
    .map(([timestamp, metrics]) => ({ timestamp, ...metrics }))
    .sort((a, b) => a.timestamp - b.timestamp);

  return { cpuPercent, memoryPercent, timeSeries };
}

/**
 * Fetch monitoring metrics from InfluxDB for a specific application.
 * Tries several InfluxDB query patterns because the measurement and field
 * names vary between CloudHub versions and regions.
 */
async function getInfluxDBMonitoringData(
  domain: string,
  periodMinutes: number,
): Promise<any | null> {
  if (!(await discoverInfluxDatasource())) return null;

  const timeRange = `time > now() - ${periodMinutes}m`;
  const groupBy = periodMinutes <= 60 ? '1m' : '5m';

  // Build multiple query patterns — different CH versions use different schemas
  const queryPatterns = [
    // Pattern 1: worker_metric measurement (common on CH1)
    {
      cpu: `SELECT mean("cpu") FROM "worker_metric" WHERE ${timeRange} AND "app" = '${domain}' GROUP BY time(${groupBy}) fill(null)`,
      mem: `SELECT mean("memory_usage") FROM "worker_metric" WHERE ${timeRange} AND "app" = '${domain}' GROUP BY time(${groupBy}) fill(null)`,
    },
    // Pattern 2: worker_statistic measurement
    {
      cpu: `SELECT mean("cpuPercentageUsed") FROM "worker_statistic" WHERE ${timeRange} AND "domain" = '${domain}' GROUP BY time(${groupBy}) fill(null)`,
      mem: `SELECT mean("memoryPercentageUsed") FROM "worker_statistic" WHERE ${timeRange} AND "domain" = '${domain}' GROUP BY time(${groupBy}) fill(null)`,
    },
    // Pattern 3: Using app_id tag
    {
      cpu: `SELECT mean("cpu") FROM "worker_metric" WHERE ${timeRange} AND "app_id" = '${domain}' GROUP BY time(${groupBy}) fill(null)`,
      mem: `SELECT mean("memory_usage") FROM "worker_metric" WHERE ${timeRange} AND "app_id" = '${domain}' GROUP BY time(${groupBy}) fill(null)`,
    },
    // Pattern 4: Combined query with applicationName
    {
      cpu: `SELECT mean("cpu") FROM "worker_metric" WHERE ${timeRange} AND "applicationName" = '${domain}' GROUP BY time(${groupBy}) fill(null)`,
      mem: `SELECT mean("memory_usage") FROM "worker_metric" WHERE ${timeRange} AND "applicationName" = '${domain}' GROUP BY time(${groupBy}) fill(null)`,
    },
    // Pattern 5: app_inbound_metric for API traffic (at least we can show request count)
    {
      cpu: `SELECT mean("app_inbound_metric_request_count") FROM "app_inbound_metric" WHERE ${timeRange} AND "app_id" = '${domain}' GROUP BY time(${groupBy}) fill(null)`,
      mem: `SELECT mean("app_inbound_metric_response_time") FROM "app_inbound_metric" WHERE ${timeRange} AND "app_id" = '${domain}' GROUP BY time(${groupBy}) fill(null)`,
    },
  ];

  for (const pattern of queryPatterns) {
    try {
      // Combine CPU and memory queries into one request (InfluxDB supports multi-statement)
      const combinedQ = `${pattern.cpu};${pattern.mem}`;
      const result = await queryInfluxDB(combinedQ);
      const parsed = parseInfluxDBResults(result);
      if (parsed && (parsed.cpuPercent != null || parsed.memoryPercent != null)) {
        console.log(`[Monitoring] InfluxDB query succeeded for ${domain}: CPU=${parsed.cpuPercent?.toFixed(1)}%, Mem=${parsed.memoryPercent?.toFixed(1)}%`);
        // Return in a format that extractMetrics can handle
        return {
          _source: 'influxdb',
          workerStatistics: [{
            statistics: {
              ...(parsed.cpuPercent != null ? { cpu: { [Date.now()]: parsed.cpuPercent } } : {}),
              ...(parsed.memoryPercent != null ? { memoryPercentageUsed: { [Date.now()]: parsed.memoryPercent } } : {}),
            },
          }],
          _timeSeries: parsed.timeSeries,
        };
      }
    } catch (err: any) {
      // Try next pattern
      continue;
    }
  }

  console.log(`[Monitoring] InfluxDB queries returned no data for ${domain}`);
  return null;
}

/**
 * Retrieve application dashboard statistics (CPU, memory, threads, etc.).
 *
 * Strategy:
 * 1. First, try to get metrics from the app detail endpoint (workerStatuses).
 *    This is the MOST RELIABLE source for EU1 CloudHub 1.0 and doesn't require
 *    any extra API calls since the app detail is already fetched separately.
 *
 * 2. If dashboardStats endpoints are known to be unavailable (they return 404
 *    on EU1), skip them entirely to avoid 404 spam in the console.
 *
 * 3. Only try monitoring/observability endpoints if they haven't returned 404.
 *
 * Returns the first non-empty response, or null if all fail.
 */
export async function getDashboardStats(
  domain: string,
  periodMinutes: number = 60,
  context?: { organizationId?: string; environmentId?: string },
): Promise<any> {
  // ── FAST PATH: discovery already done, nothing works → skip immediately ──
  // This prevents ALL redundant API calls on subsequent React Query refetches.
  if (_dashStatsCheckDone && !dashboardStatsAvailable && !monitoringApiAvailable && _influxAvailable === false) {
    console.log(`[getDashboardStats] Fast-path exit for "${domain}" — all sources disabled`);
    return null;
  }

  console.log(`[getDashboardStats] Called for "${domain}" | dashStats=${dashboardStatsAvailable} monApi=${monitoringApiAvailable} influx=${_influxAvailable} checkDone=${_dashStatsCheckDone}`);

  const now = Date.now();
  const startMs = now - periodMinutes * 60 * 1000;

  const orgId = context?.organizationId ?? getOrgId();
  const envId = context?.environmentId ?? getEnvId();

  // --- Primary: Try the app detail endpoint FIRST ---
  // The GET /applications/{domain} response often includes workerStatuses
  // with live CPU/memory/thread data. This is the most reliable on EU1.
  try {
    const { data: appDetail } = await api.get(`${CLOUDHUB_BASE}/applications/${domain}`);
    if (appDetail) {
      const ws = appDetail.workerStatuses ?? appDetail.workers?.statuses;
      if (ws && (Array.isArray(ws) ? ws.length > 0 : Object.keys(ws).length > 0)) {
        return appDetail; // Return the full app detail — extractMetrics handles it
      }

      // Log diagnostics — always log for debug (was: once per session)
      const wsType = ws == null ? 'null' : Array.isArray(ws) ? `array(${ws.length})` : `object(${Object.keys(ws).length})`;
      const hasKeys = appDetail ? Object.keys(appDetail).filter(k =>
        k.includes('worker') || k.includes('monitor') || k.includes('stat')
      ).join(',') : '';
      console.log(`[getDashboardStats] App detail for ${domain}: workerStatuses=${wsType}, relevant keys=[${hasKeys}], checkDone=${_dashStatsCheckDone}`);
    }
  } catch (_) {
    // App detail fetch failed, try other sources
  }

  // ── CONSOLIDATED DISCOVERY GATE ──
  // When multiple getDashboardStats calls fire in parallel (via useQueries),
  // the FIRST call tests ALL stat + monitoring endpoints in one pass.
  // All other calls await the same promise → zero redundant 404s.
  if (!_dashStatsCheckDone) {
    if (!_statsDiscoveryPromise) {
      _statsDiscoveryPromise = (async () => {
        const testDomain = domain;
        const fromIso = new Date(startMs).toISOString();
        const toIso = new Date(now).toISOString();

        // ── Test dashboardStats endpoints ──
        console.log('[getDashboardStats] Discovery gate: testing dashboardStats...');
        let statsFailed = true;
        const statsTests = [
          () => api.get(`${CLOUDHUB_BASE}/applications/${testDomain}/dashboardStats`, {
            params: { startDate: startMs, endDate: now },
          }),
          () => api.get(`${CLOUDHUB_V1}/applications/${testDomain}/dashboardStats`, {
            params: { startDate: startMs, endDate: now },
          }),
        ];

        for (const attempt of statsTests) {
          try {
            const { data } = await attempt();
            if (data) { statsFailed = false; break; }
          } catch (err: any) {
            if (err?.response?.status !== 404) statsFailed = false;
          }
        }
        if (statsFailed) {
          dashboardStatsAvailable = false;
          console.log('[getDashboardStats] dashboardStats endpoints return 404 — disabling for session');
        }

        // ── Test monitoring/observability endpoints ──
        console.log('[getDashboardStats] Discovery gate: testing monitoring APIs...');
        if (orgId && envId) {
          let monFound = false;
          const monTests: Array<() => Promise<any>> = [
            () => api.post(`/monitoring/archive/api/v1/organizations/${orgId}/environments/${envId}/query`, {
              targets: [{ target: 'worker-cpu-usage', type: 'timeserie' }],
              range: { from: fromIso, to: toIso },
              app: testDomain,
            }),
            () => api.post('/observability/api/v1/metrics:search', {
              query: `SELECT avg(cpuUsage) FROM "mulesoft.cloudhub.worker" WHERE timestamp BETWEEN '${fromIso}' AND '${toIso}' AND applicationName = '${testDomain}' AND organizationId = '${orgId}' AND environmentId = '${envId}'`,
            }),
          ];

          for (const attempt of monTests) {
            try {
              const { data } = await attempt();
              if (data) { monFound = true; break; }
            } catch (err: any) {
              const s = err?.response?.status;
              console.log(`[getDashboardStats] Monitoring API test failed: status=${s}`);
              // Any error during discovery means this source is unavailable
            }
          }
          if (!monFound) {
            monitoringApiAvailable = false;
            console.log('[getDashboardStats] Monitoring APIs unavailable — disabling for session');
          }
        } else {
          // No org/env → can't use monitoring APIs
          monitoringApiAvailable = false;
        }

        // ── Test InfluxDB proxy (the REAL monitoring endpoint) ──
        // This is the Grafana-style datasource proxy that the Anypoint web UI uses.
        console.log('[getDashboardStats] Discovery gate: testing InfluxDB proxy...');
        if (_influxAvailable === null) {
          await discoverInfluxDatasource();
        }

        console.log('[getDashboardStats] Discovery complete:', { dashboardStatsAvailable, monitoringApiAvailable, _influxAvailable });
        _dashStatsCheckDone = true;
      })();
    }
    await _statsDiscoveryPromise;

    // After discovery, if nothing works, return null immediately
    if (!dashboardStatsAvailable && !monitoringApiAvailable && _influxAvailable !== true) {
      return null;
    }
  }

  // ── Use the endpoints we know work (discovery passed) ──
  if (dashboardStatsAvailable) {
    const statsAttempts: Array<() => Promise<any>> = [
      () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/dashboardStats`, {
        params: { startDate: startMs, endDate: now },
      }),
      () => api.get(`${CLOUDHUB_V1}/applications/${domain}/dashboardStats`, {
        params: { startDate: startMs, endDate: now },
      }),
      () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/statistics`, {
        params: { startDate: startMs, endDate: now },
      }),
    ];

    for (const attempt of statsAttempts) {
      try {
        const { data } = await attempt();
        if (data) return data;
      } catch (_) {
        // continue
      }
    }
  }

  if (monitoringApiAvailable && orgId && envId) {
    const fromIso = new Date(startMs).toISOString();
    const toIso = new Date(now).toISOString();

    const monAttempts: Array<() => Promise<any>> = [
      () => api.post(`/monitoring/archive/api/v1/organizations/${orgId}/environments/${envId}/query`, {
        targets: [
          { target: 'worker-cpu-usage', type: 'timeserie' },
          { target: 'worker-memory-usage', type: 'timeserie' },
          { target: 'worker-thread-count', type: 'timeserie' },
        ],
        range: { from: fromIso, to: toIso },
        app: domain,
      }),
      () => api.post('/observability/api/v1/metrics:search', {
        query: `SELECT avg(cpuUsage), avg(memoryUsage), avg(threadCount) FROM "mulesoft.cloudhub.worker" WHERE timestamp BETWEEN '${fromIso}' AND '${toIso}' AND applicationName = '${domain}' AND organizationId = '${orgId}' AND environmentId = '${envId}'`,
      }),
    ];

    for (const attempt of monAttempts) {
      try {
        const { data } = await attempt();
        if (data) return data;
      } catch (_) {
        // continue
      }
    }
  }

  // --- InfluxDB proxy (the real Anypoint Monitoring endpoint) ---
  if (_influxAvailable) {
    try {
      const influxData = await getInfluxDBMonitoringData(domain, periodMinutes);
      if (influxData) return influxData;
    } catch (err: any) {
      console.log(`[getDashboardStats] InfluxDB query failed for ${domain}: ${err?.message}`);
    }
  }

  // --- CloudHub 2.0 deployment detail (AMC API) — may contain replica status ---
  const amcPath = amcDeploymentsPath();
  if (amcPath) {
    try {
      const { data: deps } = await api.get(amcPath);
      const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
      const match = items.find((d: any) => d.name === domain || d.id === domain);
      if (match) {
        const { data: detail } = await api.get(`${amcPath}/${match.id}`);
        if (detail) return detail;
      }
    } catch (_) {
      // CH2 not available
    }
  }

  return null;
}

/**
 * Extract a time-series array from a CloudHub statistics map.
 * Input:  { "1709564000000": 2.5, "1709564060000": 3.1 }
 * Output: [{ timestamp: 1709564000000, value: 2.5 }, ...]
 *
 * If `statisticsByWorker` is nested by worker ID, unwrap the first worker.
 */
function extractTimeSeries(
  statsObj: any,
  metricName: string,
): Array<{ timestamp: number; value: number }> {
  if (!statsObj || typeof statsObj !== 'object') return [];

  // Direct access: statsObj might be { cpu: {...}, memoryPercentageUsed: {...} }
  let metricMap = statsObj[metricName];

  // If not found, the object might be nested by worker ID
  if (metricMap == null) {
    const workerKeys = Object.keys(statsObj);
    for (const wk of workerKeys) {
      const nested = statsObj[wk];
      if (nested && typeof nested === 'object' && nested[metricName] != null) {
        metricMap = nested[metricName];
        break;
      }
    }
  }

  if (metricMap == null || typeof metricMap !== 'object' || Array.isArray(metricMap)) return [];

  return Object.entries(metricMap)
    .map(([ts, val]) => ({ timestamp: Number(ts), value: typeof val === 'number' ? val : 0 }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Retrieve application metrics (CPU, memory, etc.).
 * Returns an array of { timestamp, value } data points for the requested metric.
 *
 * If dashboardStats is unavailable (common on EU1), tries to extract
 * time-series from the app detail's workerStatuses instead.
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

  // Map friendly metric names to CloudHub field names
  const metricFieldMap: Record<string, string[]> = {
    cpu: ['cpuPercentageUsed', 'cpu'],
    memory: ['memoryPercentageUsed', 'memoryTotalUsed'],
  };
  const fieldNames = metricFieldMap[params.metricName] ?? [params.metricName];

  // Skip dashboardStats if known to be unavailable
  if (dashboardStatsAvailable) {
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

      if (!data) return null;

      // Extract time-series from workerStatistics (the main metrics container)
      const statsSource = data.workerStatistics ?? data;

      for (const fieldName of fieldNames) {
        const series = extractTimeSeries(statsSource, fieldName);
        if (series.length > 0) return series;
      }

      // Return the raw data if we couldn't extract a time-series
      return data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        // dashboardStats not available — will be disabled by getDashboardStats
        return null;
      }
      throw err;
    }
  }

  // Fallback: try to get metrics from app detail workerStatuses
  try {
    const { data } = await api.get(`${CLOUDHUB_BASE}/applications/${domain}`);
    if (data?.workerStatuses || data?.workers?.statuses) {
      return data; // extractMetrics in the UI layer will handle this shape
    }
  } catch (_) {
    // not available
  }

  return null;
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
