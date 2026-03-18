import api from './api';
import {
  findNestedValue,
  toNumber,
  toStringValue,
  unwrapCollection,
  withOptionalFallback,
} from './controlPlaneCommon';

const GOVERNANCE_XAPI_BASE = '/governance/xapi/api/v1';
const APIM_XAPI_BASE = '/apimanager/xapi/v1';
const GATEWAY_XAPI_BASE = '/gatewaymanager/xapi/v1';

export interface GovernanceTenantDashboard {
  activeProfiles: number | null;
  conformantApis: number | null;
  nonConformantApis: number | null;
  violations: number | null;
}

export interface GovernanceTenantLimit {
  limit: number | null;
  used: number | null;
  remaining: number | null;
}

export interface ManagedServiceApi {
  id: string;
  name: string;
  stage: string | null;
  state: string | null;
  autodiscoveryApiName: string | null;
}

export interface GatewayPermission {
  id: string;
  subject: string;
  permission: string;
  resourceType: string | null;
}

function asRecord(value: unknown): Record<string, any> {
  return (value && typeof value === 'object' ? value : {}) as Record<string, any>;
}

export async function getGovernanceTenantDashboard(
  organizationId: string,
): Promise<GovernanceTenantDashboard | null> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(`${GOVERNANCE_XAPI_BASE}/dashboard/${organizationId}`, {
      params: { tenant: false },
    });
    return {
      activeProfiles: toNumber(findNestedValue(data, ['activeProfiles', 'activeProfileCount', 'profiles'])),
      conformantApis: toNumber(findNestedValue(data, ['conformantApis', 'conformantApiCount'])),
      nonConformantApis: toNumber(findNestedValue(data, ['nonConformantApis', 'nonConformantApiCount'])),
      violations: toNumber(findNestedValue(data, ['violations', 'violationCount', 'openViolations'])),
    };
  }, null);
}

export async function getGovernanceTenantLimit(
  organizationId: string,
): Promise<GovernanceTenantLimit | null> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(`${GOVERNANCE_XAPI_BASE}/overage/limit`, {
      params: { organization: organizationId },
    });
    const limit = toNumber(findNestedValue(data, ['limit', 'max']));
    const used = toNumber(findNestedValue(data, ['used', 'usage', 'currentUsage']));
    return {
      limit,
      used,
      remaining: limit != null && used != null ? Math.max(0, limit - used) : null,
    };
  }, null);
}

export async function getManagedServiceApis(
  organizationId: string,
  environmentId: string,
): Promise<ManagedServiceApi[]> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(
      `${APIM_XAPI_BASE}/organizations/${organizationId}/environments/${environmentId}/managedServiceApis`,
    );
    return unwrapCollection(data, ['managedServiceApis', 'items']).map((entry: unknown) => {
      const item = asRecord(entry);
      return {
        id: toStringValue(item.id) ?? toStringValue(item.instanceId) ?? toStringValue(item.apiId) ?? `msa-${Math.random()}`,
        name: toStringValue(item.name) ?? toStringValue(item.instanceLabel) ?? toStringValue(item.assetId) ?? 'Managed service API',
        stage: toStringValue(item.stage) ?? toStringValue(item.environmentType),
        state: toStringValue(item.state) ?? toStringValue(item.status),
        autodiscoveryApiName: toStringValue(item.autodiscoveryApiName) ?? toStringValue(item.autodiscoveryName),
      };
    });
  }, []);
}

export async function getGatewayPermissions(
  organizationId: string,
  environmentId: string,
): Promise<GatewayPermission[]> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(
      `${GATEWAY_XAPI_BASE}/organizations/${organizationId}/environments/${environmentId}/permissions`,
    );
    return unwrapCollection(data, ['permissions', 'items']).map((entry: unknown) => {
      const item = asRecord(entry);
      return {
        id: toStringValue(item.id) ?? toStringValue(item.subject) ?? `${Math.random()}`,
        subject: toStringValue(item.subject) ?? toStringValue(item.name) ?? 'Unknown subject',
        permission: toStringValue(item.permission) ?? toStringValue(item.action) ?? 'Unknown',
        resourceType: toStringValue(item.resourceType) ?? toStringValue(item.scope),
      };
    });
  }, []);
}
