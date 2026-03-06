// ============================================================
// Anypoint Mobile Platform - Deployment Service
//
// Platform-aware: fetches from BOTH CloudHub and Hybrid/RTF
// backends, merges results into a unified list.
//
// CloudHub: per-app deployment history via
//   GET /cloudhub/api/v2/applications/{domain}/deployments
// Hybrid/RTF: environment-scoped via
//   GET /hybrid/api/v2/organizations/{org}/environments/{env}/deployments
// ============================================================

import api from './api';
import type {
  DeploymentHistory,
  DeploymentStatus,
  Application,
  PaginatedResponse,
} from '../types';
import logger from '../utils/logger';

const CLOUDHUB_BASE = '/cloudhub/api/v2';
const HYBRID_BASE = '/hybrid/api/v2';

// ---------- CloudHub per-app deployment → DeploymentHistory ----------

/**
 * Normalize a CloudHub per-app deployment record into DeploymentHistory.
 * These come from GET /cloudhub/api/v2/applications/{domain}/deployments.
 */
function normalizeChDeployment(dep: any, appDomain: string): DeploymentHistory {
  let status: DeploymentStatus = 'DEPLOYED';
  const raw = (dep?.status ?? '').toUpperCase();
  if (raw === 'STARTED' || raw === 'RUNNING') status = 'DEPLOYED';
  else if (raw === 'DEPLOYING' || raw === 'APPLYING') status = 'DEPLOYING';
  else if (raw === 'FAILED' || raw === 'DEPLOYMENT_FAILED') status = 'FAILED';
  else if (raw === 'UNDEPLOYED' || raw === 'UNDEPLOYING' || raw === 'NOT_RUNNING' || raw === 'DELETING') status = 'UNDEPLOYING';
  else if (raw === 'PARTIALLY_STARTED') status = 'PARTIALLY_DEPLOYED';

  return {
    id: dep.deploymentId ?? dep._id ?? dep.id ?? '',
    applicationName: appDomain,
    version: dep.applicationVersion ?? dep.muleVersion ?? '',
    status,
    target: 'CloudHub',
    targetType: 'cloudhub',
    startedAt: dep.createTime ?? dep.lastUpdateTime ?? '',
    completedAt: dep.lastUpdateTime ?? dep.endTime ?? undefined,
    initiatedBy: dep.userId ?? 'system',
  };
}

// ---------- Deployment History (multi-platform) ----------

/**
 * Retrieve deployment history across ALL platforms in an environment.
 *
 * **CloudHub** — fetches the app list from
 *   `GET /cloudhub/api/v2/applications`
 * then for each app fetches per-app deployment timelines from
 *   `GET /cloudhub/api/v2/applications/{domain}/deployments`
 * and normalizes each record into `DeploymentHistory`.
 *
 * **Hybrid / RTF** — fetches environment-scoped deployment records from
 *   `GET /hybrid/api/v2/organizations/{org}/environments/{env}/deployments`
 *
 * If one platform returns a 404/403 (e.g. no Hybrid registrations in a
 * CloudHub-only env, or vice-versa) that source is silently skipped.
 * Only throws when *both* sources fail with non-404/403 errors.
 */
