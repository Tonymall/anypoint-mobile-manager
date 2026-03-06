import api from './api';
import type { DesignCenterProject, PaginatedResponse } from '../types';

const DC_BASE = '/designcenter/api/v2';
const DC_DESIGNER_BASE = '/designcenter/api-designer';

export async function getProjects(
  organizationId: string,
  params?: { pageSize?: number; pageIndex?: number; orderBy?: string },
): Promise<PaginatedResponse<DesignCenterProject>> {
  const { data } = await api.get<PaginatedResponse<DesignCenterProject>>(
    `${DC_BASE}/organizations/${organizationId}/projects`,
    { params },
  );
  return data;
}

export async function getProject(projectId: string): Promise<DesignCenterProject> {
  // NOTE: this endpoint uses x-organization-id and x-owner-id headers
  // which are set via api defaults (X-ANYPNT-ORG-ID maps)
  const { data } = await api.get<DesignCenterProject>(
    `${DC_DESIGNER_BASE}/projects/${projectId}`,
  );
  return data;
}

export async function createProject(
  organizationId: string,
  ownerId: string,
  project: { name: string; classifier: string },
): Promise<DesignCenterProject> {
  const { data } = await api.post<DesignCenterProject>(
    `${DC_DESIGNER_BASE}/projects`,
    project,
    { headers: { 'x-organization-id': organizationId, 'x-owner-id': ownerId } },
  );
  return data;
}

export async function deleteProject(projectId: string): Promise<void> {
  await api.delete(`${DC_DESIGNER_BASE}/projects/${projectId}`);
}

export async function publishToExchange(
  projectId: string,
  branch: string,
  body: { main: string; apiVersion: string; version: string; assetId: string },
  organizationId: string,
  ownerId: string,
): Promise<void> {
  await api.post(
    `${DC_DESIGNER_BASE}/projects/${projectId}/branches/${branch}/publish/exchange`,
    body,
    { headers: { 'x-organization-id': organizationId, 'x-owner-id': ownerId, 'Content-Type': 'application/json' } },
  );
}
