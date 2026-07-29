import api from './api';
import { getStatusCode, toNumber, toStringValue, unwrapCollection } from './controlPlaneCommon';
import logger from '../utils/logger';

const METERING_BASE = '/metering/usage/api/v1';

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Time-series granularity strategy
 * --------------------------------
 * Every metering query is a `TIMESERIES <granularity>` AMQL statement. The live
 * platform rejects a `P1M` (one calendar month) bucket whenever the requested
 * window is longer than 61 days:
 *
 *   HTTP 400 {"message":"Query duration more than 61 days for P1M"}
 *
 * The Usage Reports screen offers 30d / 90d / 365d, so 2 of its 3 ranges used to
 * fail outright.
 *
 * We deliberately do NOT emit a coarser bucket (P3M / P1Y / ...). Nothing in this
 * repository establishes that the metering API accepts one: the captured console
 * traffic (docs/anypoint-platform-capture.md) records only the endpoints, the
 * `supportedTimeSeries` field returned by `meters:describe` is not captured, and
 * the only other granularity tokens in the codebase (PT1M / PT1H / P1D in
 * services/runtime/monitoring.ts) belong to a different API (observability AMQL)
 * and are all *finer* than P1M. Guessing a token would trade a reproducible 400
 * for an unpredictable one.
 *
 * So the honest behaviour is: keep the only granularity we know is supported and
 * split any longer window into sequential sub-61-day segments, issuing one query
 * per segment and merging the resulting series. Segments are non-overlapping
 * (`between` is inclusive on both ends, so each segment starts 1ms after the
 * previous one ends) and are executed through the same bounded-concurrency
 * runner as the rest of the fan-out.
 */
export const MAX_P1M_WINDOW_DAYS = 61;
export const MAX_P1M_WINDOW_MS = MAX_P1M_WINDOW_DAYS * DAY_MS;

export type TimeSeriesGranularity = 'P1M';

/** Cap on simultaneous `meters:search` POSTs (the console fans out unbounded and gets 429ed). */
export const DEFAULT_METERING_CONCURRENCY = 4;
/** Retries are for 429 only, and are bounded so a throttled tenant cannot hang the screen. */
export const DEFAULT_MAX_RETRIES = 3;
export const DEFAULT_RETRY_BASE_DELAY_MS = 500;
export const MAX_RETRY_DELAY_MS = 8000;

export interface MeterDimension {
  name: string;
  label: string | null;
  description: string | null;
}

export interface MeterMeasurement {
  name: string;
  label: string | null;
  description: string | null;
}

export interface MeterDescriptor {
  name: string;
  description: string;
  productName: string | null;
  productLabel: string | null;
  meterType: string | null;
  dimensions: MeterDimension[];
  measurements: MeterMeasurement[];
  supportedTimeSeries: string[];
}

export interface UsageSearchMetadata {
  responseAsOf: string | null;
  lastUpdatedAt: string | null;
}

export interface UsageSearchResult {
  metadata: UsageSearchMetadata;
  data: Array<Record<string, unknown>>;
}

/**
 * How partial series from chunked windows recombine.
 *
 * - `sum`: the meter counts events inside the bucket (messages, requests, bytes,
 *   message units, contracts). Two partial buckets add up.
 * - `max`: the meter is a concurrency snapshot — it reports the peak value and the
 *   `max_concurrent_time` at which that peak occurred. Adding two peaks would be
 *   nonsense, so the winning row is kept whole (value *and* its timestamp).
 */
export type UsageMergeStrategy = 'sum' | 'max';

export interface UsageReportCategory {
  id: string;
  title: string;
  summaryMetric: string;
  summaryUnit: string;
  detailColumns: string[];
  aggregateQuery: string;
  detailQuery: string;
  mergeStrategy: UsageMergeStrategy;
}

export interface UsageReportSection {
  category: UsageReportCategory;
  aggregate: UsageSearchResult;
  detail: UsageSearchResult;
  /** `unavailable` means every retry for this meter failed; the rest of the screen still renders. */
  status: 'available' | 'unavailable';
  error: string | null;
}

