// ============================================================
// Anypoint Mobile Platform - API Manager Service
// ============================================================

import api from './api';
import type {
  ManagedAPI,
  APIPolicy,
  SLATier,
  SLALimit,
  APIContract,
  APIAlert,
  PaginatedResponse,
} from '../types';

const API_MANAGER_BASE = '/apimanager/api/v1';

// ---------- Managed APIs ----------

/**
 * List all managed API instances for the given organization and environment.
 */
export async function getManagedAPIs(
  organizationId: string,
  environmentId: string,
  params?: {
    offset?: number;
    limit?: number;
    sort?: string;
    query?: string;
  },
): Promise<PaginatedResponse<ManagedAPI>> {
  const { data } = await api.get<PaginatedResponse<ManagedAPI>>(
    `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${environmentId}/apis`,
    { params },
  );
  return data;
}

/**
 * Get details for a single managed API instance.
 */
export async function getAPI(
  organizationId: string,
  environmentId: string,
  apiId: number,
): Promise<ManagedAPI> {
  const { data } = await api.get<ManagedAPI>(
    `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}`,
  );
  return data;
}

// ---------- Policies ----------

/**
 * List all policies applied to a managed API.
 */
export async function getPolicies(
  organizationId: string,
  environmentId: string,
  apiId: number,
): Promise<APIPolicy[]> {
  const { data } = await api.get<APIPolicy[]>(
    `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}/policies`,
  );
  return data;
}

/**
 * Apply a policy to a managed API.
 */
export async function applyPolicy(
  organizationId: string,
  environmentId: string,
  apiId: number,
  policy: {
    policyTemplateId: string;
    groupId: string;
    assetId: string;
    assetVersion: string;
    configuration: Record<string, unknown>;
    order?: number;
  },
): Promise<APIPolicy> {
  const { data } = await api.post<APIPolicy>(
    `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}/policies`,
    policy,
  );
  return data;
}

/**
 * Remove a policy from a managed API.
 */
export async function removePolicy(
  organizationId: string,
  environmentId: string,
  apiId: number,
  policyId: number,
): Promise<void> {
  await api.delete(
    `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}/policies/${policyId}`,
  );
}

// ---------- SLA Tiers ----------

/**
 * List SLA tiers for a managed API.
 */
export async function getSLATiers(
  organizationId: string,
  environmentId: string,
  apiId: number,
): Promise<SLATier[]> {
  const { data } = await api.get<SLATier[]>(
    `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}/tiers`,
  );
  return data;
}

/**
 * Create a new SLA tier for a managed API.
 */
export async function createSLATier(
  organizationId: string,
  environmentId: string,
  apiId: number,
  tier: {
    name: string;
    description: string;
    autoApprove: boolean;
    limits: SLALimit[];
  },
): Promise<SLATier> {
  const { data } = await api.post<SLATier>(
    `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}/tiers`,
    tier,
  );
  return data;
}

// ---------- Contracts ----------

/**
 * List all contracts (access requests) for a managed API.
 */
export async function getContracts(
  organizationId: string,
  environmentId: string,
  apiId: number,
  params?: { status?: string; offset?: number; limit?: number },
): Promise<PaginatedResponse<APIContract>> {
  const { data } = await api.get<PaginatedResponse<APIContract>>(
    `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}/contracts`,
    { params },
  );
  return data;
}

/**
 * Approve a pending contract.
 */
export async function approveContract(
  organizationId: string,
  environmentId: string,
  apiId: number,
  contractId: number,
): Promise<APIContract> {
  const { data } = await api.patch<APIContract>(
    `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}/contracts/${contractId}`,
    { status: 'APPROVED' },
  );
  return data;
}

/**
 * Reject a pending contract.
 */
export async function rejectContract(
  organizationId: string,
  environmentId: string,
  apiId: number,
  contractId: number,
): Promise<APIContract> {
  const { data } = await api.patch<APIContract>(
    `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}/contracts/${contractId}`,
    { status: 'REJECTED' },
  );
  return data;
}

// ---------- Alerts ----------

/**
 * Get alerts configured for a managed API.
 */
export async function getAlerts(
  organizationId: string,
  environmentId: string,
  apiId: number,
): Promise<APIAlert[]> {
  const { data } = await api.get<APIAlert[]>(
    `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}/alerts`,
  );
  return data;
}

// ---------- Promote ----------

/**
 * Promote an API instance from one environment to another.
 */
export async function promoteAPI(
  organizationId: string,
  sourceEnvironmentId: string,
  apiId: number,
  targetEnvironmentId: string,
): Promise<ManagedAPI> {
  const { data } = await api.post<ManagedAPI>(
    `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${sourceEnvironmentId}/apis/${apiId}/promote`,
    { targetEnvironmentId },
  );
  return data;
}
