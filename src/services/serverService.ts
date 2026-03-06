// ============================================================
// Anypoint Mobile Platform - Server & Infrastructure Service
// ============================================================

import api from './api';
import type {
  Server,
  ServerGroup,
  Cluster,
  RTFDeployment,
  AppLogEntry,
  PaginatedResponse,
} from '../types';

const SERVERS_BASE = '/armui/api/v1';
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
  const { data } = await api.get<PaginatedResponse<Server>>(
    `${SERVERS_BASE}/servers`,
    { params },
  );
  return data;
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
    `${SERVERS_BASE}/servers/${serverId}`,
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
    `${SERVERS_BASE}/servers`,
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
    `${SERVERS_BASE}/servers/${serverId}`,
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
    `${SERVERS_BASE}/serverGroups`,
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
    `${SERVERS_BASE}/clusters`,
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
    `${SERVERS_BASE}/servers/${serverId}/restart`,
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
    `${SERVERS_BASE}/servers/${serverId}/logs`,
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
