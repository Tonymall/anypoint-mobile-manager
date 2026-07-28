// ============================================================
// Anypoint Mobile Platform - Runtime Manager Service
// Logs: endpoint discovery, retrieval strategies, and log
// extraction/normalization/parsing helpers
// ============================================================

import api from '../api';
import logger from '../../utils/logger';
import type { AppLogEntry } from '../../types';
import {
  CLOUDHUB_BASE,
  CLOUDHUB_V1,
  AMC_BASE,
  HYBRID_BASE,
  getOrgId,
  getEnvId,
  amcDeploymentsPath,
  matchDeployment,
} from './shared';
import { sessionState } from './state';

// ---------- Logs ----------

/**
 * Check if log endpoints are known to be unavailable.
 * When true, the UI should disable live polling to avoid spamming
 * failing API calls every 5 seconds.
 */
export function areLogEndpointsAvailable(): boolean {
  return sessionState._logEndpointsAvailable || !sessionState._logEndpointsChecked;
}

/**
 * Retrieve application log entries.
 *
 * Tries multiple CloudHub / Anypoint Monitoring endpoints because the available
 * API varies by region, deployment target (CH1/CH2), and subscription level.
 *
 * IMPORTANT: On EU1 CloudHub 1.0:
 * - GET /logs returns 405 (Method Not Allowed) → we try POST instead
 * - Most /instances endpoints return 404
 * - Monitoring log search endpoints require Titanium subscription
 */
