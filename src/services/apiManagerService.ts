// ============================================================
// Anypoint Mobile Platform - API Manager Service
// ============================================================

import api from './api';
import { getStatusCode, toStringValue, unwrapCollection } from './controlPlaneCommon';
import type {
  ManagedAPI,
  APIPolicy,
  SLATier,
  SLALimit,
  APIContract,
  APIAlert,
  PolicyConfigField,
  PaginatedResponse,
} from '../types';

const API_MANAGER_BASE = '/apimanager/api/v1';
const API_MANAGER_XAPI_BASE = '/apimanager/xapi/v1';

export interface APIPolicyTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  groupId: string | null;
  assetId: string | null;
  assetVersion: string | null;
  docsUrl?: string | null;
  providedCharacteristics: string[];
  requiredCharacteristics: string[];
  isSlaBased: boolean;
  configurationFields: PolicyConfigField[];
}

export interface APIAssetSummary {
  id: string;
  name: string;
  exchangeAssetName: string | null;
  groupId: string | null;
  assetId: string | null;
}

export interface APIGovernanceReportSummary {
  urn: string | null;
  status: string | null;
  instanceAspectNotValidated: boolean;
  otherInstancesTotal: number;
  otherUnauthorizedInstances: number;
}

function normalizeTierList(data: unknown): SLATier[] {
  if (Array.isArray(data)) return data as SLATier[];
  const tiers = unwrapCollection<SLATier>(data, ['tiers', 'data', 'items']);
  return tiers;
}

function normalizeContracts(
  data: unknown,
  params?: { status?: string; offset?: number; limit?: number },
): PaginatedResponse<APIContract> {
  const items = unwrapCollection<APIContract>(data, ['contracts', 'data', 'items']);
  const payload = (data && typeof data === 'object' ? data : {}) as Record<string, any>;
  return {
    data: items,
    total: typeof payload.total === 'number' ? payload.total : items.length,
    offset: params?.offset ?? 0,
    limit: params?.limit ?? items.length,
  };
}

function normalizeFieldType(value: unknown): PolicyConfigField['type'] {
  const raw = String(value ?? 'string').toLowerCase();
  if (raw === 'int' || raw === 'integer' || raw === 'number') return 'int';
  if (raw === 'boolean' || raw === 'bool') return 'boolean';
  if (raw === 'array' || raw === 'list') return 'array';
  if (raw === 'expression') return 'expression';
  return 'string';
}

function mapConfigField(input: any, fallbackName?: string): PolicyConfigField | null {
  const propertyName = toStringValue(input?.propertyName)
    ?? toStringValue(input?.name)
    ?? toStringValue(fallbackName);
  if (!propertyName) return null;

  return {
    propertyName,
    name: toStringValue(input?.title) ?? toStringValue(input?.displayName) ?? propertyName,
    description: toStringValue(input?.description) ?? '',
    type: normalizeFieldType(input?.type),
    defaultValue: input?.defaultValue ?? input?.default,
    optional: Boolean(input?.optional ?? !input?.required),
    sensitive: Boolean(input?.sensitive),
    allowMultiple: Boolean(input?.allowMultiple),
  };
}

function parsePolicyConfigFields(entry: any): PolicyConfigField[] {
  const arrayCandidates = [
    entry?.configuration,
    entry?.configurationFields,
    entry?.fields,
    entry?.schema?.fields,
  ];

  for (const candidate of arrayCandidates) {
    if (Array.isArray(candidate)) {
      return candidate
        .map((field) => mapConfigField(field))
        .filter((field): field is PolicyConfigField => !!field);
    }
  }

  const objectCandidates = [
    entry?.properties,
    entry?.jsonSchema?.properties,
    entry?.schema?.properties,
    entry?.configurationSchema?.properties,
  ];

  for (const candidate of objectCandidates) {
    if (candidate && typeof candidate === 'object') {
      return Object.entries(candidate)
        .map(([key, value]) => mapConfigField(value, key))
        .filter((field): field is PolicyConfigField => !!field);
    }
  }

  return [];
}

// ---------- Managed APIs ----------

