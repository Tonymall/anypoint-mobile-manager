// ============================================================
// Anypoint Mobile Platform - Deployment Service
// ============================================================

import api from './api';
import type {
  DeploymentHistory,
  DeploymentStatus,
  Application,
  PaginatedResponse,
} from '../types';

const CLOUDHUB_BASE = '/cloudhub/api/v2';
const RUNTIME_BASE = '/armui/api/v1';

// ---------- Deployment History ----------

/**
 * Retrieve the deployment history for a specific application.
 */
export async function getDeploymentHistory(
  organizationId: string,
  environmentId: string,
  params?: {
    applicationName?: string;
    status?: DeploymentStatus;
    offset?: number;
    limit?: number;
  },
): Promise<PaginatedResponse<DeploymentHistory>> {
  const { data } = await api.get<PaginatedResponse<DeploymentHistory>>(
    `${RUNTIME_BASE}/organizations/${organizationId}/environments/${environmentId}/deploymentHistory`,
    { params },
  );
  return data;
}

// ---------- Redeployment ----------

/**
 * Trigger a redeployment of an application using the current configuration.
 */
export async function triggerRedeployment(
  domain: string,
): Promise<Application> {
  const { data } = await api.post<Application>(
    `${CLOUDHUB_BASE}/applications/${domain}/deploy`,
  );
  return data;
}

// ---------- Rollback ----------

/**
 * Roll back an application to a previous deployment version.
 */
export async function rollback(
  organizationId: string,
  environmentId: string,
  applicationName: string,
  deploymentId: string,
): Promise<DeploymentHistory> {
  const { data } = await api.post<DeploymentHistory>(
    `${RUNTIME_BASE}/organizations/${organizationId}/environments/${environmentId}/deployments/${deploymentId}/rollback`,
    { applicationName },
  );
  return data;
}

// ---------- Deployment Status ----------

/**
 * Get the current deployment status for an application.
 */
export async function getDeploymentStatus(
  organizationId: string,
  environmentId: string,
  deploymentId: string,
): Promise<DeploymentHistory> {
  const { data } = await api.get<DeploymentHistory>(
    `${RUNTIME_BASE}/organizations/${organizationId}/environments/${environmentId}/deployments/${deploymentId}`,
  );
  return data;
}

// ---------- Promote Between Environments ----------

/**
 * Promote an application deployment from one environment to another.
 */
export async function promoteEnvironment(
  organizationId: string,
  sourceEnvironmentId: string,
  applicationName: string,
  targetEnvironmentId: string,
  overrides?: {
    workerCount?: number;
    workerType?: string;
    properties?: Record<string, string>;
  },
): Promise<DeploymentHistory> {
  const { data } = await api.post<DeploymentHistory>(
    `${RUNTIME_BASE}/organizations/${organizationId}/environments/${sourceEnvironmentId}/deployments/promote`,
    {
      applicationName,
      targetEnvironmentId,
      ...overrides,
    },
  );
  return data;
}
