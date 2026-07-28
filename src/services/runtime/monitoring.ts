// ============================================================
// Anypoint Mobile Platform - Runtime Manager Service
// Monitoring: dashboard stats, observability (AMQL) queries,
// InfluxDB proxy metrics, and app metric time-series
// ============================================================

import api from '../api';
import * as monitoringService from '../monitoringService';
import logger from '../../utils/logger';
import {
  CLOUDHUB_BASE,
  CLOUDHUB_V1,
  getOrgId,
  getEnvId,
  amcDeploymentsPath,
  matchDeployment,
} from './shared';
import {
  OBSERVABILITY_DESCRIPTOR_CACHE_MAX,
  _observabilityMetricDescribeCache,
  sessionState,
} from './state';

function escapeAmqlLiteral(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

function buildAmqlBaseFilterSets(orgId: string, envId: string): string[][] {
  return [
    [
      `"sub_org.id" = '${escapeAmqlLiteral(orgId)}'`,
      `"env.id" = '${escapeAmqlLiteral(envId)}'`,
    ],
  ];
}

function buildAmqlScopeClauses(
  orgId: string,
  envId: string,
  app: { platformId?: string; name?: string; domain?: string },
): string[] {
  const baseSets = buildAmqlBaseFilterSets(orgId, envId);
  const clauses = baseSets.flatMap((base) => [
    app.platformId ? [...base, `"app.id" = '${escapeAmqlLiteral(app.platformId)}'`].join(' AND ') : null,
    app.name ? [...base, `"app.name" = '${escapeAmqlLiteral(app.name)}'`].join(' AND ') : null,
    app.domain && app.domain !== app.name ? [...base, `"app.name" = '${escapeAmqlLiteral(app.domain)}'`].join(' AND ') : null,
  ]).filter((value): value is string => Boolean(value));

  return clauses.length > 0 ? Array.from(new Set(clauses)) : baseSets.map((base) => base.join(' AND '));
}

function buildDescriptorAwareScopeClauses(
  orgId: string,
  envId: string,
  app: { platformId?: string; name?: string; domain?: string },
  descriptorDimensions: string[],
): string[] {
  const baseSets = buildAmqlBaseFilterSets(orgId, envId);
  const dimensions = new Set(descriptorDimensions ?? []);
  const appIdentifiers = Array.from(new Set([
    app.platformId,
    app.domain,
    app.name,
  ].filter((value): value is string => Boolean(value))));
  const appNames = Array.from(new Set([
    app.name,
    app.domain,
  ].filter((value): value is string => Boolean(value))));

  const dimensionCandidates: Array<{ names: string[]; values: string[] }> = [
    {
      names: ['app.id', 'application.id', 'entity.id', 'resource.id', 'service.id', 'asset.id'],
      values: appIdentifiers,
    },
    {
      names: ['app.name', 'application.name', 'application.display_name', 'entity.name', 'entity.display_name', 'resource.name', 'resource.display_name', 'service.name', 'asset.name'],
      values: appNames,
    },
  ];

  const clauses: string[] = [];

  for (const candidate of dimensionCandidates) {
    const supportedNames = candidate.names.filter((name) => dimensions.has(name));
    if (supportedNames.length === 0 || candidate.values.length === 0) continue;

    for (const base of baseSets) {
      for (const dimensionName of supportedNames) {
        for (const value of candidate.values) {
          clauses.push([...base, `"${dimensionName}" = '${escapeAmqlLiteral(value)}'`].join(' AND '));
        }
      }
    }
  }

  return clauses.length > 0
    ? Array.from(new Set(clauses))
    : baseSets.map((base) => base.join(' AND '));
}

function buildAmqlQuery(
  metricName: string,
  selectClause: string,
  whereClause: string,
  startMs: number,
  endMs: number,
  timeseriesInterval?: string,
): string {
  const needsTimestamp = Boolean(timeseriesInterval) && !/\btimestamp\b/i.test(selectClause);
  const effectiveSelect = needsTimestamp ? `timestamp, ${selectClause}` : selectClause;
  const timeseries = timeseriesInterval ? ` TIMESERIES ${timeseriesInterval}` : '';
  return `SELECT ${effectiveSelect} FROM "${metricName}" WHERE timestamp BETWEEN ${startMs} AND ${endMs} AND ${whereClause}${timeseries}`;
}

function isObservabilityDataPresent(payload: any): boolean {
  if (!payload) return false;
  if (Array.isArray(payload?.data)) return payload.data.length > 0;
  return Array.isArray(payload) ? payload.length > 0 : false;
}

function metricTypeNameOf(entry: any): string | null {
  if (typeof entry === 'string') return entry;
  if (!entry || typeof entry !== 'object') return null;
  return entry.name ?? entry.id ?? entry.metricType ?? entry.metric_type ?? null;
}

function pickMetricType(
  metricTypes: string[],
  exactCandidates: string[],
  containsPatterns: RegExp[] = [],
): string | null {
  for (const candidate of exactCandidates) {
    const exactMatch = metricTypes.find((metricType) => metricType === candidate);
    if (exactMatch) return exactMatch;
  }

  for (const pattern of containsPatterns) {
    const partialMatch = metricTypes.find((metricType) => pattern.test(metricType));
    if (partialMatch) return partialMatch;
  }

  return null;
}

function descriptorNamesOf(entries: any): string[] {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => {
      if (typeof entry === 'string') return entry;
      if (!entry || typeof entry !== 'object') return null;
      return entry.name ?? entry.id ?? entry.key ?? entry.field ?? entry.fieldName ?? null;
    })
    .filter((value): value is string => Boolean(value));
}

async function describeObservabilityMetricType(
  metricType: string,
): Promise<{ dimensions: string[]; measurements: string[] }> {
  const cached = _observabilityMetricDescribeCache.get(metricType);
  if (cached) return cached;

  const { data } = await api.get(`/observability/api/v1/metric_types/${encodeURIComponent(metricType)}:describe`);
  const descriptor = {
    dimensions: descriptorNamesOf(data?.dimensions ?? data?.tags ?? data?.labels),
    measurements: descriptorNamesOf(data?.measurements ?? data?.fields ?? data?.aggregations),
  };
  if (_observabilityMetricDescribeCache.size >= OBSERVABILITY_DESCRIPTOR_CACHE_MAX) {
    const oldestKey = _observabilityMetricDescribeCache.keys().next().value;
    if (oldestKey) {
      _observabilityMetricDescribeCache.delete(oldestKey);
    }
  }
  _observabilityMetricDescribeCache.set(metricType, descriptor);
  return descriptor;
}

function pickMeasurement(
  measurements: string[],
  patterns: RegExp[],
): string | null {
  for (const pattern of patterns) {
    const match = measurements.find((measurement) => pattern.test(measurement));
    if (match) return match;
  }
  return null;
}

// ---------- Metrics / Dashboard Stats ----------

/**
 * Check if monitoring endpoints are known to be unavailable.
 * Returns true when discovery is done AND both stats + monitoring APIs
 * AND InfluxDB proxy all failed.
 * The UI uses this to show a "monitoring requires subscription" banner.
 */
export function isMonitoringUnavailable(): boolean {
  return sessionState._dashStatsCheckDone && !sessionState.dashboardStatsAvailable && !sessionState.monitoringApiAvailable && sessionState._influxAvailable === false;
}

export function resetSessionFlags(): void {
  sessionState.dashboardStatsAvailable = true;
  sessionState.monitoringApiAvailable = true;
  sessionState._archiveAvailable = true;
  sessionState._dashStatsCheckDone = false;
  sessionState._statsDiscoveryPromise = null;
  sessionState._logEndpointsAvailable = true;
  sessionState._logEndpointsChecked = false;
  sessionState._logCheckedForDomain = null;
  sessionState._workingLogStrategy = null;
  sessionState._instancesEndpointAvailable = true;
  sessionState._influxDatasourceId = null;
  sessionState._influxDbName = null;
  sessionState._influxAvailable = null;
  sessionState._legacyJvmApiAvailable = false;
  sessionState._legacyMetricsApiAvailable = false;
  sessionState._observabilityMetricTypesPromise = null;
  sessionState._observabilityMetricTypesCache = null;
  _observabilityMetricDescribeCache.clear();
  sessionState._cachedAmcDeploymentId = null;
  sessionState._cachedAmcSpecId = null;
  sessionState._cachedAmcDomain = null;
  sessionState._cachedCh1DeploymentId = null;
  sessionState._cachedCh1Domain = null;
  logger.log('[runtimeService] Session flags reset');
}

async function getObservabilityMetricTypes(): Promise<string[]> {
  if (sessionState._observabilityMetricTypesCache) return sessionState._observabilityMetricTypesCache;
  if (!sessionState._observabilityMetricTypesPromise) {
    sessionState._observabilityMetricTypesPromise = api
      .get('/observability/api/v1/metric_types')
      .then(({ data }) => {
        const metricTypes = Array.isArray(data)
          ? data.map(metricTypeNameOf).filter((value): value is string => Boolean(value))
          : [];
        sessionState._observabilityMetricTypesCache = metricTypes;
        logger.log(`[Monitoring] metric_types cached: ${metricTypes.slice(0, 20).join(', ')}`);
        return metricTypes;
      })
      .catch((error: any) => {
        sessionState._observabilityMetricTypesPromise = null;
        throw error;
      });
  }

  return sessionState._observabilityMetricTypesPromise;
}

