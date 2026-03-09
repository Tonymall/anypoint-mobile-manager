// ============================================================
// Anypoint Mobile Platform - Runtime Manager Service
// Supports both CloudHub 1.0 and CloudHub 2.0 (AMC) APIs
// ============================================================

import api from './api';
import * as monitoringService from './monitoringService';
import logger from '../utils/logger';
import type {
  Application,
  AppLogEntry,
  DeploymentRequest,
} from '../types';

const CLOUDHUB_BASE = '/cloudhub/api/v2';
const CLOUDHUB_V1 = '/cloudhub/api';
const _RUNTIME_BASE = '/armui/api/v1';
const AMC_BASE = '/amc/application-manager/api/v2';
const HYBRID_BASE = '/hybrid/api/v1';

// ---------- Helpers: read org/env from API headers ----------

function getOrgId(): string | undefined {
  return api.defaults.headers.common['X-ANYPNT-ORG-ID'] as string | undefined;
}

function getEnvId(): string | undefined {
  return api.defaults.headers.common['X-ANYPNT-ENV-ID'] as string | undefined;
}

function escapeAmqlLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildAmqlBaseFilterSets(orgId: string, envId: string): string[][] {
  return [
    [
      `"sub_org.id" = '${escapeAmqlLiteral(orgId)}'`,
      `"env.id" = '${escapeAmqlLiteral(envId)}'`,
    ],
  ];
}

function buildAmqlScopeClauses(
  orgId: string,
  envId: string,
  app: { platformId?: string; name?: string; domain?: string },
): string[] {
  const baseSets = buildAmqlBaseFilterSets(orgId, envId);
  const clauses = baseSets.flatMap((base) => [
    app.platformId ? [...base, `"app.id" = '${escapeAmqlLiteral(app.platformId)}'`].join(' AND ') : null,
    app.name ? [...base, `"app.name" = '${escapeAmqlLiteral(app.name)}'`].join(' AND ') : null,
    app.domain && app.domain !== app.name ? [...base, `"app.name" = '${escapeAmqlLiteral(app.domain)}'`].join(' AND ') : null,
  ]).filter((value): value is string => Boolean(value));

  return clauses.length > 0 ? Array.from(new Set(clauses)) : baseSets.map((base) => base.join(' AND '));
}

function buildDescriptorAwareScopeClauses(
  orgId: string,
  envId: string,
  app: { platformId?: string; name?: string; domain?: string },
  descriptorDimensions: string[],
): string[] {
  const baseSets = buildAmqlBaseFilterSets(orgId, envId);
  const dimensions = new Set(descriptorDimensions ?? []);
  const appIdentifiers = Array.from(new Set([
    app.platformId,
    app.domain,
    app.name,
  ].filter((value): value is string => Boolean(value))));
  const appNames = Array.from(new Set([
    app.name,
    app.domain,
  ].filter((value): value is string => Boolean(value))));

  const dimensionCandidates: Array<{ names: string[]; values: string[] }> = [
    {
      names: ['app.id', 'application.id', 'entity.id', 'resource.id', 'service.id', 'asset.id'],
      values: appIdentifiers,
    },
    {
      names: ['app.name', 'application.name', 'application.display_name', 'entity.name', 'entity.display_name', 'resource.name', 'resource.display_name', 'service.name', 'asset.name'],
      values: appNames,
    },
  ];

  const clauses: string[] = [];

  for (const candidate of dimensionCandidates) {
    const supportedNames = candidate.names.filter((name) => dimensions.has(name));
    if (supportedNames.length === 0 || candidate.values.length === 0) continue;

    for (const base of baseSets) {
      for (const dimensionName of supportedNames) {
        for (const value of candidate.values) {
          clauses.push([...base, `"${dimensionName}" = '${escapeAmqlLiteral(value)}'`].join(' AND '));
        }
      }
    }
  }

  return clauses.length > 0
    ? Array.from(new Set(clauses))
    : baseSets.map((base) => base.join(' AND '));
}

function buildAmqlQuery(
  metricName: string,
  selectClause: string,
  whereClause: string,
  startMs: number,
  endMs: number,
  timeseriesInterval?: string,
): string {
  const needsTimestamp = Boolean(timeseriesInterval) && !/\btimestamp\b/i.test(selectClause);
  const effectiveSelect = needsTimestamp ? `timestamp, ${selectClause}` : selectClause;
  const timeseries = timeseriesInterval ? ` TIMESERIES ${timeseriesInterval}` : '';
  return `SELECT ${effectiveSelect} FROM "${metricName}" WHERE timestamp BETWEEN ${startMs} AND ${endMs} AND ${whereClause}${timeseries}`;
}

function isObservabilityDataPresent(payload: any): boolean {
  if (!payload) return false;
  if (Array.isArray(payload?.data)) return payload.data.length > 0;
  return Array.isArray(payload) ? payload.length > 0 : false;
}

function metricTypeNameOf(entry: any): string | null {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return null;
  return entry.name ?? entry.id ?? entry.metricType ?? entry.metric_type ?? null;
}

function pickMetricType(
  metricTypes: string[],
  exactCandidates: string[],
  containsPatterns: RegExp[] = [],
): string | null {
  for (const candidate of exactCandidates) {
    const exactMatch = metricTypes.find((metricType) => metricType === candidate);
    if (exactMatch) return exactMatch;
  }

  for (const pattern of containsPatterns) {
    const partialMatch = metricTypes.find((metricType) => pattern.test(metricType));
    if (partialMatch) return partialMatch;
  }

  return null;
}

function descriptorNamesOf(entries: any): string[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (!entry || typeof entry !== 'object') return null;
      return entry.name ?? entry.id ?? entry.key ?? entry.field ?? entry.fieldName ?? null;
    })
    .filter((value): value is string => Boolean(value));
}

async function describeObservabilityMetricType(
  metricType: string,
): Promise<{ dimensions: string[]; measurements: string[] }> {
  const cached = _observabilityMetricDescribeCache.get(metricType);
  if (cached) return cached;

  const { data } = await api.get(`/observability/api/v1/metric_types/${encodeURIComponent(metricType)}:describe`);
  const descriptor = {
    dimensions: descriptorNamesOf(data?.dimensions ?? data?.tags ?? data?.labels),
    measurements: descriptorNamesOf(data?.measurements ?? data?.fields ?? data?.aggregations),
  };
  if (_observabilityMetricDescribeCache.size >= OBSERVABILITY_DESCRIPTOR_CACHE_MAX) {
    const oldestKey = _observabilityMetricDescribeCache.keys().next().value;
    if (oldestKey) {
      _observabilityMetricDescribeCache.delete(oldestKey);
    }
  }
  _observabilityMetricDescribeCache.set(metricType, descriptor);
  return descriptor;
}

function pickMeasurement(
  measurements: string[],
  patterns: RegExp[],
): string | null {
  for (const pattern of patterns) {
    const match = measurements.find((measurement) => pattern.test(measurement));
    if (match) return match;
  }
  return null;
}

/** Build the AMC base path for the current org/env (CloudHub 2.0) */
function amcDeploymentsPath(): string | null {
  const orgId = getOrgId();
  const envId = getEnvId();
  if (!orgId || !envId) return null;
  return `${AMC_BASE}/organizations/${orgId}/environments/${envId}/deployments`;
}

/**
 * Match a CH2/AMC deployment object against a domain string.
 * Checks name, id, nested application fields, fullDomain, and partial matches.
 */
