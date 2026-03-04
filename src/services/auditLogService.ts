// ============================================================
// Anypoint Mobile Platform - Audit Log Service
// Uses the Anypoint Platform Audit Log Query API:
// POST /audit/v2/organizations/{orgId}/query
// ============================================================

import api from './api';
import type { AuditLogEntry } from '../types';

export interface AuditLogQueryParams {
  startDate?: string;
  endDate?: string;
  platforms?: string[];
  objectTypes?: string[];
  actions?: string[];
  objectIds?: string[];
  userIds?: string[];
  offset?: number;
  limit?: number;
  ascending?: boolean;
}

export interface AuditLogResponse {
  data: AuditLogEntry[];
  total: number;
}

/**
 * Query audit logs for the given organization.
 * Endpoint: POST /audit/v2/organizations/{orgId}/query
 */
export async function queryAuditLogs(
  organizationId: string,
  params?: AuditLogQueryParams,
): Promise<AuditLogResponse> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const body: Record<string, any> = {
    startDate: params?.startDate ?? oneDayAgo.toISOString(),
    endDate: params?.endDate ?? now.toISOString(),
    platforms: params?.platforms ?? [],
    objectTypes: params?.objectTypes ?? [],
    actions: params?.actions ?? [],
    objectIds: params?.objectIds ?? [],
    userIds: params?.userIds ?? [],
    offset: params?.offset ?? 0,
    limit: params?.limit ?? 100,
    ascending: params?.ascending ?? false,
    organizationId,
  };

  // Try both possible endpoint paths
  const endpoints = [
    `/audit/v2/organizations/${organizationId}/query`,
    `/audit/v2/organizations/${organizationId}`,
    `/apiplatform/repository/v2/organizations/${organizationId}/audit-logging/query`,
  ];

  for (const endpoint of endpoints) {
    try {
      const { data } = await api.post(endpoint, body);
      return normalizeAuditResponse(data);
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) throw err; // token expired, don't retry
      // continue to next endpoint
    }
  }

  return { data: [], total: 0 };
}

/**
 * Normalize the audit log response from various possible shapes.
 */
function normalizeAuditResponse(raw: any): AuditLogResponse {
  if (!raw) return { data: [], total: 0 };

  // Standard response: { data: [...], total: N }
  if (Array.isArray(raw.data)) {
    return {
      data: raw.data.map(normalizeEntry),
      total: raw.total ?? raw.data.length,
    };
  }

  // Alternative: { items: [...] } or { entries: [...] }
  const items = raw.items ?? raw.entries ?? raw.auditLogs ?? raw.logs;
  if (Array.isArray(items)) {
    return {
      data: items.map(normalizeEntry),
      total: raw.total ?? items.length,
    };
  }

  // If it's an array directly
  if (Array.isArray(raw)) {
    return {
      data: raw.map(normalizeEntry),
      total: raw.length,
    };
  }

  return { data: [], total: 0 };
}

/**
 * Normalize a single audit log entry.
 */
function normalizeEntry(raw: any): AuditLogEntry {
  return {
    id: raw.id ?? raw.auditId ?? String(Math.random()),
    action: raw.action ?? raw.actionName ?? 'Unknown',
    objectType: raw.objectType ?? raw.type ?? '',
    objectId: raw.objectId ?? raw.objectName ?? '',
    userName: raw.userName ?? raw.userEmail ?? raw.user?.name ?? raw.user?.email ?? '',
    userId: raw.userId ?? raw.user?.id ?? '',
    timestamp: raw.timestamp ?? raw.createdAt ?? raw.date ?? '',
    environmentId: raw.environmentId ?? '',
    environmentName: raw.environmentName ?? '',
    payload: raw.payload ?? raw.properties ?? raw.details ?? undefined,
  };
}

/**
 * Available platform filter options for audit logs.
 */
export const AUDIT_PLATFORMS = [
  'Access Management',
  'API Manager',
  'CloudHub',
  'Runtime Manager',
  'Exchange',
  'Design Center',
  'Anypoint MQ',
  'Object Store',
  'Secrets Manager',
  'Visualizer',
];

/**
 * Common action types in audit logs.
 */
export const AUDIT_ACTIONS = [
  'Create',
  'Update',
  'Delete',
  'Deploy',
  'Login',
  'Logout',
  'Start',
  'Stop',
  'Restart',
  'Redeploy',
];