// ---------- InfluxDB Monitoring Helpers ----------

/**
 * Extract the region slug from the API base URL.
 * e.g. "https://eu1.anypoint.mulesoft.com" → "eu1"
 *      "https://anypoint.mulesoft.com" → "us" (default region has no prefix)
 */
function _getRegionSlug(): string {
  const baseUrl = api.defaults.baseURL ?? '';
  const match = baseUrl.match(/https?:\/\/(\w+)\.anypoint\.mulesoft\.com/);
  if (match && match[1] !== 'anypoint') return match[1];
  return 'us';
}

/**
 * Discover the InfluxDB datasource for Anypoint Monitoring.
 * The Anypoint Monitoring visualizer uses a Grafana-style datasource proxy.
 *
 * Discovery approach:
 * 1. GET /monitoring/api/visualizer/api/datasources → find InfluxDB type
 * 2. Extract datasource ID and database name
 * 3. Verify with a test SHOW MEASUREMENTS query
 *
 * Real-world example (EU1):
 *   - Datasource ID: 4113
 *   - Database name: "dias_mt_1_prod" (quoted in the db parameter!)
 *
 * Returns true if an InfluxDB datasource was found.
 */
async function discoverInfluxDatasource(): Promise<boolean> {
  logger.log('[Monitoring] discoverInfluxDatasource() called, current state:', sessionState._influxAvailable);
  if (sessionState._influxAvailable !== null) return sessionState._influxAvailable;

  let _influxTriedCount = 0;
  let datasources: any[] = [];
  const testedDatasourceIds = new Set<string>();

  const verifyInfluxDatasource = async (ds: any): Promise<boolean> => {
    const dsId = ds?.id;
    if (dsId == null) return false;

    const dsKey = String(dsId);
    if (testedDatasourceIds.has(dsKey)) return false;
    testedDatasourceIds.add(dsKey);
    _influxTriedCount++;

    const rawDbName = ds?.database ?? ds?.jsonData?.database ?? '';
    const dbName = rawDbName.startsWith('"') ? rawDbName : `"${rawDbName}"`;

    const orgId = getOrgId();
    const envId = getEnvId();
    const endMs = Date.now();
    const startMs = endMs - (15 * 60 * 1000);
    const testQ = orgId && envId
      ? `SELECT sum("messageCount") FROM "app_stats" WHERE "org_id" = '${orgId}' AND "env_id" = '${envId}' AND time >= ${startMs}ms and time <= ${endMs}ms GROUP BY time(5m) fill(0)`
      : 'SHOW MEASUREMENTS LIMIT 5';

    try {
      const { data: testResult } = await api.get(
        `/monitoring/api/visualizer/api/datasources/proxy/${dsId}/query`,
        { params: { db: dbName, q: testQ, epoch: 'ms' } },
      );

      if (testResult?.results) {
        sessionState._influxDatasourceId = dsId;
        sessionState._influxDbName = dbName;
        sessionState._influxAvailable = true;
        const measurements = testResult.results?.[0]?.series?.[0]?.values?.map((v: any) => v[0]) ?? [];
        logger.log(`[Monitoring] InfluxDB datasource VERIFIED: id=${dsId}, db=${dbName}, measurements=[${measurements.slice(0, 5).join(', ')}]`);
        return true;
      }
    } catch (testErr: any) {
      const errBody = testErr?.response?.data ? (typeof testErr.response.data === 'string' ? testErr.response.data : JSON.stringify(testErr.response.data)).slice(0, 200) : '';
      logger.log(`[Monitoring] Datasource ${dsId} (db=${dbName}) test failed: ${testErr?.response?.status ?? testErr?.message}${errBody ? ' body=' + errBody : ''}`);
      if (rawDbName && !rawDbName.startsWith('"')) {
        try {
          const { data: testResult2 } = await api.get(
            `/monitoring/api/visualizer/api/datasources/proxy/${dsId}/query`,
            { params: { db: rawDbName, q: testQ, epoch: 'ms' } },
          );
          if (testResult2?.results) {
            sessionState._influxDatasourceId = dsId;
            sessionState._influxDbName = rawDbName;
            sessionState._influxAvailable = true;
            logger.log(`[Monitoring] InfluxDB datasource VERIFIED (unquoted): id=${dsId}, db=${rawDbName}`);
            return true;
          }
        } catch (_) {
          // continue
        }
      }
    }

    return false;
  };

  // ── Step 1: List all datasources and find InfluxDB ones ──
  try {
    const { data } = await api.get('/monitoring/api/visualizer/api/datasources');
    logger.log(`[Monitoring] Datasources API returned: ${Array.isArray(data) ? data.length + ' entries' : typeof data}`);

    if (Array.isArray(data) && data.length > 0) {
      datasources = data;
      // Log datasource summary: total count and all types
      logger.log(`[Monitoring] Datasource list: ${data.length} total, types: ${[...new Set(data.map((d: any) => d.type))].join(', ')}`);
      // Log all datasources for debug
      for (const ds of data) {
        logger.log(`[Monitoring] Datasource: id=${ds.id}, type=${ds.type}, name=${ds.name}, db=${ds.database ?? ds.jsonData?.database ?? 'unknown'}`);
      }
    }
  } catch (err: any) {
    logger.log(`[Monitoring] Datasource list API failed: ${err?.response?.status ?? err?.message}`);
  }

  if (datasources.length === 0) {
    try {
      const { data } = await api.get('/monitoring/api/visualizer/api/bootdata');
      const bootDatasources = data?.Settings?.datasources ?? data?.settings?.datasources;
      if (bootDatasources && typeof bootDatasources === 'object') {
        datasources = Object.values(bootDatasources);
        logger.log(`[Monitoring] Bootdata returned ${datasources.length} datasource entries`);
      }
    } catch (err: any) {
      logger.log(`[Monitoring] Bootdata datasource fallback failed: ${err?.response?.status ?? err?.message}`);
    }
  }

  const influxDatasources = datasources.filter((ds: any) =>
    ds?.type === 'influxdb'
    || ds?.typeName === 'InfluxDB'
    || ds?.meta?.id === 'influxdb'
    || ds?.meta?.name === 'InfluxDB'
  );

  if (influxDatasources.length > 0) {
    logger.log(`[Monitoring] Found ${influxDatasources.length} InfluxDB datasource(s), testing each...`);
    for (const ds of influxDatasources) {
      if (await verifyInfluxDatasource(ds)) {
        return true;
      }
    }
  }

  sessionState._influxAvailable = false;
  logger.log(`[Monitoring] No working InfluxDB datasource found (tried ${_influxTriedCount} InfluxDB datasource(s))`);
  return false;
}

/**
 * Run an InfluxDB query via the Grafana proxy endpoint.
 * Supports multi-statement queries separated by semicolons.
 */
async function queryInfluxDB(query: string): Promise<any> {
  if (!sessionState._influxDatasourceId || !sessionState._influxDbName) return null;

  const { data } = await api.get(
    `/monitoring/api/visualizer/api/datasources/proxy/${sessionState._influxDatasourceId}/query`,
    {
      params: {
        db: sessionState._influxDbName,
        q: query,
        epoch: 'ms',
      },
    },
  );

  return data;
}

/**
 * Build an InfluxDB WHERE clause for a specific app.
 * Uses org_id, env_id, and app_id (fullDomain) tags.
 */
function buildInfluxWhere(
  orgId: string,
  envId: string,
  appIdentifiers: string[],
  startMs: number,
  endMs: number,
): string {
  const identifiers = Array.from(new Set(appIdentifiers.filter(Boolean)));
  const appClauses = identifiers.map((identifier) => `"app_id" = '${identifier}'`);

  if (appClauses.length === 0) {
    return `("org_id" = '${orgId}' AND "env_id" = '${envId}') AND time >= ${startMs}ms and time <= ${endMs}ms`;
  }

  return `("org_id" = '${orgId}' AND "env_id" = '${envId}' AND (${appClauses.join(' OR ')})) AND time >= ${startMs}ms and time <= ${endMs}ms`;
}

/**
 * Extra metrics extracted from InfluxDB (thread count, heap, GC, etc.)
 */
interface InfluxExtraMetrics {
  threadCount: number | null;
  heapUsed: number | null;
  heapCommitted: number | null;
  gcCollections: number | null;
  classesLoaded: number | null;
  messageCount: number | null;
  // Inbound HTTP metrics (from Anypoint Monitoring)
  inboundAvgResponseTime: number | null;
  inboundRequestCount: number | null;
  inboundErrorCount: number | null;
  // Outbound HTTP metrics
  outboundAvgResponseTime: number | null;
  outboundRequestCount: number | null;
  outboundErrorCount: number | null;
}

/**
 * Parse an InfluxDB query response into a monitoring metrics format.
 * InfluxDB returns: { results: [{ series: [{ name, columns, values }] }] }
 *
 * Handles multi-statement responses where each result set corresponds to
 * a different measurement (CPU, memory, threads, GC, etc.)
 */