const USAGE_REPORT_CATEGORIES: UsageReportCategory[] = [
  {
    id: 'runtime-messages',
    title: 'Runtime Messages',
    summaryMetric: 'mule_message_count',
    summaryUnit: 'messages',
    detailColumns: ['app_name', 'env_name', 'org_name', 'deployment_model', 'mule_message_count'],
    mergeStrategy: 'sum',
    aggregateQuery: "SELECT mule_message_count FROM runtime_mule_message_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
    detailQuery:
      "SELECT mule_message_count, org_id, org_name, asset_id, deployment_model, env_id, env_name, env_type, app_name, target_name, target_type, target_id, asset_sideloaded FROM runtime_mule_message_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
  },
  {
    id: 'runtime-network',
    title: 'Runtime Network',
    summaryMetric: 'network_bytes_count',
    summaryUnit: 'GB',
    detailColumns: ['app_name', 'env_name', 'org_name', 'deployment_model', 'network_bytes_count'],
    mergeStrategy: 'sum',
    aggregateQuery: "SELECT DIV(network_bytes_count, 1000000000) FROM runtime_network_bytes_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
    detailQuery:
      "SELECT DIV(network_bytes_count, 1000000000), org_id, org_name, asset_id, deployment_model, env_id, env_name, env_type, app_name FROM runtime_network_bytes_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
  },
  {
    id: 'runtime-flows',
    title: 'Runtime Flows',
    summaryMetric: 'mule_flow_count',
    summaryUnit: 'flows',
    detailColumns: ['app_name', 'env_name', 'org_name', 'num_workers', 'mule_flow_count'],
    // Concurrency meter: `max_concurrent_time` marks the peak, so chunks take a max.
    mergeStrategy: 'max',
    aggregateQuery: "SELECT mule_flow_count, max_concurrent_time FROM runtime_flow_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
    detailQuery:
      "SELECT mule_flow_count, num_workers, org_id, org_name, asset_id, deployment_model, env_id, env_name, env_type, app_name, target_name, target_type, target_id, asset_sideloaded FROM runtime_flow_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
  },
  {
    id: 'api-manager',
    title: 'API Manager',
    summaryMetric: 'managed_api_count',
    summaryUnit: 'managed APIs',
    detailColumns: ['org_name', 'env_type', 'runtime', 'managed_api_count'],
    // Concurrency meter (peak managed API instances).
    mergeStrategy: 'max',
    aggregateQuery: "SELECT managed_api_count, max_concurrent_time FROM api_manager_api_instance_count_prod WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
    detailQuery:
      "SELECT managed_api_count, org_id, org_name, env_type, runtime FROM api_manager_api_instance_count_prod WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
  },
  {
    id: 'governance',
    title: 'Governed APIs',
    summaryMetric: 'governed_api_count',
    summaryUnit: 'governed APIs',
    detailColumns: ['org_name', 'governed_api_count'],
    // Concurrency meter (peak governed APIs).
    mergeStrategy: 'max',
    aggregateQuery: "SELECT max_concurrent_time, governed_api_count FROM governed_api_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
    detailQuery:
      "SELECT governed_api_count, org_id, org_name FROM governed_api_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
  },
  {
    id: 'api-contracts',
    title: 'Approved API Contracts',
    summaryMetric: 'approved_contract_count',
    summaryUnit: 'contracts',
    detailColumns: ['portal_name', 'target_org_id', 'approved_contract_count'],
    mergeStrategy: 'sum',
    aggregateQuery: "SELECT approved_contract_count FROM acm_aeh_approved_contracts_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
    detailQuery:
      "SELECT approved_contract_count, target_org_id, portal_name FROM acm_aeh_approved_contracts_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
  },
  {
    id: 'mq-requests',
    title: 'Anypoint MQ API Requests',
    summaryMetric: 'api_requests',
    summaryUnit: 'requests',
    detailColumns: ['object_name', 'env_name', 'org_name', 'object_type', 'api_requests'],
    mergeStrategy: 'sum',
    aggregateQuery: "SELECT api_requests FROM anypoint_mq_api_requests_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
    detailQuery:
      "SELECT api_requests, region_id, env_id, env_name, object_name, org_id, org_name, object_type FROM anypoint_mq_api_requests_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
  },
  {
    id: 'mq-message-units',
    title: 'Anypoint MQ Message Units',
    summaryMetric: 'message_units',
    summaryUnit: 'message units',
    detailColumns: ['object_name', 'env_name', 'org_name', 'object_type', 'message_units'],
    mergeStrategy: 'sum',
    aggregateQuery: "SELECT message_units FROM anypoint_mq_message_units_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
    detailQuery:
      "SELECT message_units, region_id, env_id, env_name, object_name, org_id, org_name, object_type FROM anypoint_mq_message_units_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
  },
  {
    id: 'object-store',
    title: 'Object Store Effective Requests',
    summaryMetric: 'effective_api_requests',
    summaryUnit: 'requests',
    detailColumns: ['store_id', 'env_name', 'org_name', 'region_id', 'effective_api_requests'],
    mergeStrategy: 'sum',
    aggregateQuery: "SELECT effective_api_requests FROM object_store_effective_api_requests_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
    detailQuery:
      "SELECT effective_api_requests, env_id, env_name, org_id, org_name, store_id, region_id FROM object_store_effective_api_requests_count WHERE timestamp between '$FROM' and '$TO' TIMESERIES $GRANULARITY",
  },
];

