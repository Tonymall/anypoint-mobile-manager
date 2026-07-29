// ============================================================
// Anypoint Mobile Platform - Insights Service
// ============================================================
// Queries the Anypoint Observability Metrics API (AMQL) over the
// "mulesoft.entity" metric type. This is the replacement for the
// classic built-in dashboards, which reach EOL on 2026-10-15.
//
// Contract (captured from the Anypoint web console):
//   POST /observability/api/v1/metrics:search?offset=0&limit=N
//   body: { "query": "<AMQL string>" }
//
// Every query is scoped to the BUSINESS GROUP org id (sub_org.id)
// and the currently selected environment (env.id) — the same values
// the console sends.
//
// This module NEVER throws to the UI: when the observability API is
// unavailable (403/404/503/...) it logs a warning and returns empty
// results, matching how runtime/monitoring.ts degrades.
// ============================================================

import api from './api';
import { getEnvId, getOrgId } from './runtime/shared';
import { useAuthStore } from '../stores/authStore';
import logger from '../utils/logger';
import type {
  InsightsEntityHealth,
  InsightsEntityOverview,
  InsightsMetricDescriptor,
  InsightsScope,
  InsightsSlowEntity,
  InsightsTimeRange,
  InsightsTimeSeriesPoint,
} from '../types';

export const OBSERVABILITY_SEARCH_PATH = '/observability/api/v1/metrics:search';
export const ENTITY_METRIC_TYPE = 'mulesoft.entity';

export const DEFAULT_OVERVIEW_LIMIT = 20;
export const DEFAULT_DETAIL_LIMIT = 60;
const MAX_LIMIT = 500;
/** Hard cap on how many entity ids we will inline into an IN (...) clause. */
const MAX_ENTITY_IDS = 200;

// ---------- AMQL literal safety ----------

/**
 * Characters that could break out of an AMQL string literal.
 * The only values we interpolate are UUID-shaped ids and integers, so a
 * strict reject-list (rather than escaping) is the safe choice here.
 */
const UNSAFE_AMQL_CHARS = /['"\\;]/;

/** Control characters (incl. newlines/tabs) are never valid inside an id. */
function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}

/** Raised when a caller supplies an id/number that cannot be safely inlined. */
export class InsightsQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InsightsQueryError';
  }
}

/** True when `value` is a non-empty string that can be inlined into AMQL. */
export function isSafeAmqlId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 256 &&
    !UNSAFE_AMQL_CHARS.test(value) &&
    !hasControlCharacter(value)
  );
}

function assertSafeAmqlId(value: unknown, label: string): string {
  if (!isSafeAmqlId(value)) {
    throw new InsightsQueryError(`Unsafe ${label} for AMQL: ${JSON.stringify(value)}`);
  }
  return value;
}

function assertSafeInteger(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) {
    throw new InsightsQueryError(`Unsafe ${label} for AMQL: ${JSON.stringify(value)}`);
  }
  return Math.trunc(parsed);
}

function assertSafeLimit(value: unknown, fallback: number): number {
  if (value == null) return fallback;
  const parsed = assertSafeInteger(value, 'limit');
  if (parsed < 1) throw new InsightsQueryError(`Unsafe limit for AMQL: ${JSON.stringify(value)}`);
  return Math.min(parsed, MAX_LIMIT);
}

/**
 * Drop any entity id that cannot be safely inlined, de-duplicating the rest.
 * Rejected ids are logged so a malformed id is visible but never corrupts the
 * query for the other entities.
 */
export function sanitizeEntityIds(entityIds: readonly unknown[]): string[] {
  const safe: string[] = [];
  const rejected: unknown[] = [];

  for (const entityId of entityIds ?? []) {
    if (isSafeAmqlId(entityId)) {
      if (!safe.includes(entityId)) safe.push(entityId);
    } else {
      rejected.push(entityId);
    }
  }

  if (rejected.length > 0) {
    logger.warn(`[Insights] Rejected ${rejected.length} unsafe entity id(s) before building AMQL`);
  }

  return safe.slice(0, MAX_ENTITY_IDS);
}

function normalizeRange(range: InsightsTimeRange): { startMs: number; endMs: number } {
  const startMs = assertSafeInteger(range?.startMs, 'startMs');
  const endMs = assertSafeInteger(range?.endMs, 'endMs');
  if (endMs < startMs) {
    throw new InsightsQueryError(`Invalid insights range: endMs (${endMs}) precedes startMs (${startMs})`);
  }
  return { startMs, endMs };
}

// ---------- Org / env resolution ----------

