// ============================================================
// Anypoint Mobile Platform - Server & Infrastructure Service
// ============================================================

import api from './api';
import { armGetCollection, getArmBase } from './armApiVersion';
import type {
  Server,
  ServerGroup,
  Cluster,
  RTFDeployment,
  AppLogEntry,
  PaginatedResponse,
} from '../types';

const CLOUDHUB_BASE = '/cloudhub/api/v2';
const HYBRID_BASE = '/hybrid/api/v2';

// ---------- Servers ----------

/**
 * List all registered servers for the given organization and environment.
 */
export async function getServers(
  _organizationId: string,
  _environmentId: string,
  params?: {
    offset?: number;
    limit?: number;
    searchTerm?: string;
  },
): Promise<PaginatedResponse<Server>> {
  return armGetCollection<PaginatedResponse<Server>>('/servers', { params });
}

/**
 * Get details for a specific server.
 */
export async function getServer(
  _organizationId: string,
  _environmentId: string,
  serverId: number,
): Promise<Server> {
  const { data } = await api.get<Server>(
    `${getArmBase()}/servers/${serverId}`,
  );
  return data;
}

/**
 * Register a new server with the given registration token.
 */
export async function addServer(
  _organizationId: string,
  _environmentId: string,
  server: {
    name: string;
    registrationToken: string;
  },
): Promise<Server> {
  const { data } = await api.post<Server>(
    `${getArmBase()}/servers`,
    server,
  );
  return data;
}

/**
 * Remove / unregister a server.
 */
export async function removeServer(
  _organizationId: string,
  _environmentId: string,
  serverId: number,
): Promise<void> {
  await api.delete(
    `${getArmBase()}/servers/${serverId}`,
  );
}

// ---------- Server Groups ----------

/**
 * Create a new server group from existing servers.
 */
export async function createServerGroup(
  _organizationId: string,
  _environmentId: string,
  group: {
    name: string;
    serverIds: number[];
  },
): Promise<ServerGroup> {
  const { data } = await api.post<ServerGroup>(
    `${getArmBase()}/serverGroups`,
    group,
  );
  return data;
}

// ---------- Clusters ----------

/**
 * Create a new cluster from existing servers.
 */
export async function createCluster(
  _organizationId: string,
  _environmentId: string,
  cluster: {
    name: string;
    serverIds: number[];
    multicastEnabled?: boolean;
  },
): Promise<Cluster> {
  const { data } = await api.post<Cluster>(
    `${getArmBase()}/clusters`,
    cluster,
  );
  return data;
}

// ---------- Server Actions ----------

/**
 * Restart a server.
 */
export async function restartServer(
  _organizationId: string,
  _environmentId: string,
  serverId: number,
): Promise<Server> {
  const { data } = await api.post<Server>(
    `${getArmBase()}/servers/${serverId}/restart`,
  );
  return data;
}

/**
 * Retrieve logs for a specific server.
 */
export async function getServerLogs(
  _organizationId: string,
  _environmentId: string,
  serverId: number,
  params?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  },
): Promise<PaginatedResponse<AppLogEntry>> {
  const { data } = await api.get<PaginatedResponse<AppLogEntry>>(
    `${getArmBase()}/servers/${serverId}/logs`,
    { params },
  );
  return data;
}

// ---------- Server Groups (List) ----------
export async function getServerGroups(
  _organizationId: string,
  _environmentId: string,
): Promise<ServerGroup[]> {
  const { data } = await api.get<ServerGroup[]>(
    '/hybrid/api/v1/serverGroups',
  );
  return data;
}

// ---------- Clusters (List) ----------
export async function getClusters(
  _organizationId: string,
  _environmentId: string,
): Promise<Cluster[]> {
  const { data } = await api.get<Cluster[]>(
    '/hybrid/api/v1/clusters',
  );
  return data;
}

// ---------- Runtime Fabric ----------

/**
 * List deployments on Runtime Fabric targets.
 */
export async function getRTFDeployments(
  organizationId: string,
  environmentId: string,
  params?: {
    offset?: number;
    limit?: number;
  },
): Promise<PaginatedResponse<RTFDeployment>> {
  const { data } = await api.get<PaginatedResponse<RTFDeployment>>(
    `${HYBRID_BASE}/organizations/${organizationId}/environments/${environmentId}/deployments`,
    { params },
  );
  return data;
}

// ---------- CloudHub Regions ----------

/**
 * List available CloudHub deployment regions.
 */
export async function getCloudHubRegions(): Promise<
  Array<{ id: string; name: string; defaultWorkerSize: string }>
> {
  const { data } = await api.get<
    Array<{ id: string; name: string; defaultWorkerSize: string }>
  >(`${CLOUDHUB_BASE}/regions`);
  return data;
}