export interface UsageQueryWindow {
  from: number;
  to: number;
  granularity: TimeSeriesGranularity;
}

export interface MeteringRequestOptions {
  /** Max 429 retries per request (default 3). Set to 0 to disable retrying. */
  maxRetries?: number;
  retryBaseDelayMs?: number;
  maxRetryDelayMs?: number;
}

export interface UsageBundleOptions extends MeteringRequestOptions {
  /** Max simultaneous `meters:search` POSTs (default 4). */
  concurrency?: number;
}

/**
 * The granularity token usable for a *single* request covering `windowMs`, or
 * `null` when no known token covers a window that long (the caller must chunk).
 */
export function selectTimeSeriesGranularity(windowMs: number): TimeSeriesGranularity | null {
  if (!Number.isFinite(windowMs) || windowMs < 0) return null;
  return windowMs <= MAX_P1M_WINDOW_MS ? 'P1M' : null;
}

/**
 * Split `[from, to]` into non-overlapping windows that each fit inside the
 * granularity's duration cap. A 30d range yields one window; 90d yields two;
 * 365d yields six.
 */
export function planUsageQueryWindows(from: number, to: number): UsageQueryWindow[] {
  const start = Math.min(from, to);
  const end = Math.max(from, to);

  const single = selectTimeSeriesGranularity(end - start);
  if (single) {
    return [{ from: start, to: end, granularity: single }];
  }

  const windows: UsageQueryWindow[] = [];
  let cursor = start;
  while (cursor <= end) {
    // `between` is inclusive, so the segment spans MAX-1 ms and the next one
    // resumes 1ms later. That keeps every window strictly under the cap and
    // prevents a boundary bucket from being counted twice.
    const segmentEnd = Math.min(cursor + MAX_P1M_WINDOW_MS - 1, end);
    windows.push({ from: cursor, to: segmentEnd, granularity: 'P1M' });
    cursor = segmentEnd + 1;
  }

  return windows;
}

function fillQueryTemplate(query: string, window: UsageQueryWindow): string {
  return query
    .replaceAll('$FROM', String(window.from))
    .replaceAll('$TO', String(window.to))
    .replaceAll('$GRANULARITY', window.granularity);
}

export function getUsageReportCategories(): UsageReportCategory[] {
  return USAGE_REPORT_CATEGORIES;
}