/**
 * Resolve the business-group org id + environment id used by every query.
 * The auth store holds the selected business group; the axios default
 * headers (set by the org/env screens) are the fallback — the same pair
 * runtime/monitoring.ts relies on.
 */
export function resolveInsightsScope(): InsightsScope | null {
  const { currentOrganization, currentEnvironment } = useAuthStore.getState();
  const orgId = currentOrganization?.id ?? getOrgId();
  const envId = currentEnvironment?.id ?? getEnvId();

  if (!orgId || !envId) {
    logger.warn('[Insights] No business group / environment selected — skipping observability query');
    return null;
  }
  if (!isSafeAmqlId(orgId) || !isSafeAmqlId(envId)) {
    logger.warn('[Insights] Refusing to build AMQL — org/env id contains unsafe characters');
    return null;
  }

  return { orgId, envId };
}

// ---------- AMQL builders ----------

function scopeClauses(scope: InsightsScope): string[] {
  return [
    `"sub_org.id" = '${assertSafeAmqlId(scope?.orgId, 'sub_org.id')}'`,
    `"env.id" = '${assertSafeAmqlId(scope?.envId, 'env.id')}'`,
  ];
}

function timestampClause(startMs: number, endMs: number): string {
  return `timestamp BETWEEN ${startMs} AND ${endMs}`;
}

function entityIdInClause(entityIds: readonly string[]): string {
  const values = entityIds.map((entityId) => `'${assertSafeAmqlId(entityId, 'entity.id')}'`);
  return `"entity.id" IN (${values.join(',')})`;
}

const OVERVIEW_SELECT = [
  '"entity.id" AS id',
  'LATEST("entity.type") AS type',
  'LATEST("entity.name") AS name',
  'LATEST("sub_org.id") AS orgId',
  'LATEST("sub_org.name") AS orgName',
  'LATEST("env.id") AS envId',
  'LATEST("env.name") AS envName',
  'PERCENTILE("response_time", 0.99) AS p99RequestLatency',
  'COUNT(requests) AS requestVolume',
  'LATEST("deployment.type") AS deploymentType',
  'LATEST("deployment.id") AS deploymentId',
].join(', ');

/** Query 1 — entity list with health, ordered by traffic. */
export function buildEntityOverviewQuery(
  scope: InsightsScope,
  range: InsightsTimeRange,
  limit: number = DEFAULT_OVERVIEW_LIMIT,
): string {
  const { startMs, endMs } = normalizeRange(range);
  const where = [...scopeClauses(scope), timestampClause(startMs, endMs)].join(' AND ');
  return (
    `SELECT ${OVERVIEW_SELECT} FROM "${ENTITY_METRIC_TYPE}" WHERE ${where} ` +
    `GROUP BY id ORDER BY requestVolume DESC LIMIT ${assertSafeLimit(limit, DEFAULT_OVERVIEW_LIMIT)}`
  );
}

/** Query 2 — slowest entities by p99 response time. */
export function buildSlowestEntitiesQuery(
  scope: InsightsScope,
  range: InsightsTimeRange,
  limit: number = DEFAULT_DETAIL_LIMIT,
): string {
  const { startMs, endMs } = normalizeRange(range);
  const where = [...scopeClauses(scope), timestampClause(startMs, endMs)].join(' AND ');
  return (
    'SELECT "entity.id", LATEST("env.id") AS envIds, PERCENTILE("response_time", 0.99) AS p99RequestLatency ' +
    `FROM "${ENTITY_METRIC_TYPE}" WHERE ${where} ` +
    `GROUP BY "entity.id" ORDER BY p99RequestLatency DESC LIMIT ${assertSafeLimit(limit, DEFAULT_DETAIL_LIMIT)}`
  );
}

/** Query 3 — failed-request counts per entity. */
export function buildEntityErrorCountsQuery(
  entityIds: readonly string[],
  scope: InsightsScope,
  range: InsightsTimeRange,
  limit: number = DEFAULT_DETAIL_LIMIT,
): string {
  const { startMs, endMs } = normalizeRange(range);
  const where = [
    entityIdInClause(entityIds),
    `"entity.response.status" = 'FAILED'`,
    ...scopeClauses(scope),
    timestampClause(startMs, endMs),
  ].join(' AND ');
  return (
    `SELECT "entity.id" AS id, COUNT(requests) AS errorRequestCount FROM "${ENTITY_METRIC_TYPE}" ` +
    `WHERE ${where} GROUP BY "entity.id" LIMIT ${assertSafeLimit(limit, DEFAULT_DETAIL_LIMIT)}`
  );
}

