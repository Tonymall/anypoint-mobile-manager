// ============================================================
// Anypoint Mobile Platform - Governance Service
// ============================================================

import api from './api';
import type {
  GovernanceProfile,
  GovernanceRuleset,
  ConformanceReport,
  GovernanceViolation,
  PaginatedResponse,
} from '../types';

const GOVERNANCE_BASE = '/apigovernance/api/v1';

// ---------- Governance Profiles ----------

/**
 * List all governance profiles for the organization.
 */
export async function getProfiles(
  organizationId: string,
  params?: {
    status?: 'active' | 'draft' | 'archived';
    offset?: number;
    limit?: number;
  },
): Promise<PaginatedResponse<GovernanceProfile>> {
  const { data } = await api.get<PaginatedResponse<GovernanceProfile>>(
    `${GOVERNANCE_BASE}/organizations/${organizationId}/profiles`,
    { params },
  );
  return data;
}

/**
 * Get details for a specific governance profile.
 */
export async function getProfile(
  organizationId: string,
  profileId: string,
): Promise<GovernanceProfile> {
  const { data } = await api.get<GovernanceProfile>(
    `${GOVERNANCE_BASE}/organizations/${organizationId}/profiles/${profileId}`,
  );
  return data;
}

// ---------- Rulesets ----------

/**
 * List all available governance rulesets.
 */
export async function getRulesets(
  organizationId: string,
  params?: {
    category?: string;
    offset?: number;
    limit?: number;
  },
): Promise<PaginatedResponse<GovernanceRuleset>> {
  const { data } = await api.get<PaginatedResponse<GovernanceRuleset>>(
    `${GOVERNANCE_BASE}/organizations/${organizationId}/rulesets`,
    { params },
  );
  return data;
}

// ---------- Validation ----------

/**
 * Run governance validation against a specific API definition.
 */
export async function runValidation(
  organizationId: string,
  params: {
    profileId: string;
    apiId: string;
    version?: string;
  },
): Promise<ConformanceReport> {
  const { data } = await api.post<ConformanceReport>(
    `${GOVERNANCE_BASE}/organizations/${organizationId}/validations`,
    params,
  );
  return data;
}

// ---------- Conformance Reports ----------

/**
 * Get conformance reports for APIs in the organization.
 */
export async function getConformanceReports(
  organizationId: string,
  params?: {
    profileId?: string;
    status?: 'conformant' | 'non-conformant' | 'not-validated';
    offset?: number;
    limit?: number;
  },
): Promise<PaginatedResponse<ConformanceReport>> {
  const { data } = await api.get<PaginatedResponse<ConformanceReport>>(
    `${GOVERNANCE_BASE}/organizations/${organizationId}/conformance`,
    { params },
  );
  return data;
}

// ---------- Violations ----------

/**
 * Get governance violations for a specific API.
 */
export async function getViolations(
  organizationId: string,
  apiId: string,
  params?: {
    severity?: 'error' | 'warning' | 'info';
    profileId?: string;
    offset?: number;
    limit?: number;
  },
): Promise<PaginatedResponse<GovernanceViolation>> {
  const { data } = await api.get<PaginatedResponse<GovernanceViolation>>(
    `${GOVERNANCE_BASE}/organizations/${organizationId}/apis/${apiId}/violations`,
    { params },
  );
  return data;
}