export async function getAppLogs(
  domain: string,
  params?: {
    startDate?: string;
    endDate?: string;
    priority?: string;
    search?: string;
    limit?: number;
    offset?: number;
  },
): Promise<AppLogEntry[]> {
  // ── PER-DOMAIN RESET: if switching to a different app, clear stale flags ──
  // This prevents a failed log discovery for app A from blocking app B's logs.
  if (sessionState._logCheckedForDomain && sessionState._logCheckedForDomain !== domain) {
    logger.log(`[getAppLogs] Domain changed from "${sessionState._logCheckedForDomain}" to "${domain}" — resetting log flags`);
    sessionState._logEndpointsAvailable = true;
    sessionState._logEndpointsChecked = false;
    sessionState._workingLogStrategy = null;
    sessionState._instancesEndpointAvailable = true;
  }
  sessionState._logCheckedForDomain = domain;

  const now = new Date();
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

  const startMs = params?.startDate
    ? new Date(params.startDate).getTime()
    : oneDayAgo.getTime();
  const endMs = params?.endDate
    ? new Date(params.endDate).getTime()
    : now.getTime();

  const limit = params?.limit ?? 200;

  // POST body — used by the CloudHub /logs POST endpoint.
  //
  // The server told us the EXACT 14 valid fields via a 400 error:
  //   "deploymentId", "priority", "tenantId", "endTime", "text",
  //   "startTime", "instanceId", "threadName", "descending",
  //   "loggerName", "lowerId", "upperId", "limitMsgLen", "limit"
  //
  // NOTE: "lowPriority" and "search" are NOT valid and cause 400.
  //       The text search field is "text", not "search".
  const postBody: Record<string, any> = {
    deploymentId: domain,
    startTime: startMs,
    endTime: endMs,
    limit,
    descending: true,
  };
  if (params?.priority) postBody.priority = params.priority;
  if (params?.search) postBody.text = params.search; // field is "text", NOT "search"

  // GET query params — used by some older /log endpoints
  const getParams: Record<string, any> = {
    startDate: startMs,
    endDate: endMs,
    limit,
    descending: true,
  };
  if (params?.priority) getParams.priority = params.priority;
  if (params?.search) getParams.search = params.search;

  const orgId = getOrgId();
  const envId = getEnvId();

  // If we already know ALL log endpoints fail, skip the expensive enumeration
  if (!sessionState._logEndpointsAvailable && sessionState._logEndpointsChecked) {
    return [];
  }

  // POST body WITHOUT deploymentId — the domain is already in the URL path.
  // Including a deploymentId that doesn't match the actual internal deployment ID
  // can cause the server to return 200 OK with zero results (no error, just empty).
  const postBodyNoDeplId: Record<string, any> = {
    startTime: startMs,
    endTime: endMs,
    limit,
    descending: true,
  };
  if (params?.priority) postBodyNoDeplId.priority = params.priority;
  if (params?.search) postBodyNoDeplId.text = params.search;

  // ── FAST PATH: if we already know which strategy works, use it directly ──
  // This eliminates ALL the /instances 404 spam and unnecessary fallback attempts.
  if (sessionState._workingLogStrategy) {
    try {
      const { data } = await _getLogsByStrategy(sessionState._workingLogStrategy, domain, postBodyNoDeplId, postBody, getParams, orgId, envId);
      const entries = extractLogEntries(data);
      if (entries.length > 0) return entries;
    } catch (_) {
      // Working strategy failed (maybe different app) — fall through to full scan
      sessionState._workingLogStrategy = null;
    }
  }

  // ── Named strategies for the attempt loop ──
  const strategies: Array<{ name: string; fn: () => Promise<any> }> = [];

  // ---------------------------------------------------------------
  // 1) POST /logs — this is the CORRECT method for CloudHub log search
  // ---------------------------------------------------------------
  strategies.push(
    { name: 'post-v2-no-deplid', fn: () => api.post(`${CLOUDHUB_BASE}/applications/${domain}/logs`, postBodyNoDeplId) },
    { name: 'post-v2-with-deplid', fn: () => api.post(`${CLOUDHUB_BASE}/applications/${domain}/logs`, postBody) },
    { name: 'post-v1-no-deplid', fn: () => api.post(`${CLOUDHUB_V1}/applications/${domain}/logs`, postBodyNoDeplId) },
    { name: 'post-v1-with-deplid', fn: () => api.post(`${CLOUDHUB_V1}/applications/${domain}/logs`, postBody) },
  );

  // ---------------------------------------------------------------
  // 2) Deployment-based GET /logs (real browser flow)
  //    The Anypoint web UI fetches logs via:
  //      GET .../applications/{domain}/deployments?orderByDate=DESC&loggingVersion=VERSION_2
  //      GET .../applications/{domain}/deployments/{deploymentId}/logs?tail=true&limitMsgLen=5000
  //    The deployment ID (e.g. "69959c9d64b87b16e38cdb96") is NOT the domain name.
  // ---------------------------------------------------------------
  strategies.push(
    { name: 'ch1-deploy-lookup', fn: async () => {
      // Step 1: Get the real deployment ID
      const { data: deploymentsData } = await api.get(
        `${CLOUDHUB_BASE}/applications/${domain}/deployments`,
        { params: { orderByDate: 'DESC', loggingVersion: 'VERSION_2' } },
      );
      const deployments = Array.isArray(deploymentsData)
        ? deploymentsData
        : (deploymentsData?.data ?? deploymentsData?.items ?? []);
      if (deployments.length === 0) throw new Error('No deployments found');

      const deploymentId = deployments[0]?.deploymentId ?? deployments[0]?.id ?? deployments[0]?._id;
      if (!deploymentId) throw new Error('No deploymentId in deployments response');

      // Cache for fast path
      sessionState._cachedCh1DeploymentId = deploymentId;
      sessionState._cachedCh1Domain = domain;
      logger.log(`[getAppLogs] CH1 deployment discovered: ${deploymentId}`);

      // Step 2: Match the real browser flow first.
      try {
        return await api.get(
          `${CLOUDHUB_BASE}/applications/${domain}/deployments/${deploymentId}/logs`,
          { params: { tail: true, limitMsgLen: 5000, limit } },
        );
      } catch (_) {
        try {
          return await api.post(`${CLOUDHUB_BASE}/applications/${domain}/logs`, postBodyNoDeplId);
        } catch (_) {
          return api.get(
            `${CLOUDHUB_BASE}/applications/${domain}/deployments/${deploymentId}/logs`,
            { params: { startDate: startMs, endDate: endMs, limit, limitMsgLen: 5000 } },
          );
        }
      }
    }},
    // Fallback: try with domain as deployment ID (older API pattern)
    { name: 'get-deploy-v2', fn: () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/deployments/${domain}/logs`, { params: getParams }) },
    { name: 'get-deploy-v1', fn: () => api.get(`${CLOUDHUB_V1}/applications/${domain}/deployments/${domain}/logs`, { params: getParams }) },
  );

  // ---------------------------------------------------------------
  // 3) Instance-specific endpoints (only if /instances hasn't failed before)
  // ---------------------------------------------------------------
  if (sessionState._instancesEndpointAvailable) {
    let instanceIds: string[] = [];
    try {
      const { data: instances } = await api.get(`${CLOUDHUB_BASE}/applications/${domain}/instances`);
      if (Array.isArray(instances)) {
        instanceIds = instances.map((i: any) => i.instanceId ?? i.id).filter(Boolean);
      }
    } catch (_) { /* no instances endpoint */ }

    if (instanceIds.length === 0) {
      try {
        const { data: instances } = await api.get(`${CLOUDHUB_V1}/applications/${domain}/instances`);
        if (Array.isArray(instances)) {
          instanceIds = instances.map((i: any) => i.instanceId ?? i.id).filter(Boolean);
        }
      } catch (_) { /* not available */ }
    }

    // If both /instances calls returned nothing, cache the failure
    if (instanceIds.length === 0) {
      sessionState._instancesEndpointAvailable = false;
      logger.log('[getAppLogs] /instances endpoints returned nothing — skipping for session');
    }

    for (const instanceId of instanceIds.slice(0, 2)) {
      strategies.push(
        { name: `get-instance-logfile-v2-${instanceId}`, fn: () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/instances/${instanceId}/log-file`, {
          params: { startDate: startMs, endDate: endMs },
          transformResponse: [(data: any) => data],
        })},
        { name: `get-instance-logfile-v1-${instanceId}`, fn: () => api.get(`${CLOUDHUB_V1}/applications/${domain}/instances/${instanceId}/log-file`, {
          params: { startDate: startMs, endDate: endMs },
          transformResponse: [(data: any) => data],
        })},
        { name: `get-instance-log-v2-${instanceId}`, fn: () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/instances/${instanceId}/log`, { params: getParams }) },
      );
    }
  }

  // ---------------------------------------------------------------
  // 4) Application-level log endpoints (CH1 fallbacks)
  // ---------------------------------------------------------------
  strategies.push(
    { name: 'get-logfile-v1', fn: () => api.get(`${CLOUDHUB_V1}/applications/${domain}/log-file`, {
      params: { startDate: startMs, endDate: endMs },
      transformResponse: [(data: any) => data],
    })},
    { name: 'get-log-v1', fn: () => api.get(`${CLOUDHUB_V1}/applications/${domain}/log`, { params: getParams }) },
    { name: 'get-log-v2', fn: () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/log`, { params: getParams }) },
  );

  // ---------------------------------------------------------------
  // 5) Anypoint Monitoring / Observability log search (CH1 + CH2)
  // ---------------------------------------------------------------
  if (orgId && envId && sessionState.monitoringApiAvailable) {
    strategies.push(
      { name: 'monitoring-query', fn: () => api.post(`/monitoring/query/api/v2/organizations/${orgId}/environments/${envId}/logs`, {
        query: `*${domain}*`,
        from: new Date(startMs).toISOString(),
        to: new Date(endMs).toISOString(),
        limit,
        ascending: false,
      })},
      { name: 'monitoring-es', fn: () => api.post(`/monitoring/log/api/v1/organizations/${orgId}/environments/${envId}/search`, {
        query: { query_string: { query: `applicationName:"${domain}"` } },
        from: 0,
        size: limit,
        sort: [{ timestamp: { order: 'desc' } }],
      })},
    );
  }

  // ---------------------------------------------------------------
  // 6) CloudHub 2.0 (AMC) deployment log endpoints
  // ---------------------------------------------------------------
  const amcPath = amcDeploymentsPath();
  if (amcPath) {
    // ── CH2/AMC log discovery ──
    // First resolve the deployment once, then try multiple log sub-paths.
    strategies.push(
      { name: 'amc-specs-logs', fn: async () => {
        // Step 1: Find the deployment
        const { data: deps } = await api.get(amcPath!, { headers: { Accept: 'application/json' } });
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => matchDeployment(d, domain));
        if (!match) throw new Error('No CH2 deployment found');
        const deploymentId = match.id;

        // Step 2: Get specs for this deployment
        const { data: specsData } = await api.get(
          `${amcPath}/${deploymentId}/specs`,
          { params: { limit: 1000 }, headers: { Accept: 'application/json' } },
        );
        const specs = Array.isArray(specsData)
          ? specsData
          : (specsData?.items ?? specsData?.data ?? specsData?.specs ?? []);
        if (specs.length === 0) throw new Error('No specs found for deployment');

        // Sort specs by date (newest first) to ensure we get the LATEST spec
        specs.sort((a: any, b: any) => {
          const dateA = new Date(a.lastModifiedDate ?? a.createdDate ?? a.updatedDate ?? 0).getTime();
          const dateB = new Date(b.lastModifiedDate ?? b.createdDate ?? b.updatedDate ?? 0).getTime();
          return dateB - dateA;
        });

        // Use the first (most recent) spec — try multiple field names
        const spec0 = specs[0];
        const specId = spec0?.id ?? spec0?.specId ?? spec0?._id ?? spec0?.version;
        if (!specId) {
          logger.warn('[getAppLogs] specs[0] has no recognizable ID field. Keys:', Object.keys(spec0 ?? {}));
          throw new Error('No specId found in specs response');
        }

        // Cache for fast path on subsequent polls
        sessionState._cachedAmcDeploymentId = deploymentId;
        sessionState._cachedAmcSpecId = specId;
        sessionState._cachedAmcDomain = domain;

        logger.log(`[getAppLogs] AMC specs discovered: deploymentId=${deploymentId}, specId=${specId}`);

        // Step 3: Try to get logs via replicas first (the standard CH2 pattern)
        try {
          const { data: replicasData } = await api.get(
            `${amcPath}/${deploymentId}/specs/${specId}/replicas`,
            { headers: { Accept: 'application/json' } },
          );
          const replicas = Array.isArray(replicasData)
            ? replicasData
            : (replicasData?.items ?? replicasData?.data ?? replicasData?.replicas ?? []);
          if (replicas.length > 0) {
            const replicaId = replicas[0]?.id ?? replicas[0]?.replicaId ?? replicas[0]?.name;
            if (replicaId) {
              logger.log(`[getAppLogs] AMC replica discovered: ${replicaId}`);
              return api.get(
                `${amcPath}/${deploymentId}/specs/${specId}/replicas/${replicaId}/logs`,
                {
                  params: { descending: true, limit },
                  headers: { Accept: 'application/json' },
                },
              );
            }
          }
        } catch (_replicaErr) {
          // Replicas endpoint doesn't exist — fall through to direct spec logs
        }

        // Step 3b: Try direct spec-level logs
        return api.get(
          `${amcPath}/${deploymentId}/specs/${specId}/logs`,
          {
            params: {
              descending: true,
              limit,
              startDate: new Date(startMs).toISOString(),
              endDate: new Date(endMs).toISOString(),
            },
            headers: { Accept: 'application/json' },
          },
        );
      }},
    );

    // ── AMC aggregated logs (per-deployment, no specId needed) ──
    strategies.push(
      { name: 'amc-aggregated-logs', fn: async () => {
        const { data: deps } = await api.get(amcPath!, { headers: { Accept: 'application/json' } });
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => matchDeployment(d, domain));
        if (!match) throw new Error('No CH2 deployment found');
        return api.get(`${amcPath}/${match.id}/logs`, {
          params: { descending: true, limit },
          headers: { Accept: 'application/json' },
        });
      }},
    );

    // ── AMC direct/lookup fallbacks ──
    strategies.push(
      { name: 'amc-direct', fn: () => api.get(`${amcPath}/${domain}/logs`, { params: getParams, headers: { Accept: 'application/json' } }) },
      { name: 'amc-lookup', fn: async () => {
        const { data: deps } = await api.get(amcPath!, { headers: { Accept: 'application/json' } });
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => matchDeployment(d, domain));
        if (!match) throw new Error('No CH2 deployment found');
        return api.get(`${amcPath}/${match.id}/logs`, { params: getParams, headers: { Accept: 'application/json' } });
      }},
    );
  }

  // ---------------------------------------------------------------
  // 7) CloudHub 2.0 / Runtime Fabric additional log endpoints
  //    These cover CH2 deployments that use different API paths
  // ---------------------------------------------------------------
  if (orgId && envId) {
    // Runtime Fabric v1 log endpoint
    strategies.push(
      { name: 'rtf-logs', fn: async () => {
        // First resolve the deployment ID
        const ch2Path = amcPath ?? `${AMC_BASE}/organizations/${orgId}/environments/${envId}/deployments`;
        const { data: deps } = await api.get(ch2Path);
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => matchDeployment(d, domain));
        if (!match) throw new Error('No deployment found for RTF logs');
        const deploymentId = match.id;

        // Cache for fast path
        sessionState._cachedAmcDeploymentId = deploymentId;
        sessionState._cachedAmcDomain = domain;

        return api.get(
          `/runtimefabric/api/organizations/${orgId}/environments/${envId}/deployments/${deploymentId}/logs`,
          { params: { limit, descending: true } },
        );
      }},
    );

    // Hybrid v2 log endpoint (Runtime Manager v2)
    strategies.push(
      { name: 'hybrid-v2-logs', fn: async () => {
        const ch2Path = amcPath ?? `${AMC_BASE}/organizations/${orgId}/environments/${envId}/deployments`;
        const { data: deps } = await api.get(ch2Path);
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => matchDeployment(d, domain));
        if (!match) throw new Error('No deployment found for Hybrid v2 logs');
        return api.get(
          `${HYBRID_BASE}/organizations/${orgId}/environments/${envId}/deployments/${match.id}/logs`,
          { params: { limit, descending: true } },
        );
      }},
    );

    // Anypoint Logging Service v2 POST query endpoint
    strategies.push(
      { name: 'logging-v2', fn: () => api.post(
        `/logging/api/v2/organizations/${orgId}/environments/${envId}/query`,
        {
          applicationName: domain,
          startTime: startMs,
          endTime: endMs,
          limit,
          descending: true,
        },
      )},
    );

    // MC (Management Center) application log endpoint
    strategies.push(
      { name: 'mc-app-logs', fn: async () => {
        const ch2Path = amcPath ?? `${AMC_BASE}/organizations/${orgId}/environments/${envId}/deployments`;
        const { data: deps } = await api.get(ch2Path);
        const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
        const match = items.find((d: any) => matchDeployment(d, domain));
        if (!match) throw new Error('No deployment found for MC logs');
        return api.get(
          `/mc/v1/organizations/${orgId}/environments/${envId}/deployments/${match.id}/application/logs`,
          { params: { limit, descending: true } },
        );
      }},
    );
  }

  const logErrors: string[] = [];
  let orgExpiredSeen = false;

  for (let i = 0; i < strategies.length; i++) {
    const { name, fn } = strategies[i];
    try {
      const { data, headers: respHeaders } = await fn();

      // Reject HTML responses early (server returned SPA page instead of JSON)
      const contentType = respHeaders?.['content-type'] ?? '';
      if (contentType.includes('text/html')) {
        if (!sessionState._logEndpointsChecked) {
          logger.warn(`[getAppLogs] "${name}" returned HTML (Content-Type: text/html) — skipping`);
        }
        continue;
      }
      if (typeof data === 'string' && data.trim().length > 0) {
        const trimmed = data.trim();
        if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
          if (!sessionState._logEndpointsChecked) {
            logger.warn(`[getAppLogs] "${name}" returned HTML body — skipping`);
          }
          continue;
        }
      }

      const entries = extractLogEntries(data);
      if (entries.length > 0) {
        sessionState._logEndpointsAvailable = true;
        sessionState._logEndpointsChecked = true;
        sessionState._workingLogStrategy = name; // ← Cache this for next poll
        logger.log(`[getAppLogs] ✅ Got ${entries.length} log entries via "${name}"`);
        return entries;
      }

      // Diagnostic: endpoint returned 200 but no entries extracted (once per session)
      if (!sessionState._logEndpointsChecked) {
        const preview = typeof data === 'string'
          ? data.slice(0, 400)
          : JSON.stringify(data).slice(0, 400);
        logger.log(`[getAppLogs] "${name}" returned 200 OK but no log entries. Preview:`, preview);
      }
    } catch (err: any) {
      const status = err?.response?.status;
      if (status) logErrors.push(String(status));

      // Detect "Organization is expired" — this is a permanent failure
      const errMsg = err?.response?.data?.message ?? '';
      if (typeof errMsg === 'string' && errMsg.toLowerCase().includes('organization is expired')) {
        orgExpiredSeen = true;
      }

      if (status === 400 && !sessionState._logEndpointsChecked) {
        const respBody = err?.response?.data;
        const url = err?.config?.url ?? 'unknown';
        logger.warn(`[getAppLogs] 400 from ${url}:`,
          typeof respBody === 'object' ? JSON.stringify(respBody).slice(0, 500) : String(respBody ?? '').slice(0, 500));
      }
    }
  }

  // Log summary (only once per session)
  if (!sessionState._logEndpointsChecked) {
    if (orgExpiredSeen) {
      logger.warn(`[getAppLogs] Organization is expired — log access may be restricted. Some endpoints returned 403.`);
    } else if (logErrors.length > 0) {
      logger.warn(`[getAppLogs] All ${strategies.length} strategies failed for ${domain}. Statuses: ${logErrors.join(', ')}`);
    } else {
      logger.warn(`[getAppLogs] All ${strategies.length} strategies returned empty results for ${domain}`);
    }
    const allPermanent = logErrors.length > 0 && logErrors.every((s) => s === '400' || s === '404' || s === '405' || s === '403');
    if (allPermanent) {
      sessionState._logEndpointsAvailable = false;
      logger.log('[getAppLogs] All log endpoints return 400/403/404/405 — disabling live polling for session');
    }
    sessionState._logEndpointsChecked = true;
  }

  return [];
}