export async function getMeterDescriptors(): Promise<MeterDescriptor[]> {
  const { data } = await api.get(`${METERING_BASE}/meters:describe`);
  return unwrapCollection<any>(data).map((entry) => ({
    name: toStringValue(entry.name) ?? 'meter',
    description: toStringValue(entry.description) ?? '',
    productName: toStringValue(entry.productName),
    productLabel: toStringValue(entry.productLabel),
    meterType: toStringValue(entry.meterType),
    dimensions: unwrapCollection<any>(entry.dimensions).map((dimension) => ({
      name: toStringValue(dimension.name) ?? 'dimension',
      label: toStringValue(dimension.label),
      description: toStringValue(dimension.description),
    })),
    measurements: unwrapCollection<any>(entry.measurements).map((measurement) => ({
      name: toStringValue(measurement.name) ?? 'measurement',
      label: toStringValue(measurement.label),
      description: toStringValue(measurement.description),
    })),
    supportedTimeSeries: Array.isArray(entry.supportedTimeSeries)
      ? entry.supportedTimeSeries.map((value: unknown) => String(value))
      : [],
  }));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function readHeader(error: unknown, name: string): string | null {
  const headers = (error as any)?.response?.headers;
  if (!headers) return null;
  const direct = typeof headers.get === 'function' ? headers.get(name) : undefined;
  const wanted = name.toLowerCase();
  const match = Object.entries(headers as Record<string, unknown>).find(
    ([key]) => key.toLowerCase() === wanted,
  );
  const value: unknown = direct ?? match?.[1];
  return typeof value === 'string' || typeof value === 'number' ? String(value) : null;
}

/**
 * Backoff for a 429: honour `Retry-After` (delta-seconds or HTTP-date) when the
 * tenant sends one, otherwise exponential. Always clamped to `maxDelayMs` so a
 * hostile/very large header cannot stall the screen.
 */
export function computeRetryDelayMs(
  error: unknown,
  attempt: number,
  baseDelayMs: number = DEFAULT_RETRY_BASE_DELAY_MS,
  maxDelayMs: number = MAX_RETRY_DELAY_MS,
): number {
  const retryAfter = readHeader(error, 'retry-after');
  if (retryAfter != null) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds) && seconds >= 0) {
      return Math.min(seconds * 1000, maxDelayMs);
    }
    const asDate = Date.parse(retryAfter);
    if (Number.isFinite(asDate)) {
      return Math.min(Math.max(asDate - Date.now(), 0), maxDelayMs);
    }
  }
  return Math.min(baseDelayMs * 2 ** attempt, maxDelayMs);
}

function parseSearchResponse(data: unknown): UsageSearchResult {
  return {
    metadata: {
      responseAsOf: toStringValue((data as any)?.metadata?.responseAsOf),
      lastUpdatedAt: toStringValue((data as any)?.metadata?.lastUpdatedAt),
    },
    data: unwrapCollection<Record<string, unknown>>(data, ['data']),
  };
}

/**
 * One `meters:search` POST with bounded 429 handling.
 *
 * Only 429 is retried. A 400 is a permanent contract error (bad query, window
 * too long for the granularity) and retrying it just burns the rate limit.
 */
export async function searchUsage(
  query: string,
  options: MeteringRequestOptions = {},
): Promise<UsageSearchResult> {
  const maxRetries = Math.max(0, options.maxRetries ?? DEFAULT_MAX_RETRIES);
  const baseDelayMs = options.retryBaseDelayMs ?? DEFAULT_RETRY_BASE_DELAY_MS;
  const maxDelayMs = options.maxRetryDelayMs ?? MAX_RETRY_DELAY_MS;

  for (let attempt = 0; ; attempt += 1) {
    try {
      const { data } = await api.post(`${METERING_BASE}/meters:search`, { query });
      return parseSearchResponse(data);
    } catch (error) {
      const status = getStatusCode(error);
      if (status !== 429 || attempt >= maxRetries) {
        throw error;
      }
      await delay(computeRetryDelayMs(error, attempt, baseDelayMs, maxDelayMs));
    }
  }
}

