// ============================================================
// Anypoint Mobile Platform - Audit Log Service
// Uses the Anypoint Platform Audit Log Query API:
// POST /audit/v2/organizations/{orgId}/query
// ============================================================

import api from './api';
import logger from '../utils/logger';
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
 *
 * Correct endpoint (from Postman collection):
 *   POST /audit/v2/organizations/{orgId}/query?include_internal=false
 *
 * Body format (matching Postman):
 * {
 *   "startDate": "2021-04-20T12:05:21.714Z",  // ISO string
 *   "endDate": "2021-04-21T12:05:21.714Z",     // ISO string
 *   "platforms": [],
 *   "objectTypes": [],
 *   "environmentIds": [],                        // NOTE: environmentIds, not environments
 *   "actions": [],
 *   "objectIds": [],
 *   "userIds": [],
 *   "ascending": false,
 *   "organizationId": "...",
 *   "offset": 0,
 *   "limit": 25
 * }
 */
export async function queryAuditLogs(
  organizationId: string,
  params?: AuditLogQueryParams,
): Promise<AuditLogResponse> {
  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  // Build body matching the Postman collection format exactly
  const body: Record<string, any> = {
    startDate: params?.startDate ?? oneDayAgo.toISOString(),
    endDate: params?.endDate ?? now.toISOString(),
    platforms: params?.platforms ?? [],
    objectTypes: params?.objectTypes ?? [],
    actions: params?.actions ?? [],
    objectIds: params?.objectIds ?? [],
    userIds: params?.userIds ?? [],
    environmentIds: [],  // Postman uses environmentIds (not environments)
    offset: params?.offset ?? 0,
    limit: params?.limit ?? 25,
    ascending: params?.ascending ?? false,
    organizationId,
  };

  // --- Primary: The correct endpoint from Postman collection ---
  // The `?include_internal=false` query param is REQUIRED in the Postman collection
  try {
    const { data } = await api.post(
      `/audit/v2/organizations/${organizationId}/query?include_internal=false`,
      body,
    );
    const result = normalizeAuditResponse(data);
    if (result.data.length >= 0) return result; // Return even if empty — endpoint is correct
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 401) throw err; // token expired, don't retry
    logger.warn(`[AuditLogs] Primary endpoint failed: ${status} ${err?.response?.data?.message ?? err?.message ?? ''}`);
  }

  // --- Fallback endpoints ---
  const fallbackEndpoints = [
    // Without query param
    `/audit/v2/organizations/${organizationId}/query`,
    // v1 endpoint
    `/audit/v1/organizations/${organizationId}/query`,
  ];

  for (const endpoint of fallbackEndpoints) {
    try {
      const { data } = await api.post(endpoint, body);
      const result = normalizeAuditResponse(data);
      if (result.data.length > 0) return result;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401) throw err;
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
 * Keys that, when present on an object-valued field, carry the
 * human-meaningful label for that object. Checked in this order.
 */
const DISPLAY_KEYS = ['name', 'displayName', 'label', 'title', 'value', 'email', 'id'];

/**
 * Coerce an arbitrary API value into something that is safe to render as a
 * React text child.
 *
 * The audit API is loosely typed: fields declared as strings in
 * `AuditLogEntry` occasionally arrive as objects, arrays or numbers. Rendering
 * an object as a React child throws ("Objects are not valid as a React
 * child"), so the coercion happens here at the service boundary rather than in
 * the screens.
 *
 * Rules:
 *  - strings pass through untouched
 *  - finite numbers / booleans / bigints stringify
 *  - null / undefined / NaN / Infinity -> `fallback`
 *  - Date -> ISO string
 *  - arrays -> each element coerced and joined with ", " (empties dropped)
 *  - objects -> the first meaningful nested field (name, displayName, label,
 *    title, value, email, id); never "[object Object]"
 *  - anything else (functions, symbols) -> `fallback`
 */
export function toDisplayString(value: unknown, fallback = '', depth = 0): string {
  if (value === null || value === undefined) return fallback;

  if (typeof value === 'string') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : fallback;
  if (typeof value === 'boolean' || typeof value === 'bigint') return String(value);

  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? fallback : value.toISOString();
  }

  if (depth >= 3) return fallback;

  if (Array.isArray(value)) {
    const parts = value
      .map((item) => toDisplayString(item, '', depth + 1))
      .filter((part) => part.length > 0);
    return parts.length > 0 ? parts.join(', ') : fallback;
  }

  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    for (const key of DISPLAY_KEYS) {
      if (record[key] === null || record[key] === undefined) continue;
      const nested = toDisplayString(record[key], '', depth + 1);
      if (nested.length > 0) return nested;
    }
    return fallback;
  }

  return fallback;
}

/**
 * Normalize a single audit log entry.
 *
 * Every field typed as a string on `AuditLogEntry` is run through
 * `toDisplayString`. The fallback chains below are unchanged — the coercion
 * only wraps the resolved value, using the chain's original default.
 * `payload` is deliberately left as-is: it is typed `Record<string, unknown>`
 * and only its keys are rendered.
 */
function normalizeEntry(input: any): AuditLogEntry {
  const raw: any = input && typeof input === 'object' ? input : {};
  const fallbackIdSeed = `${toDisplayString(raw.timestamp ?? raw.createdAt ?? raw.date, 'ts')}-${toDisplayString(raw.action ?? raw.actionName, 'action')}-${toDisplayString(raw.objectId ?? raw.objectName ?? raw.userId, 'object')}`;
  return {
    id: toDisplayString(raw.id ?? raw.auditId, fallbackIdSeed),
    action: toDisplayString(raw.action ?? raw.actionName, 'Unknown'),
    platform: toDisplayString(raw.platform ?? raw.platformName ?? raw.product ?? raw.platformType, ''),
    objectType: toDisplayString(raw.objectType ?? raw.type, ''),
    objectId: toDisplayString(raw.objectId ?? raw.objectName, ''),
    userName: toDisplayString(raw.userName ?? raw.userEmail ?? raw.user?.name ?? raw.user?.email, ''),
    userId: toDisplayString(raw.userId ?? raw.user?.id, ''),
    timestamp: toDisplayString(raw.timestamp ?? raw.createdAt ?? raw.date, ''),
    environmentId: toDisplayString(raw.environmentId, ''),
    environmentName: toDisplayString(raw.environmentName, ''),
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
