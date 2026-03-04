// ============================================================
// Anypoint Mobile Platform - Monitoring Service
// ============================================================

import api from './api';
import type {
  MetricSeries,
  DashboardConfig,
  AppLogEntry,
  LogSearchQuery,
  TransactionTrace,
  JVMMetrics,
  PaginatedResponse,
} from '../types';

const MONITORING_BASE = '/monitoring/api/v1';
const VISUALIZER_BASE = '/visualizer/api/v1';

// ---------- Metrics ----------

/**
 * Retrieve metric series for a given resource.
 */
export async function getMetrics(
  organizationId: string,
  environmentId: string,
  params: {
    resourceId: string;
    metricNames: string[];
    startDate: string;
    endDate: string;
    interval?: string;
  },
): Promise<MetricSeries[]> {
  const { data } = await api.post<MetricSeries[]>(
    `${MONITORING_BASE}/organizations/${organizationId}/environments/${environmentId}/metrics`,
    params,
  );
  return data;
}

// ---------- Dashboards ----------

/**
 * List all available dashboards.
 */
export async function getDashboards(
  organizationId: string,
  environmentId: string,
): Promise<DashboardConfig[]> {
  const { data } = await api.get<DashboardConfig[]>(
    `${MONITORING_BASE}/organizations/${organizationId}/environments/${environmentId}/dashboards`,
  );
  return data;
}

/**
 * Get a specific dashboard by ID.
 */
export async function getDashboard(
  organizationId: string,
  environmentId: string,
  dashboardId: string,
): Promise<DashboardConfig> {
  const { data } = await api.get<DashboardConfig>(
    `${MONITORING_BASE}/organizations/${organizationId}/environments/${environmentId}/dashboards/${dashboardId}`,
  );
  return data;
}

// ---------- Logs ----------

/**
 * Retrieve application log entries.
 */
export async function getLogs(
  organizationId: string,
  environmentId: string,
  params: {
    applicationName?: string;
    priority?: string;
    startDate: string;
    endDate: string;
    limit?: number;
    offset?: number;
  },
): Promise<PaginatedResponse<AppLogEntry>> {
  const { data } = await api.get<PaginatedResponse<AppLogEntry>>(
    `${MONITORING_BASE}/organizations/${organizationId}/environments/${environmentId}/logs`,
    { params },
  );
  return data;
}

/**
 * Search logs using a structured query.
 */
export async function searchLogs(
  organizationId: string,
  environmentId: string,
  query: LogSearchQuery,
): Promise<PaginatedResponse<AppLogEntry>> {
  const { data } = await api.post<PaginatedResponse<AppLogEntry>>(
    `${MONITORING_BASE}/organizations/${organizationId}/environments/${environmentId}/logs/search`,
    query,
  );
  return data;
}

// ---------- Traces ----------

/**
 * List transaction traces.
 */
export async function getTraces(
  organizationId: string,
  environmentId: string,
  params: {
    applicationName?: string;
    startDate: string;
    endDate: string;
    status?: 'success' | 'error';
    limit?: number;
    offset?: number;
  },
): Promise<PaginatedResponse<TransactionTrace>> {
  const { data } = await api.get<PaginatedResponse<TransactionTrace>>(
    `${VISUALIZER_BASE}/organizations/${organizationId}/environments/${environmentId}/traces`,
    { params },
  );
  return data;
}

/**
 * Get a single transaction trace by ID.
 */
export async function getTrace(
  organizationId: string,
  environmentId: string,
  traceId: string,
): Promise<TransactionTrace> {
  const { data } = await api.get<TransactionTrace>(
    `${VISUALIZER_BASE}/organizations/${organizationId}/environments/${environmentId}/traces/${traceId}`,
  );
  return data;
}

// ---------- JVM Metrics ----------

/**
 * Retrieve JVM-level metrics for an application.
 */
export async function getJVMMetrics(
  organizationId: string,
  environmentId: string,
  applicationName: string,
): Promise<JVMMetrics> {
  const { data } = await api.get<JVMMetrics>(
    `${MONITORING_BASE}/organizations/${organizationId}/environments/${environmentId}/applications/${applicationName}/jvm`,
  );
  return data;
}

// ---------- Business Events ----------

/**
 * Query business events from the monitoring platform.
 */
export async function getBusinessEvents(
  organizationId: string,
  environmentId: string,
  params: {
    applicationName?: string;
    eventType?: string;
    startDate: string;
    endDate: string;
    limit?: number;
    offset?: number;
  },
): Promise<PaginatedResponse<Record<string, unknown>>> {
  const { data } = await api.get<PaginatedResponse<Record<string, unknown>>>(
    `${MONITORING_BASE}/organizations/${organizationId}/environments/${environmentId}/events`,
    { params },
  );
  return data;
}