/**
 * Execute a specific log strategy by name (fast path for cached strategies).
 */
async function _getLogsByStrategy(
  strategy: string,
  domain: string,
  postBodyNoDeplId: Record<string, any>,
  postBody: Record<string, any>,
  getParams: Record<string, any>,
  orgId: string | undefined,
  envId: string | undefined,
): Promise<{ data: any }> {
  switch (strategy) {
    case 'post-v2-no-deplid':
      return api.post(`${CLOUDHUB_BASE}/applications/${domain}/logs`, postBodyNoDeplId);
    case 'post-v2-with-deplid':
      return api.post(`${CLOUDHUB_BASE}/applications/${domain}/logs`, postBody);
    case 'post-v1-no-deplid':
      return api.post(`${CLOUDHUB_V1}/applications/${domain}/logs`, postBodyNoDeplId);
    case 'post-v1-with-deplid':
      return api.post(`${CLOUDHUB_V1}/applications/${domain}/logs`, postBody);
    case 'ch1-deploy-lookup': {
      // Fast path: use cached CH1 deployment ID (skip the deployment lookup)
      if (!sessionState._cachedCh1DeploymentId || sessionState._cachedCh1Domain !== domain) {
        throw new Error('CH1 deployment not cached for this domain — need re-discovery');
      }
      // Prefer POST /logs (supports date range + all priorities) — fall back to GET with date params
      try {
        return await api.get(
          `${CLOUDHUB_BASE}/applications/${domain}/deployments/${sessionState._cachedCh1DeploymentId}/logs`,
          { params: { tail: true, limitMsgLen: 5000, limit: getParams.limit ?? 200 } },
        );
      } catch (_) {
        try {
          return await api.post(`${CLOUDHUB_BASE}/applications/${domain}/logs`, postBodyNoDeplId);
        } catch (_) {
          return api.get(
            `${CLOUDHUB_BASE}/applications/${domain}/deployments/${sessionState._cachedCh1DeploymentId}/logs`,
            { params: { startDate: getParams.startDate, endDate: getParams.endDate, limit: getParams.limit ?? 200, limitMsgLen: 5000 } },
          );
        }
      }
    }
    case 'get-deploy-v2':
      return api.get(`${CLOUDHUB_BASE}/applications/${domain}/deployments/${domain}/logs`, { params: getParams });
    case 'get-deploy-v1':
      return api.get(`${CLOUDHUB_V1}/applications/${domain}/deployments/${domain}/logs`, { params: getParams });
    case 'get-logfile-v1':
      return api.get(`${CLOUDHUB_V1}/applications/${domain}/log-file`, {
        params: { startDate: getParams.startDate, endDate: getParams.endDate },
        transformResponse: [(data: any) => data],
      });
    case 'get-log-v1':
      return api.get(`${CLOUDHUB_V1}/applications/${domain}/log`, { params: getParams });
    case 'get-log-v2':
      return api.get(`${CLOUDHUB_BASE}/applications/${domain}/log`, { params: getParams });
    case 'amc-specs-logs': {
      // Fast path: use cached deployment/spec IDs (skip the 3-step lookup)
      if (!sessionState._cachedAmcDeploymentId || !sessionState._cachedAmcSpecId || sessionState._cachedAmcDomain !== domain) {
        throw new Error('AMC specs not cached for this domain — need re-discovery');
      }
      const amcP = amcDeploymentsPath();
      if (!amcP) throw new Error('No AMC path available');

      // Try replica-based logs first (the standard CH2 pattern)
      try {
        const { data: replicasData } = await api.get(
          `${amcP}/${sessionState._cachedAmcDeploymentId}/specs/${sessionState._cachedAmcSpecId}/replicas`,
          { headers: { Accept: 'application/json' } },
        );
        const replicas = Array.isArray(replicasData)
          ? replicasData
          : (replicasData?.items ?? replicasData?.data ?? replicasData?.replicas ?? []);
        if (replicas.length > 0) {
          const replicaId = replicas[0]?.id ?? replicas[0]?.replicaId ?? replicas[0]?.name;
          if (replicaId) {
            return api.get(
              `${amcP}/${sessionState._cachedAmcDeploymentId}/specs/${sessionState._cachedAmcSpecId}/replicas/${replicaId}/logs`,
              {
                params: { descending: true, limit: getParams.limit ?? 200 },
                headers: { Accept: 'application/json' },
              },
            );
          }
        }
      } catch (_) {
        // Replicas not available — fall through to spec-level logs
      }

      return api.get(
        `${amcP}/${sessionState._cachedAmcDeploymentId}/specs/${sessionState._cachedAmcSpecId}/logs`,
        {
          params: {
            descending: true,
            limit: getParams.limit ?? 200,
            startDate: new Date(getParams.startDate).toISOString(),
            endDate: new Date(getParams.endDate).toISOString(),
          },
          headers: { Accept: 'application/json' },
        },
      );
    }
    case 'amc-aggregated-logs': {
      if (!sessionState._cachedAmcDeploymentId || sessionState._cachedAmcDomain !== domain) {
        throw new Error('AMC deployment not cached — need re-discovery');
      }
      const amcP2 = amcDeploymentsPath();
      if (!amcP2) throw new Error('No AMC path available');
      return api.get(
        `${amcP2}/${sessionState._cachedAmcDeploymentId}/logs`,
        { params: { descending: true, limit: getParams.limit ?? 200 }, headers: { Accept: 'application/json' } },
      );
    }
    case 'rtf-logs': {
      if (!sessionState._cachedAmcDeploymentId || sessionState._cachedAmcDomain !== domain) {
        throw new Error('RTF deployment not cached — need re-discovery');
      }
      return api.get(
        `/runtimefabric/api/organizations/${orgId}/environments/${envId}/deployments/${sessionState._cachedAmcDeploymentId}/logs`,
        { params: { limit: getParams.limit ?? 200, descending: true, startDate: getParams.startDate, endDate: getParams.endDate } },
      );
    }
    case 'hybrid-v2-logs': {
      if (!sessionState._cachedAmcDeploymentId || sessionState._cachedAmcDomain !== domain) {
        throw new Error('Hybrid v2 deployment not cached — need re-discovery');
      }
      return api.get(
        `${HYBRID_BASE}/organizations/${orgId}/environments/${envId}/deployments/${sessionState._cachedAmcDeploymentId}/logs`,
        { params: { limit: getParams.limit ?? 200, descending: true, startDate: getParams.startDate, endDate: getParams.endDate } },
      );
    }
    case 'logging-v2': {
      return api.post(
        `/logging/api/v2/organizations/${orgId}/environments/${envId}/query`,
        {
          applicationName: domain,
          startTime: getParams.startDate,
          endTime: getParams.endDate,
          limit: getParams.limit ?? 200,
          descending: true,
        },
      );
    }
    case 'mc-app-logs': {
      if (!sessionState._cachedAmcDeploymentId || sessionState._cachedAmcDomain !== domain) {
        throw new Error('MC deployment not cached — need re-discovery');
      }
      return api.get(
        `/mc/v1/organizations/${orgId}/environments/${envId}/deployments/${sessionState._cachedAmcDeploymentId}/application/logs`,
        { params: { limit: getParams.limit ?? 200, descending: true, startDate: getParams.startDate, endDate: getParams.endDate } },
      );
    }
    default:
      // Instance-specific or monitoring strategies — just re-discover
      throw new Error(`Strategy "${strategy}" requires re-discovery`);
  }
}

