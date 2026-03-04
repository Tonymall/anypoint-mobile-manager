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
const RTF_BASE = '/runtimefabric/api/v1';

// ---------- Servers ----------

/**
 * List all registered servers for the given organization and environment.
 */
export async function getServers(
  organizationId: string,
  environmentId: string,
  params?: {
    offset?: number;
    limit?: number;
    searchTerm?: string;
  },
): Promise<PaginatedResponse<Server>> {
  const { data } = await api.get<PaginatedResponse<Server>>(
    `${SERVERS_BASE}/organizations/${organizationId}/environments/${environmentId}/servers`,
    { params },
  );
  return data;
}

/**
 * Get details for a specific server.
 */
export async function getServer(
  organizationId: string,
  environmentId: string,
  serverId: number,
): Promise<Server> {
  const { data } = await api.get<Server>(
    `${SERVERS_BASE}/organizations/${organizationId}/environments/${environmentId}/servers/${serverId}`,
  );
  return data;
}

/**
 * Register a new server with the given registration token.
 */
export async function addServer(
  organizationId: string,
  environmentId: string,
  server: {
    name: string;
    registrationToken: string;
  },
): Promise<Server> {
  const { data } = await api.post<Server>(
    `${SERVERS_BASE}/organizations/${organizationId}/environments/${environmentId}/servers`,
    server,
  );
  return data;
}

/**
 * Remove / unregister a server.
 */
export async function removeServer(
  organizationId: string,
  environmentId: string,
  serverId: number,
): Promise<void> {
  await api.delete(
    `${SERVERS_BASE}/organizations/${organizationId}/environments/${environmentId}/servers/${serverId}`,
  );
}

// ---------- Server Groups ----------

/**
 * Create a new server group from existing servers.
 */
export async function createServerGroup(
  organizationId: string,
  environmentId: string,
  group: {
    name: string;
    serverIds: number[];
  },
): Promise<ServerGroup> {
  const { data } = await api.post<ServerGroup>(
    `${SERVERS_BASE}/organizations/${organizationId}/environments/${environmentId}/serverGroups`,
    group,
  );
  return data;
}

// ---------- Clusters ----------

/**
 * Create a new cluster from existing servers.
 */
export async function createCluster(
  organizationId: string,
  environmentId: string,
  cluster: {
    name: string;
    serverIds: number[];
    multicastEnabled?: boolean;
  },
): Promise<Cluster> {
  const { data } = await api.post<Cluster>(
    `${SERVERS_BASE}/organizations/${organizationId}/environments/${environmentId}/clusters`,
    cluster,
  );
  return data;
}

// ---------- Server Actions ----------

/**
 * Restart a server.
 */
export async function restartServer(
  organizationId: string,
  environmentId: string,
  serverId: number,
): Promise<Server> {
  const { data } = await api.post<Server>(
    `${SERVERS_BASE}/organizations/${organizationId}/environments/${environmentId}/servers/${serverId}/restart`,
  );
  return data;
}

/**
 * Retrieve logs for a specific server.
 */
export async function getServerLogs(
  organizationId: string,
  environmentId: string,
  serverId: number,
  params?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  },
): Promise<PaginatedResponse<AppLogEntry>> {
  const { data } = await api.get<PaginatedResponse<AppLogEntry>>(
    `${SERVERS_BASE}/organizations/${organizationId}/environments/${environmentId}/servers/${serverId}/logs`,
    { params },
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
    `${RTF_BASE}/organizations/${organizationId}/environments/${environmentId}/deployments`,
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