/** Fixed-size worker pool: at most `limit` tasks are ever in flight. */
async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  const workerCount = Math.max(1, Math.min(limit, items.length));
  let cursor = 0;

  const worker = async (): Promise<void> => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      results[index] = await task(items[index]);
    }
  };

  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

const NON_MEASUREMENT_KEYS = new Set(['timestamp', 'max_concurrent_time']);

function isMeasurement(key: string, value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && !NON_MEASUREMENT_KEYS.has(key);
}

/**
 * Rows are identified by their dimension tuple (every non-measurement field), so
 * the same app/env/org in two chunks lands on the same row. `max_concurrent_time`
 * is never part of the identity - it is a property of the peak, not a dimension.
 */
function rowKey(row: Record<string, unknown>, collapseTimestamps: boolean): string {
  const parts = Object.entries(row)
    .filter(([key, value]) => !isMeasurement(key, value))
    .filter(([key]) => key !== 'max_concurrent_time')
    .filter(([key]) => !(collapseTimestamps && key === 'timestamp'))
    .map(([key, value]) => `${key}=${String(value ?? '')}`)
    .sort();
  return parts.join('|');
}

function pickLatest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  const aTime = Date.parse(a);
  const bTime = Date.parse(b);
  if (!Number.isFinite(aTime)) return b;
  if (!Number.isFinite(bTime)) return a;
  return bTime > aTime ? b : a;
}

export interface MergeUsageOptions {
  strategy: UsageMergeStrategy;
  summaryMetric: string;
  /**
   * Fold every time bucket into a single row per dimension tuple. Used for the
   * aggregate series, where the screen reads `data[0]` as *the* number for the
   * whole range - without this a chunked 365d range would surface only the first
   * monthly bucket.
   */
  collapseTimestamps?: boolean;
}

/**
 * Recombine the per-chunk series of a chunked window into a single series.
 * See `UsageMergeStrategy` for why counts add and concurrency peaks do not.
 */
export function mergeUsageResults(
  results: UsageSearchResult[],
  options: MergeUsageOptions,
): UsageSearchResult {
  const { strategy, summaryMetric } = options;
  const collapseTimestamps = options.collapseTimestamps ?? false;

  if (results.length === 0) {
    return { metadata: { responseAsOf: null, lastUpdatedAt: null }, data: [] };
  }
  if (results.length === 1 && !collapseTimestamps) return results[0];

  const rows = new Map<string, Record<string, unknown>>();
  let responseAsOf: string | null = null;
  let lastUpdatedAt: string | null = null;

  for (const result of results) {
    responseAsOf = pickLatest(responseAsOf, result.metadata.responseAsOf);
    lastUpdatedAt = pickLatest(lastUpdatedAt, result.metadata.lastUpdatedAt);

    for (const row of result.data) {
      const key = rowKey(row, collapseTimestamps);
      const existing = rows.get(key);
      if (!existing) {
        const seed = { ...row };
        // A summed roll-up no longer belongs to any single bucket.
        if (collapseTimestamps && strategy === 'sum') delete seed.timestamp;
        rows.set(key, seed);
        continue;
      }

      if (strategy === 'max') {
        // Keep the peak row intact so its `max_concurrent_time` still matches the value.
        const existingValue = findPrimaryMetric(existing, summaryMetric) ?? Number.NEGATIVE_INFINITY;
        const incomingValue = findPrimaryMetric(row, summaryMetric) ?? Number.NEGATIVE_INFINITY;
        if (incomingValue > existingValue) {
          rows.set(key, { ...row });
        }
        continue;
      }

      const merged: Record<string, unknown> = { ...existing };
      for (const [field, value] of Object.entries(row)) {
        if (collapseTimestamps && field === 'timestamp') continue;
        if (!isMeasurement(field, value)) {
          if (!(field in merged)) merged[field] = value;
          continue;
        }
        const previous = merged[field];
        merged[field] = isMeasurement(field, previous) ? (previous as number) + value : value;
      }
      rows.set(key, merged);
    }
  }

  return {
    metadata: { responseAsOf, lastUpdatedAt },
    data: Array.from(rows.values()),
  };
}