/** Extract log entries from various CloudHub response shapes. */
function extractLogEntries(data: any): AppLogEntry[] {
  if (Array.isArray(data)) return normalizeLogArray(data);

  // Handle plain text log responses (GET /log-file returns raw text)
  // Reject HTML responses (CH2 sometimes returns an HTML page instead of logs)
  if (typeof data === 'string' && data.trim().length > 0) {
    const trimmed = data.trim();
    if (trimmed.startsWith('<!DOCTYPE') || trimmed.startsWith('<html') || trimmed.startsWith('<HTML')) {
      logger.warn('[extractLogEntries] Received HTML response instead of logs — skipping');
      return [];
    }
    return parseRawLogText(data);
  }

  if (data && typeof data === 'object') {
    // Elasticsearch / Monitoring response: { hits: { hits: [ { _source: {...} } ] } }
    if (data.hits?.hits && Array.isArray(data.hits.hits)) {
      const entries = data.hits.hits.map((hit: any) => {
        const src = hit._source ?? hit;
        return {
          timestamp: src.timestamp ?? src['@timestamp'] ?? src.instant ?? '',
          priority: (src.priority ?? src.level ?? src.logLevel ?? 'INFO').toUpperCase(),
          message: src.message ?? src.msg ?? src.log ?? JSON.stringify(src),
          threadName: src.threadName ?? src.thread ?? '',
          loggerName: src.loggerName ?? src.logger ?? '',
        } as AppLogEntry;
      });
      if (entries.length > 0) return entries;
    }

    // Try all known response wrapper fields
    const candidates = [
      data.data, data.logs, data.items, data.entries,
      data.records, data.results, data.logEntries,
      data.messages, data.lines, data.content, data.payload,
      data.response, data.body,
    ];
    for (const candidate of candidates) {
      if (Array.isArray(candidate) && candidate.length > 0) {
        return normalizeLogArray(candidate);
      }
    }
    // If the response has a total/count field, look for any array value
    if (data.total !== undefined || data.count !== undefined) {
      for (const val of Object.values(data)) {
        if (Array.isArray(val) && val.length > 0) return normalizeLogArray(val as any[]);
      }
    }
  }
  return [];
}