function matchDeployment(dep: any, domain: string): boolean {
  if (dep.name === domain || dep.id === domain) return true;
  if (dep.application?.ref?.artifactId === domain) return true;
  if (dep.application?.name === domain) return true;
  if (dep.fullDomain === domain || dep.application?.fullDomain === domain) return true;
  const dName = dep.name ?? '';
  if (dName && (dName.includes(domain) || domain.includes(dName))) return true;
  return false;
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
  const _replicaState = firstReplica?.state ?? firstReplica?.status ?? '';

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
    // Production: sanitized error (no org/env IDs, no base URL)
    const hasToken = !!(api.defaults.headers.common['Authorization']);
    logger.error('[getApplications] All endpoints failed:', errors.length, 'errors, token:', hasToken ? 'present' : 'MISSING');
    // Dev-only: full debug details including org/env context
    logger.log('[getApplications] Debug:', {
      orgId: getOrgId() ?? 'MISSING',
      envId: getEnvId() ?? 'MISSING',
      baseURL: api.defaults.baseURL ?? 'NOT SET',
      errors,
    });
    const userMsg = errors.map(e => e.replace(/https?:\/\/[^\s]+/g, '[endpoint]')).join(' | ');
    throw new Error(`Failed to load applications: ${userMsg}`);
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
  // Try CH1 — use retreiveStatistics=true to get worker statistics
  try {
    const { data } = await api.get<Application>(`${CLOUDHUB_BASE}/applications/${domain}`, {
      params: { retreiveStatistics: true },
    });
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
      const match = items.find((d: any) => matchDeployment(d, domain));
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
    const match = items.find((d: any) => matchDeployment(d, domain));
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
      const match = items.find((d: any) => matchDeployment(d, domain));
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
    const match = items.find((d: any) => matchDeployment(d, domain));
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
 *
 * IMPORTANT: These flags are NOW per-domain. When the user navigates
 * from one app's logs to another, we reset the flags so the new app's
 * endpoints are discovered fresh. This prevents a failed discovery for
 * app A from blocking log access for app B.
 */
let _logEndpointsAvailable = true;
let _logEndpointsChecked = false;
let _logCheckedForDomain: string | null = null;

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
  // ── PER-DOMAIN RESET: if switching to a different app, clear stale flags ──
  // This prevents a failed log discovery for app A from blocking app B's logs.
  if (_logCheckedForDomain && _logCheckedForDomain !== domain) {
    logger.log(`[getAppLogs] Domain changed from "${_logCheckedForDomain}" to "${domain}" — resetting log flags`);
    _logEndpointsAvailable = true;
    _logEndpointsChecked = false;
    _workingLogStrategy = null;
    _instancesEndpointAvailable = true;
  }
  _logCheckedForDomain = domain;

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
      logger.log(`[getAppLogs] CH1 deployment discovered: ${deploymentId}`);

      // Step 2: Match the real browser flow first.
      try {
        return await api.get(
          `${CLOUDHUB_BASE}/applications/${domain}/deployments/${deploymentId}/logs`,
          { params: { tail: true, limitMsgLen: 5000, limit } },
        );
      } catch (_) {
        try {
          return await api.post(`${CLOUDHUB_BASE}/applications/${domain}/logs`, postBodyNoDeplId);
        } catch (_) {
          return api.get(
            `${CLOUDHUB_BASE}/applications/${domain}/deployments/${deploymentId}/logs`,
            { params: { startDate: startMs, endDate: endMs, limit, limitMsgLen: 5000 } },
          );
        }
      }
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
      logger.log('[getAppLogs] /instances endpoints returned nothing — skipping for session');
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
    // ── CH2/AMC log discovery ──
    // First resolve the deployment once, then try multiple log sub-paths.
    strategies.push(
      { name: 'amc-specs-logs', fn: async () => {
        // Step 1: Find the deployment
        const { data: deps } = await api.get(amcPath!, { headers: { Accept: 'application/json' } });
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => matchDeployment(d, domain));
        if (!match) throw new Error('No CH2 deployment found');
        const deploymentId = match.id;

        // Step 2: Get specs for this deployment
        const { data: specsData } = await api.get(
          `${amcPath}/${deploymentId}/specs`,
          { params: { limit: 1000 }, headers: { Accept: 'application/json' } },
        );
        const specs = Array.isArray(specsData)
          ? specsData
          : (specsData?.items ?? specsData?.data ?? specsData?.specs ?? []);
        if (specs.length === 0) throw new Error('No specs found for deployment');

        // Sort specs by date (newest first) to ensure we get the LATEST spec
        specs.sort((a: any, b: any) => {
          const dateA = new Date(a.lastModifiedDate ?? a.createdDate ?? a.updatedDate ?? 0).getTime();
          const dateB = new Date(b.lastModifiedDate ?? b.createdDate ?? b.updatedDate ?? 0).getTime();
          return dateB - dateA;
        });

        // Use the first (most recent) spec — try multiple field names
        const spec0 = specs[0];
        const specId = spec0?.id ?? spec0?.specId ?? spec0?._id ?? spec0?.version;
        if (!specId) {
          logger.warn('[getAppLogs] specs[0] has no recognizable ID field. Keys:', Object.keys(spec0 ?? {}));
          throw new Error('No specId found in specs response');
        }

        // Cache for fast path on subsequent polls
        _cachedAmcDeploymentId = deploymentId;
        _cachedAmcSpecId = specId;
        _cachedAmcDomain = domain;

        logger.log(`[getAppLogs] AMC specs discovered: deploymentId=${deploymentId}, specId=${specId}`);

        // Step 3: Try to get logs via replicas first (the standard CH2 pattern)
        try {
          const { data: replicasData } = await api.get(
            `${amcPath}/${deploymentId}/specs/${specId}/replicas`,
            { headers: { Accept: 'application/json' } },
          );
          const replicas = Array.isArray(replicasData)
            ? replicasData
            : (replicasData?.items ?? replicasData?.data ?? replicasData?.replicas ?? []);
          if (replicas.length > 0) {
            const replicaId = replicas[0]?.id ?? replicas[0]?.replicaId ?? replicas[0]?.name;
            if (replicaId) {
              logger.log(`[getAppLogs] AMC replica discovered: ${replicaId}`);
              return api.get(
                `${amcPath}/${deploymentId}/specs/${specId}/replicas/${replicaId}/logs`,
                {
                  params: { descending: true, limit },
                  headers: { Accept: 'application/json' },
                },
              );
            }
          }
        } catch (_replicaErr) {
          // Replicas endpoint doesn't exist — fall through to direct spec logs
        }

        // Step 3b: Try direct spec-level logs
        return api.get(
          `${amcPath}/${deploymentId}/specs/${specId}/logs`,
          {
            params: {
              descending: true,
              limit,
              startDate: new Date(startMs).toISOString(),
              endDate: new Date(endMs).toISOString(),
            },
            headers: { Accept: 'application/json' },
          },
        );
      }},
    );

    // ── AMC aggregated logs (per-deployment, no specId needed) ──
    strategies.push(
      { name: 'amc-aggregated-logs', fn: async () => {
        const { data: deps } = await api.get(amcPath!, { headers: { Accept: 'application/json' } });
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => matchDeployment(d, domain));
        if (!match) throw new Error('No CH2 deployment found');
        return api.get(`${amcPath}/${match.id}/logs`, {
          params: { descending: true, limit },
          headers: { Accept: 'application/json' },
        });
      }},
    );

    // ── AMC direct/lookup fallbacks ──
    strategies.push(
      { name: 'amc-direct', fn: () => api.get(`${amcPath}/${domain}/logs`, { params: getParams, headers: { Accept: 'application/json' } }) },
      { name: 'amc-lookup', fn: async () => {
        const { data: deps } = await api.get(amcPath!, { headers: { Accept: 'application/json' } });
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => matchDeployment(d, domain));
        if (!match) throw new Error('No CH2 deployment found');
        return api.get(`${amcPath}/${match.id}/logs`, { params: getParams, headers: { Accept: 'application/json' } });
      }},
    );
  }

  // ---------------------------------------------------------------
  // 7) CloudHub 2.0 / Runtime Fabric additional log endpoints
  //    These cover CH2 deployments that use different API paths
  // ---------------------------------------------------------------
  if (orgId && envId) {
    // Runtime Fabric v1 log endpoint
    strategies.push(
      { name: 'rtf-logs', fn: async () => {
        // First resolve the deployment ID
        const ch2Path = amcPath ?? `${AMC_BASE}/organizations/${orgId}/environments/${envId}/deployments`;
        const { data: deps } = await api.get(ch2Path);
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => matchDeployment(d, domain));
        if (!match) throw new Error('No deployment found for RTF logs');
        const deploymentId = match.id;

        // Cache for fast path
        _cachedAmcDeploymentId = deploymentId;
        _cachedAmcDomain = domain;

        return api.get(
          `/runtimefabric/api/organizations/${orgId}/environments/${envId}/deployments/${deploymentId}/logs`,
          { params: { limit, descending: true } },
        );
      }},
    );

    // Hybrid v2 log endpoint (Runtime Manager v2)
    strategies.push(
      { name: 'hybrid-v2-logs', fn: async () => {
        const ch2Path = amcPath ?? `${AMC_BASE}/organizations/${orgId}/environments/${envId}/deployments`;
        const { data: deps } = await api.get(ch2Path);
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => matchDeployment(d, domain));
        if (!match) throw new Error('No deployment found for Hybrid v2 logs');
        return api.get(
          `${HYBRID_BASE}/organizations/${orgId}/environments/${envId}/deployments/${match.id}/logs`,
          { params: { limit, descending: true } },
        );
      }},
    );

    // Anypoint Logging Service v2 POST query endpoint
    strategies.push(
      { name: 'logging-v2', fn: () => api.post(
        `/logging/api/v2/organizations/${orgId}/environments/${envId}/query`,
        {
          applicationName: domain,
          startTime: startMs,
          endTime: endMs,
          limit,
          descending: true,
        },
      )},
    );

    // MC (Management Center) application log endpoint
    strategies.push(
      { name: 'mc-app-logs', fn: async () => {
        const ch2Path = amcPath ?? `${AMC_BASE}/organizations/${orgId}/environments/${envId}/deployments`;
        const { data: deps } = await api.get(ch2Path);
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => matchDeployment(d, domain));
        if (!match) throw new Error('No deployment found for MC logs');
        return api.get(
          `/mc/v1/organizations/${orgId}/environments/${envId}/deployments/${match.id}/application/logs`,
          { params: { limit, descending: true } },
        );
      }},
    );
  }

  const logErrors: string[] = [];
  let orgExpiredSeen = false;

  for (let i = 0; i < strategies.length; i++) {
    const { name, fn } = strategies[i];
    try {
      const { data, headers: respHeaders } = await fn();

      // Reject HTML responses early (server returned SPA page instead of JSON)
      const contentType = respHeaders?.['content-type'] ?? '';
      if (contentType.includes('text/html')) {
        if (!_logEndpointsChecked) {
          logger.warn(`[getAppLogs] "${name}" returned HTML (Content-Type: text/html) — skipping`);
        }
        continue;
      }
      if (typeof data === 'string' && data.trim().length > 0) {
        const trimmed = data.trim();
        if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
          if (!_logEndpointsChecked) {
            logger.warn(`[getAppLogs] "${name}" returned HTML body — skipping`);
          }
          continue;
        }
      }

      const entries = extractLogEntries(data);
      if (entries.length > 0) {
        _logEndpointsAvailable = true;
        _logEndpointsChecked = true;
        _workingLogStrategy = name; // ← Cache this for next poll
        logger.log(`[getAppLogs] ✅ Got ${entries.length} log entries via "${name}"`);
        return entries;
      }

      // Diagnostic: endpoint returned 200 but no entries extracted (once per session)
      if (!_logEndpointsChecked) {
        const preview = typeof data === 'string'
          ? data.slice(0, 400)
          : JSON.stringify(data).slice(0, 400);
        logger.log(`[getAppLogs] "${name}" returned 200 OK but no log entries. Preview:`, preview);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status) logErrors.push(String(status));

      // Detect "Organization is expired" — this is a permanent failure
      const errMsg = err?.response?.data?.message ?? '';
      if (typeof errMsg === 'string' && errMsg.toLowerCase().includes('organization is expired')) {
        orgExpiredSeen = true;
      }

      if (status === 400 && !_logEndpointsChecked) {
        const respBody = err?.response?.data;
        const url = err?.config?.url ?? 'unknown';
        logger.warn(`[getAppLogs] 400 from ${url}:`,
          typeof respBody === 'object' ? JSON.stringify(respBody).slice(0, 500) : String(respBody ?? '').slice(0, 500));
      }
    }
  }

  // Log summary (only once per session)
  if (!_logEndpointsChecked) {
    if (orgExpiredSeen) {
      logger.warn(`[getAppLogs] Organization is expired — log access may be restricted. Some endpoints returned 403.`);
    } else if (logErrors.length > 0) {
      logger.warn(`[getAppLogs] All ${strategies.length} strategies failed for ${domain}. Statuses: ${logErrors.join(', ')}`);
    } else {
      logger.warn(`[getAppLogs] All ${strategies.length} strategies returned empty results for ${domain}`);
    }
    const allPermanent = logErrors.length > 0 && logErrors.every((s) => s === '400' || s === '404' || s === '405' || s === '403');
    if (allPermanent) {
      _logEndpointsAvailable = false;
      logger.log('[getAppLogs] All log endpoints return 400/403/404/405 — disabling live polling for session');
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
      // Prefer POST /logs (supports date range + all priorities) — fall back to GET with date params
      try {
        return await api.get(
          `${CLOUDHUB_BASE}/applications/${domain}/deployments/${_cachedCh1DeploymentId}/logs`,
          { params: { tail: true, limitMsgLen: 5000, limit: getParams.limit ?? 200 } },
        );
      } catch (_) {
        try {
          return await api.post(`${CLOUDHUB_BASE}/applications/${domain}/logs`, postBodyNoDeplId);
        } catch (_) {
          return api.get(
            `${CLOUDHUB_BASE}/applications/${domain}/deployments/${_cachedCh1DeploymentId}/logs`,
            { params: { startDate: getParams.startDate, endDate: getParams.endDate, limit: getParams.limit ?? 200, limitMsgLen: 5000 } },
          );
        }
      }
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

      // Try replica-based logs first (the standard CH2 pattern)
      try {
        const { data: replicasData } = await api.get(
          `${amcP}/${_cachedAmcDeploymentId}/specs/${_cachedAmcSpecId}/replicas`,
          { headers: { Accept: 'application/json' } },
        );
        const replicas = Array.isArray(replicasData)
          ? replicasData
          : (replicasData?.items ?? replicasData?.data ?? replicasData?.replicas ?? []);
        if (replicas.length > 0) {
          const replicaId = replicas[0]?.id ?? replicas[0]?.replicaId ?? replicas[0]?.name;
          if (replicaId) {
            return api.get(
              `${amcP}/${_cachedAmcDeploymentId}/specs/${_cachedAmcSpecId}/replicas/${replicaId}/logs`,
              {
                params: { descending: true, limit: getParams.limit ?? 200 },
                headers: { Accept: 'application/json' },
              },
            );
          }
        }
      } catch (_) {
        // Replicas not available — fall through to spec-level logs
      }

      return api.get(
        `${amcP}/${_cachedAmcDeploymentId}/specs/${_cachedAmcSpecId}/logs`,
        {
          params: {
            descending: true,
            limit: getParams.limit ?? 200,
            startDate: new Date(getParams.startDate).toISOString(),
            endDate: new Date(getParams.endDate).toISOString(),
          },
          headers: { Accept: 'application/json' },
        },
      );
    }
    case 'amc-aggregated-logs': {
      if (!_cachedAmcDeploymentId || _cachedAmcDomain !== domain) {
        throw new Error('AMC deployment not cached — need re-discovery');
      }
      const amcP2 = amcDeploymentsPath();
      if (!amcP2) throw new Error('No AMC path available');
      return api.get(
        `${amcP2}/${_cachedAmcDeploymentId}/logs`,
        { params: { descending: true, limit: getParams.limit ?? 200 }, headers: { Accept: 'application/json' } },
      );
    }
    case 'rtf-logs': {
      if (!_cachedAmcDeploymentId || _cachedAmcDomain !== domain) {
        throw new Error('RTF deployment not cached — need re-discovery');
      }
      return api.get(
        `/runtimefabric/api/organizations/${orgId}/environments/${envId}/deployments/${_cachedAmcDeploymentId}/logs`,
        { params: { limit: getParams.limit ?? 200, descending: true, startDate: getParams.startDate, endDate: getParams.endDate } },
      );
    }
    case 'hybrid-v2-logs': {
      if (!_cachedAmcDeploymentId || _cachedAmcDomain !== domain) {
        throw new Error('Hybrid v2 deployment not cached — need re-discovery');
      }
      return api.get(
        `${HYBRID_BASE}/organizations/${orgId}/environments/${envId}/deployments/${_cachedAmcDeploymentId}/logs`,
        { params: { limit: getParams.limit ?? 200, descending: true, startDate: getParams.startDate, endDate: getParams.endDate } },
      );
    }
    case 'logging-v2': {
      return api.post(
        `/logging/api/v2/organizations/${orgId}/environments/${envId}/query`,
        {
          applicationName: domain,
          startTime: getParams.startDate,
          endTime: getParams.endDate,
          limit: getParams.limit ?? 200,
          descending: true,
        },
      );
    }
    case 'mc-app-logs': {
      if (!_cachedAmcDeploymentId || _cachedAmcDomain !== domain) {
        throw new Error('MC deployment not cached — need re-discovery');
      }
      return api.get(
        `/mc/v1/organizations/${orgId}/environments/${envId}/deployments/${_cachedAmcDeploymentId}/application/logs`,
        { params: { limit: getParams.limit ?? 200, descending: true, startDate: getParams.startDate, endDate: getParams.endDate } },
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
  // Reject HTML responses (CH2 sometimes returns an HTML page instead of logs)
  if (typeof data === 'string' && data.trim().length > 0) {
    const trimmed = data.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
      logger.warn('[extractLogEntries] Received HTML response instead of logs — skipping');
      return [];
    }
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
      data.messages, data.lines, data.content, data.payload,
      data.response, data.body,
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

  // ── CH2 specs-based logs: { docId, timestamp, message, replicaId, logLevel, context: { logger, class } } ──
  if (first?.docId !== undefined || first?.logLevel !== undefined || first?.replicaId !== undefined) {
    return arr.map((e) => ({
      timestamp: e.timestamp ?? '',
      priority: (e.logLevel ?? e.priority ?? e.level ?? 'INFO').toUpperCase(),
      message: e.message ?? e.msg ?? '',
      threadName: e.replicaId ?? e.threadName ?? '',
      loggerName: e.context?.logger ?? e.context?.class ?? e.loggerName ?? '',
    } as AppLogEntry));
  }

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

  // Catch-all: normalize any remaining array entries with best-effort field mapping
  // Some API endpoints (AMC specs-logs, RTF, etc.) may use different field names
  return arr.map((e) => {
    const ev = e.event ?? {};
    return {
      timestamp: e.timestamp ?? e['@timestamp'] ?? ev.timestamp ?? e.ts ?? e.time ?? e.date ?? e.instant ?? '',
      priority: (e.priority ?? ev.priority ?? e.level ?? ev.level ?? e.severity ?? e.logLevel ?? e.log_level ?? 'INFO').toUpperCase(),
      message: e.message ?? ev.message ?? e.msg ?? e.text ?? e.log ?? e.logLine ?? e.content ?? (typeof e.line === 'string' ? e.line : JSON.stringify(e)),
      threadName: e.threadName ?? ev.threadName ?? e.thread ?? '',
      loggerName: e.loggerName ?? ev.loggerName ?? e.logger ?? '',
      recordId: e.recordId ?? e.docId ?? e.id ?? '',
      deploymentId: e.deploymentId ?? '',
      instanceId: e.instanceId ?? ev.instanceId ?? '',
    } as AppLogEntry;
  });
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
let _archiveAvailable = true;       // /monitoring/archive/* endpoints
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
 * The Anypoint Monitoring visualizer uses a Grafana-style InfluxDB proxy:
 *   GET /monitoring/api/visualizer/api/datasources/proxy/{datasourceId}/query
 *     ?db="dias_mt_1_prod"&q=SELECT...&epoch=ms
 *
 * Key details (discovered from the real Anypoint Monitoring web UI):
 *   - Datasource ID: varies per org (e.g. 4113)
 *   - Database name: e.g. "dias_mt_1_prod" (WITH quotes in param value!)
 *   - app_id uses fullDomain: e.g. "crm-profile-s.de-c1.eu1.cloudhub.io"
 *   - Queries use org_id, env_id, app_id WHERE filters
 *   - Time ranges: "time >= {ms}ms and time <= {ms}ms"
 *
 * We discover the datasource ID and db name once, then cache for the session.
 */
let _influxDatasourceId: number | null = null;
let _influxDbName: string | null = null;
let _influxAvailable: boolean | null = null; // null = not checked yet
let _legacyJvmApiAvailable = false;
let _legacyMetricsApiAvailable = false;
let _observabilityMetricTypesPromise: Promise<string[]> | null = null;
let _observabilityMetricTypesCache: string[] | null = null;
const OBSERVABILITY_DESCRIPTOR_CACHE_MAX = 100;
const _observabilityMetricDescribeCache = new Map<string, { dimensions: string[]; measurements: string[] }>();

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
  _archiveAvailable = true;
  _dashStatsCheckDone = false;
  _statsDiscoveryPromise = null;
  _logEndpointsAvailable = true;
  _logEndpointsChecked = false;
  _logCheckedForDomain = null;
  _workingLogStrategy = null;
  _instancesEndpointAvailable = true;
  _influxDatasourceId = null;
  _influxDbName = null;
  _influxAvailable = null;
  _legacyJvmApiAvailable = false;
  _legacyMetricsApiAvailable = false;
  _observabilityMetricTypesPromise = null;
  _observabilityMetricTypesCache = null;
  _observabilityMetricDescribeCache.clear();
  _cachedAmcDeploymentId = null;
  _cachedAmcSpecId = null;
  _cachedAmcDomain = null;
  _cachedCh1DeploymentId = null;
  _cachedCh1Domain = null;
  logger.log('[runtimeService] Session flags reset');
}

async function getObservabilityMetricTypes(): Promise<string[]> {
  if (_observabilityMetricTypesCache) return _observabilityMetricTypesCache;
  if (!_observabilityMetricTypesPromise) {
    _observabilityMetricTypesPromise = api
      .get('/observability/api/v1/metric_types')
      .then(({ data }) => {
        const metricTypes = Array.isArray(data)
          ? data.map(metricTypeNameOf).filter((value): value is string => Boolean(value))
          : [];
        _observabilityMetricTypesCache = metricTypes;
        logger.log(`[Monitoring] metric_types cached: ${metricTypes.slice(0, 20).join(', ')}`);
        return metricTypes;
      })
      .catch((error: any) => {
        _observabilityMetricTypesPromise = null;
        throw error;
      });
  }

  return _observabilityMetricTypesPromise;
}

// ---------- InfluxDB Monitoring Helpers ----------

/**
 * Extract the region slug from the API base URL.
 * e.g. "https://eu1.anypoint.mulesoft.com" → "eu1"
 *      "https://anypoint.mulesoft.com" → "us" (default region has no prefix)
 */
function _getRegionSlug(): string {
  const baseUrl = api.defaults.baseURL ?? '';
  const match = baseUrl.match(/https?:\/\/(\w+)\.anypoint\.mulesoft\.com/);
  if (match && match[1] !== 'anypoint') return match[1];
  return 'us';
}

/**
 * Discover the InfluxDB datasource for Anypoint Monitoring.
 * The Anypoint Monitoring visualizer uses a Grafana-style datasource proxy.
 *
 * Discovery approach:
 * 1. GET /monitoring/api/visualizer/api/datasources → find InfluxDB type
 * 2. Extract datasource ID and database name
 * 3. Verify with a test SHOW MEASUREMENTS query
 *
 * Real-world example (EU1):
 *   - Datasource ID: 4113
 *   - Database name: "dias_mt_1_prod" (quoted in the db parameter!)
 *
 * Returns true if an InfluxDB datasource was found.
 */
async function discoverInfluxDatasource(): Promise<boolean> {
  logger.log('[Monitoring] discoverInfluxDatasource() called, current state:', _influxAvailable);
  if (_influxAvailable !== null) return _influxAvailable;

  let _influxTriedCount = 0;
  let datasources: any[] = [];
  const testedDatasourceIds = new Set<string>();

  const verifyInfluxDatasource = async (ds: any): Promise<boolean> => {
    const dsId = ds?.id;
    if (dsId == null) return false;

    const dsKey = String(dsId);
    if (testedDatasourceIds.has(dsKey)) return false;
    testedDatasourceIds.add(dsKey);
    _influxTriedCount++;

    const rawDbName = ds?.database ?? ds?.jsonData?.database ?? '';
    const dbName = rawDbName.startsWith('"') ? rawDbName : `"${rawDbName}"`;

    const orgId = getOrgId();
    const envId = getEnvId();
    const endMs = Date.now();
    const startMs = endMs - (15 * 60 * 1000);
    const testQ = orgId && envId
      ? `SELECT sum("messageCount") FROM "app_stats" WHERE "org_id" = '${orgId}' AND "env_id" = '${envId}' AND time >= ${startMs}ms and time <= ${endMs}ms GROUP BY time(5m) fill(0)`
      : 'SHOW MEASUREMENTS LIMIT 5';

    try {
      const { data: testResult } = await api.get(
        `/monitoring/api/visualizer/api/datasources/proxy/${dsId}/query`,
        { params: { db: dbName, q: testQ, epoch: 'ms' } },
      );

      if (testResult?.results) {
        _influxDatasourceId = dsId;
        _influxDbName = dbName;
        _influxAvailable = true;
        const measurements = testResult.results?.[0]?.series?.[0]?.values?.map((v: any) => v[0]) ?? [];
        logger.log(`[Monitoring] InfluxDB datasource VERIFIED: id=${dsId}, db=${dbName}, measurements=[${measurements.slice(0, 5).join(', ')}]`);
        return true;
      }
    } catch (testErr: any) {
      const errBody = testErr?.response?.data ? (typeof testErr.response.data === 'string' ? testErr.response.data : JSON.stringify(testErr.response.data)).slice(0, 200) : '';
      logger.log(`[Monitoring] Datasource ${dsId} (db=${dbName}) test failed: ${testErr?.response?.status ?? testErr?.message}${errBody ? ' body=' + errBody : ''}`);
      if (rawDbName && !rawDbName.startsWith('"')) {
        try {
          const { data: testResult2 } = await api.get(
            `/monitoring/api/visualizer/api/datasources/proxy/${dsId}/query`,
            { params: { db: rawDbName, q: testQ, epoch: 'ms' } },
          );
          if (testResult2?.results) {
            _influxDatasourceId = dsId;
            _influxDbName = rawDbName;
            _influxAvailable = true;
            logger.log(`[Monitoring] InfluxDB datasource VERIFIED (unquoted): id=${dsId}, db=${rawDbName}`);
            return true;
          }
        } catch (_) {
          // continue
        }
      }
    }

    return false;
  };

  // ── Step 1: List all datasources and find InfluxDB ones ──
  try {
    const { data } = await api.get('/monitoring/api/visualizer/api/datasources');
    logger.log(`[Monitoring] Datasources API returned: ${Array.isArray(data) ? data.length + ' entries' : typeof data}`);

    if (Array.isArray(data) && data.length > 0) {
      datasources = data;
      // Log datasource summary: total count and all types
      logger.log(`[Monitoring] Datasource list: ${data.length} total, types: ${[...new Set(data.map((d: any) => d.type))].join(', ')}`);
      // Log all datasources for debug
      for (const ds of data) {
        logger.log(`[Monitoring] Datasource: id=${ds.id}, type=${ds.type}, name=${ds.name}, db=${ds.database ?? ds.jsonData?.database ?? 'unknown'}`);
      }
    }
  } catch (err: any) {
    logger.log(`[Monitoring] Datasource list API failed: ${err?.response?.status ?? err?.message}`);
  }

  if (datasources.length === 0) {
    try {
      const { data } = await api.get('/monitoring/api/visualizer/api/bootdata');
      const bootDatasources = data?.Settings?.datasources ?? data?.settings?.datasources;
      if (bootDatasources && typeof bootDatasources === 'object') {
        datasources = Object.values(bootDatasources);
        logger.log(`[Monitoring] Bootdata returned ${datasources.length} datasource entries`);
      }
    } catch (err: any) {
      logger.log(`[Monitoring] Bootdata datasource fallback failed: ${err?.response?.status ?? err?.message}`);
    }
  }

  const influxDatasources = datasources.filter((ds: any) =>
    ds?.type === 'influxdb'
    || ds?.typeName === 'InfluxDB'
    || ds?.meta?.id === 'influxdb'
    || ds?.meta?.name === 'InfluxDB'
  );

  if (influxDatasources.length > 0) {
    logger.log(`[Monitoring] Found ${influxDatasources.length} InfluxDB datasource(s), testing each...`);
    for (const ds of influxDatasources) {
      if (await verifyInfluxDatasource(ds)) {
        return true;
      }
    }
  }

  _influxAvailable = false;
  logger.log(`[Monitoring] No working InfluxDB datasource found (tried ${_influxTriedCount} InfluxDB datasource(s))`);
  return false;
}

/**
 * Run an InfluxDB query via the Grafana proxy endpoint.
 * Supports multi-statement queries separated by semicolons.
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
 * Build an InfluxDB WHERE clause for a specific app.
 * Uses org_id, env_id, and app_id (fullDomain) tags.
 */
function buildInfluxWhere(
  orgId: string,
  envId: string,
  appIdentifiers: string[],
  startMs: number,
  endMs: number,
): string {
  const identifiers = Array.from(new Set(appIdentifiers.filter(Boolean)));
  const appClauses = identifiers.map((identifier) => `"app_id" = '${identifier}'`);

  if (appClauses.length === 0) {
    return `("org_id" = '${orgId}' AND "env_id" = '${envId}') AND time >= ${startMs}ms and time <= ${endMs}ms`;
  }

  return `("org_id" = '${orgId}' AND "env_id" = '${envId}' AND (${appClauses.join(' OR ')})) AND time >= ${startMs}ms and time <= ${endMs}ms`;
}

/**
 * Extra metrics extracted from InfluxDB (thread count, heap, GC, etc.)
 */
interface InfluxExtraMetrics {
  threadCount: number | null;
  heapUsed: number | null;
  heapCommitted: number | null;
  gcCollections: number | null;
  classesLoaded: number | null;
  messageCount: number | null;
  // Inbound HTTP metrics (from Anypoint Monitoring)
  inboundAvgResponseTime: number | null;
  inboundRequestCount: number | null;
  inboundErrorCount: number | null;
  // Outbound HTTP metrics
  outboundAvgResponseTime: number | null;
  outboundRequestCount: number | null;
  outboundErrorCount: number | null;
}

/**
 * Parse an InfluxDB query response into a monitoring metrics format.
 * InfluxDB returns: { results: [{ series: [{ name, columns, values }] }] }
 *
 * Handles multi-statement responses where each result set corresponds to
 * a different measurement (CPU, memory, threads, GC, etc.)
 */
function parseInfluxDBResults(data: any): {
  cpuPercent: number | null;
  memoryPercent: number | null;
  timeSeries: Array<{ timestamp: number; cpu: number | null; memory: number | null }>;
  extraMetrics: InfluxExtraMetrics;
} | null {
  const results = data?.results;
  if (!Array.isArray(results)) return null;

  let cpuPercent: number | null = null;
  let memoryPercent: number | null = null;
  const timeSeriesMap = new Map<number, { cpu: number | null; memory: number | null }>();
  const extra: InfluxExtraMetrics = {
    threadCount: null,
    heapUsed: null,
    heapCommitted: null,
    gcCollections: null,
    classesLoaded: null,
    messageCount: null,
    inboundAvgResponseTime: null,
    inboundRequestCount: null,
    inboundErrorCount: null,
    outboundAvgResponseTime: null,
    outboundRequestCount: null,
    outboundErrorCount: null,
  };

  for (const result of results) {
    const seriesList = result?.series;
    if (!Array.isArray(seriesList) || seriesList.length === 0) continue;

    for (const s of seriesList) {
      const columns: string[] = s.columns ?? [];
      const values: any[][] = s.values ?? [];
      const name = (s.name ?? '').toLowerCase();

      // Classify the measurement
      const isCpu = (name === 'worker' && columns.some((c: string) => c.includes('cpu')))
        || (name === 'jvm.cpu.operatingsystem' && columns.some((c: string) => c === 'mean' || c.includes('cpu')));
      const isMemory = (name === 'worker' && columns.some((c: string) => c.includes('memory')))
        || (name === 'jvm.cpu.operatingsystem' && columns.some((c: string) => c.includes('total_physical_memory_size')));
      const isThread = name.includes('threading');
      const isHeap = name.includes('jvm.memory') && columns.some((c: string) => c.includes('heap_used') || c.includes('heap_total'));
      const isHeapCommitted = name.includes('jvm.memory') && columns.some((c: string) => c.includes('heap_committed') || c.includes('heap_total'));
      const isGC = name.includes('garbagecollector');
      const isClasses = name.includes('classloading');
      const isAppStats = name === 'app_stats';
      const isAppInboundMetric = name === 'app_inbound_metric';
      const isAppOutboundMetric = name === 'app_outbound_metric';
      // HTTP inbound / outbound metrics (Anypoint Monitoring flow-level)
      const isHttpInbound = (name === 'http_inbound' || name === 'inbound')
        || (name === 'http' && (s.tags?.flow_type === 'inbound' || s.tags?.type === 'inbound' || columns.some((c: string) => c.includes('inbound'))));
      const isHttpOutbound = (name === 'http_outbound' || name === 'outbound')
        || (name === 'http' && (s.tags?.flow_type === 'outbound' || s.tags?.type === 'outbound' || columns.some((c: string) => c.includes('outbound'))));
      const isHttp = !isHttpInbound && !isHttpOutbound && (name === 'http' || name === 'http_summary');

      // Also detect by column names if measurement name is generic
      const hasCpuCol = columns.some((c: string) => c === 'mean' || c === 'cpu' || c === 'cpu_usage');
      const hasMemCol = columns.some((c: string) => c === 'mean' || c === 'memory' || c === 'memory_usage');

      const timeIdx = columns.indexOf('time');

      // Get the latest non-null value from the series
      let latestVal: number | null = null;
      let _latestTs: number = 0;

      for (const row of values) {
        if (!Array.isArray(row)) continue;
        const ts = timeIdx >= 0 ? row[timeIdx] : row[0];
        for (let ci = 0; ci < columns.length; ci++) {
          if (columns[ci] === 'time') continue;
          const val = row[ci];
          if (val == null) continue;
          latestVal = val;
          _latestTs = ts;
        }
      }

      // Assign to the appropriate metric
      if (isCpu || (name === 'worker_metric' && hasCpuCol)) {
        if (latestVal != null) cpuPercent = latestVal;
        // Build time series for CPU
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          const ts = timeIdx >= 0 ? row[timeIdx] : row[0];
          for (let ci = 0; ci < columns.length; ci++) {
            if (columns[ci] === 'time') continue;
            const val = row[ci];
            const entry = timeSeriesMap.get(ts) ?? { cpu: null, memory: null };
            entry.cpu = val;
            timeSeriesMap.set(ts, entry);
            break;
          }
        }
      } else if (isMemory || (name === 'worker_metric' && hasMemCol && !isCpu)) {
        if (latestVal != null) memoryPercent = latestVal;
        // Build time series for memory
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          const ts = timeIdx >= 0 ? row[timeIdx] : row[0];
          for (let ci = 0; ci < columns.length; ci++) {
            if (columns[ci] === 'time') continue;
            const val = row[ci];
            const entry = timeSeriesMap.get(ts) ?? { cpu: null, memory: null };
            entry.memory = val;
            timeSeriesMap.set(ts, entry);
            break;
          }
        }
      } else if (isThread && latestVal != null) {
        extra.threadCount = latestVal;
      } else if (isHeap && latestVal != null) {
        if (columns.some((c: string) => c.includes('heap_total'))) {
          extra.heapCommitted = latestVal;
        } else {
          extra.heapUsed = latestVal;
        }
      } else if (isHeapCommitted && latestVal != null) {
        extra.heapCommitted = latestVal;
      } else if (isGC && latestVal != null) {
        extra.gcCollections = latestVal;
      } else if (isClasses && latestVal != null) {
        extra.classesLoaded = latestVal;
      } else if (isAppStats && latestVal != null) {
        // Sum up message counts
        let totalMessages = 0;
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          for (let ci = 0; ci < columns.length; ci++) {
            if (columns[ci] === 'time') continue;
            if (row[ci] != null) totalMessages += row[ci];
            break;
          }
        }
        extra.messageCount = totalMessages;
        const responseTimeCol = columns.findIndex((c: string) => c.toLowerCase().includes('responsetime'));
        const errorCountCol = columns.findIndex((c: string) => c.toLowerCase().includes('errorcount'));
        let responseTimeTotal = 0;
        let responseTimeSamples = 0;
        let errorTotal = 0;
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          if (responseTimeCol >= 0 && row[responseTimeCol] != null) {
            responseTimeTotal += row[responseTimeCol];
            responseTimeSamples++;
          }
          if (errorCountCol >= 0 && row[errorCountCol] != null) {
            errorTotal += row[errorCountCol];
          }
        }
        if (responseTimeSamples > 0 && extra.inboundAvgResponseTime == null) {
          extra.inboundAvgResponseTime = Math.round(responseTimeTotal / responseTimeSamples);
        }
        if (errorTotal > 0 && extra.inboundErrorCount == null) {
          extra.inboundErrorCount = errorTotal;
        }
      } else if (isAppInboundMetric) {
        const rtCol = columns.findIndex((c: string) => c.includes('response_time.avg') || c.includes('responseTime') || c === 'mean');
        const countCol = columns.findIndex((c: string) => c.includes('avg_request_count'));
        let totalCount = 0;
        let totalRt = 0;
        let rtSamples = 0;
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          if (rtCol >= 0 && row[rtCol] != null) { totalRt += row[rtCol]; rtSamples++; }
          if (countCol >= 0 && row[countCol] != null) totalCount += row[countCol];
        }
        if (rtSamples > 0) extra.inboundAvgResponseTime = Math.round(totalRt / rtSamples);
        if (totalCount > 0) extra.inboundRequestCount = totalCount;
      } else if (isAppOutboundMetric) {
        const rtCol = columns.findIndex((c: string) => c.includes('response_time.avg') || c.includes('responseTime') || c === 'mean');
        const countCol = columns.findIndex((c: string) => c.includes('avg_request_count'));
        let totalCount = 0;
        let totalRt = 0;
        let rtSamples = 0;
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          if (rtCol >= 0 && row[rtCol] != null) { totalRt += row[rtCol]; rtSamples++; }
          if (countCol >= 0 && row[countCol] != null) totalCount += row[countCol];
        }
        if (rtSamples > 0) extra.outboundAvgResponseTime = Math.round(totalRt / rtSamples);
        if (totalCount > 0) extra.outboundRequestCount = totalCount;
      } else if (isHttpInbound || (isHttp && extra.inboundRequestCount == null)) {
        // Extract inbound HTTP metrics (response time, request count, errors)
        const rtCol = columns.findIndex((c: string) => c.includes('response_time') || c === 'mean');
        const countCol = columns.findIndex((c: string) => c.includes('count') || c.includes('request'));
        const errCol = columns.findIndex((c: string) => c.includes('error') || c.includes('failure'));
        let totalCount = 0; let totalRt = 0; let rtSamples = 0; let totalErrors = 0;
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          if (rtCol >= 0 && row[rtCol] != null) { totalRt += row[rtCol]; rtSamples++; }
          if (countCol >= 0 && row[countCol] != null) totalCount += row[countCol];
          if (errCol >= 0 && row[errCol] != null) totalErrors += row[errCol];
        }
        if (rtSamples > 0) extra.inboundAvgResponseTime = Math.round(totalRt / rtSamples);
        if (totalCount > 0) extra.inboundRequestCount = totalCount;
        if (totalErrors > 0) extra.inboundErrorCount = totalErrors;
      } else if (isHttpOutbound) {
        // Extract outbound HTTP metrics
        const rtCol = columns.findIndex((c: string) => c.includes('response_time') || c === 'mean');
        const countCol = columns.findIndex((c: string) => c.includes('count') || c.includes('request'));
        const errCol = columns.findIndex((c: string) => c.includes('error') || c.includes('failure'));
        let totalCount = 0; let totalRt = 0; let rtSamples = 0; let totalErrors = 0;
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          if (rtCol >= 0 && row[rtCol] != null) { totalRt += row[rtCol]; rtSamples++; }
          if (countCol >= 0 && row[countCol] != null) totalCount += row[countCol];
          if (errCol >= 0 && row[errCol] != null) totalErrors += row[errCol];
        }
        if (rtSamples > 0) extra.outboundAvgResponseTime = Math.round(totalRt / rtSamples);
        if (totalCount > 0) extra.outboundRequestCount = totalCount;
        if (totalErrors > 0) extra.outboundErrorCount = totalErrors;
      }
    }
  }

  if (
    cpuPercent == null &&
    memoryPercent == null &&
    timeSeriesMap.size === 0 &&
    extra.threadCount == null &&
    extra.messageCount == null &&
    extra.heapUsed == null
  ) {
    return null;
  }

  const timeSeries = Array.from(timeSeriesMap.entries())
    .map(([timestamp, metrics]) => ({ timestamp, ...metrics }))
    .sort((a, b) => a.timestamp - b.timestamp);

  return { cpuPercent, memoryPercent, timeSeries, extraMetrics: extra };
}