/**
 * List all managed API instances for the given organization and environment.
 * API Manager returns { assets: [...], total } or similar shapes.
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
): Promise<ManagedAPI[]> {
  const { data } = await api.get(
    `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${environmentId}/apis`,
    { params },
  );
  // Handle various Anypoint API Manager response shapes
  if (Array.isArray(data)) return data;
  if (data && typeof data === 'object') {
    const d = data as any;
    const list = d.assets ?? d.instances ?? d.apis ?? d.data ?? d.items ?? [];
    // The API Manager returns { assets: [{ apis: [...], assetId, ... }] }
    // Each asset group contains a nested `apis` array with the actual instances.
    // Flatten them into a single list of API instances.
    if (Array.isArray(list) && list.length > 0 && Array.isArray(list[0]?.apis)) {
      return list.flatMap((asset: any) =>
        (asset.apis ?? []).map((instance: any) => ({
          ...instance,
          // Carry asset-level fields down to each instance for convenience
          assetId: instance.assetId ?? asset.assetId,
          assetVersion: instance.assetVersion ?? asset.assetVersion,
          groupId: instance.groupId ?? asset.groupId,
        })),
      );
    }
    return list;
  }
  return [];
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
  const { data } = await api.get(
    `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}/tiers`,
  );
  return normalizeTierList(data);
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
  try {
    const { data } = await api.get(
      `${API_MANAGER_XAPI_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}/contracts`,
      {
        params: {
          limit: params?.limit ?? 20,
          offset: params?.offset ?? 0,
          sort: 'name',
          ascending: true,
          ...(params?.status ? { status: params.status } : {}),
        },
      },
    );
    return normalizeContracts(data, params);
  } catch (error) {
    const status = getStatusCode(error);
    if (status !== 403 && status !== 404 && status !== 405) {
      throw error;
    }

    const { data } = await api.get(
      `${API_MANAGER_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}/contracts`,
      { params },
    );
    return normalizeContracts(data, params);
  }
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

// ---------- xAPI detail helpers ----------

export async function getPolicyTemplates(
  organizationId: string,
  environmentId: string,
  apiId: number,
  options?: {
    includeConfiguration?: boolean;
  },
): Promise<APIPolicyTemplate[]> {
  const { data } = await api.get(
    `${API_MANAGER_XAPI_BASE}/organizations/${organizationId}/exchange-policy-templates`,
    {
      params: {
        environmentId,
        splitModel: true,
        latest: true,
        apiInstanceId: apiId,
        includeConfiguration: options?.includeConfiguration ?? false,
        automatedOnly: false,
        injectionPoint: 'inbound',
      },
    },
  );

  return unwrapCollection<any>(data).map((entry) => ({
    id: toStringValue(entry.id) ?? `${entry.groupId ?? 'policy'}:${entry.assetId ?? 'template'}`,
    name: toStringValue(entry.name) ?? toStringValue(entry.assetId) ?? 'Policy template',
    description: toStringValue(entry.description) ?? '',
    category: toStringValue(entry.category) ?? 'Other',
    groupId: toStringValue(entry.groupId),
    assetId: toStringValue(entry.assetId),
    assetVersion: toStringValue(entry.version),
    docsUrl: toStringValue(entry.docsUrl) ?? null,
    providedCharacteristics: Array.isArray(entry.providedCharacteristics)
      ? entry.providedCharacteristics.map((value: unknown) => String(value))
      : [],
    requiredCharacteristics: Array.isArray(entry.requiredCharacteristics)
      ? entry.requiredCharacteristics.map((value: unknown) => String(value))
      : [],
    isSlaBased: Boolean(entry.isSlaBased),
    configurationFields: parsePolicyConfigFields(entry),
  }));
}

export async function getApiAssetSummary(
  organizationId: string,
  environmentId: string,
  apiId: number,
): Promise<APIAssetSummary | null> {
  try {
    const { data } = await api.get(
      `${API_MANAGER_XAPI_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}/apiAsset`,
    );
    return {
      id: toStringValue((data as any)?.id) ?? `${apiId}`,
      name: toStringValue((data as any)?.name) ?? 'API asset',
      exchangeAssetName: toStringValue((data as any)?.exchangeAssetName),
      groupId: toStringValue((data as any)?.groupId),
      assetId: toStringValue((data as any)?.assetId),
    };
  } catch (error) {
    const status = getStatusCode(error);
    if (status === 403 || status === 404 || status === 405) {
      return null;
    }
    throw error;
  }
}

export async function getApiGovernanceReport(
  organizationId: string,
  environmentId: string,
  apiId: number,
): Promise<APIGovernanceReportSummary | null> {
  try {
    const { data } = await api.get(
      `${API_MANAGER_XAPI_BASE}/organizations/${organizationId}/environments/${environmentId}/apis/${apiId}/governance-report`,
      {
        params: { includeOtherInstances: true },
      },
    );
    return {
      urn: toStringValue((data as any)?.urn),
      status: toStringValue((data as any)?.status),
      instanceAspectNotValidated: Boolean((data as any)?.instanceAspectNotValidated),
      otherInstancesTotal: Number((data as any)?.otherInstances?.total ?? 0),
      otherUnauthorizedInstances: Number((data as any)?.otherInstances?.otherUnauthorizedInstances ?? 0),
    };
  } catch (error) {
    const status = getStatusCode(error);
    if (status === 403 || status === 404 || status === 405) {
      return null;
    }
    throw error;
  }
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