/** Normalize an array of log objects (could be raw API shape or pre-formatted) */
function normalizeLogArray(arr: any[]): AppLogEntry[] {
  if (arr.length === 0) return [];

  const first = arr[0];

  // ── CH2 specs-based logs: { docId, timestamp, message, replicaId, logLevel, context: { logger, class } } ──
  if (first?.docId !== undefined || first?.logLevel !== undefined || first?.replicaId !== undefined) {
    return arr.map((e) => ({
      timestamp: e.timestamp ?? '',
      priority: (e.logLevel ?? e.priority ?? e.level ?? 'INFO').toUpperCase(),
      message: e.message ?? e.msg ?? '',
      threadName: e.replicaId ?? e.threadName ?? '',
      loggerName: e.context?.logger ?? e.context?.class ?? e.loggerName ?? '',
    } as AppLogEntry));
  }

  // ── CH1 POST /logs response: entries have a nested `event` wrapper ──
  // Shape: { recordId, deploymentId, instanceId, line (number),
  //          event: { message, priority, timestamp, loggerName, threadName, instanceId } }
  if (first?.event?.message !== undefined || first?.event?.msg !== undefined) {
    return arr.map((e) => {
      const ev = e.event ?? {};
      return {
        timestamp: ev.timestamp ?? e.timestamp ?? e['@timestamp'] ?? '',
        priority: (ev.priority ?? ev.level ?? e.priority ?? 'INFO').toUpperCase(),
        message: ev.message ?? ev.msg ?? ev.log ?? JSON.stringify(ev),
        threadName: ev.threadName ?? ev.thread ?? '',
        loggerName: ev.loggerName ?? ev.logger ?? '',
        // Preserve extra fields for the detail sheet
        recordId: e.recordId ?? e.docId ?? '',
        deploymentId: e.deploymentId ?? '',
        instanceId: ev.instanceId ?? e.instanceId ?? '',
      } as AppLogEntry;
    });
  }

  // Check if already in our format (top-level message/msg)
  if (first?.message !== undefined || first?.msg !== undefined) {
    return arr.map((e) => ({
      timestamp: e.timestamp ?? e['@timestamp'] ?? e.instant ?? e.date ?? '',
      priority: (e.priority ?? e.level ?? e.logLevel ?? 'INFO').toUpperCase(),
      message: e.message ?? e.msg ?? e.log ?? JSON.stringify(e),
      threadName: e.threadName ?? e.thread ?? '',
      loggerName: e.loggerName ?? e.logger ?? '',
      recordId: e.recordId ?? e.docId ?? '',
      deploymentId: e.deploymentId ?? '',
      instanceId: e.instanceId ?? '',
    } as AppLogEntry));
  }

  // Fallback: if entries have `line` (number) with no message, still normalize
  // This covers edge cases where CH1 returns entries without event wrapper
  if (first?.line !== undefined && first?.recordId !== undefined) {
    return arr.map((e) => {
      const ev = e.event ?? {};
      return {
        timestamp: ev.timestamp ?? e.timestamp ?? '',
        priority: (ev.priority ?? e.priority ?? 'INFO').toUpperCase(),
        message: ev.message ?? ev.msg ?? (typeof e.line === 'string' ? e.line : JSON.stringify(e)),
        threadName: ev.threadName ?? '',
        loggerName: ev.loggerName ?? '',
        recordId: e.recordId ?? '',
        deploymentId: e.deploymentId ?? '',
        instanceId: e.instanceId ?? '',
      } as AppLogEntry;
    });
  }

  // Catch-all: normalize any remaining array entries with best-effort field mapping
  // Some API endpoints (AMC specs-logs, RTF, etc.) may use different field names
  return arr.map((e) => {
    const ev = e.event ?? {};
    return {
      timestamp: e.timestamp ?? e['@timestamp'] ?? ev.timestamp ?? e.ts ?? e.time ?? e.date ?? e.instant ?? '',
      priority: (e.priority ?? ev.priority ?? e.level ?? ev.level ?? e.severity ?? e.logLevel ?? e.log_level ?? 'INFO').toUpperCase(),
      message: e.message ?? ev.message ?? e.msg ?? e.text ?? e.log ?? e.logLine ?? e.content ?? (typeof e.line === 'string' ? e.line : JSON.stringify(e)),
      threadName: e.threadName ?? ev.threadName ?? e.thread ?? '',
      loggerName: e.loggerName ?? ev.loggerName ?? e.logger ?? '',
      recordId: e.recordId ?? e.docId ?? e.id ?? '',
      deploymentId: e.deploymentId ?? '',
      instanceId: e.instanceId ?? ev.instanceId ?? '',
    } as AppLogEntry;
  });
}

