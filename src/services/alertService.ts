// ============================================================
// Anypoint Mobile Platform - Alert Service
//
// Org/env context is passed via the X-ANYPNT-ORG-ID and
// X-ANYPNT-ENV-ID headers (set by api.ts), NOT as URL segments.
// Endpoint paths match the Postman collection:
//   /armui/api/v1/alerts
//   /armui/api/v1/alerts/cloudhub
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
 * Org/env are sent as headers by the shared Axios instance.
 */
export async function getAlerts(
  _organizationId: string,
  _environmentId: string,
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
    `${ALERTS_BASE}/alerts`,
    { params },
  );
  return data;
}

/**
 * Get details for a specific CloudHub alert.
 * Uses the /alerts/cloudhub/{id} path per the Postman collection.
 */
export async function getAlert(
  _organizationId: string,
  _environmentId: string,
  alertId: string,
): Promise<Alert> {
  const { data } = await api.get<Alert>(
    `${ALERTS_BASE}/alerts/cloudhub/${alertId}`,
  );
  return data;
}

// ---------- Alert Actions ----------

/**
 * Acknowledge an active CloudHub alert.
 */
export async function acknowledgeAlert(
  _organizationId: string,
  _environmentId: string,
  alertId: string,
): Promise<Alert> {
  const { data } = await api.patch<Alert>(
    `${ALERTS_BASE}/alerts/cloudhub/${alertId}`,
    { status: 'ACKNOWLEDGED' },
  );
  return data;
}

/**
 * Mark a CloudHub alert as resolved.
 */
export async function resolveAlert(
  _organizationId: string,
  _environmentId: string,
  alertId: string,
): Promise<Alert> {
  const { data } = await api.patch<Alert>(
    `${ALERTS_BASE}/alerts/cloudhub/${alertId}`,
    { status: 'RESOLVED' },
  );
  return data;
}

/**
 * Dismiss a CloudHub alert (mark as no longer relevant).
 */
export async function dismissAlert(
  _organizationId: string,
  _environmentId: string,
  alertId: string,
): Promise<Alert> {
  const { data } = await api.patch<Alert>(
    `${ALERTS_BASE}/alerts/cloudhub/${alertId}`,
    { status: 'DISMISSED' },
  );
  return data;
}

// ---------- CloudHub Alert Configurations ----------

/**
 * List CloudHub alert configurations for the current context.
 *
 * This is the CloudHub alerts resource endpoint at /alerts/cloudhub.
 * Per the Postman collection this returns CloudHub alert objects that
 * include both the alert state and its configuration (conditions,
 * recipients, etc.), which the UI presents as "alert rules".
 */
export async function getAlertRules(
  _organizationId: string,
  _environmentId: string,
  params?: {
    type?: AlertType;
    enabled?: boolean;
    offset?: number;
    limit?: number;
  },
): Promise<PaginatedResponse<AlertRule>> {
  const { data } = await api.get<PaginatedResponse<AlertRule>>(
    `${ALERTS_BASE}/alerts/cloudhub`,
    { params },
  );
  return data;
}

/**
 * Create a new alert rule.
 */
export async function createAlertRule(
  _organizationId: string,
  _environmentId: string,
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
    `${ALERTS_BASE}/alerts/cloudhub`,
    rule,
  );
  return data;
}

/**
 * Update an existing alert rule.
 */
export async function updateAlertRule(
  _organizationId: string,
  _environmentId: string,
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
    `${ALERTS_BASE}/alerts/cloudhub/${ruleId}`,
    updates,
  );
  return data;
}

/**
 * Delete an alert rule.
 */
export async function deleteAlertRule(
  _organizationId: string,
  _environmentId: string,
  ruleId: string,
): Promise<void> {
  await api.delete(
    `${ALERTS_BASE}/alerts/cloudhub/${ruleId}`,
  );
}