function emptyResult(): UsageSearchResult {
  return { metadata: { responseAsOf: null, lastUpdatedAt: null }, data: [] };
}

function describeError(error: unknown): string {
  const status = getStatusCode(error);
  const message =
    toStringValue((error as any)?.response?.data?.message)
    ?? toStringValue((error as any)?.message)
    ?? 'request failed';
  return status ? `HTTP ${status}: ${message}` : message;
}

type QueryKind = 'aggregate' | 'detail';

interface MeterJob {
  categoryIndex: number;
  kind: QueryKind;
  query: string;
}

type JobOutcome =
  | { ok: true; value: UsageSearchResult }
  | { ok: false; error: unknown };

/**
 * Load every usage category for `[from, to]`.
 *
 * Windows longer than the granularity cap are chunked (BUG 1) and the whole
 * fan-out - categories x {aggregate, detail} x chunks - runs through one bounded
 * worker pool (BUG 2). A meter that still fails after its retries degrades to
 * `status: 'unavailable'` instead of rejecting the bundle, so one throttled or
 * unlicensed meter never blanks the screen.
 */
export async function getUsageReportBundle(
  from: number,
  to: number,
  options: UsageBundleOptions = {},
): Promise<UsageReportSection[]> {
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_METERING_CONCURRENCY);
  const windows = planUsageQueryWindows(from, to);

  const jobs: MeterJob[] = [];
  USAGE_REPORT_CATEGORIES.forEach((category, categoryIndex) => {
    for (const window of windows) {
      jobs.push({ categoryIndex, kind: 'aggregate', query: fillQueryTemplate(category.aggregateQuery, window) });
      jobs.push({ categoryIndex, kind: 'detail', query: fillQueryTemplate(category.detailQuery, window) });
    }
  });

  const outcomes = await mapWithConcurrency<MeterJob, JobOutcome>(jobs, concurrency, async (job) => {
    try {
      return { ok: true, value: await searchUsage(job.query, options) };
    } catch (error) {
      return { ok: false, error };
    }
  });

  return USAGE_REPORT_CATEGORIES.map((category, categoryIndex) => {
    const collected: Record<QueryKind, UsageSearchResult[]> = { aggregate: [], detail: [] };
    let failure: unknown = null;

    outcomes.forEach((outcome, index) => {
      const job = jobs[index];
      if (job.categoryIndex !== categoryIndex) return;
      if (outcome.ok) {
        collected[job.kind].push(outcome.value);
      } else if (failure == null) {
        failure = outcome.error;
      }
    });

    if (failure != null) {
      const reason = describeError(failure);
      logger.warn(`[metering] ${category.id} unavailable: ${reason}`);
      return {
        category,
        aggregate: emptyResult(),
        detail: emptyResult(),
        status: 'unavailable' as const,
        error: reason,
      };
    }

    return {
      category,
      aggregate: mergeUsageResults(collected.aggregate, {
        strategy: category.mergeStrategy,
        summaryMetric: category.summaryMetric,
        collapseTimestamps: true,
      }),
      detail: mergeUsageResults(collected.detail, {
        strategy: category.mergeStrategy,
        summaryMetric: category.summaryMetric,
      }),
      status: 'available' as const,
      error: null,
    };
  });
}

export function findPrimaryMetric(
  row: Record<string, unknown>,
  preferredKey: string,
): number | null {
  if (preferredKey in row) {
    return toNumber(row[preferredKey]);
  }
  for (const [key, value] of Object.entries(row)) {
    if (key === 'timestamp') continue;
    const numeric = toNumber(value);
    if (numeric != null) return numeric;
  }
  return null;
}