/** Parse raw text log output (from GET /log-file or /log endpoints) */
function parseRawLogText(text: string): AppLogEntry[] {
  const lines = text.split('\n').filter((l: string) => l.trim());
  if (lines.length === 0) return [];

  const entries: AppLogEntry[] = [];
  let currentEntry: AppLogEntry | null = null;

  for (const line of lines) {
    // Match common Mule log patterns:
    // [2024-01-15 10:30:45.123] INFO  org.mule.runtime - message
    // 2024-01-15T10:30:45.123Z  INFO [thread-1] org.mule.runtime: message
    const match = line.match(
      /^\[?(\d{4}[-/]\d{2}[-/]\d{2}[T ]\d{2}:\d{2}:\d{2}[^\]]*)\]?\s*(ERROR|WARN|WARNING|INFO|DEBUG|TRACE|FATAL|SYSTEM)\s+(.*)/i,
    );
    if (match) {
      // Save previous entry
      if (currentEntry) entries.push(currentEntry);
      currentEntry = {
        timestamp: match[1].trim(),
        priority: match[2].toUpperCase().replace('WARNING', 'WARN'),
        message: match[3].trim(),
      } as AppLogEntry;
    } else if (currentEntry) {
      // Continuation of multi-line log (stack trace, etc.)
      currentEntry.message += '\n' + line;
    } else {
      // No pattern match and no current entry — standalone line
      entries.push({
        timestamp: new Date().toISOString(),
        priority: 'INFO',
        message: line,
      } as AppLogEntry);
    }
  }
  // Don't forget the last entry
  if (currentEntry) entries.push(currentEntry);

  return entries;
}
