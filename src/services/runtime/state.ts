// ============================================================
// Anypoint Mobile Platform - Runtime Manager Service
// Shared mutable session state (caches + availability flags)
//
// ALL module-level mutable state for the runtime service lives
// here, in exactly one place, so the domain modules
// (applications, logs, schedulers, monitoring) share a single
// source of truth and resetSessionFlags() can clear everything.
// ============================================================

export const OBSERVABILITY_DESCRIPTOR_CACHE_MAX = 100;
export const _observabilityMetricDescribeCache = new Map<string, { dimensions: string[]; measurements: string[] }>();

interface RuntimeSessionState {
  // ---------- Logs ----------

  /**
   * Module-level flag: skip log endpoints known to 404.
   * Prevents spamming API calls that always fail.
   *
   * IMPORTANT: These flags are NOW per-domain. When the user navigates
   * from one app's logs to another, we reset the flags so the new app's
   * endpoints are discovered fresh. This prevents a failed discovery for
   * app A from blocking log access for app B.
   */
  _logEndpointsAvailable: boolean;
  _logEndpointsChecked: boolean;
  _logCheckedForDomain: string | null;

  /**
   * Cache the working log strategy so subsequent polls skip straight to it.
   * 'post-no-deplid' = POST without deploymentId (the one that works on EU1)
   * 'post-with-deplid' = POST with deploymentId
   * null = not yet determined, try all endpoints
   */
  _workingLogStrategy: string | null;

  /**
   * Cache whether /instances endpoint is available.
   * Once it 404s, we never try again — saves 2 x 404 per poll cycle.
   */
  _instancesEndpointAvailable: boolean;

  /**
   * ── AMC specs-based log retrieval cache ──
   * CH2/AMC logs require: deployments → specs (specId) → logs
   * We cache the deployment ID and spec ID per domain to avoid repeated lookups.
   */
  _cachedAmcDeploymentId: string | null;
  _cachedAmcSpecId: string | null;
  _cachedAmcDomain: string | null;

  /**
   * ── CH1 deployment-based log retrieval cache ──
   * The browser UI fetches logs via:
   *   GET /cloudhub/api/v2/applications/{domain}/deployments?orderByDate=DESC&loggingVersion=VERSION_2
   *   GET /cloudhub/api/v2/applications/{domain}/deployments/{deploymentId}/logs?tail=true&limitMsgLen=5000
   * We cache the deployment ID per domain so subsequent polls skip the lookup.
   */
  _cachedCh1DeploymentId: string | null;
  _cachedCh1Domain: string | null;

  // ---------- Metrics / Dashboard Stats ----------

  /**
   * Module-level flags to remember which monitoring endpoints are unavailable.
   * Once an endpoint returns 404, we stop retrying it for the session.
   * This prevents spamming the console with 404s (common on EU1 CloudHub 1.0).
   */
  dashboardStatsAvailable: boolean; // /dashboardStats, /statistics
  monitoringApiAvailable: boolean;  // /monitoring/*, /observability/*
  _archiveAvailable: boolean;       // /monitoring/archive/* endpoints
  _dashStatsCheckDone: boolean;

  /**
   * Promise-based gate for the first stats/monitoring endpoint discovery.
   * When multiple getDashboardStats calls fire in parallel (via useQueries),
   * the first one checks all endpoints and resolves this promise. Subsequent
   * calls await it instead of making redundant 404 requests.
   *
   * The discovery covers BOTH dashboardStats AND monitoring endpoints so
   * all parallel callers wait for a single set of API calls.
   */
  _statsDiscoveryPromise: Promise<void> | null;

  /**
   * ── InfluxDB Monitoring (Grafana-style datasource proxy) ──
   * The Anypoint Monitoring visualizer uses a Grafana-style InfluxDB proxy:
   *   GET /monitoring/api/visualizer/api/datasources/proxy/{datasourceId}/query
   *     ?db="dias_mt_1_prod"&q=SELECT...&epoch=ms
   *
   * Key details (discovered from the real Anypoint Monitoring web UI):
   *   - Datasource ID: varies per org (e.g. 4113)
   *   - Database name: e.g. "dias_mt_1_prod" (WITH quotes in param value!)
   *   - app_id uses fullDomain: e.g. "crm-profile-s.de-c1.eu1.cloudhub.io"
   *   - Queries use org_id, env_id, app_id WHERE filters
   *   - Time ranges: "time >= {ms}ms and time <= {ms}ms"
   *
   * We discover the datasource ID and db name once, then cache for the session.
   */
  _influxDatasourceId: number | null;
  _influxDbName: string | null;
  _influxAvailable: boolean | null; // null = not checked yet
  _legacyJvmApiAvailable: boolean;
  _legacyMetricsApiAvailable: boolean;
  _observabilityMetricTypesPromise: Promise<string[]> | null;
  _observabilityMetricTypesCache: string[] | null;
}

export const sessionState: RuntimeSessionState = {
  // ---------- Logs ----------
  _logEndpointsAvailable: true,
  _logEndpointsChecked: false,
  _logCheckedForDomain: null,
  _workingLogStrategy: null,
  _instancesEndpointAvailable: true,
  _cachedAmcDeploymentId: null,
  _cachedAmcSpecId: null,
  _cachedAmcDomain: null,
  _cachedCh1DeploymentId: null,
  _cachedCh1Domain: null,

  // ---------- Metrics / Dashboard Stats ----------
  dashboardStatsAvailable: true,
  monitoringApiAvailable: true,
  _archiveAvailable: true,
  _dashStatsCheckDone: false,
  _statsDiscoveryPromise: null,
  _influxDatasourceId: null,
  _influxDbName: null,
  _influxAvailable: null,
  _legacyJvmApiAvailable: false,
  _legacyMetricsApiAvailable: false,
  _observabilityMetricTypesPromise: null,
  _observabilityMetricTypesCache: null,
};
