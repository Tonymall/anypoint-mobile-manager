// ============================================================
// Anypoint Mobile Platform - Environment Service
// Fetch and manage environments for an organization
// ============================================================

import api from './api';
import type { Environment } from '../types';

const ACCOUNTS_BASE = '/accounts/api';

/**
 * List all environments for the given organization.
 */
export async function getEnvironments(
  organizationId: string,
): Promise<Environment[]> {
  const { data } = await api.get<{ data: Environment[] }>(
    `${ACCOUNTS_BASE}/organizations/${organizationId}/environments`,
  );
  return data.data;
}

/**
 * Get a single environment by ID.
 */
export async function getEnvironment(
  organizationId: string,
  environmentId: string,
): Promise<Environment> {
  const { data } = await api.get<Environment>(
    `${ACCOUNTS_BASE}/organizations/${organizationId}/environments/${environmentId}`,
  );
  return data;
}