export async function getDeploymentHistory(
  organizationId: string,
  environmentId: string,
  params?: {
    applicationName?: string;
    status?: DeploymentStatus;
    offset?: number;
    limit?: number;
  },
): Promise<PaginatedResponse<DeploymentHistory>> {
  const [hybridResult, chAppsResult] = await Promise.allSettled([
    // Hybrid / RTF deployments (environment-scoped)
    api.get<PaginatedResponse<DeploymentHistory>>(
      `${HYBRID_BASE}/organizations/${organizationId}/environments/${environmentId}/deployments`,
      { params },
    ),
    // CloudHub 1.0 — list all apps in the environment (org/env via headers)
    api.get(`${CLOUDHUB_BASE}/applications`),
  ]);

  const merged: DeploymentHistory[] = [];
  let sourcesReached = 0;

  // ── Hybrid results ──
  if (hybridResult.status === 'fulfilled') {
    sourcesReached++;
    const body = hybridResult.value.data;
    const items: DeploymentHistory[] = Array.isArray(body) ? body : (body?.data ?? []);
    merged.push(...items);
    logger.log(`[DeploymentService] Hybrid: ${items.length} records`);
  } else {
    const code = (hybridResult.reason as any)?.response?.status;
    if (code === 404 || code === 403) {
      sourcesReached++;
      logger.log('[DeploymentService] Hybrid endpoint not available (CloudHub-only env?)');
    } else {
      logger.warn('[DeploymentService] Hybrid fetch failed:', hybridResult.reason?.message ?? hybridResult.reason);
    }
  }

  // ── CloudHub per-app deployment history ──
  if (chAppsResult.status === 'fulfilled') {
    const appsBody = chAppsResult.value.data;
    const apps: any[] = Array.isArray(appsBody) ? appsBody : (appsBody?.data ?? appsBody?.items ?? []);
    logger.log(`[DeploymentService] CloudHub: ${apps.length} apps found`);

    const appDomains = apps
      .map((a: any) => a.domain ?? a.name ?? '')
      .filter(Boolean);

    if (appDomains.length === 0) {
      // App list succeeded but no apps — CloudHub source is reachable
      sourcesReached++;
      logger.log('[DeploymentService] CloudHub: no apps in environment');
    } else {
      // Fetch per-app deployment timelines concurrently
      const perAppResults = await Promise.allSettled(
        appDomains.map((domain: string) =>
          api.get(`${CLOUDHUB_BASE}/applications/${domain}/deployments`, {
            params: { orderByDate: 'DESC' },
          }),
        ),
      );

      let perAppSuccessCount = 0;
      let perAppFailCount = 0;

      for (let i = 0; i < perAppResults.length; i++) {
        const result = perAppResults[i];
        const domain = appDomains[i];
        if (result.status === 'fulfilled') {
          perAppSuccessCount++;
          const depBody = result.value.data;
          const deps: any[] = Array.isArray(depBody) ? depBody : (depBody?.data ?? depBody?.items ?? []);
          const normalized = deps.map((d: any) => normalizeChDeployment(d, domain));
          merged.push(...normalized);
        } else {
          perAppFailCount++;
          logger.warn(`[DeploymentService] CloudHub per-app failed for ${domain}:`, (perAppResults[i] as any).reason?.message ?? '');
        }
      }

      logger.log(`[DeploymentService] CloudHub per-app: ${perAppSuccessCount} succeeded, ${perAppFailCount} failed`);

      // Only count CloudHub as reachable if at least one per-app call succeeded.
      // If the app list succeeded but every per-app call failed, the deployment
      // endpoint may be misconfigured or the environment is non-standard — do NOT
      // silently swallow the failure.
      if (perAppSuccessCount > 0) {
        sourcesReached++;
      } else {
        logger.warn(`[DeploymentService] CloudHub: app list returned ${appDomains.length} apps but all per-app deployment calls failed`);
      }
    }
  } else {
    const code = (chAppsResult.reason as any)?.response?.status;
    if (code === 404 || code === 403) {
      sourcesReached++;
      logger.log('[DeploymentService] CloudHub endpoint not available (Hybrid-only env?)');
    } else {
      logger.warn('[DeploymentService] CloudHub apps fetch failed:', chAppsResult.reason?.message ?? chAppsResult.reason);
    }
  }

  // If neither source was reachable, throw so the UI shows ErrorState
  if (sourcesReached === 0) {
    throw new Error('Failed to load deployment history from any platform.');
  }

  // Sort merged results by startedAt descending (newest first)
  merged.sort((a, b) =>
    new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  return {
    data: merged,
    total: merged.length,
    offset: params?.offset ?? 0,
    limit: params?.limit ?? merged.length,
  };
}

// ---------- Redeployment (CloudHub) ----------

/**
 * Trigger a redeployment of a CloudHub application.
 * Uses the CloudHub API — not applicable to Hybrid/RTF targets.
 */
export async function triggerRedeployment(
  domain: string,
): Promise<Application> {
  const { data } = await api.post<Application>(
    `${CLOUDHUB_BASE}/applications/${domain}/deploy`,
  );
  return data;
}

// ---------- Rollback (Hybrid/RTF) ----------

/**
 * Roll back a Hybrid/RTF deployment to a previous version.
 * Not applicable to CloudHub — use `triggerRedeployment` instead.
 */
export async function rollback(
  organizationId: string,
  environmentId: string,
  applicationName: string,
  deploymentId: string,
): Promise<DeploymentHistory> {
  const { data } = await api.post<DeploymentHistory>(
    `${HYBRID_BASE}/organizations/${organizationId}/environments/${environmentId}/deployments/${deploymentId}/rollback`,
    { applicationName },
  );
  return data;
}

// ---------- Deployment Status (Hybrid/RTF) ----------

/**
 * Get status of a specific Hybrid/RTF deployment.
 * Not applicable to CloudHub deployments.
 */
export async function getDeploymentStatus(
  organizationId: string,
  environmentId: string,
  deploymentId: string,
): Promise<DeploymentHistory> {
  const { data } = await api.get<DeploymentHistory>(
    `${HYBRID_BASE}/organizations/${organizationId}/environments/${environmentId}/deployments/${deploymentId}`,
  );
  return data;
}

// ---------- Promote Between Environments (Hybrid/RTF) ----------

/**
 * Promote a Hybrid/RTF deployment from one environment to another.
 * Not applicable to CloudHub — CloudHub deployments are re-deployed
 * individually via `triggerRedeployment`.
 */
export async function promoteEnvironment(
  organizationId: string,
  sourceEnvironmentId: string,
  applicationName: string,
  targetEnvironmentId: string,
  overrides?: {
    workerCount?: number;
    workerType?: string;
    properties?: Record<string, string>;
  },
): Promise<DeploymentHistory> {
  const { data } = await api.post<DeploymentHistory>(
    `${HYBRID_BASE}/organizations/${organizationId}/environments/${sourceEnvironmentId}/deployments/promote`,
    {
      applicationName,
      targetEnvironmentId,
      ...overrides,
    },
  );
  return data;
}