/** Queries 4 & 5 — request (or failed-request) volume bucketed by timestamp. */
export function buildEntityTimeSeriesQuery(
  entityIds: readonly string[],
  scope: InsightsScope,
  range: InsightsTimeRange,
  options?: { failedOnly?: boolean },
): string {
  const { startMs, endMs } = normalizeRange(range);
  const where = [
    entityIdInClause(entityIds),
    ...(options?.failedOnly ? [`"entity.response.status" = 'FAILED'`] : []),
    ...scopeClauses(scope),
    timestampClause(startMs, endMs),
  ].join(' AND ');
  return `SELECT timestamp, COUNT(requests) AS requestVolume FROM "${ENTITY_METRIC_TYPE}" WHERE ${where}`;
}

/** Query 6 — total request volume per entity. */
export function buildEntityRequestTotalsQuery(
  entityIds: readonly string[],
  scope: InsightsScope,
  range: InsightsTimeRange,
  limit: number = DEFAULT_DETAIL_LIMIT,
): string {
  const { startMs, endMs } = normalizeRange(range);
  const where = [
    entityIdInClause(entityIds),
    ...scopeClauses(scope),
    timestampClause(startMs, endMs),
  ].join(' AND ');
  return (
    `SELECT "entity.id" AS id, COUNT(requests) AS totalRequestCount FROM "${ENTITY_METRIC_TYPE}" ` +
    `WHERE ${where} GROUP BY "entity.id" LIMIT ${assertSafeLimit(limit, DEFAULT_DETAIL_LIMIT)}`
  );
}

// ---------- Response parsing ----------

type MetricRow = Record<string, any>;

/**
 * Normalize the metrics:search payload into plain rows.
 * Observed shapes: { data: [...] }, a bare array, and the columnar
 * { columns: [...], rows: [[...]] } variant.
 */
export function extractRows(payload: any): MetricRow[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload.filter((row) => row && typeof row === 'object');
  if (Array.isArray(payload.data)) return payload.data.filter((row: any) => row && typeof row === 'object');
  if (Array.isArray(payload.results)) return payload.results.filter((row: any) => row && typeof row === 'object');

  if (Array.isArray(payload.columns) && Array.isArray(payload.rows)) {
    const columns: string[] = payload.columns.map((column: any) =>
      typeof column === 'string' ? column : (column?.name ?? column?.alias ?? ''),
    );
    return payload.rows
      .filter((row: any) => Array.isArray(row))
      .map((row: any[]) => {
        const mapped: MetricRow = {};
        columns.forEach((column, index) => {
          if (column) mapped[column] = row[index];
        });
        return mapped;
      });
  }

  return [];
}

/** Read the first present alias from a row, case-insensitively. */
function rowValue(row: MetricRow, candidates: string[]): unknown {
  for (const candidate of candidates) {
    const value = row[candidate];
    if (value != null) return value;
  }
  const lowerKeys = new Map<string, unknown>(
    Object.keys(row).map((key) => [key.toLowerCase(), row[key]]),
  );
  for (const candidate of candidates) {
    const value = lowerKeys.get(candidate.toLowerCase());
    if (value != null) return value;
  }
  return null;
}

function rowString(row: MetricRow, candidates: string[]): string | null {
  const value = rowValue(row, candidates);
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return null;
}

