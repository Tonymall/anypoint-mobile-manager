// ============================================================
// Anypoint Mobile Platform - Environment Service
// Fetch and manage environments for an organization
// ============================================================

import axios from 'axios';
import api, { getBaseUrl, getStoredAccessToken } from './api';
import type { Environment } from '../types';

const ACCOUNTS_BASE = '/accounts/api';

/**
 * Build Authorization headers from stored token.
 * Uses a fresh axios instance to avoid any shared api interceptor issues.
 */
async function freshGet<T>(path: string): Promise<T> {
  const baseURL = getBaseUrl();
  const token = await getStoredAccessToken();

  if (token) {
    try {
      const { data } = await axios.get<T>(`${baseURL}${path}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/json',
        },
        timeout: 30000,
      });
      return data;
    } catch (_) {
      // Fall through to shared api
    }
  }

  // Fallback: shared api instance (has interceptor for token injection)
  const { data } = await api.get<T>(path);
  return data;
}

/**
 * List all environments for the given organization.
 * Uses fresh axios to avoid interceptor timing / shared state issues.
 */
export async function getEnvironments(
  organizationId: string,
): Promise<Environment[]> {
  const result = await freshGet<{ data: Environment[] }>(
    `${ACCOUNTS_BASE}/organizations/${organizationId}/environments`,
  );
  return result.data;
}

/**
 * Get a single environment by ID.
 */
export async function getEnvironment(
  organizationId: string,
  environmentId: string,
): Promise<Environment> {
  return freshGet<Environment>(
    `${ACCOUNTS_BASE}/organizations/${organizationId}/environments/${environmentId}`,
  );
}
