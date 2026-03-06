// ============================================================
// Anypoint Mobile Platform - Access Management Service
// ============================================================

import api from './api';
import type {
  User,
  UserRole,
  Team,
  AuditLogEntry,
  ConnectedApp,
  Environment,
  PaginatedResponse,
} from '../types';

const ACCOUNTS_BASE = '/accounts/api';
const ACCESS_BASE = '/access-management/api/v1';

// ---------- Users ----------

/**
 * List all users in the organization.
 */
export async function getUsers(
  organizationId: string,
  params?: {
    offset?: number;
    limit?: number;
    search?: string;
    type?: string;
  },
): Promise<PaginatedResponse<User>> {
  const { data } = await api.get<PaginatedResponse<User>>(
    `${ACCOUNTS_BASE}/organizations/${organizationId}/members`,
    { params },
  );
  return data;
}

/**
 * Invite a new user to the organization.
 */
export async function inviteUser(
  organizationId: string,
  invitation: {
    email: string;
    roleIds?: string[];
    teamIds?: string[];
  },
): Promise<{ id: string; email: string; status: string }> {
  const { data } = await api.post<{ id: string; email: string; status: string }>(
    `${ACCOUNTS_BASE}/organizations/${organizationId}/invites`,
    invitation,
  );
  return data;
}

/**
 * Deactivate (disable) a user in the organization.
 */
export async function deactivateUser(
  organizationId: string,
  userId: string,
): Promise<void> {
  await api.delete(
    `${ACCOUNTS_BASE}/organizations/${organizationId}/members/${userId}`,
  );
}

// ---------- Teams ----------

/**
 * List all teams in the organization.
 */
export async function getTeams(
  organizationId: string,
  params?: {
    offset?: number;
    limit?: number;
    search?: string;
    parentTeamId?: string;
  },
): Promise<PaginatedResponse<Team>> {
  const { data } = await api.get<PaginatedResponse<Team>>(
    `${ACCOUNTS_BASE}/organizations/${organizationId}/teams`,
    { params },
  );
  return data;
}

/**
 * Create a new team in the organization.
 */
export async function createTeam(
  organizationId: string,
  team: {
    name: string;
    description?: string;
    parentTeamId?: string;
  },
): Promise<Team> {
  const { data } = await api.post<Team>(
    `${ACCOUNTS_BASE}/organizations/${organizationId}/teams`,
    team,
  );
  return data;
}

// ---------- Roles ----------

/**
 * Assign a role to a user or team in the organization.
 */
export async function assignRole(
  organizationId: string,
  assignment: {
    roleId: string;
    userId?: string;
    teamId?: string;
    environmentId?: string;
  },
): Promise<UserRole> {
  const { data } = await api.post<UserRole>(
    `${ACCOUNTS_BASE}/organizations/${organizationId}/roleAssignments`,
    assignment,
  );
  return data;
}

// ---------- Audit Logs ----------

/**
 * Retrieve audit log entries for the organization.
 */
export async function getAuditLogs(
  organizationId: string,
  params?: {
    action?: string;
    objectType?: string;
    userName?: string;
    startDate?: string;
    endDate?: string;
    offset?: number;
    limit?: number;
  },
): Promise<PaginatedResponse<AuditLogEntry>> {
  const { data } = await api.get<PaginatedResponse<AuditLogEntry>>(
    `${ACCESS_BASE}/organizations/${organizationId}/audit`,
    { params },
  );
  return data;
}

// ---------- Connected Apps ----------

/**
 * List all connected (external) applications in the organization.
 */
export async function getConnectedApps(
  _organizationId: string,
  params?: {
    offset?: number;
    limit?: number;
    includeUsage?: boolean;
  },
): Promise<PaginatedResponse<ConnectedApp>> {
  const { data } = await api.get<PaginatedResponse<ConnectedApp>>(
    `${ACCOUNTS_BASE}/connectedApplications`,
    { params: { limit: 100, offset: 0, includeUsage: true, ...params } },
  );
  return data;
}

// ---------- Environments ----------

/**
 * Manage (create, update, or delete) environments for an organization.
 */
export async function manageEnvironments(
  organizationId: string,
  action: 'create' | 'update' | 'delete',
  environment: {
    id?: string;
    name?: string;
    type?: 'sandbox' | 'production' | 'design';
    isProduction?: boolean;
  },
): Promise<Environment | void> {
  switch (action) {
    case 'create': {
      const { data } = await api.post<Environment>(
        `${ACCOUNTS_BASE}/organizations/${organizationId}/environments`,
        {
          name: environment.name,
          type: environment.type,
          isProduction: environment.isProduction ?? false,
        },
      );
      return data;
    }
    case 'update': {
      const { data } = await api.put<Environment>(
        `${ACCOUNTS_BASE}/organizations/${organizationId}/environments/${environment.id}`,
        {
          name: environment.name,
          type: environment.type,
          isProduction: environment.isProduction,
        },
      );
      return data;
    }
    case 'delete': {
      await api.delete(
        `${ACCOUNTS_BASE}/organizations/${organizationId}/environments/${environment.id}`,
      );
      return;
    }
  }
}

// ---------- Permissions ----------

/**
 * Get the permissions / entitlements for the current user in the organization.
 */
export async function getPermissions(
  organizationId: string,
): Promise<Array<{ resource: string; actions: string[] }>> {
  const { data } = await api.get<Array<{ resource: string; actions: string[] }>>(
    `${ACCOUNTS_BASE}/cs/organizations/${organizationId}/permissions/products`,
  );
  return data;
}