function parseInfluxDBResults(data: any): {
  cpuPercent: number | null;
  memoryPercent: number | null;
  timeSeries: Array<{ timestamp: number; cpu: number | null; memory: number | null }>;
  extraMetrics: InfluxExtraMetrics;
} | null {
  const results = data?.results;
  if (!Array.isArray(results)) return null;

  let cpuPercent: number | null = null;
  let memoryPercent: number | null = null;
  const timeSeriesMap = new Map<number, { cpu: number | null; memory: number | null }>();
  const extra: InfluxExtraMetrics = {
    threadCount: null,
    heapUsed: null,
    heapCommitted: null,
    gcCollections: null,
    classesLoaded: null,
    messageCount: null,
    inboundAvgResponseTime: null,
    inboundRequestCount: null,
    inboundErrorCount: null,
    outboundAvgResponseTime: null,
    outboundRequestCount: null,
    outboundErrorCount: null,
  };

  for (const result of results) {
    const seriesList = result?.series;
    if (!Array.isArray(seriesList) || seriesList.length === 0) continue;

    for (const s of seriesList) {
      const columns: string[] = s.columns ?? [];
      const values: any[][] = s.values ?? [];
      const name = (s.name ?? '').toLowerCase();

      // Classify the measurement
      const isCpu = (name === 'worker' && columns.some((c: string) => c.includes('cpu')))
        || (name === 'jvm.cpu.operatingsystem' && columns.some((c: string) => c === 'mean' || c.includes('cpu')));
      const isMemory = (name === 'worker' && columns.some((c: string) => c.includes('memory')))
        || (name === 'jvm.cpu.operatingsystem' && columns.some((c: string) => c.includes('total_physical_memory_size')));
      const isThread = name.includes('threading');
      const isHeap = name.includes('jvm.memory') && columns.some((c: string) => c.includes('heap_used') || c.includes('heap_total'));
      const isHeapCommitted = name.includes('jvm.memory') && columns.some((c: string) => c.includes('heap_committed') || c.includes('heap_total'));
      const isGC = name.includes('garbagecollector');
      const isClasses = name.includes('classloading');
      const isAppStats = name === 'app_stats';
      const isAppInboundMetric = name === 'app_inbound_metric';
      const isAppOutboundMetric = name === 'app_outbound_metric';
      // HTTP inbound / outbound metrics (Anypoint Monitoring flow-level)
      const isHttpInbound = (name === 'http_inbound' || name === 'inbound')
        || (name === 'http' && (s.tags?.flow_type === 'inbound' || s.tags?.type === 'inbound' || columns.some((c: string) => c.includes('inbound'))));
      const isHttpOutbound = (name === 'http_outbound' || name === 'outbound')
        || (name === 'http' && (s.tags?.flow_type === 'outbound' || s.tags?.type === 'outbound' || columns.some((c: string) => c.includes('outbound'))));
      const isHttp = !isHttpInbound && !isHttpOutbound && (name === 'http' || name === 'http_summary');

      // Also detect by column names if measurement name is generic
      const hasCpuCol = columns.some((c: string) => c === 'mean' || c === 'cpu' || c === 'cpu_usage');
      const hasMemCol = columns.some((c: string) => c === 'mean' || c === 'memory' || c === 'memory_usage');

      const timeIdx = columns.indexOf('time');

      // Get the latest non-null value from the series
      let latestVal: number | null = null;
      let _latestTs: number = 0;

      for (const row of values) {
        if (!Array.isArray(row)) continue;
        const ts = timeIdx >= 0 ? row[timeIdx] : row[0];
        for (let ci = 0; ci < columns.length; ci++) {
          if (columns[ci] === 'time') continue;
          const val = row[ci];
          if (val == null) continue;
          latestVal = val;
          _latestTs = ts;
        }
      }

      // Assign to the appropriate metric
      if (isCpu || (name === 'worker_metric' && hasCpuCol)) {
        if (latestVal != null) cpuPercent = latestVal;
        // Build time series for CPU
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          const ts = timeIdx >= 0 ? row[timeIdx] : row[0];
          for (let ci = 0; ci < columns.length; ci++) {
            if (columns[ci] === 'time') continue;
            const val = row[ci];
            const entry = timeSeriesMap.get(ts) ?? { cpu: null, memory: null };
            entry.cpu = val;
            timeSeriesMap.set(ts, entry);
            break;
          }
        }
      } else if (isMemory || (name === 'worker_metric' && hasMemCol && !isCpu)) {
        if (latestVal != null) memoryPercent = latestVal;
        // Build time series for memory
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          const ts = timeIdx >= 0 ? row[timeIdx] : row[0];
          for (let ci = 0; ci < columns.length; ci++) {
            if (columns[ci] === 'time') continue;
            const val = row[ci];
            const entry = timeSeriesMap.get(ts) ?? { cpu: null, memory: null };
            entry.memory = val;
            timeSeriesMap.set(ts, entry);
            break;
          }
        }
      } else if (isThread && latestVal != null) {
        extra.threadCount = latestVal;
      } else if (isHeap && latestVal != null) {
        if (columns.some((c: string) => c.includes('heap_total'))) {
          extra.heapCommitted = latestVal;
        } else {
          extra.heapUsed = latestVal;
        }
      } else if (isHeapCommitted && latestVal != null) {
        extra.heapCommitted = latestVal;
      } else if (isGC && latestVal != null) {
        extra.gcCollections = latestVal;
      } else if (isClasses && latestVal != null) {
        extra.classesLoaded = latestVal;
      } else if (isAppStats && latestVal != null) {
        // Sum up message counts
        let totalMessages = 0;
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          for (let ci = 0; ci < columns.length; ci++) {
            if (columns[ci] === 'time') continue;
            if (row[ci] != null) totalMessages += row[ci];
            break;
          }
        }
        extra.messageCount = totalMessages;
        const responseTimeCol = columns.findIndex((c: string) => c.toLowerCase().includes('responsetime'));
        const errorCountCol = columns.findIndex((c: string) => c.toLowerCase().includes('errorcount'));
        let responseTimeTotal = 0;
        let responseTimeSamples = 0;
        let errorTotal = 0;
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          if (responseTimeCol >= 0 && row[responseTimeCol] != null) {
            responseTimeTotal += row[responseTimeCol];
            responseTimeSamples++;
          }
          if (errorCountCol >= 0 && row[errorCountCol] != null) {
            errorTotal += row[errorCountCol];
          }
        }
        if (responseTimeSamples > 0 && extra.inboundAvgResponseTime == null) {
          extra.inboundAvgResponseTime = Math.round(responseTimeTotal / responseTimeSamples);
        }
        if (errorTotal > 0 && extra.inboundErrorCount == null) {
          extra.inboundErrorCount = errorTotal;
        }
      } else if (isAppInboundMetric) {
        const rtCol = columns.findIndex((c: string) => c.includes('response_time.avg') || c.includes('responseTime') || c === 'mean');
        const countCol = columns.findIndex((c: string) => c.includes('avg_request_count'));
        let totalCount = 0;
        let totalRt = 0;
        let rtSamples = 0;
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          if (rtCol >= 0 && row[rtCol] != null) { totalRt += row[rtCol]; rtSamples++; }
          if (countCol >= 0 && row[countCol] != null) totalCount += row[countCol];
        }
        if (rtSamples > 0) extra.inboundAvgResponseTime = Math.round(totalRt / rtSamples);
        if (totalCount > 0) extra.inboundRequestCount = totalCount;
      } else if (isAppOutboundMetric) {
        const rtCol = columns.findIndex((c: string) => c.includes('response_time.avg') || c.includes('responseTime') || c === 'mean');
        const countCol = columns.findIndex((c: string) => c.includes('avg_request_count'));
        let totalCount = 0;
        let totalRt = 0;
        let rtSamples = 0;
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          if (rtCol >= 0 && row[rtCol] != null) { totalRt += row[rtCol]; rtSamples++; }
          if (countCol >= 0 && row[countCol] != null) totalCount += row[countCol];
        }
        if (rtSamples > 0) extra.outboundAvgResponseTime = Math.round(totalRt / rtSamples);
        if (totalCount > 0) extra.outboundRequestCount = totalCount;
      } else if (isHttpInbound || (isHttp && extra.inboundRequestCount == null)) {
        // Extract inbound HTTP metrics (response time, request count, errors)
        const rtCol = columns.findIndex((c: string) => c.includes('response_time') || c === 'mean');
        const countCol = columns.findIndex((c: string) => c.includes('count') || c.includes('request'));
        const errCol = columns.findIndex((c: string) => c.includes('error') || c.includes('failure'));
        let totalCount = 0; let totalRt = 0; let rtSamples = 0; let totalErrors = 0;
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          if (rtCol >= 0 && row[rtCol] != null) { totalRt += row[rtCol]; rtSamples++; }
          if (countCol >= 0 && row[countCol] != null) totalCount += row[countCol];
          if (errCol >= 0 && row[errCol] != null) totalErrors += row[errCol];
        }
        if (rtSamples > 0) extra.inboundAvgResponseTime = Math.round(totalRt / rtSamples);
        if (totalCount > 0) extra.inboundRequestCount = totalCount;
        if (totalErrors > 0) extra.inboundErrorCount = totalErrors;
      } else if (isHttpOutbound) {
        // Extract outbound HTTP metrics
        const rtCol = columns.findIndex((c: string) => c.includes('response_time') || c === 'mean');
        const countCol = columns.findIndex((c: string) => c.includes('count') || c.includes('request'));
        const errCol = columns.findIndex((c: string) => c.includes('error') || c.includes('failure'));
        let totalCount = 0; let totalRt = 0; let rtSamples = 0; let totalErrors = 0;
        for (const row of values) {
          if (!Array.isArray(row)) continue;
          if (rtCol >= 0 && row[rtCol] != null) { totalRt += row[rtCol]; rtSamples++; }
          if (countCol >= 0 && row[countCol] != null) totalCount += row[countCol];
          if (errCol >= 0 && row[errCol] != null) totalErrors += row[errCol];
        }
        if (rtSamples > 0) extra.outboundAvgResponseTime = Math.round(totalRt / rtSamples);
        if (totalCount > 0) extra.outboundRequestCount = totalCount;
        if (totalErrors > 0) extra.outboundErrorCount = totalErrors;
      }
    }
  }

  if (
    cpuPercent == null &&
    memoryPercent == null &&
    timeSeriesMap.size === 0 &&
    extra.threadCount == null &&
    extra.messageCount == null &&
    extra.heapUsed == null
  ) {
    return null;
  }

  const timeSeries = Array.from(timeSeriesMap.entries())
    .map(([timestamp, metrics]) => ({ timestamp, ...metrics }))
    .sort((a, b) => a.timestamp - b.timestamp);

  return { cpuPercent, memoryPercent, timeSeries, extraMetrics: extra };
}

