import api from './api';
import { findNestedValue, toNumber, toStringValue, unwrapCollection, withOptionalFallback } from './controlPlaneCommon';

const RUNTIME_FABRIC_BASE = '/runtimefabric/api';

export interface RuntimeFabricSummary {
  id: string;
  name: string;
  region: string | null;
  status: string | null;
  targetCount: number | null;
}

export interface PrivateSpaceSummary {
  id: string;
  name: string;
  status: string | null;
  region: string | null;
  targetCount: number | null;
  currentVersion: string | null;
}

export interface RuntimeFabricTarget {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  provider: string | null;
}

export interface PrivateSpacePatchWindow {
  id: string;
  name: string;
  cron: string | null;
  timezone: string | null;
}

export interface RuntimeFabricUsage {
  entitlementLimit: number | null;
  currentUsage: number | null;
  unit: string | null;
}

function asRecord(value: unknown): Record<string, any> {
  return (value && typeof value === 'object' ? value : {}) as Record<string, any>;
}

function normalizeFabric(raw: unknown): RuntimeFabricSummary {
  const item = asRecord(raw);
  return {
    id: toStringValue(item.id) ?? toStringValue(item.fabricId) ?? toStringValue(item.name) ?? `fabric-${Math.random()}`,
    name: toStringValue(item.name) ?? toStringValue(item.displayName) ?? 'Unnamed fabric',
    region: toStringValue(item.region) ?? toStringValue(item.location) ?? toStringValue(item.providerRegion),
    status: toStringValue(item.status) ?? toStringValue(item.lifecycleState),
    targetCount: toNumber(item.targetCount) ?? toNumber(item.targetsCount) ?? toNumber(item.workerCount),
  };
}

function normalizePrivateSpace(raw: unknown): PrivateSpaceSummary {
  const item = asRecord(raw);
  return {
    id: toStringValue(item.id) ?? toStringValue(item.privateSpaceId) ?? toStringValue(item.name) ?? `ps-${Math.random()}`,
    name: toStringValue(item.name) ?? toStringValue(item.displayName) ?? 'Unnamed private space',
    status: toStringValue(item.status) ?? toStringValue(item.phase),
    region: toStringValue(item.region) ?? toStringValue(item.location),
    targetCount: toNumber(item.targetCount) ?? toNumber(item.targetsCount),
    currentVersion: toStringValue(item.currentVersion) ?? toStringValue(item.runtimeVersion),
  };
}

function normalizeTarget(raw: unknown): RuntimeFabricTarget {
  const item = asRecord(raw);
  return {
    id: toStringValue(item.id) ?? toStringValue(item.targetId) ?? toStringValue(item.name) ?? `target-${Math.random()}`,
    name: toStringValue(item.name) ?? toStringValue(item.displayName) ?? 'Unnamed target',
    type: toStringValue(item.type) ?? toStringValue(item.targetType),
    status: toStringValue(item.status) ?? toStringValue(item.lifecycleState),
    provider: toStringValue(item.provider) ?? toStringValue(item.infrastructureProvider),
  };
}

function normalizePatchWindow(raw: unknown): PrivateSpacePatchWindow {
  const item = asRecord(raw);
  return {
    id: toStringValue(item.id) ?? toStringValue(item.name) ?? `patch-${Math.random()}`,
    name: toStringValue(item.name) ?? 'Patch window',
    cron: toStringValue(item.cronExpression) ?? toStringValue(item.schedule),
    timezone: toStringValue(item.timezone),
  };
}

export async function getFabrics(organizationId: string): Promise<RuntimeFabricSummary[]> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(`${RUNTIME_FABRIC_BASE}/organizations/${organizationId}/fabrics`);
    return unwrapCollection(data, ['fabrics']).map(normalizeFabric);
  }, []);
}

export async function getPrivateSpaces(organizationId: string): Promise<PrivateSpaceSummary[]> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(`${RUNTIME_FABRIC_BASE}/organizations/${organizationId}/privatespaces`);
    return unwrapCollection(data, ['privateSpaces', 'items']).map(normalizePrivateSpace);
  }, []);
}

export async function getPrivateSpaceStatuses(organizationId: string): Promise<Record<string, string>> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(`${RUNTIME_FABRIC_BASE}/organizations/${organizationId}/privatespaces/status`);
    const entries = unwrapCollection<any>(data, ['statuses', 'items']);
    const statuses: Record<string, string> = {};
    for (const entry of entries) {
      const item = asRecord(entry);
      const id = toStringValue(item.id) ?? toStringValue(item.privateSpaceId) ?? toStringValue(item.name);
      const status = toStringValue(item.status) ?? toStringValue(item.phase);
      if (id && status) statuses[id] = status;
    }
    return statuses;
  }, {});
}

export async function getPrivateSpacePatchWindows(
  organizationId: string,
): Promise<PrivateSpacePatchWindow[]> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(
      `${RUNTIME_FABRIC_BASE}/organizations/${organizationId}/privatespaces/monthlypatchwindow`,
    );
    return unwrapCollection(data, ['windows', 'items']).map(normalizePatchWindow);
  }, []);
}

export async function getTargets(organizationId: string): Promise<RuntimeFabricTarget[]> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(`${RUNTIME_FABRIC_BASE}/organizations/${organizationId}/targets`);
    return unwrapCollection(data, ['targets']).map(normalizeTarget);
  }, []);
}

export async function getPrivateSpaceUsage(
  organizationId: string,
): Promise<RuntimeFabricUsage | null> {
  return withOptionalFallback(async () => {
    const { data } = await api.get(
      `${RUNTIME_FABRIC_BASE}/organizations/${organizationId}/usage/rtf_privatespaces`,
      { params: { includeUsageOfMigratedSpacesWithinTimeBoxPeriod: false } },
    );
    return {
      entitlementLimit: toNumber(findNestedValue(data, ['entitlementLimit', 'limit', 'max'])),
      currentUsage: toNumber(findNestedValue(data, ['currentUsage', 'usage', 'used'])),
      unit: toStringValue(findNestedValue(data, ['unit', 'metricUnit', 'usageUnit'])),
    };
  }, null);
}