function rowNumber(row: MetricRow, candidates: string[]): number | null {
  const value = rowValue(row, candidates);
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

// ---------- Availability / graceful degradation ----------

/** Statuses that mean "this tenant does not have the observability API". */
const UNAVAILABLE_STATUSES = new Set([403, 404, 405, 501, 503]);

let insightsUnavailable = false;

/** True once the observability API answered with a "not available" status. */
export function isInsightsUnavailable(): boolean {
  return insightsUnavailable;
}

/** Re-enable insights (call on logout / org switch, and from tests). */
export function resetInsightsSession(): void {
  insightsUnavailable = false;
}

async function withInsightsFallback<T>(
  label: string,
  loader: () => Promise<T>,
  fallback: T,
): Promise<T> {
  if (insightsUnavailable) {
    logger.log(`[Insights] ${label} skipped — observability API unavailable for this session`);
    return fallback;
  }

  try {
    return await loader();
  } catch (error: any) {
    const status: number | null = error?.response?.status ?? null;
    if (status != null && UNAVAILABLE_STATUSES.has(status)) {
      insightsUnavailable = true;
      logger.warn(`[Insights] ${label} unavailable (HTTP ${status}) — disabling insights for this session`);
    } else {
      logger.warn(`[Insights] ${label} failed: ${status ?? error?.message ?? 'unknown error'}`);
    }
    return fallback;
  }
}

async function runAmqlQuery(query: string, limit: number, offset = 0): Promise<MetricRow[]> {
  const { data } = await api.post(
    OBSERVABILITY_SEARCH_PATH,
    { query },
    { params: { offset, limit } },
  );
  return extractRows(data);
}

// ---------- Public API ----------

/**
 * Entity inventory for the current business group + environment, with p99
 * latency and request volume, ordered by traffic (query 1).
 */
export async function getEntityOverview(
  options: InsightsTimeRange & { limit?: number },
): Promise<InsightsEntityOverview[]> {
  const scope = resolveInsightsScope();
  if (!scope) return [];

  return withInsightsFallback('getEntityOverview', async () => {
    const limit = assertSafeLimit(options?.limit, DEFAULT_OVERVIEW_LIMIT);
    const query = buildEntityOverviewQuery(scope, options, limit);
    const rows = await runAmqlQuery(query, limit);

    return rows
      .map((row) => {
        const id = rowString(row, ['id', 'entity.id', 'entityId']);
        if (!id) return null;
        return {
          id,
          type: rowString(row, ['type', 'entity.type']),
          name: rowString(row, ['name', 'entity.name']),
          orgId: rowString(row, ['orgId', 'sub_org.id']),
          orgName: rowString(row, ['orgName', 'sub_org.name']),
          envId: rowString(row, ['envId', 'env.id']),
          envName: rowString(row, ['envName', 'env.name']),
          p99RequestLatency: rowNumber(row, ['p99RequestLatency', 'PERCENTILE(response_time, 0.99)']),
          requestVolume: rowNumber(row, ['requestVolume', 'COUNT(requests)']) ?? 0,
          deploymentType: rowString(row, ['deploymentType', 'deployment.type']),
          deploymentId: rowString(row, ['deploymentId', 'deployment.id']),
        } satisfies InsightsEntityOverview;
      })
      .filter((entity): entity is InsightsEntityOverview => entity != null);
  }, []);
}

/** Slowest entities by p99 response time (query 2). */
export async function getSlowestEntities(
  range: InsightsTimeRange,
  limit: number = DEFAULT_DETAIL_LIMIT,
): Promise<InsightsSlowEntity[]> {
  const scope = resolveInsightsScope();
  if (!scope) return [];

  return withInsightsFallback('getSlowestEntities', async () => {
    const effectiveLimit = assertSafeLimit(limit, DEFAULT_DETAIL_LIMIT);
    const query = buildSlowestEntitiesQuery(scope, range, effectiveLimit);
    const rows = await runAmqlQuery(query, effectiveLimit);

    return rows
      .map((row) => {
        const id = rowString(row, ['entity.id', 'id', 'entityId']);
        if (!id) return null;
        return {
          id,
          envId: rowString(row, ['envIds', 'envId', 'env.id']),
          p99RequestLatency: rowNumber(row, ['p99RequestLatency', 'PERCENTILE(response_time, 0.99)']),
        } satisfies InsightsSlowEntity;
      })
      .filter((entity): entity is InsightsSlowEntity => entity != null);
  }, []);
}

/** Failed-request counts keyed by entity id (query 3). */
export async function getEntityErrorCounts(
  entityIds: readonly string[],
  range: InsightsTimeRange,
): Promise<Record<string, number>> {
  const scope = resolveInsightsScope();
  if (!scope) return {};

  const safeIds = sanitizeEntityIds(entityIds);
  if (safeIds.length === 0) return {};

  return withInsightsFallback('getEntityErrorCounts', async () => {
    const limit = Math.min(Math.max(safeIds.length, 1), MAX_LIMIT);
    const query = buildEntityErrorCountsQuery(safeIds, scope, range, limit);
    const rows = await runAmqlQuery(query, limit);

    const counts: Record<string, number> = {};
    for (const row of rows) {
      const id = rowString(row, ['id', 'entity.id', 'entityId']);
      if (!id) continue;
      counts[id] = rowNumber(row, ['errorRequestCount', 'COUNT(requests)']) ?? 0;
    }
    return counts;
  }, {});
}

/** Total request counts keyed by entity id (query 6). */
export async function getEntityRequestTotals(
  entityIds: readonly string[],
  range: InsightsTimeRange,
): Promise<Record<string, number>> {
  const scope = resolveInsightsScope();
  if (!scope) return {};

  const safeIds = sanitizeEntityIds(entityIds);
  if (safeIds.length === 0) return {};

  return withInsightsFallback('getEntityRequestTotals', async () => {
    const limit = Math.min(Math.max(safeIds.length, 1), MAX_LIMIT);
    const query = buildEntityRequestTotalsQuery(safeIds, scope, range, limit);
    const rows = await runAmqlQuery(query, limit);

    const totals: Record<string, number> = {};
    for (const row of rows) {
      const id = rowString(row, ['id', 'entity.id', 'entityId']);
      if (!id) continue;
      totals[id] = rowNumber(row, ['totalRequestCount', 'COUNT(requests)']) ?? 0;
    }
    return totals;
  }, {});
}

/**
 * Time-bucketed request volume for the given entities (queries 4 & 5).
 * Pass `{ failedOnly: true }` for the error series.
 */
export async function getEntityTimeSeries(
  entityIds: readonly string[],
  range: InsightsTimeRange,
  options?: { failedOnly?: boolean; limit?: number },
): Promise<InsightsTimeSeriesPoint[]> {
  const scope = resolveInsightsScope();
  if (!scope) return [];

  const safeIds = sanitizeEntityIds(entityIds);
  if (safeIds.length === 0) return [];

  return withInsightsFallback('getEntityTimeSeries', async () => {
    const limit = assertSafeLimit(options?.limit, MAX_LIMIT);
    const query = buildEntityTimeSeriesQuery(safeIds, scope, range, {
      failedOnly: options?.failedOnly,
    });
    const rows = await runAmqlQuery(query, limit);

    return rows
      .map((row) => {
        const timestamp = rowNumber(row, ['timestamp', 'time', 'window_start']);
        if (timestamp == null) return null;
        return {
          timestamp,
          value: rowNumber(row, ['requestVolume', 'COUNT(requests)']) ?? 0,
        } satisfies InsightsTimeSeriesPoint;
      })
      .filter((point): point is InsightsTimeSeriesPoint => point != null)
      .sort((a, b) => a.timestamp - b.timestamp);
  }, []);
}

function compareWorstFirst(a: InsightsEntityHealth, b: InsightsEntityHealth): number {
  if (b.errorRate !== a.errorRate) return b.errorRate - a.errorRate;
  if (b.errorCount !== a.errorCount) return b.errorCount - a.errorCount;
  const aLatency = a.p99RequestLatency ?? 0;
  const bLatency = b.p99RequestLatency ?? 0;
  if (bLatency !== aLatency) return bLatency - aLatency;
  return b.requestVolume - a.requestVolume;
}

/**
 * Entity overview enriched with failed-request counts and error rate,
 * sorted worst-first — the incident feed data source.
 */
export async function getEstateHealth(
  range: InsightsTimeRange,
  options?: { limit?: number },
): Promise<InsightsEntityHealth[]> {
  const entities = await getEntityOverview({ ...range, limit: options?.limit });
  if (entities.length === 0) return [];

  const errorCounts = await getEntityErrorCounts(entities.map((entity) => entity.id), range);

  return entities
    .map((entity) => {
      const errorCount = errorCounts[entity.id] ?? 0;
      const errorRate = entity.requestVolume > 0
        ? Math.min(1, Math.max(0, errorCount / entity.requestVolume))
        : 0;
      return { ...entity, errorCount, errorRate } satisfies InsightsEntityHealth;
    })
    .sort(compareWorstFirst);
}

/** Metric descriptor for "mulesoft.entity" (available dimensions/measurements). */
export async function getEntityMetricDescriptor(): Promise<InsightsMetricDescriptor | null> {
  return withInsightsFallback('getEntityMetricDescriptor', async () => {
    const { data } = await api.get(
      `/observability/api/v1/metric_types/${encodeURIComponent(ENTITY_METRIC_TYPE)}:describe`,
    );
    const names = (entries: any): string[] => {
      if (!Array.isArray(entries)) return [];
      return entries
        .map((entry: any) => {
          if (typeof entry === 'string') return entry;
          if (!entry || typeof entry !== 'object') return null;
          return entry.name ?? entry.id ?? entry.key ?? entry.field ?? null;
        })
        .filter((value: any): value is string => typeof value === 'string' && value.length > 0);
    };
    return {
      dimensions: names(data?.dimensions ?? data?.tags ?? data?.labels),
      measurements: names(data?.measurements ?? data?.fields ?? data?.aggregations),
    } satisfies InsightsMetricDescriptor;
  }, null);
}
