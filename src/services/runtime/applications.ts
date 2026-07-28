// ============================================================
// Anypoint Mobile Platform - Runtime Manager Service
// Applications: listing, detail, lifecycle, deployment, workers,
// and property management (CloudHub 1.0 + CloudHub 2.0 / AMC)
// ============================================================

import api from '../api';
import logger from '../../utils/logger';
import type {
  Application,
  DeploymentRequest,
} from '../../types';
import {
  CLOUDHUB_BASE,
  CLOUDHUB_V1,
  AMC_BASE,
  HYBRID_BASE,
  getOrgId,
  getEnvId,
  amcDeploymentsPath,
  matchDeployment,
  normalizeDeployment,
} from './shared';

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
 * List applications for a specific org/environment without mutating the active app headers.
 * Used by cross-environment comparison features.
 */
export async function getApplicationsForEnvironment(
  organizationId: string,
  environmentId: string,
  params?: {
    offset?: number;
    limit?: number;
  },
): Promise<Application[]> {
  const errors: string[] = [];
  const scopedHeaders = {
    'X-ANYPNT-ORG-ID': organizationId,
    'X-ANYPNT-ENV-ID': environmentId,
  };

  let ch1Apps: Application[] = [];
  try {
    const { data } = await api.get(`${CLOUDHUB_BASE}/applications`, {
      params,
      headers: scopedHeaders,
    });
    if (Array.isArray(data)) ch1Apps = data;
    else if (data && typeof data === 'object') {
      const d = data as any;
      ch1Apps = d.data ?? d.applications ?? d.items ?? [];
    }
  } catch (err: any) {
    errors.push(`CH1: ${err?.response?.status ?? 'ERR'} ${err?.response?.data?.message ?? err?.message ?? ''}`);
  }

  let ch2Apps: Application[] = [];
  try {
    const { data } = await api.get(
      `${AMC_BASE}/organizations/${organizationId}/environments/${environmentId}/deployments`,
    );
    const items = Array.isArray(data) ? data : (data?.items ?? data?.data ?? []);
    ch2Apps = items.map(normalizeDeployment);
  } catch (err: any) {
    errors.push(`CH2: ${err?.response?.status ?? 'ERR'} ${err?.response?.data?.message ?? err?.message ?? ''}`);
  }

  if (ch1Apps.length === 0 && ch2Apps.length === 0) {
    try {
      const { data } = await api.get(`${HYBRID_BASE}/applications`, { headers: scopedHeaders });
      const items = Array.isArray(data) ? data : (data?.data ?? data?.items ?? []);
      if (items.length > 0) return items;
    } catch (err: any) {
      errors.push(`Hybrid: ${err?.response?.status ?? 'ERR'}`);
    }
  }

  if (ch1Apps.length === 0 && ch2Apps.length === 0 && errors.length > 0) {
    throw new Error(`Failed to load applications: ${errors.join(' | ')}`);
  }

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