/**
 * Fetch monitoring metrics from InfluxDB for a specific application.
 *
 * Uses the REAL Anypoint Monitoring query format discovered from the web UI:
 *   - Measurements: app_stats, jvm.memory, jvm.threading, jvm.classloading,
 *                   jvm.garbagecollector.*, worker_metric, etc.
 *   - WHERE: org_id, env_id, app_id (fullDomain)
 *   - GROUP BY: time(1m), "worker_id"
 *   - fill(null)
 *
 * @param domain - the short domain name (e.g. "crm-profile-s")
 * @param periodMinutes - how far back to query
 * @param fullDomain - the full domain (e.g. "crm-profile-s.de-c1.eu1.cloudhub.io")
 * @param orgId - organization ID
 * @param envId - environment ID
 */
async function getInfluxDBMonitoringData(
  domain: string,
  periodMinutes: number,
  fullDomain?: string,
  orgId?: string,
  envId?: string,
): Promise<any | null> {
  if (!(await discoverInfluxDatasource())) return null;

  const org = orgId ?? getOrgId();
  const env = envId ?? getEnvId();
  if (!org || !env) {
    logger.log('[Monitoring] Cannot query InfluxDB — no org/env IDs');
    return null;
  }

  const appIds = Array.from(
    new Set(
      [
        fullDomain,
        domain,
        fullDomain ? fullDomain.split('.')[0] : null,
      ].filter((value): value is string => !!value),
    ),
  );

  const now = Date.now();
  const startMs = now - periodMinutes * 60 * 1000;
  const groupBy = periodMinutes <= 60 ? '1m' : '5m';
  const timeZone = 'Europe/Athens';
  const querySets = [
    fullDomain
      ? {
          label: 'fullDomain',
          ids: [fullDomain],
        }
      : null,
    {
      label: 'fallback',
      ids: appIds,
    },
  ].filter((querySet): querySet is { label: string; ids: string[] } => Boolean(querySet));

  for (const querySet of querySets) {
    const scopedWhere = buildInfluxWhere(org, env, querySet.ids, startMs, now);
    const queries = [
      `SELECT sum("messageCount") FROM "app_stats" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "app_id" fill(0) tz('${timeZone}')`,
      `SELECT mean("responseTime") FROM "app_stats" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "app_id" fill(none) tz('${timeZone}')`,
      `SELECT sum("errorCount") FROM "app_stats" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "app_id" fill(0) tz('${timeZone}')`,
      `SELECT sum("avg_request_count") FROM "app_inbound_metric" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "response_type" fill(0) tz('${timeZone}')`,
      `SELECT mean("response_time.avg") FROM "app_inbound_metric" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "app_id" fill(none) tz('${timeZone}')`,
      `SELECT sum("avg_request_count") FROM "app_outbound_metric" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "response_type" fill(0) tz('${timeZone}')`,
      `SELECT mean("response_time.avg") FROM "app_outbound_metric" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "app_id" fill(none) tz('${timeZone}')`,
      `SELECT mean("cpu") FROM "jvm.cpu.operatingsystem" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "worker_id" fill(null) tz('${timeZone}')`,
      `SELECT mean("total_physical_memory_size") FROM "jvm.cpu.operatingsystem" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "worker_id" fill(null) tz('${timeZone}')`,
      `SELECT mean("heap_used") FROM "jvm.memory" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "worker_id" fill(null) tz('${timeZone}')`,
      `SELECT max("heap_total") FROM "jvm.memory" WHERE ${scopedWhere} GROUP BY time(${groupBy}) fill(null) tz('${timeZone}')`,
      `SELECT mean("thread_count") FROM "jvm.threading" WHERE ${scopedWhere} GROUP BY time(${groupBy}), "worker_id" fill(null) tz('${timeZone}')`,
    ];

    try {
      logger.log(
        `[Monitoring] InfluxDB query for ${domain} (${querySet.label}, appIds=${querySet.ids.join(', ')}): ${queries.length} statements, period=${periodMinutes}m`,
      );
      const result = await queryInfluxDB(queries.join(';'));
      if (!result?.results) {
        continue;
      }

      logger.log(`[Monitoring] InfluxDB returned ${result.results.length} result sets for ${domain}`);
      const parsed = parseInfluxDBResults(result);
      const hasInfluxData = parsed && (
        parsed.cpuPercent != null
        || parsed.memoryPercent != null
        || parsed.timeSeries.length > 0
        || parsed.extraMetrics.messageCount != null
        || parsed.extraMetrics.threadCount != null
        || parsed.extraMetrics.heapUsed != null
        || parsed.extraMetrics.heapCommitted != null
        || parsed.extraMetrics.inboundRequestCount != null
        || parsed.extraMetrics.outboundRequestCount != null
        || parsed.extraMetrics.inboundAvgResponseTime != null
        || parsed.extraMetrics.outboundAvgResponseTime != null
      );

      if (hasInfluxData) {
        logger.log(
          `[Monitoring] InfluxDB SUCCESS for ${domain}: CPU=${parsed!.cpuPercent?.toFixed(1)}%, Mem=${parsed!.memoryPercent?.toFixed(1)}%, MsgCount=${parsed!.extraMetrics.messageCount}`,
        );
        return {
          _source: 'influxdb',
          workerStatistics: [{
            statistics: {
              ...(parsed!.cpuPercent != null ? { cpu: { [now]: parsed!.cpuPercent } } : {}),
              ...(parsed!.memoryPercent != null ? { memoryPercentageUsed: { [now]: parsed!.memoryPercent } } : {}),
            },
          }],
          _timeSeries: parsed!.timeSeries,
          _extraMetrics: parsed!.extraMetrics,
        };
      }

      logger.log(
        `[Monitoring] InfluxDB returned no usable data for ${domain} using ${querySet.label} ids`,
      );
    } catch (err: any) {
      logger.log(
        `[Monitoring] InfluxDB query failed for ${domain} using ${querySet.label}: ${err?.response?.status ?? err?.message}`,
      );
    }
  }

  logger.log(`[Monitoring] InfluxDB queries returned no data for ${domain} (appIds=${appIds.join(', ')})`);
  return null;
}

/**
 * Retrieve application dashboard statistics (CPU, memory, threads, etc.).
 *
 * Strategy:
 * 1. First, try to get metrics from the app detail endpoint (workerStatuses).
 *    This is the MOST RELIABLE source for EU1 CloudHub 1.0 and doesn't require
 *    any extra API calls since the app detail is already fetched separately.
 *
 * 2. If dashboardStats endpoints are known to be unavailable (they return 404
 *    on EU1), skip them entirely to avoid 404 spam in the console.
 *
 * 3. Only try monitoring/observability endpoints if they haven't returned 404.
 *
 * Returns the first non-empty response, or null if all fail.
 */