/**
 * Fetch monitoring metrics from InfluxDB for a specific application.
 *
 * Uses the REAL Anypoint Monitoring query format discovered from the web UI:
 *   - Measurements: app_stats, jvm.memory, jvm.threading, jvm.classloading,
 *                   jvm.garbagecollector.*, worker_metric, etc.
 *   - WHERE: org_id, env_id, app_id (fullDomain)
 *   - GROUP BY: time(1m), "worker_id"
 *   - fill(null)
 *
 * @param domain - the short domain name (e.g. "crm-profile-s")
 * @param periodMinutes - how far back to query
 * @param fullDomain - the full domain (e.g. "crm-profile-s.de-c1.eu1.cloudhub.io")
 * @param orgId - organization ID
 * @param envId - environment ID
 */
async function getInfluxDBMonitoringData(
  domain: string,
  periodMinutes: number,
  fullDomain?: string,
  orgId?: string,
  envId?: string,
): Promise<any | null> {
  if (!(await discoverInfluxDatasource())) return null;

  const org = orgId ?? getOrgId();
  const env = envId ?? getEnvId();
  if (!org || !env) {
    logger.log('[Monitoring] Cannot query InfluxDB — no org/env IDs');
    return null;
  }

  const appIds = Array.from(
    new Set(
      [
        fullDomain,
        domain,
        fullDomain ? fullDomain.split('.')[0] : null,
      ].filter((value): value is string => !!value),
    ),
  );

  const now = Date.now();
  const startMs = now - periodMinutes * 60 * 1000;
  const groupBy = periodMinutes <= 60 ? '1m' : '5m';
  const timeZone = 'Europe/Athens';
  const querySets = [
    fullDomain
      ? {
          label: 'fullDomain',
          ids: [fullDomain],
        }
      : null,
    {
      label: 'fallback',
      ids: appIds,
    },
  ].filter((querySet): querySet is { label: string; ids: string[] } => Boolean(querySet));

  for (const querySet of querySets) {
    const scopedWhere = buildInfluxWhere(org, env, querySet.ids, startMs, now);
    const queries = [
      `SELECT sum("messageCount") FROM "app_stats" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "app_id" fill(0) tz('${timeZone}')`,
      `SELECT mean("responseTime") FROM "app_stats" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "app_id" fill(none) tz('${timeZone}')`,
      `SELECT sum("errorCount") FROM "app_stats" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "app_id" fill(0) tz('${timeZone}')`,
      `SELECT sum("avg_request_count") FROM "app_inbound_metric" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "response_type" fill(0) tz('${timeZone}')`,
      `SELECT mean("response_time.avg") FROM "app_inbound_metric" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "app_id" fill(none) tz('${timeZone}')`,
      `SELECT sum("avg_request_count") FROM "app_outbound_metric" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "response_type" fill(0) tz('${timeZone}')`,
      `SELECT mean("response_time.avg") FROM "app_outbound_metric" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "app_id" fill(none) tz('${timeZone}')`,
      `SELECT mean("cpu") FROM "jvm.cpu.operatingsystem" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "worker_id" fill(null) tz('${timeZone}')`,
      `SELECT mean("total_physical_memory_size") FROM "jvm.cpu.operatingsystem" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "worker_id" fill(null) tz('${timeZone}')`,
      `SELECT mean("heap_used") FROM "jvm.memory" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "worker_id" fill(null) tz('${timeZone}')`,
      `SELECT max("heap_total") FROM "jvm.memory" WHERE ${scopedWhere} GROUP BY time(${groupBy}) fill(null) tz('${timeZone}')`,
      `SELECT mean("thread_count") FROM "jvm.threading" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "worker_id" fill(null) tz('${timeZone}')`,
    ];

    try {
      logger.log(
        `[Monitoring] InfluxDB query for ${domain} (${querySet.label}, appIds=${querySet.ids.join(', ')}): ${queries.length} statements, period=${periodMinutes}m`,
      );
      const result = await queryInfluxDB(queries.join(';'));
      if (!result?.results) {
        continue;
      }

      logger.log(`[Monitoring] InfluxDB returned ${result.results.length} result sets for ${domain}`);
      const parsed = parseInfluxDBResults(result);
      const hasInfluxData = parsed && (
        parsed.cpuPercent != null
        || parsed.memoryPercent != null
        || parsed.timeSeries.length > 0
        || parsed.extraMetrics.messageCount != null
        || parsed.extraMetrics.threadCount != null
        || parsed.extraMetrics.heapUsed != null
        || parsed.extraMetrics.heapCommitted != null
        || parsed.extraMetrics.inboundRequestCount != null
        || parsed.extraMetrics.outboundRequestCount != null
        || parsed.extraMetrics.inboundAvgResponseTime != null
        || parsed.extraMetrics.outboundAvgResponseTime != null
      );

      if (hasInfluxData) {
        logger.log(
          `[Monitoring] InfluxDB SUCCESS for ${domain}: CPU=${parsed!.cpuPercent?.toFixed(1)}%, Mem=${parsed!.memoryPercent?.toFixed(1)}%, MsgCount=${parsed!.extraMetrics.messageCount}`,
        );
        return {
          _source: 'influxdb',
          workerStatistics: [{
            statistics: {
              ...(parsed!.cpuPercent != null ? { cpu: { [now]: parsed!.cpuPercent } } : {}),
              ...(parsed!.memoryPercent != null ? { memoryPercentageUsed: { [now]: parsed!.memoryPercent } } : {}),
            },
          }],
          _timeSeries: parsed!.timeSeries,
          _extraMetrics: parsed!.extraMetrics,
        };
      }

      logger.log(
        `[Monitoring] InfluxDB returned no usable data for ${domain} using ${querySet.label} ids`,
      );
    } catch (err: any) {
      logger.log(
        `[Monitoring] InfluxDB query failed for ${domain} using ${querySet.label}: ${err?.response?.status ?? err?.message}`,
      );
    }
  }

  logger.log(`[Monitoring] InfluxDB queries returned no data for ${domain} (appIds=${appIds.join(', ')})`);
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
    logger.log(`[getDashboardStats] Fast-path exit for "${domain}" — all sources disabled`);
    return null;
  }

  logger.log(`[getDashboardStats] Called for "${domain}" | dashStats=${dashboardStatsAvailable} monApi=${monitoringApiAvailable} influx=${_influxAvailable} checkDone=${_dashStatsCheckDone}`);

  const now = Date.now();
  const startMs = now - periodMinutes * 60 * 1000;

  const orgId = context?.organizationId ?? getOrgId();
  const envId = context?.environmentId ?? getEnvId();

  // --- Primary: Try the app detail endpoint FIRST ---
  // Use retreiveStatistics=true to request worker statistics alongside the detail.
  // The response includes workerStatuses with host/status info.
  let _appFullDomain: string | undefined;
  let _appPlatformId: string | undefined;
  let _appName: string | undefined;
  try {
    const { data: appDetail } = await api.get(`${CLOUDHUB_BASE}/applications/${domain}`, {
      params: { retreiveStatistics: true },
    });
    if (appDetail) {
      // Cache the fullDomain for InfluxDB queries
      _appFullDomain = appDetail.fullDomain;
      _appPlatformId = appDetail.fullDomain ?? appDetail.id;
      _appName = appDetail.name ?? appDetail.domain ?? domain;

      const ws = appDetail.workerStatuses ?? appDetail.workers?.statuses;
      // Check if workerStatuses has actual statistics (not just host/status info)
      const hasStats = Array.isArray(ws)
        ? ws.some((w: any) => w.statisticsByWorker || w.statistics || w.cpu != null)
        : ws && typeof ws === 'object' && Object.values(ws).some((w: any) =>
            (w as any)?.statisticsByWorker || (w as any)?.statistics || (w as any)?.cpu != null
          );
      if (hasStats) {
        return appDetail; // Return the full app detail — extractMetrics handles it
      }

      // Log diagnostics
      const monitoringEnabled = appDetail.monitoringEnabled ?? appDetail.monitoring?.enabled ?? false;
      const wsType = ws == null ? 'null' : Array.isArray(ws) ? `array(${ws.length})` : `object(${Object.keys(ws).length})`;
      const hasKeys = appDetail ? Object.keys(appDetail).filter(k =>
        k.includes('worker') || k.includes('monitor') || k.includes('stat')
      ).join(',') : '';
      logger.log(`[getDashboardStats] App detail for ${domain}: monitoringEnabled=${monitoringEnabled}, fullDomain=${_appFullDomain}, workerStatuses=${wsType}, hasStats=${hasStats}, relevant keys=[${hasKeys}]`);
    }
  } catch (_) {
    // App detail fetch failed, try other sources
  }

  const amqlScopeClauses = orgId && envId
    ? buildAmqlScopeClauses(orgId, envId, {
        platformId: _appPlatformId,
        name: _appName ?? domain,
        domain,
      })
    : [];
  const amqlDiscoveryClause = orgId && envId
    ? buildAmqlBaseFilterSets(orgId, envId).map((filters) => filters.join(' AND '))
    : [];

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
        logger.log('[getDashboardStats] Discovery gate: testing dashboardStats...');
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
          logger.log('[getDashboardStats] dashboardStats endpoints return 404 — disabling for session');
        }

        // ── Test monitoring/observability endpoints ──
        logger.log('[getDashboardStats] Discovery gate: testing monitoring APIs...');
        if (orgId && envId) {
          let discoveredMetricTypes: string[] = [];
          try {
            discoveredMetricTypes = await getObservabilityMetricTypes();
            logger.log(`[getDashboardStats] Available metric types: [${discoveredMetricTypes.slice(0, 15).join(', ')}]`);
          } catch (err: any) {
            logger.log(`[getDashboardStats] metric_types discovery failed: ${err?.response?.status ?? err?.message}`);
          }

          const discoveryInboundMetric = pickMetricType(
            discoveredMetricTypes,
            ['mulesoft.app.request', 'mulesoft.app.inbound'],
            [/mulesoft\.app\.(?:inbound|request)$/i],
          );
          const discoveryMessageMetric = pickMetricType(
            discoveredMetricTypes,
            ['mulesoft.app.message'],
            [/mulesoft\.app\.message/i],
          );

          let monFound = false;
          if (discoveredMetricTypes.length > 0) {
            monFound = true;
          }
          const monTests: Array<() => Promise<any>> = [
            async () => {
              if (!_archiveAvailable) throw new Error('Archive disabled');
              try {
                return await api.post(`/monitoring/archive/api/v1/organizations/${orgId}/environments/${envId}/query`, {
                  targets: [{ target: 'worker-cpu-usage', type: 'timeserie' }],
                  range: { from: fromIso, to: toIso },
                  app: testDomain,
                });
              } catch (err: any) {
                if (err?.response?.status === 404 || err?.response?.status === 405) {
                  _archiveAvailable = false;
                  logger.log('[getDashboardStats] monitoring-archive returned 404/405 — disabling for session');
                }
                throw err;
              }
            },
          ];

          if (discoveryInboundMetric && amqlDiscoveryClause.length > 0) {
            monTests.push(() => api.post('/observability/api/v1/metrics:search', {
              query: buildAmqlQuery(
                discoveryInboundMetric,
                'COUNT(requests) AS requestCount',
                amqlDiscoveryClause[0],
                startMs,
                now,
                'PT1H',
              ),
            }));
          }

          if (discoveryMessageMetric && amqlDiscoveryClause.length > 0) {
            monTests.push(() => api.post('/observability/api/v1/metrics:search', {
              query: buildAmqlQuery(
                discoveryMessageMetric,
                'SUM("total_count") AS totalCount',
                amqlDiscoveryClause[0],
                startMs,
                now,
              ),
            }));
          }

          for (const attempt of monTests) {
            try {
              const { data } = await attempt();
              if (isObservabilityDataPresent(data) || data) { monFound = true; break; }
            } catch (err: any) {
              const s = err?.response?.status;
              logger.log(`[getDashboardStats] Monitoring API test failed: status=${s}`);
              // Continue to try next endpoint
            }
          }
          if (!monFound) {
            monitoringApiAvailable = false;
            logger.log('[getDashboardStats] Monitoring APIs unavailable — disabling for session');
          }
        } else {
          // No org/env → can't use monitoring APIs
          monitoringApiAvailable = false;
        }

        // ── Test InfluxDB proxy (the REAL monitoring endpoint) ──
        // This is the Grafana-style datasource proxy that the Anypoint web UI uses.
        logger.log('[getDashboardStats] Discovery gate: testing InfluxDB proxy...');
        if (_influxAvailable === null) {
          await discoverInfluxDatasource();
        }

        logger.log('[getDashboardStats] Discovery complete:', { dashboardStatsAvailable, monitoringApiAvailable, _influxAvailable });
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

    // Determine appropriate time interval based on the period
    const amqlInterval = periodMinutes <= 60 ? 'PT1M' : periodMinutes <= 720 ? 'PT1H' : 'P1D';

    const monAttempts: Array<{ label: string; fn: () => Promise<any> }> = [
      // Grafana-style monitoring archive query (requires Titanium/Platinum)
      {
        label: 'monitoring-archive',
        fn: async () => {
          if (!_archiveAvailable) throw new Error('Archive disabled');
          try {
            return await api.post(`/monitoring/archive/api/v1/organizations/${orgId}/environments/${envId}/query`, {
              targets: [
                { target: 'worker-cpu-usage', type: 'timeserie' },
                { target: 'worker-memory-usage', type: 'timeserie' },
                { target: 'worker-thread-count', type: 'timeserie' },
              ],
              range: { from: fromIso, to: toIso },
              app: domain,
            });
          } catch (err: any) {
            if (err?.response?.status === 404 || err?.response?.status === 405) {
              _archiveAvailable = false;
              logger.log('[getDashboardStats] monitoring-archive returned 404/405 — disabling for session');
            }
            throw err;
          }
        },
      },
      // Observability Metrics API — inbound request metrics (correct AMQL)
    ];

    for (const attempt of monAttempts) {
      try {
        const { data } = await attempt.fn();
        if (data) {
          logger.log(`[getDashboardStats] ${attempt.label} returned data for ${domain}`);
          // Tag the response with source info
          if (typeof data === 'object' && !Array.isArray(data)) {
            data._source = attempt.label;
          }
          return data;
        }
      } catch (err: any) {
        logger.log(`[getDashboardStats] ${attempt.label} failed: ${err?.response?.status ?? err?.message}`);
      }
    }

    let metricTypes: string[] = [];
    try {
      metricTypes = await getObservabilityMetricTypes();
    } catch (err: any) {
      logger.log(`[getDashboardStats] observability metric_types unavailable: ${err?.response?.status ?? err?.message}`);
    }

    const inboundMetricType = pickMetricType(
      metricTypes,
      ['mulesoft.app.request', 'mulesoft.app.inbound'],
      [/mulesoft\.app\.(?:inbound|request)$/i],
    );
    const outboundMetricType = pickMetricType(
      metricTypes,
      ['mulesoft.app.outbound.request', 'mulesoft.app.outbound'],
      [/mulesoft\.app\.outbound(?:\.request)?$/i],
    );
    const messageMetricType = pickMetricType(
      metricTypes,
      ['mulesoft.app.message'],
      [/mulesoft\.app\.message/i],
    );
    const jvmMetricType = pickMetricType(
      metricTypes,
      ['mulesoft.flex.system.metric', 'mulesoft.app.jvm', 'mulesoft.entity'],
      [/mulesoft\.flex\.system\.metric/i, /mulesoft\.app\.jvm/i, /jvm/i, /entity/i],
    );
    const workerMetricType = pickMetricType(
      metricTypes,
      ['mulesoft.flex.system.metric', 'mulesoft.app.worker', 'mulesoft.worker', 'mulesoft.entity'],
      [/mulesoft\.flex\.system\.metric/i, /worker/i, /entity/i],
    );

    const runObservabilityQuery = async (
      metricType: string,
      selectClause: string,
      whereClauses: string[],
    ): Promise<any | null> => {
      let lastError: any = null;
      for (const whereClause of whereClauses) {
        try {
          const { data } = await api.post('/observability/api/v1/metrics:search', {
            query: buildAmqlQuery(metricType, selectClause, whereClause, startMs, now, amqlInterval),
          });
          if (isObservabilityDataPresent(data)) return data;
          logger.log(`[getDashboardStats] observability query returned no rows for metric=${metricType} where=${whereClause}`);
        } catch (err: any) {
          lastError = err;
        }
      }
      if (lastError) throw lastError;
      return null;
    };

    const observabilityResult: any = {
      _source: 'observability',
      _timeSeries: [] as Array<Record<string, number>>,
      _extraMetrics: {} as Record<string, number>,
      _jvmMetrics: {} as Record<string, number>,
      _appMetrics: {
        inboundRequestCount: null as number | null,
        inboundAvgResponseTime: null as number | null,
        outboundRequestCount: null as number | null,
        outboundAvgResponseTime: null as number | null,
        messageCount: null as number | null,
        errorCount: null as number | null,
      },
    };
    let hasAnyObservabilityData = false;
    const timeSeriesMap = new Map<number, Record<string, number>>();

    const getTimeSeriesPoint = (timestamp: number): Record<string, number> => {
      const existing = timeSeriesMap.get(timestamp);
      if (existing) return existing;
      const created: Record<string, number> = { timestamp };
      timeSeriesMap.set(timestamp, created);
      return created;
    };

    const appMetricAttempts: Array<{
      label: string;
      metricType: string | null;
      selectClause: string;
    }> = [
      {
        label: 'observability-inbound',
        metricType: inboundMetricType,
        selectClause: 'timestamp, COUNT(requests) AS requestCount, AVG("response_time") AS avgResponseTime',
      },
      {
        label: 'observability-messages',
        metricType: messageMetricType,
        selectClause: 'timestamp, SUM("total_count") AS totalCount, SUM("error_count") AS errorCount',
      },
      {
        label: 'observability-outbound',
        metricType: outboundMetricType,
        selectClause: 'timestamp, COUNT(requests) AS requestCount, AVG("response_time") AS avgResponseTime',
      },
    ];

    logger.log(
      `[getDashboardStats] Observability candidates for ${domain}: inbound=${inboundMetricType ?? 'none'}, outbound=${outboundMetricType ?? 'none'}, messages=${messageMetricType ?? 'none'}, jvm=${jvmMetricType ?? 'none'}, worker=${workerMetricType ?? 'none'}, scopeClauses=${amqlScopeClauses.length}`,
    );

    for (const attempt of appMetricAttempts) {
      if (!attempt.metricType || amqlScopeClauses.length === 0) continue;
      try {
        const data = await runObservabilityQuery(attempt.metricType, attempt.selectClause, amqlScopeClauses);
        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
          hasAnyObservabilityData = true;
          for (const row of data.data) {
            const timestamp = Number(
              row.timestamp ??
              row.TIMESTAMP ??
              row.time ??
              row.ts ??
              row.window_start ??
              0,
            );
            const point = timestamp > 0 ? getTimeSeriesPoint(timestamp) : null;
            const requestCount = Number(row.requestCount ?? row.REQUESTCOUNT ?? row['COUNT(requests)'] ?? NaN);
            const avgResponseTime = Number(row.avgResponseTime ?? row.AVGRESPONSETIME ?? row['AVG(response_time)'] ?? NaN);
            const totalCount = Number(row.totalCount ?? row.TOTALCOUNT ?? row['SUM(total_count)'] ?? NaN);
            const errorCount = Number(row.errorCount ?? row.ERRORCOUNT ?? row['SUM(error_count)'] ?? NaN);

            if (Number.isFinite(requestCount)) {
              if (attempt.label.includes('outbound')) {
                observabilityResult._appMetrics.outboundRequestCount = (observabilityResult._appMetrics.outboundRequestCount ?? 0) + requestCount;
                if (point) point.outboundRequests = requestCount;
              } else {
                observabilityResult._appMetrics.inboundRequestCount = (observabilityResult._appMetrics.inboundRequestCount ?? 0) + requestCount;
                if (point) point.inboundRequests = requestCount;
              }
            }

            if (Number.isFinite(avgResponseTime)) {
              if (attempt.label.includes('outbound')) {
                observabilityResult._appMetrics.outboundAvgResponseTime = avgResponseTime;
                if (point) point.outboundResponseTime = avgResponseTime;
              } else {
                observabilityResult._appMetrics.inboundAvgResponseTime = avgResponseTime;
                if (point) point.inboundResponseTime = avgResponseTime;
              }
            }

            if (Number.isFinite(totalCount)) {
              observabilityResult._appMetrics.messageCount = (observabilityResult._appMetrics.messageCount ?? 0) + totalCount;
              if (point) point.messageCount = totalCount;
            }

            if (Number.isFinite(errorCount)) {
              observabilityResult._appMetrics.errorCount = (observabilityResult._appMetrics.errorCount ?? 0) + errorCount;
              if (point) point.inboundErrors = errorCount;
            }
          }
        }
      } catch (err: any) {
        logger.log(`[getDashboardStats] ${attempt.label} failed: ${err?.response?.status ?? err?.message}`);
      }
    }

    const observabilityInfraAttempts: Array<{
      label: string;
      metricType: string | null;
      selectClause: string | null;
      whereClauses: string[];
    }> = [];

    if (workerMetricType && amqlScopeClauses.length > 0) {
      try {
        const workerDescriptor = await describeObservabilityMetricType(workerMetricType);
        logger.log(
          `[getDashboardStats] worker metric descriptor for ${domain}: ${workerMetricType} -> [${workerDescriptor.measurements.slice(0, 20).join(', ')}]`,
        );
        logger.log(
          `[getDashboardStats] worker metric descriptor dims for ${domain}: ${workerMetricType} -> [${workerDescriptor.dimensions.slice(0, 20).join(', ')}]`,
        );
        const workerScopeClauses = buildDescriptorAwareScopeClauses(
          orgId,
          envId,
          {
            platformId: _appPlatformId,
            name: _appName ?? domain,
            domain,
          },
          workerDescriptor.dimensions,
        );
        const workerCpuMeasurement = pickMeasurement(workerDescriptor.measurements, [
          /process.*cpu/i,
          /system.*cpu/i,
          /cpu.*(?:usage|load|percent|pct)/i,
          /^cpu$/i,
        ]);
        const workerMemoryPercentMeasurement = pickMeasurement(workerDescriptor.measurements, [
          /memory.*(?:usage|percent|pct)/i,
          /memory.*used.*percent/i,
        ]);
        const workerMemoryUsedMeasurement = pickMeasurement(workerDescriptor.measurements, [
          /heap.*used/i,
          /physical.*memory.*used/i,
          /used.*memory/i,
          /memory.*(?:used|usage)/i,
        ]);
        const workerMemoryTotalMeasurement = pickMeasurement(workerDescriptor.measurements, [
          /heap.*(?:total|max|committed)/i,
          /physical.*memory.*(?:total|size)/i,
          /memory.*(?:total|max|limit|committed)/i,
        ]);

        const workerSelects = ['timestamp'];
        if (workerCpuMeasurement) workerSelects.push(`AVG("${workerCpuMeasurement}") AS cpuPercent`);
        if (workerMemoryPercentMeasurement) workerSelects.push(`AVG("${workerMemoryPercentMeasurement}") AS memoryPercent`);
        if (workerMemoryUsedMeasurement) workerSelects.push(`AVG("${workerMemoryUsedMeasurement}") AS memoryUsed`);
        if (workerMemoryTotalMeasurement) workerSelects.push(`AVG("${workerMemoryTotalMeasurement}") AS memoryTotal`);
        if (workerSelects.length > 1) {
          observabilityInfraAttempts.push({
            label: 'observability-worker',
            metricType: workerMetricType,
            selectClause: workerSelects.join(', '),
            whereClauses: workerScopeClauses,
          });
        }
      } catch (err: any) {
        logger.log(`[getDashboardStats] worker metric describe failed: ${err?.response?.status ?? err?.message}`);
      }
    }

    if (jvmMetricType && amqlScopeClauses.length > 0) {
      try {
        const jvmDescriptor = await describeObservabilityMetricType(jvmMetricType);
        logger.log(
          `[getDashboardStats] jvm metric descriptor for ${domain}: ${jvmMetricType} -> [${jvmDescriptor.measurements.slice(0, 20).join(', ')}]`,
        );
        logger.log(
          `[getDashboardStats] jvm metric descriptor dims for ${domain}: ${jvmMetricType} -> [${jvmDescriptor.dimensions.slice(0, 20).join(', ')}]`,
        );
        const jvmScopeClauses = buildDescriptorAwareScopeClauses(
          orgId,
          envId,
          {
            platformId: _appPlatformId,
            name: _appName ?? domain,
            domain,
          },
          jvmDescriptor.dimensions,
        );
        const jvmCpuMeasurement = pickMeasurement(jvmDescriptor.measurements, [
          /process.*cpu/i,
          /system.*cpu/i,
          /cpu.*(?:usage|load|percent|pct)/i,
          /^cpu$/i,
        ]);
        const heapUsedMeasurement = pickMeasurement(jvmDescriptor.measurements, [/heap.*used/i]);
        const heapCommittedMeasurement = pickMeasurement(jvmDescriptor.measurements, [/heap.*(?:committed|max|total)/i]);
        const nonHeapUsedMeasurement = pickMeasurement(jvmDescriptor.measurements, [/non.*heap.*used/i]);
        const threadCountMeasurement = pickMeasurement(jvmDescriptor.measurements, [/thread.*count/i, /^threads$/i]);
        const classesLoadedMeasurement = pickMeasurement(jvmDescriptor.measurements, [/classes.*loaded/i]);
        const gcCollectionsMeasurement = pickMeasurement(jvmDescriptor.measurements, [/garbage.*collection.*count/i, /gc.*count/i, /collections/i]);
        const gcTimeMeasurement = pickMeasurement(jvmDescriptor.measurements, [/garbage.*collection.*time/i, /gc.*time/i]);

        const jvmSelects = ['timestamp'];
        if (jvmCpuMeasurement) jvmSelects.push(`AVG("${jvmCpuMeasurement}") AS cpuPercent`);
        if (heapUsedMeasurement) jvmSelects.push(`AVG("${heapUsedMeasurement}") AS heapUsed`);
        if (heapCommittedMeasurement) jvmSelects.push(`AVG("${heapCommittedMeasurement}") AS heapCommitted`);
        if (nonHeapUsedMeasurement) jvmSelects.push(`AVG("${nonHeapUsedMeasurement}") AS nonHeapUsed`);
        if (threadCountMeasurement) jvmSelects.push(`AVG("${threadCountMeasurement}") AS threadCount`);
        if (classesLoadedMeasurement) jvmSelects.push(`AVG("${classesLoadedMeasurement}") AS classesLoaded`);
        if (gcCollectionsMeasurement) jvmSelects.push(`AVG("${gcCollectionsMeasurement}") AS gcCollections`);
        if (gcTimeMeasurement) jvmSelects.push(`AVG("${gcTimeMeasurement}") AS gcTime`);
        if (jvmSelects.length > 1) {
          observabilityInfraAttempts.push({
            label: 'observability-jvm',
            metricType: jvmMetricType,
            selectClause: jvmSelects.join(', '),
            whereClauses: jvmScopeClauses,
          });
        }
      } catch (err: any) {
        logger.log(`[getDashboardStats] jvm metric describe failed: ${err?.response?.status ?? err?.message}`);
      }
    }

    for (const attempt of observabilityInfraAttempts) {
      if (!attempt.metricType || !attempt.selectClause || attempt.whereClauses.length === 0) continue;
      try {
        const data = await runObservabilityQuery(attempt.metricType, attempt.selectClause, attempt.whereClauses);
        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
          hasAnyObservabilityData = true;
          for (const row of data.data) {
            const timestamp = Number(row.timestamp ?? row.TIMESTAMP ?? row.time ?? row.ts ?? 0);
            const point = timestamp > 0 ? getTimeSeriesPoint(timestamp) : null;
            const cpuPercent = Number(row.cpuPercent ?? row.CPUPERCENT ?? NaN);
            const memoryPercent = Number(row.memoryPercent ?? row.MEMORYPERCENT ?? NaN);
            const memoryUsed = Number(row.memoryUsed ?? row.MEMORYUSED ?? NaN);
            const memoryTotal = Number(row.memoryTotal ?? row.MEMORYTOTAL ?? NaN);
            const heapUsed = Number(row.heapUsed ?? row.HEAPUSED ?? NaN);
            const heapCommitted = Number(row.heapCommitted ?? row.HEAPCOMMITTED ?? NaN);
            const nonHeapUsed = Number(row.nonHeapUsed ?? row.NONHEAPUSED ?? NaN);
            const threadCount = Number(row.threadCount ?? row.THREADCOUNT ?? NaN);
            const classesLoaded = Number(row.classesLoaded ?? row.CLASSESLOADED ?? NaN);
            const gcCollections = Number(row.gcCollections ?? row.GCCOLLECTIONS ?? NaN);
            const gcTime = Number(row.gcTime ?? row.GCTIME ?? NaN);

            if (Number.isFinite(cpuPercent)) {
              observabilityResult._extraMetrics.cpuPercent = cpuPercent;
              observabilityResult._jvmMetrics.cpuUsage = observabilityResult._jvmMetrics.cpuUsage ?? cpuPercent;
              if (point) point.cpu = cpuPercent;
            }
            if (Number.isFinite(memoryPercent)) {
              observabilityResult._extraMetrics.memoryPercent = memoryPercent;
              if (point) point.memory = memoryPercent;
            }
            if (Number.isFinite(memoryUsed)) observabilityResult._extraMetrics.memoryUsed = memoryUsed;
            if (Number.isFinite(memoryTotal)) observabilityResult._extraMetrics.memoryTotal = memoryTotal;
            if (Number.isFinite(heapUsed)) {
              observabilityResult._jvmMetrics.heapUsed = heapUsed;
              if (point) point.heapUsed = heapUsed;
            }
            if (Number.isFinite(heapCommitted)) {
              observabilityResult._jvmMetrics.heapCommitted = heapCommitted;
              if (point) point.heapCommitted = heapCommitted;
            }
            if (Number.isFinite(nonHeapUsed)) observabilityResult._jvmMetrics.nonHeapUsed = nonHeapUsed;
            if (Number.isFinite(threadCount)) {
              observabilityResult._jvmMetrics.threadCount = threadCount;
              if (point) point.threadCount = threadCount;
            }
            if (Number.isFinite(classesLoaded)) observabilityResult._jvmMetrics.classesLoaded = classesLoaded;
            if (Number.isFinite(gcCollections)) observabilityResult._jvmMetrics.gcCollections = gcCollections;
            if (Number.isFinite(gcTime)) observabilityResult._jvmMetrics.gcTime = gcTime;

            if (
              !Number.isFinite(memoryPercent) &&
              Number.isFinite(memoryUsed) &&
              Number.isFinite(memoryTotal) &&
              memoryTotal > 0
            ) {
              const derivedPercent = Math.round((memoryUsed / memoryTotal) * 100);
              observabilityResult._extraMetrics.memoryPercent = derivedPercent;
              if (point) point.memory = derivedPercent;
            } else if (
              !Number.isFinite(memoryPercent) &&
              Number.isFinite(heapUsed) &&
              Number.isFinite(heapCommitted) &&
              heapCommitted > 0
            ) {
              const derivedPercent = Math.round((heapUsed / heapCommitted) * 100);
              observabilityResult._extraMetrics.memoryPercent = derivedPercent;
              if (point) point.memory = derivedPercent;
            }
          }
        }
      } catch (err: any) {
        logger.log(`[getDashboardStats] ${attempt.label} failed: ${err?.response?.status ?? err?.message}`);
      }
    }

    if (hasAnyObservabilityData) {
      observabilityResult._timeSeries = Array.from(timeSeriesMap.values()).sort(
        (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
      );
      logger.log(`[getDashboardStats] Observability API returned app-level metrics for ${domain}:`, observabilityResult._appMetrics);
      return observabilityResult;
    }
  }

  // --- JVM metrics endpoint (direct monitoring API) ---
  if (orgId && envId && _legacyJvmApiAvailable) {
    try {
      const jvmData = await monitoringService.getJVMMetrics(orgId, envId, domain);
      if (jvmData && typeof jvmData === 'object' && Object.keys(jvmData).length > 0) {
        logger.log(`[getDashboardStats] JVM endpoint returned data for ${domain}:`, Object.keys(jvmData).join(', '));
        return {
          _source: 'jvm-endpoint',
          _jvmMetrics: jvmData,
        };
      }
    } catch (err: any) {
      if (err?.response?.status === 404 || err?.response?.status === 405) {
        _legacyJvmApiAvailable = false;
      }
      logger.log(`[getDashboardStats] JVM endpoint failed for ${domain}: ${err?.response?.status ?? err?.message}`);
    }
  }

  // --- Monitoring metrics endpoint (POST metrics API) ---
  if (orgId && envId && _legacyMetricsApiAvailable) {
    try {
      const fromIso = new Date(startMs).toISOString();
      const toIso = new Date(now).toISOString();
      const metricsData = await monitoringService.getMetrics(orgId, envId, {
        resourceId: domain,
        metricNames: ['cpu.usage', 'memory.usage', 'memory.total'],
        startDate: fromIso,
        endDate: toIso,
        interval: 'PT1M',
      });
      if (metricsData && Array.isArray(metricsData) && metricsData.length > 0) {
        logger.log(`[getDashboardStats] Monitoring metrics endpoint returned ${metricsData.length} series for ${domain}`);
        return {
          _source: 'monitoring-metrics',
          _metricSeries: metricsData,
        };
      }
    } catch (err: any) {
      if (err?.response?.status === 404 || err?.response?.status === 405) {
        _legacyMetricsApiAvailable = false;
      }
      logger.log(`[getDashboardStats] Monitoring metrics endpoint failed for ${domain}: ${err?.response?.status ?? err?.message}`);
    }
  }

  // --- InfluxDB proxy (the real Anypoint Monitoring endpoint) ---
  if (_influxAvailable) {
    try {
      const influxData = await getInfluxDBMonitoringData(
        domain,
        periodMinutes,
        _appFullDomain,  // pass the fullDomain for accurate app_id filtering
        orgId,
        envId,
      );
      if (influxData) return influxData;
    } catch (err: any) {
      logger.log(`[getDashboardStats] InfluxDB query failed for ${domain}: ${err?.message}`);
    }
  }

  // --- CloudHub 2.0 deployment detail (AMC API) — may contain replica status ---
  const amcPath = amcDeploymentsPath();
  if (amcPath) {
    try {
      const { data: deps } = await api.get(amcPath);
      const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
      const match = items.find((d: any) => matchDeployment(d, domain));
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
        dashboardStatsAvailable = false;
      } else {
        throw err;
      }
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

  try {
    const periodMinutes = Math.max(1, Math.ceil((endMs - startMs) / 60000));
    const dashboardLike = await getDashboardStats(domain, periodMinutes);

    if (Array.isArray(dashboardLike?._timeSeries)) {
      if (params.metricName === 'cpu') {
        const series = dashboardLike._timeSeries
          .filter((point: any) => point?.timestamp != null && point?.cpu != null)
          .map((point: any) => ({ timestamp: Number(point.timestamp), value: Number(point.cpu) }));
        if (series.length > 0) return series;
      }

      if (params.metricName === 'memory') {
        const series = dashboardLike._timeSeries
          .filter((point: any) => point?.timestamp != null && (point?.memory != null || point?.heapUsed != null))
          .map((point: any) => ({
            timestamp: Number(point.timestamp),
            value: Number(point.memory ?? point.heapUsed),
          }));
        if (series.length > 0) return series;
      }
    }

    const statsSource = dashboardLike?.workerStatistics ?? dashboardLike;
    for (const fieldName of fieldNames) {
      const series = extractTimeSeries(statsSource, fieldName);
      if (series.length > 0) return series;
    }
  } catch (_) {
    // The dashboard query is handled independently in the monitoring screens.
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

