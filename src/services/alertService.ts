// ============================================================
// Anypoint Mobile Platform - Alert Service
// ============================================================

import api from './api';
import type {
  Alert,
  AlertRule,
  AlertSeverity,
  AlertStatus,
  AlertType,
  AlertCondition,
  AlertRecipient,
  PaginatedResponse,
} from '../types';

const ALERTS_BASE = '/armui/api/v1';

// ---------- Alerts ----------

/**
 * List all alerts for the current organization and environment.
 */
export async function getAlerts(
  organizationId: string,
  environmentId: string,
  params?: {
    status?: AlertStatus;
    severity?: AlertSeverity;
    type?: AlertType;
    applicationName?: string;
    offset?: number;
    limit?: number;
  },
): Promise<PaginatedResponse<Alert>> {
  const { data } = await api.get<PaginatedResponse<Alert>>(
    `${ALERTS_BASE}/organizations/${organizationId}/environments/${environmentId}/alerts`,
    { params },
  );
  return data;
}

/**
 * Get details for a specific alert.
 */
export async function getAlert(
  organizationId: string,
  environmentId: string,
  alertId: string,
): Promise<Alert> {
  const { data } = await api.get<Alert>(
    `${ALERTS_BASE}/organizations/${organizationId}/environments/${environmentId}/alerts/${alertId}`,
  );
  return data;
}

// ---------- Alert Actions ----------

/**
 * Acknowledge an active alert.
 */
export async function acknowledgeAlert(
  organizationId: string,
  environmentId: string,
  alertId: string,
): Promise<Alert> {
  const { data } = await api.patch<Alert>(
    `${ALERTS_BASE}/organizations/${organizationId}/environments/${environmentId}/alerts/${alertId}`,
    { status: 'ACKNOWLEDGED' },
  );
  return data;
}

/**
 * Mark an alert as resolved.
 */
export async function resolveAlert(
  organizationId: string,
  environmentId: string,
  alertId: string,
): Promise<Alert> {
  const { data } = await api.patch<Alert>(
    `${ALERTS_BASE}/organizations/${organizationId}/environments/${environmentId}/alerts/${alertId}`,
    { status: 'RESOLVED' },
  );
  return data;
}

/**
 * Dismiss an alert (mark as no longer relevant).
 */
export async function dismissAlert(
  organizationId: string,
  environmentId: string,
  alertId: string,
): Promise<Alert> {
  const { data } = await api.patch<Alert>(
    `${ALERTS_BASE}/organizations/${organizationId}/environments/${environmentId}/alerts/${alertId}`,
    { status: 'DISMISSED' },
  );
  return data;
}

// ---------- Alert Rules ----------

/**
 * List all alert rules for the given organization and environment.
 */
export async function getAlertRules(
  organizationId: string,
  environmentId: string,
  params?: {
    type?: AlertType;
    enabled?: boolean;
    offset?: number;
    limit?: number;
  },
): Promise<PaginatedResponse<AlertRule>> {
  const { data } = await api.get<PaginatedResponse<AlertRule>>(
    `${ALERTS_BASE}/organizations/${organizationId}/environments/${environmentId}/alertRules`,
    { params },
  );
  return data;
}

/**
 * Create a new alert rule.
 */
export async function createAlertRule(
  organizationId: string,
  environmentId: string,
  rule: {
    name: string;
    type: AlertType;
    severity: AlertSeverity;
    enabled: boolean;
    condition: AlertCondition;
    recipients: AlertRecipient[];
    applicationIds?: string[];
    apiIds?: number[];
  },
): Promise<AlertRule> {
  const { data } = await api.post<AlertRule>(
    `${ALERTS_BASE}/organizations/${organizationId}/environments/${environmentId}/alertRules`,
    rule,
  );
  return data;
}

/**
 * Update an existing alert rule.
 */
export async function updateAlertRule(
  organizationId: string,
  environmentId: string,
  ruleId: string,
  updates: Partial<{
    name: string;
    severity: AlertSeverity;
    enabled: boolean;
    condition: AlertCondition;
    recipients: AlertRecipient[];
    applicationIds: string[];
    apiIds: number[];
  }>,
): Promise<AlertRule> {
  const { data } = await api.patch<AlertRule>(
    `${ALERTS_BASE}/organizations/${organizationId}/environments/${environmentId}/alertRules/${ruleId}`,
    updates,
  );
  return data;
}

/**
 * Delete an alert rule.
 */
export async function deleteAlertRule(
  organizationId: string,
  environmentId: string,
  ruleId: string,
): Promise<void> {
  await api.delete(
    `${ALERTS_BASE}/organizations/${organizationId}/environments/${environmentId}/alertRules/${ruleId}`,
  );
}