export async function getDashboardStats(
  domain: string,
  periodMinutes: number = 60,
  context?: { organizationId?: string; environmentId?: string },
): Promise<any> {
  // ── FAST PATH: discovery already done, nothing works → skip immediately ──
  // This prevents ALL redundant API calls on subsequent React Query refetches.
  if (sessionState._dashStatsCheckDone && !sessionState.dashboardStatsAvailable && !sessionState.monitoringApiAvailable && sessionState._influxAvailable === false) {
    logger.log(`[getDashboardStats] Fast-path exit for "${domain}" — all sources disabled`);
    return null;
  }

  logger.log(`[getDashboardStats] Called for "${domain}" | dashStats=${sessionState.dashboardStatsAvailable} monApi=${sessionState.monitoringApiAvailable} influx=${sessionState._influxAvailable} checkDone=${sessionState._dashStatsCheckDone}`);

  const now = Date.now();
  const startMs = now - periodMinutes * 60 * 1000;

  const orgId = context?.organizationId ?? getOrgId();
  const envId = context?.environmentId ?? getEnvId();

  // --- Primary: Try the app detail endpoint FIRST ---
  // Use retreiveStatistics=true to request worker statistics alongside the detail.
  // The response includes workerStatuses with host/status info.
  let _appFullDomain: string | undefined;
  let _appPlatformId: string | undefined;
  let _appName: string | undefined;
  try {
    const { data: appDetail } = await api.get(`${CLOUDHUB_BASE}/applications/${domain}`, {
      params: { retreiveStatistics: true },
    });
    if (appDetail) {
      // Cache the fullDomain for InfluxDB queries
      _appFullDomain = appDetail.fullDomain;
      _appPlatformId = appDetail.fullDomain ?? appDetail.id;
      _appName = appDetail.name ?? appDetail.domain ?? domain;

      const ws = appDetail.workerStatuses ?? appDetail.workers?.statuses;
      // Check if workerStatuses has actual statistics (not just host/status info)
      const hasStats = Array.isArray(ws)
        ? ws.some((w: any) => w.statisticsByWorker || w.statistics || w.cpu != null)
        : ws && typeof ws === 'object' && Object.values(ws).some((w: any) =>
            (w as any)?.statisticsByWorker || (w as any)?.statistics || (w as any)?.cpu != null
          );
      if (hasStats) {
        return appDetail; // Return the full app detail — extractMetrics handles it
      }

      // Log diagnostics
      const monitoringEnabled = appDetail.monitoringEnabled ?? appDetail.monitoring?.enabled ?? false;
      const wsType = ws == null ? 'null' : Array.isArray(ws) ? `array(${ws.length})` : `object(${Object.keys(ws).length})`;
      const hasKeys = appDetail ? Object.keys(appDetail).filter(k =>
        k.includes('worker') || k.includes('monitor') || k.includes('stat')
      ).join(',') : '';
      logger.log(`[getDashboardStats] App detail for ${domain}: monitoringEnabled=${monitoringEnabled}, fullDomain=${_appFullDomain}, workerStatuses=${wsType}, hasStats=${hasStats}, relevant keys=[${hasKeys}]`);
    }
  } catch (_) {
    // App detail fetch failed, try other sources
  }

  const amqlScopeClauses = orgId && envId
    ? buildAmqlScopeClauses(orgId, envId, {
        platformId: _appPlatformId,
        name: _appName ?? domain,
        domain,
      })
    : [];
  const amqlDiscoveryClause = orgId && envId
    ? buildAmqlBaseFilterSets(orgId, envId).map((filters) => filters.join(' AND '))
    : [];

  // ── CONSOLIDATED DISCOVERY GATE ──
  // When multiple getDashboardStats calls fire in parallel (via useQueries),
  // the FIRST call tests ALL stat + monitoring endpoints in one pass.
  // All other calls await the same promise → zero redundant 404s.
  if (!sessionState._dashStatsCheckDone) {
    if (!sessionState._statsDiscoveryPromise) {
      sessionState._statsDiscoveryPromise = (async () => {
        const testDomain = domain;
        const fromIso = new Date(startMs).toISOString();
        const toIso = new Date(now).toISOString();

        // ── Test dashboardStats endpoints ──
        logger.log('[getDashboardStats] Discovery gate: testing dashboardStats...');
        let statsFailed = true;
        const statsTests = [
          () => api.get(`${CLOUDHUB_BASE}/applications/${testDomain}/dashboardStats`, {
            params: { startDate: startMs, endDate: now },
          }),
          () => api.get(`${CLOUDHUB_V1}/applications/${testDomain}/dashboardStats`, {
            params: { startDate: startMs, endDate: now },
          }),
        ];

        for (const attempt of statsTests) {
          try {
            const { data } = await attempt();
            if (data) { statsFailed = false; break; }
          } catch (err: any) {
            if (err?.response?.status !== 404) statsFailed = false;
          }
        }
        if (statsFailed) {
          sessionState.dashboardStatsAvailable = false;
          logger.log('[getDashboardStats] dashboardStats endpoints return 404 — disabling for session');
        }

        // ── Test monitoring/observability endpoints ──
        logger.log('[getDashboardStats] Discovery gate: testing monitoring APIs...');
        if (orgId && envId) {
          let discoveredMetricTypes: string[] = [];
          try {
            discoveredMetricTypes = await getObservabilityMetricTypes();
            logger.log(`[getDashboardStats] Available metric types: [${discoveredMetricTypes.slice(0, 15).join(', ')}]`);
          } catch (err: any) {
            logger.log(`[getDashboardStats] metric_types discovery failed: ${err?.response?.status ?? err?.message}`);
          }

          const discoveryInboundMetric = pickMetricType(
            discoveredMetricTypes,
            ['mulesoft.app.request', 'mulesoft.app.inbound'],
            [/mulesoft\.app\.(?:inbound|request)$/i],
          );
          const discoveryMessageMetric = pickMetricType(
            discoveredMetricTypes,
            ['mulesoft.app.message'],
            [/mulesoft\.app\.message/i],
          );

          let monFound = false;
          if (discoveredMetricTypes.length > 0) {
            monFound = true;
          }
          const monTests: Array<() => Promise<any>> = [
            async () => {
              if (!sessionState._archiveAvailable) throw new Error('Archive disabled');
              try {
                return await api.post(`/monitoring/archive/api/v1/organizations/${orgId}/environments/${envId}/query`, {
                  targets: [{ target: 'worker-cpu-usage', type: 'timeserie' }],
                  range: { from: fromIso, to: toIso },
                  app: testDomain,
                });
              } catch (err: any) {
                if (err?.response?.status === 404 || err?.response?.status === 405) {
                  sessionState._archiveAvailable = false;
                  logger.log('[getDashboardStats] monitoring-archive returned 404/405 — disabling for session');
                }
                throw err;
              }
            },
          ];

          if (discoveryInboundMetric && amqlDiscoveryClause.length > 0) {
            monTests.push(() => api.post('/observability/api/v1/metrics:search', {
              query: buildAmqlQuery(
                discoveryInboundMetric,
                'COUNT(requests) AS requestCount',
                amqlDiscoveryClause[0],
                startMs,
                now,
                'PT1H',
              ),
            }));
          }

          if (discoveryMessageMetric && amqlDiscoveryClause.length > 0) {
            monTests.push(() => api.post('/observability/api/v1/metrics:search', {
              query: buildAmqlQuery(
                discoveryMessageMetric,
                'SUM("total_count") AS totalCount',
                amqlDiscoveryClause[0],
                startMs,
                now,
              ),
            }));
          }

          for (const attempt of monTests) {
            try {
              const { data } = await attempt();
              if (isObservabilityDataPresent(data) || data) { monFound = true; break; }
            } catch (err: any) {
              const s = err?.response?.status;
              logger.log(`[getDashboardStats] Monitoring API test failed: status=${s}`);
              // Continue to try next endpoint
            }
          }
          if (!monFound) {
            sessionState.monitoringApiAvailable = false;
            logger.log('[getDashboardStats] Monitoring APIs unavailable — disabling for session');
          }
        } else {
          // No org/env → can't use monitoring APIs
          sessionState.monitoringApiAvailable = false;
        }

        // ── Test InfluxDB proxy (the REAL monitoring endpoint) ──
        // This is the Grafana-style datasource proxy that the Anypoint web UI uses.
        logger.log('[getDashboardStats] Discovery gate: testing InfluxDB proxy...');
        if (sessionState._influxAvailable === null) {
          await discoverInfluxDatasource();
        }

        logger.log('[getDashboardStats] Discovery complete:', { dashboardStatsAvailable: sessionState.dashboardStatsAvailable, monitoringApiAvailable: sessionState.monitoringApiAvailable, _influxAvailable: sessionState._influxAvailable });
        sessionState._dashStatsCheckDone = true;
      })();
    }
    await sessionState._statsDiscoveryPromise;

    // After discovery, if nothing works, return null immediately
    if (!sessionState.dashboardStatsAvailable && !sessionState.monitoringApiAvailable && sessionState._influxAvailable !== true) {
      return null;
    }
  }

  // ── Use the endpoints we know work (discovery passed) ──
  if (sessionState.dashboardStatsAvailable) {
    const statsAttempts: Array<() => Promise<any>> = [
      () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/dashboardStats`, {
        params: { startDate: startMs, endDate: now },
      }),
      () => api.get(`${CLOUDHUB_V1}/applications/${domain}/dashboardStats`, {
        params: { startDate: startMs, endDate: now },
      }),
      () => api.get(`${CLOUDHUB_BASE}/applications/${domain}/statistics`, {
        params: { startDate: startMs, endDate: now },
      }),
    ];

    for (const attempt of statsAttempts) {
      try {
        const { data } = await attempt();
        if (data) return data;
      } catch (_) {
        // continue
      }
    }
  }

  if (sessionState.monitoringApiAvailable && orgId && envId) {
    const fromIso = new Date(startMs).toISOString();
    const toIso = new Date(now).toISOString();

    // Determine appropriate time interval based on the period
    const amqlInterval = periodMinutes <= 60 ? 'PT1M' : periodMinutes <= 720 ? 'PT1H' : 'P1D';

    const monAttempts: Array<{ label: string; fn: () => Promise<any> }> = [
      // Grafana-style monitoring archive query (requires Titanium/Platinum)
      {
        label: 'monitoring-archive',
        fn: async () => {
          if (!sessionState._archiveAvailable) throw new Error('Archive disabled');
          try {
            return await api.post(`/monitoring/archive/api/v1/organizations/${orgId}/environments/${envId}/query`, {
              targets: [
                { target: 'worker-cpu-usage', type: 'timeserie' },
                { target: 'worker-memory-usage', type: 'timeserie' },
                { target: 'worker-thread-count', type: 'timeserie' },
              ],
              range: { from: fromIso, to: toIso },
              app: domain,
            });
          } catch (err: any) {
            if (err?.response?.status === 404 || err?.response?.status === 405) {
              sessionState._archiveAvailable = false;
              logger.log('[getDashboardStats] monitoring-archive returned 404/405 — disabling for session');
            }
            throw err;
          }
        },
      },
      // Observability Metrics API — inbound request metrics (correct AMQL)
    ];

    for (const attempt of monAttempts) {
      try {
        const { data } = await attempt.fn();
        if (data) {
          logger.log(`[getDashboardStats] ${attempt.label} returned data for ${domain}`);
          // Tag the response with source info
          if (typeof data === 'object' && !Array.isArray(data)) {
            data._source = attempt.label;
          }
          return data;
        }
      } catch (err: any) {
        logger.log(`[getDashboardStats] ${attempt.label} failed: ${err?.response?.status ?? err?.message}`);
      }
    }

    let metricTypes: string[] = [];
    try {
      metricTypes = await getObservabilityMetricTypes();
    } catch (err: any) {
      logger.log(`[getDashboardStats] observability metric_types unavailable: ${err?.response?.status ?? err?.message}`);
    }

    const inboundMetricType = pickMetricType(
      metricTypes,
      ['mulesoft.app.request', 'mulesoft.app.inbound'],
      [/mulesoft\.app\.(?:inbound|request)$/i],
    );
    const outboundMetricType = pickMetricType(
      metricTypes,
      ['mulesoft.app.outbound.request', 'mulesoft.app.outbound'],
      [/mulesoft\.app\.outbound(?:\.request)?$/i],
    );
    const messageMetricType = pickMetricType(
      metricTypes,
      ['mulesoft.app.message'],
      [/mulesoft\.app\.message/i],
    );
    const jvmMetricType = pickMetricType(
      metricTypes,
      ['mulesoft.flex.system.metric', 'mulesoft.app.jvm', 'mulesoft.entity'],
      [/mulesoft\.flex\.system\.metric/i, /mulesoft\.app\.jvm/i, /jvm/i, /entity/i],
    );
    const workerMetricType = pickMetricType(
      metricTypes,
      ['mulesoft.flex.system.metric', 'mulesoft.app.worker', 'mulesoft.worker', 'mulesoft.entity'],
      [/mulesoft\.flex\.system\.metric/i, /worker/i, /entity/i],
    );

    const runObservabilityQuery = async (
      metricType: string,
      selectClause: string,
      whereClauses: string[],
    ): Promise<any | null> => {
      let lastError: any = null;
      for (const whereClause of whereClauses) {
        try {
          const { data } = await api.post('/observability/api/v1/metrics:search', {
            query: buildAmqlQuery(metricType, selectClause, whereClause, startMs, now, amqlInterval),
          });
          if (isObservabilityDataPresent(data)) return data;
          logger.log(`[getDashboardStats] observability query returned no rows for metric=${metricType} where=${whereClause}`);
        } catch (err: any) {
          lastError = err;
        }
      }
      if (lastError) throw lastError;
      return null;
    };

    const observabilityResult: any = {
      _source: 'observability',
      _timeSeries: [] as Array<Record<string, number>>,
      _extraMetrics: {} as Record<string, number>,
      _jvmMetrics: {} as Record<string, number>,
      _appMetrics: {
        inboundRequestCount: null as number | null,
        inboundAvgResponseTime: null as number | null,
        outboundRequestCount: null as number | null,
        outboundAvgResponseTime: null as number | null,
        messageCount: null as number | null,
        errorCount: null as number | null,
      },
    };
    let hasAnyObservabilityData = false;
    const timeSeriesMap = new Map<number, Record<string, number>>();

    const getTimeSeriesPoint = (timestamp: number): Record<string, number> => {
      const existing = timeSeriesMap.get(timestamp);
      if (existing) return existing;
      const created: Record<string, number> = { timestamp };
      timeSeriesMap.set(timestamp, created);
      return created;
    };

    const appMetricAttempts: Array<{
      label: string;
      metricType: string | null;
      selectClause: string;
    }> = [
      {
        label: 'observability-inbound',
        metricType: inboundMetricType,
        selectClause: 'timestamp, COUNT(requests) AS requestCount, AVG("response_time") AS avgResponseTime',
      },
      {
        label: 'observability-messages',
        metricType: messageMetricType,
        selectClause: 'timestamp, SUM("total_count") AS totalCount, SUM("error_count") AS errorCount',
      },
      {
        label: 'observability-outbound',
        metricType: outboundMetricType,
        selectClause: 'timestamp, COUNT(requests) AS requestCount, AVG("response_time") AS avgResponseTime',
      },
    ];

    logger.log(
      `[getDashboardStats] Observability candidates for ${domain}: inbound=${inboundMetricType ?? 'none'}, outbound=${outboundMetricType ?? 'none'}, messages=${messageMetricType ?? 'none'}, jvm=${jvmMetricType ?? 'none'}, worker=${workerMetricType ?? 'none'}, scopeClauses=${amqlScopeClauses.length}`,
    );

    for (const attempt of appMetricAttempts) {
      if (!attempt.metricType || amqlScopeClauses.length === 0) continue;
      try {
        const data = await runObservabilityQuery(attempt.metricType, attempt.selectClause, amqlScopeClauses);
        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
          hasAnyObservabilityData = true;
          for (const row of data.data) {
            const timestamp = Number(
              row.timestamp ??
              row.TIMESTAMP ??
              row.time ??
              row.ts ??
              row.window_start ??
              0,
            );
            const point = timestamp > 0 ? getTimeSeriesPoint(timestamp) : null;
            const requestCount = Number(row.requestCount ?? row.REQUESTCOUNT ?? row['COUNT(requests)'] ?? NaN);
            const avgResponseTime = Number(row.avgResponseTime ?? row.AVGRESPONSETIME ?? row['AVG(response_time)'] ?? NaN);
            const totalCount = Number(row.totalCount ?? row.TOTALCOUNT ?? row['SUM(total_count)'] ?? NaN);
            const errorCount = Number(row.errorCount ?? row.ERRORCOUNT ?? row['SUM(error_count)'] ?? NaN);

            if (Number.isFinite(requestCount)) {
              if (attempt.label.includes('outbound')) {
                observabilityResult._appMetrics.outboundRequestCount = (observabilityResult._appMetrics.outboundRequestCount ?? 0) + requestCount;
                if (point) point.outboundRequests = requestCount;
              } else {
                observabilityResult._appMetrics.inboundRequestCount = (observabilityResult._appMetrics.inboundRequestCount ?? 0) + requestCount;
                if (point) point.inboundRequests = requestCount;
              }
            }

            if (Number.isFinite(avgResponseTime)) {
              if (attempt.label.includes('outbound')) {
                observabilityResult._appMetrics.outboundAvgResponseTime = avgResponseTime;
                if (point) point.outboundResponseTime = avgResponseTime;
              } else {
                observabilityResult._appMetrics.inboundAvgResponseTime = avgResponseTime;
                if (point) point.inboundResponseTime = avgResponseTime;
              }
            }

            if (Number.isFinite(totalCount)) {
              observabilityResult._appMetrics.messageCount = (observabilityResult._appMetrics.messageCount ?? 0) + totalCount;
              if (point) point.messageCount = totalCount;
            }

            if (Number.isFinite(errorCount)) {
              observabilityResult._appMetrics.errorCount = (observabilityResult._appMetrics.errorCount ?? 0) + errorCount;
              if (point) point.inboundErrors = errorCount;
            }
          }
        }
      } catch (err: any) {
        logger.log(`[getDashboardStats] ${attempt.label} failed: ${err?.response?.status ?? err?.message}`);
      }
    }

    const observabilityInfraAttempts: Array<{
      label: string;
      metricType: string | null;
      selectClause: string | null;
      whereClauses: string[];
    }> = [];

    if (workerMetricType && amqlScopeClauses.length > 0) {
      try {
        const workerDescriptor = await describeObservabilityMetricType(workerMetricType);
        logger.log(
          `[getDashboardStats] worker metric descriptor for ${domain}: ${workerMetricType} -> [${workerDescriptor.measurements.slice(0, 20).join(', ')}]`,
        );
        logger.log(
          `[getDashboardStats] worker metric descriptor dims for ${domain}: ${workerMetricType} -> [${workerDescriptor.dimensions.slice(0, 20).join(', ')}]`,
        );
        const workerScopeClauses = buildDescriptorAwareScopeClauses(
          orgId,
          envId,
          {
            platformId: _appPlatformId,
            name: _appName ?? domain,
            domain,
          },
          workerDescriptor.dimensions,
        );
        const workerCpuMeasurement = pickMeasurement(workerDescriptor.measurements, [
          /process.*cpu/i,
          /system.*cpu/i,
          /cpu.*(?:usage|load|percent|pct)/i,
          /^cpu$/i,
        ]);
        const workerMemoryPercentMeasurement = pickMeasurement(workerDescriptor.measurements, [
          /memory.*(?:usage|percent|pct)/i,
          /memory.*used.*percent/i,
        ]);
        const workerMemoryUsedMeasurement = pickMeasurement(workerDescriptor.measurements, [
          /heap.*used/i,
          /physical.*memory.*used/i,
          /used.*memory/i,
          /memory.*(?:used|usage)/i,
        ]);
        const workerMemoryTotalMeasurement = pickMeasurement(workerDescriptor.measurements, [
          /heap.*(?:total|max|committed)/i,
          /physical.*memory.*(?:total|size)/i,
          /memory.*(?:total|max|limit|committed)/i,
        ]);

        const workerSelects = ['timestamp'];
        if (workerCpuMeasurement) workerSelects.push(`AVG("${workerCpuMeasurement}") AS cpuPercent`);
        if (workerMemoryPercentMeasurement) workerSelects.push(`AVG("${workerMemoryPercentMeasurement}") AS memoryPercent`);
        if (workerMemoryUsedMeasurement) workerSelects.push(`AVG("${workerMemoryUsedMeasurement}") AS memoryUsed`);
        if (workerMemoryTotalMeasurement) workerSelects.push(`AVG("${workerMemoryTotalMeasurement}") AS memoryTotal`);
        if (workerSelects.length > 1) {
          observabilityInfraAttempts.push({
            label: 'observability-worker',
            metricType: workerMetricType,
            selectClause: workerSelects.join(', '),
            whereClauses: workerScopeClauses,
          });
        }
      } catch (err: any) {
        logger.log(`[getDashboardStats] worker metric describe failed: ${err?.response?.status ?? err?.message}`);
      }
    }

    if (jvmMetricType && amqlScopeClauses.length > 0) {
      try {
        const jvmDescriptor = await describeObservabilityMetricType(jvmMetricType);
        logger.log(
          `[getDashboardStats] jvm metric descriptor for ${domain}: ${jvmMetricType} -> [${jvmDescriptor.measurements.slice(0, 20).join(', ')}]`,
        );
        logger.log(
          `[getDashboardStats] jvm metric descriptor dims for ${domain}: ${jvmMetricType} -> [${jvmDescriptor.dimensions.slice(0, 20).join(', ')}]`,
        );
        const jvmScopeClauses = buildDescriptorAwareScopeClauses(
          orgId,
          envId,
          {
            platformId: _appPlatformId,
            name: _appName ?? domain,
            domain,
          },
          jvmDescriptor.dimensions,
        );
        const jvmCpuMeasurement = pickMeasurement(jvmDescriptor.measurements, [
          /process.*cpu/i,
          /system.*cpu/i,
          /cpu.*(?:usage|load|percent|pct)/i,
          /^cpu$/i,
        ]);
        const heapUsedMeasurement = pickMeasurement(jvmDescriptor.measurements, [/heap.*used/i]);
        const heapCommittedMeasurement = pickMeasurement(jvmDescriptor.measurements, [/heap.*(?:committed|max|total)/i]);
        const nonHeapUsedMeasurement = pickMeasurement(jvmDescriptor.measurements, [/non.*heap.*used/i]);
        const threadCountMeasurement = pickMeasurement(jvmDescriptor.measurements, [/thread.*count/i, /^threads$/i]);
        const classesLoadedMeasurement = pickMeasurement(jvmDescriptor.measurements, [/classes.*loaded/i]);
        const gcCollectionsMeasurement = pickMeasurement(jvmDescriptor.measurements, [/garbage.*collection.*count/i, /gc.*count/i, /collections/i]);
        const gcTimeMeasurement = pickMeasurement(jvmDescriptor.measurements, [/garbage.*collection.*time/i, /gc.*time/i]);

        const jvmSelects = ['timestamp'];
        if (jvmCpuMeasurement) jvmSelects.push(`AVG("${jvmCpuMeasurement}") AS cpuPercent`);
        if (heapUsedMeasurement) jvmSelects.push(`AVG("${heapUsedMeasurement}") AS heapUsed`);
        if (heapCommittedMeasurement) jvmSelects.push(`AVG("${heapCommittedMeasurement}") AS heapCommitted`);
        if (nonHeapUsedMeasurement) jvmSelects.push(`AVG("${nonHeapUsedMeasurement}") AS nonHeapUsed`);
        if (threadCountMeasurement) jvmSelects.push(`AVG("${threadCountMeasurement}") AS threadCount`);
        if (classesLoadedMeasurement) jvmSelects.push(`AVG("${classesLoadedMeasurement}") AS classesLoaded`);
        if (gcCollectionsMeasurement) jvmSelects.push(`AVG("${gcCollectionsMeasurement}") AS gcCollections`);
        if (gcTimeMeasurement) jvmSelects.push(`AVG("${gcTimeMeasurement}") AS gcTime`);
        if (jvmSelects.length > 1) {
          observabilityInfraAttempts.push({
            label: 'observability-jvm',
            metricType: jvmMetricType,
            selectClause: jvmSelects.join(', '),
            whereClauses: jvmScopeClauses,
          });
        }
      } catch (err: any) {
        logger.log(`[getDashboardStats] jvm metric describe failed: ${err?.response?.status ?? err?.message}`);
      }
    }

    for (const attempt of observabilityInfraAttempts) {
      if (!attempt.metricType || !attempt.selectClause || attempt.whereClauses.length === 0) continue;
      try {
        const data = await runObservabilityQuery(attempt.metricType, attempt.selectClause, attempt.whereClauses);
        if (data?.data && Array.isArray(data.data) && data.data.length > 0) {
          hasAnyObservabilityData = true;
          for (const row of data.data) {
            const timestamp = Number(row.timestamp ?? row.TIMESTAMP ?? row.time ?? row.ts ?? 0);
            const point = timestamp > 0 ? getTimeSeriesPoint(timestamp) : null;
            const cpuPercent = Number(row.cpuPercent ?? row.CPUPERCENT ?? NaN);
            const memoryPercent = Number(row.memoryPercent ?? row.MEMORYPERCENT ?? NaN);
            const memoryUsed = Number(row.memoryUsed ?? row.MEMORYUSED ?? NaN);
            const memoryTotal = Number(row.memoryTotal ?? row.MEMORYTOTAL ?? NaN);
            const heapUsed = Number(row.heapUsed ?? row.HEAPUSED ?? NaN);
            const heapCommitted = Number(row.heapCommitted ?? row.HEAPCOMMITTED ?? NaN);
            const nonHeapUsed = Number(row.nonHeapUsed ?? row.NONHEAPUSED ?? NaN);
            const threadCount = Number(row.threadCount ?? row.THREADCOUNT ?? NaN);
            const classesLoaded = Number(row.classesLoaded ?? row.CLASSESLOADED ?? NaN);
            const gcCollections = Number(row.gcCollections ?? row.GCCOLLECTIONS ?? NaN);
            const gcTime = Number(row.gcTime ?? row.GCTIME ?? NaN);

            if (Number.isFinite(cpuPercent)) {
              observabilityResult._extraMetrics.cpuPercent = cpuPercent;
              observabilityResult._jvmMetrics.cpuUsage = observabilityResult._jvmMetrics.cpuUsage ?? cpuPercent;
              if (point) point.cpu = cpuPercent;
            }
            if (Number.isFinite(memoryPercent)) {
              observabilityResult._extraMetrics.memoryPercent = memoryPercent;
              if (point) point.memory = memoryPercent;
            }
            if (Number.isFinite(memoryUsed)) observabilityResult._extraMetrics.memoryUsed = memoryUsed;
            if (Number.isFinite(memoryTotal)) observabilityResult._extraMetrics.memoryTotal = memoryTotal;
            if (Number.isFinite(heapUsed)) {
              observabilityResult._jvmMetrics.heapUsed = heapUsed;
              if (point) point.heapUsed = heapUsed;
            }
            if (Number.isFinite(heapCommitted)) {
              observabilityResult._jvmMetrics.heapCommitted = heapCommitted;
              if (point) point.heapCommitted = heapCommitted;
            }
            if (Number.isFinite(nonHeapUsed)) observabilityResult._jvmMetrics.nonHeapUsed = nonHeapUsed;
            if (Number.isFinite(threadCount)) {
              observabilityResult._jvmMetrics.threadCount = threadCount;
              if (point) point.threadCount = threadCount;
            }
            if (Number.isFinite(classesLoaded)) observabilityResult._jvmMetrics.classesLoaded = classesLoaded;
            if (Number.isFinite(gcCollections)) observabilityResult._jvmMetrics.gcCollections = gcCollections;
            if (Number.isFinite(gcTime)) observabilityResult._jvmMetrics.gcTime = gcTime;

            if (
              !Number.isFinite(memoryPercent) &&
              Number.isFinite(memoryUsed) &&
              Number.isFinite(memoryTotal) &&
              memoryTotal > 0
            ) {
              const derivedPercent = Math.round((memoryUsed / memoryTotal) * 100);
              observabilityResult._extraMetrics.memoryPercent = derivedPercent;
              if (point) point.memory = derivedPercent;
            } else if (
              !Number.isFinite(memoryPercent) &&
              Number.isFinite(heapUsed) &&
              Number.isFinite(heapCommitted) &&
              heapCommitted > 0
            ) {
              const derivedPercent = Math.round((heapUsed / heapCommitted) * 100);
              observabilityResult._extraMetrics.memoryPercent = derivedPercent;
              if (point) point.memory = derivedPercent;
            }
          }
        }
      } catch (err: any) {
        logger.log(`[getDashboardStats] ${attempt.label} failed: ${err?.response?.status ?? err?.message}`);
      }
    }

    if (hasAnyObservabilityData) {
      observabilityResult._timeSeries = Array.from(timeSeriesMap.values()).sort(
        (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
      );
      logger.log(`[getDashboardStats] Observability API returned app-level metrics for ${domain}:`, observabilityResult._appMetrics);
      return observabilityResult;
    }
  }

  // --- JVM metrics endpoint (direct monitoring API) ---
  if (orgId && envId && sessionState._legacyJvmApiAvailable) {
    try {
      const jvmData = await monitoringService.getJVMMetrics(orgId, envId, domain);
      if (jvmData && typeof jvmData === 'object' && Object.keys(jvmData).length > 0) {
        logger.log(`[getDashboardStats] JVM endpoint returned data for ${domain}:`, Object.keys(jvmData).join(', '));
        return {
          _source: 'jvm-endpoint',
          _jvmMetrics: jvmData,
        };
      }
    } catch (err: any) {
      if (err?.response?.status === 404 || err?.response?.status === 405) {
        sessionState._legacyJvmApiAvailable = false;
      }
      logger.log(`[getDashboardStats] JVM endpoint failed for ${domain}: ${err?.response?.status ?? err?.message}`);
    }
  }

  // --- Monitoring metrics endpoint (POST metrics API) ---
  if (orgId && envId && sessionState._legacyMetricsApiAvailable) {
    try {
      const fromIso = new Date(startMs).toISOString();
      const toIso = new Date(now).toISOString();
      const metricsData = await monitoringService.getMetrics(orgId, envId, {
        resourceId: domain,
        metricNames: ['cpu.usage', 'memory.usage', 'memory.total'],
        startDate: fromIso,
        endDate: toIso,
        interval: 'PT1M',
      });
      if (metricsData && Array.isArray(metricsData) && metricsData.length > 0) {
        logger.log(`[getDashboardStats] Monitoring metrics endpoint returned ${metricsData.length} series for ${domain}`);
        return {
          _source: 'monitoring-metrics',
          _metricSeries: metricsData,
        };
      }
    } catch (err: any) {
      if (err?.response?.status === 404 || err?.response?.status === 405) {
        sessionState._legacyMetricsApiAvailable = false;
      }
      logger.log(`[getDashboardStats] Monitoring metrics endpoint failed for ${domain}: ${err?.response?.status ?? err?.message}`);
    }
  }

  // --- InfluxDB proxy (the real Anypoint Monitoring endpoint) ---
  if (sessionState._influxAvailable) {
    try {
      const influxData = await getInfluxDBMonitoringData(
        domain,
        periodMinutes,
        _appFullDomain,  // pass the fullDomain for accurate app_id filtering
        orgId,
        envId,
      );
      if (influxData) return influxData;
    } catch (err: any) {
      logger.log(`[getDashboardStats] InfluxDB query failed for ${domain}: ${err?.message}`);
    }
  }

  // --- CloudHub 2.0 deployment detail (AMC API) — may contain replica status ---
  const amcPath = amcDeploymentsPath();
  if (amcPath) {
    try {
      const { data: deps } = await api.get(amcPath);
      const items = Array.isArray(deps) ? deps : (deps?.items ?? deps?.data ?? []);
      const match = items.find((d: any) => matchDeployment(d, domain));
      if (match) {
        const { data: detail } = await api.get(`${amcPath}/${match.id}`);
        if (detail) return detail;
      }
    } catch (_) {
      // CH2 not available
    }
  }

  return null;
}

/**
 * Extract a time-series array from a CloudHub statistics map.
 * Input:  { "1709564000000": 2.5, "1709564060000": 3.1 }
 * Output: [{ timestamp: 1709564000000, value: 2.5 }, ...]
 *
 * If `statisticsByWorker` is nested by worker ID, unwrap the first worker.
 */
function extractTimeSeries(
  statsObj: any,
  metricName: string,
): Array<{ timestamp: number; value: number }> {
  if (!statsObj || typeof statsObj !== 'object') return [];

  // Direct access: statsObj might be { cpu: {...}, memoryPercentageUsed: {...} }
  let metricMap = statsObj[metricName];

  // If not found, the object might be nested by worker ID
  if (metricMap == null) {
    const workerKeys = Object.keys(statsObj);
    for (const wk of workerKeys) {
      const nested = statsObj[wk];
      if (nested && typeof nested === 'object' && nested[metricName] != null) {
        metricMap = nested[metricName];
        break;
      }
    }
  }

  if (metricMap == null || typeof metricMap !== 'object' || Array.isArray(metricMap)) return [];

  return Object.entries(metricMap)
    .map(([ts, val]) => ({ timestamp: Number(ts), value: typeof val === 'number' ? val : 0 }))
    .sort((a, b) => a.timestamp - b.timestamp);
}

/**
 * Retrieve application metrics (CPU, memory, etc.).
 * Returns an array of { timestamp, value } data points for the requested metric.
 *
 * If dashboardStats is unavailable (common on EU1), tries to extract
 * time-series from the app detail's workerStatuses instead.
 */
export async function getAppMetrics(
  domain: string,
  params: {
    metricName: string;
    startDate: string;
    endDate: string;
    interval?: string;
  },
): Promise<any> {
  const startMs = new Date(params.startDate).getTime();
  const endMs = new Date(params.endDate).getTime();

  // Map friendly metric names to CloudHub field names
  const metricFieldMap: Record<string, string[]> = {
    cpu: ['cpuPercentageUsed', 'cpu'],
    memory: ['memoryPercentageUsed', 'memoryTotalUsed'],
  };
  const fieldNames = metricFieldMap[params.metricName] ?? [params.metricName];

  // Skip dashboardStats if known to be unavailable
  if (sessionState.dashboardStatsAvailable) {
    try {
      const { data } = await api.get(
        `${CLOUDHUB_BASE}/applications/${domain}/dashboardStats`,
        {
          params: {
            startDate: startMs,
            endDate: endMs,
            interval: params.interval,
          },
        },
      );

      if (!data) return null;

      // Extract time-series from workerStatistics (the main metrics container)
      const statsSource = data.workerStatistics ?? data;

      for (const fieldName of fieldNames) {
        const series = extractTimeSeries(statsSource, fieldName);
        if (series.length > 0) return series;
      }

      // Return the raw data if we couldn't extract a time-series
      return data;
    } catch (err: any) {
      if (err?.response?.status === 404) {
        sessionState.dashboardStatsAvailable = false;
      } else {
        throw err;
      }
    }
  }

  // Fallback: try to get metrics from app detail workerStatuses
  try {
    const { data } = await api.get(`${CLOUDHUB_BASE}/applications/${domain}`);
    if (data?.workerStatuses || data?.workers?.statuses) {
      return data; // extractMetrics in the UI layer will handle this shape
    }
  } catch (_) {
    // not available
  }

  try {
    const periodMinutes = Math.max(1, Math.ceil((endMs - startMs) / 60000));
    const dashboardLike = await getDashboardStats(domain, periodMinutes);

    if (Array.isArray(dashboardLike?._timeSeries)) {
      if (params.metricName === 'cpu') {
        const series = dashboardLike._timeSeries
          .filter((point: any) => point?.timestamp != null && point?.cpu != null)
          .map((point: any) => ({ timestamp: Number(point.timestamp), value: Number(point.cpu) }));
        if (series.length > 0) return series;
      }

      if (params.metricName === 'memory') {
        const series = dashboardLike._timeSeries
          .filter((point: any) => point?.timestamp != null && (point?.memory != null || point?.heapUsed != null))
          .map((point: any) => ({
            timestamp: Number(point.timestamp),
            value: Number(point.memory ?? point.heapUsed),
          }));
        if (series.length > 0) return series;
      }
    }

    const statsSource = dashboardLike?.workerStatistics ?? dashboardLike;
    for (const fieldName of fieldNames) {
      const series = extractTimeSeries(statsSource, fieldName);
      if (series.length > 0) return series;
    }
  } catch (_) {
    // The dashboard query is handled independently in the monitoring screens.
  }

  return null;
}
