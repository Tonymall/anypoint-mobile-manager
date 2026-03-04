// ============================================================
// Anypoint Mobile Platform - Runtime Manager Service
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
const RUNTIME_BASE = '/armui/api/v1';

// ---------- Applications ----------

/**
 * List all applications for the current environment.
 * CloudHub v2 returns an array of applications directly.
 */
export async function getApplications(params?: {
  environmentId?: string;
  offset?: number;
  limit?: number;
}): Promise<Application[]> {
  const { data } = await api.get(
    `${CLOUDHUB_BASE}/applications`,
    { params },
  );
  // CloudHub returns an array directly; handle any shape gracefully
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const d = data as any;
    return d.data ?? d.applications ?? d.items ?? [];
  }
  return [];
}

/**
 * Get details for a specific application by domain name.
 */
export async function getApplication(domain: string): Promise<Application> {
  const { data } = await api.get<Application>(
    `${CLOUDHUB_BASE}/applications/${domain}`,
  );
  return data;
}

// ---------- Application Lifecycle ----------

/**
 * Start a stopped application.
 */
export async function startApp(domain: string): Promise<Application> {
  const { data } = await api.post<Application>(
    `${CLOUDHUB_BASE}/applications/${domain}/status`,
    { status: 'start' },
  );
  return data;
}

/**
 * Stop a running application.
 */
export async function stopApp(domain: string): Promise<Application> {
  const { data } = await api.post<Application>(
    `${CLOUDHUB_BASE}/applications/${domain}/status`,
    { status: 'stop' },
  );
  return data;
}

/**
 * Restart an application (stop + start).
 */
export async function restartApp(domain: string): Promise<Application> {
  const { data } = await api.post<Application>(
    `${CLOUDHUB_BASE}/applications/${domain}/status`,
    { status: 'restart' },
  );
  return data;
}

// ---------- Logs ----------

/**
 * Retrieve application log entries.
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
): Promise<PaginatedResponse<AppLogEntry>> {
  const { data } = await api.get<PaginatedResponse<AppLogEntry>>(
    `${CLOUDHUB_BASE}/applications/${domain}/logs`,
    { params },
  );
  return data;
}

// ---------- Deployment ----------

/**
 * Deploy an application to the target runtime.
 */
export async function deployApplication(
  request: DeploymentRequest,
): Promise<Application> {
  const { data } = await api.post<Application>(
    `${CLOUDHUB_BASE}/applications`,
    request,
  );
  return data;
}

/**
 * Delete / undeploy an application.
 */
export async function deleteApplication(domain: string): Promise<void> {
  await api.delete(`${CLOUDHUB_BASE}/applications/${domain}`);
}

// ---------- Workers ----------

/**
 * Scale the number of workers or change worker size for an application.
 */
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

// ---------- Metrics ----------

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
): Promise<MetricSeries[]> {
  const { data } = await api.get<MetricSeries[]>(
    `${CLOUDHUB_BASE}/applications/${domain}/dashboardStats`,
    { params },
  );
  return data;
}

// ---------- Properties ----------

/**
 * Update application properties (environment variables).
 */
export async function updateProperties(
  domain: string,
  properties: Record<string, string>,
): Promise<Application> {
  const { data } = await api.put<Application>(
    `${CLOUDHUB_BASE}/applications/${domain}`,
    { properties },
  );
  return data;
}
