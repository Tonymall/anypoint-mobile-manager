// ============================================================
// Anypoint Mobile Platform - CloudHub Instance Diagnostics
// ============================================================
// Wraps the CloudHub 1.0 instance-diagnostics endpoints used by
// the Anypoint web console's application "Logs" tab:
//
//   GET {CH_BASE}/organizations/{orgId}/environments/{envId}
//       /applications/{domain}/instances/{instanceId}/diagnostics/analysis
//   GET {CH_BASE}/organizations/{orgId}/environments/{envId}
//       /applications/{domain}/instances/diagnostics/analysis-readiness
//
// OBSERVED BEHAVIOUR (captured live from the web console):
//   * The endpoints return a MIX of 200 / 404 / 503 during entirely
//     normal operation.
//       - 404 → no analysis exists for that instance   → status 'none'
//       - 503 → diagnosis service temporarily offline  → status 'unavailable'
//     NEITHER is an error worth surfacing to the user, so nothing here
//     ever throws — callers get a normalized status instead.
//   * The web console fires ONE analysis request per historical instance
//     when the Logs tab opens (30+ requests on a single screen). On mobile
//     that is unacceptable, so the batch helper is capped (default 5,
//     newest first) and runs with bounded concurrency (default 3).
//
// The response body shape is undocumented, so parsing is fully
// defensive: nothing is required, commonly useful fields are extracted
// best-effort, and the untouched payload is always kept under `raw`.
// ============================================================

import api from './api';
import logger from '../utils/logger';
import { findNestedValue, toStringValue, uniqueStrings } from './controlPlaneCommon';
import { CLOUDHUB_BASE, getOrgId, getEnvId } from './runtime/shared';

// ---------- Types ----------

/**
 * 'available'   → a diagnosis payload was returned (HTTP 200 with a body)
 * 'none'        → no diagnosis exists for this instance (HTTP 404, or an empty 200)
 * 'unavailable' → the diagnosis service could not answer right now
 *                 (HTTP 503, network failure, missing org/env context, …)
 */
export type DiagnosisStatus = 'available' | 'none' | 'unavailable';

/** Best-effort normalization of an undocumented diagnosis payload. */
export interface DiagnosisAnalysis {
  summary: string | null;
  message: string | null;
  reason: string | null;
  recommendation: string | null;
  severity: string | null;
  category: string | null;
  /** The untouched payload — always present, never re-shaped. */
  raw: unknown;
}

export interface InstanceDiagnosis {
  instanceId: string;
  status: DiagnosisStatus;
  analysis?: DiagnosisAnalysis;
}

export interface AnalysisReadiness {
  domain: string;
  status: DiagnosisStatus;
  /** null when the payload exposes no recognizable readiness flag. */
  ready: boolean | null;
  /** Instance ids the payload marks as analysable, when it lists any. */
  readyInstanceIds: string[];
  raw: unknown;
}

export interface RecentDiagnosesOptions {
  /** Hard cap on how many instances are probed (newest first). */
  max?: number;
  /** Maximum number of in-flight requests. */
  concurrency?: number;
}

export interface RecentDiagnosesResult {
  domain: string;
  /** Only entries whose status is 'available'. */
  diagnoses: InstanceDiagnosis[];
  /** How many instances were actually probed (after the cap). */
  probed: number;
  /** How many instance ids the caller supplied. */
  requested: number;
  /** True when the supplied list was longer than `max`. */
  truncated: boolean;
}

export const DEFAULT_DIAGNOSES_MAX = 5;
export const DEFAULT_DIAGNOSES_CONCURRENCY = 3;

// ---------- Session flags ----------
//
// Mirrors the convention in src/services/runtime/state.ts: remember
// endpoints that are known-missing so we stop re-hitting them.
//
// NOTE: a 404 on the *per-instance* analysis endpoint is a normal
// "no analysis for this instance" answer, so it is deliberately NOT
// cached — only the shared readiness endpoint gets a skip flag, and
// that flag resets whenever the domain changes.

const diagnosticsSessionState: {
  readinessUnsupported: boolean;
  readinessDomain: string | null;
} = {
  readinessUnsupported: false,
  readinessDomain: null,
};

/** Clear the cached "readiness endpoint is missing" flag (e.g. on logout / tenant switch). */
export function resetDiagnosticsSessionFlags(): void {
  diagnosticsSessionState.readinessUnsupported = false;
  diagnosticsSessionState.readinessDomain = null;
}

// ---------- Path helpers ----------

/**
 * Build the org/env scoped applications base path.
 * org/env are read from the shared axios default headers — the same
 * source src/services/runtime/* uses (see runtime/shared.ts).
 */
function diagnosticsApplicationsBase(): string | null {
  const orgId = getOrgId();
  const envId = getEnvId();
  if (!orgId || !envId) return null;
  return `${CLOUDHUB_BASE}/organizations/${encodeURIComponent(orgId)}/environments/${encodeURIComponent(envId)}/applications`;
}

// ---------- Defensive parsing ----------

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/** A 200 with nothing meaningful in it counts as "no diagnosis". */
function isEmptyPayload(payload: unknown): boolean {
  if (payload == null) return true;
  if (typeof payload === 'string') return payload.trim().length === 0;
  if (Array.isArray(payload)) return payload.length === 0;
  if (isPlainObject(payload)) return Object.keys(payload).length === 0;
  return false;
}

/** Some control planes answer with the SPA HTML shell instead of JSON. */
function isHtmlPayload(payload: unknown): boolean {
  if (typeof payload !== 'string') return false;
  const trimmed = payload.trim().toLowerCase();
  return trimmed.startsWith('<!doctype') || trimmed.startsWith('<html');
}

const MAX_PARSE_DEPTH = 4;

/** Turn a value found under a matching key into text (arrays are joined). */
function textFromValue(value: unknown, keys: string[], depth: number): string | null {
  const direct = toStringValue(value);
  if (direct) return direct;
  if (Array.isArray(value)) {
    const parts = value
      .map((entry) => textFromValue(entry, keys, depth - 1))
      .filter((entry): entry is string => !!entry);
    return parts.length > 0 ? parts.join('; ') : null;
  }
  if (isPlainObject(value) && depth > 0) return firstText(value, keys, depth - 1);
  return null;
}

/**
 * Pull the first usable string for any of `keys`, descending into nested
 * objects/arrays (the payload shape is undocumented and varies). Only
 * values reached through a matching key are converted to text, so a random
 * string elsewhere in the payload never masquerades as a summary.
 */
function firstText(payload: unknown, keys: string[], depth = MAX_PARSE_DEPTH): string | null {
  if (Array.isArray(payload)) {
    if (depth <= 0) return null;
    for (const entry of payload) {
      const nested = firstText(entry, keys, depth - 1);
      if (nested) return nested;
    }
    return null;
  }
  if (!isPlainObject(payload)) return null;

  for (const key of keys) {
    if (key in payload) {
      const text = textFromValue(payload[key], keys, depth);
      if (text) return text;
    }
  }
  if (depth <= 0) return null;
  for (const value of Object.values(payload)) {
    const nested = firstText(value, keys, depth - 1);
    if (nested) return nested;
  }
  return null;
}

/** Normalize an unknown diagnosis payload; always keeps the raw body. */
export function parseDiagnosisPayload(payload: unknown): DiagnosisAnalysis {
  return {
    summary: firstText(payload, ['summary', 'analysisSummary', 'title', 'headline']),
    message: firstText(payload, ['message', 'description', 'detail', 'details', 'text']),
    reason: firstText(payload, ['reason', 'rootCause', 'cause', 'diagnosis', 'error']),
    recommendation: firstText(payload, [
      'recommendation',
      'recommendations',
      'suggestion',
      'suggestions',
      'remediation',
      'resolution',
      'action',
    ]),
    severity: firstText(payload, ['severity', 'level', 'priority', 'impact']),
    category: firstText(payload, ['category', 'type', 'analysisType', 'classification', 'kind']),
    raw: payload,
  };
}

function parseBooleanish(value: unknown): boolean | null {
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (['true', 'ready', 'yes', 'available', 'ok'].includes(normalized)) return true;
    if (['false', 'not_ready', 'no', 'unavailable'].includes(normalized)) return false;
  }
  return null;
}

const READINESS_KEYS = ['ready', 'isReady', 'analysisReady', 'available', 'enabled', 'analysable'];

/** Normalize the undocumented analysis-readiness payload. */
export function parseReadinessPayload(domain: string, payload: unknown): AnalysisReadiness {
  const ready = parseBooleanish(findNestedValue(payload, READINESS_KEYS));

  const readyInstanceIds: string[] = [];
  const collect = (entry: unknown, fallbackId?: string) => {
    if (isPlainObject(entry)) {
      const id =
        toStringValue(entry.instanceId) ??
        toStringValue(entry.id) ??
        toStringValue(entry.instance) ??
        (fallbackId ?? null);
      const entryReady = parseBooleanish(findNestedValue(entry, READINESS_KEYS));
      if (id && entryReady !== false) readyInstanceIds.push(id);
      return;
    }
    if (fallbackId && parseBooleanish(entry) === true) readyInstanceIds.push(fallbackId);
  };

  if (Array.isArray(payload)) {
    payload.forEach((entry) => collect(entry));
  } else if (isPlainObject(payload)) {
    const listed = [payload.instances, payload.items, payload.data, payload.results].find((value) =>
      Array.isArray(value),
    );
    if (Array.isArray(listed)) {
      listed.forEach((entry) => collect(entry));
    } else if (isPlainObject(payload.instances)) {
      Object.entries(payload.instances).forEach(([id, value]) => collect(value, id));
    }
  }

  return {
    domain,
    status: 'available',
    ready,
    readyInstanceIds: uniqueStrings(readyInstanceIds),
    raw: payload,
  };
}

// ---------- Error mapping ----------

function statusOf(error: unknown): number | null {
  return (error as { response?: { status?: number } } | undefined)?.response?.status ?? null;
}

/**
 * Map a failed diagnostics request onto a status.
 * 404 → 'none' (nothing to diagnose), everything else → 'unavailable'.
 * 503 is expected and logged quietly; anything else warns.
 */
function mapErrorStatus(error: unknown, context: string): DiagnosisStatus {
  const httpStatus = statusOf(error);
  if (httpStatus === 404) {
    logger.log(`[diagnostics] ${context}: 404 — no diagnosis available`);
    return 'none';
  }
  if (httpStatus === 503) {
    logger.log(`[diagnostics] ${context}: 503 — diagnosis service temporarily unavailable`);
    return 'unavailable';
  }
  logger.warn(
    `[diagnostics] ${context}: request failed (${httpStatus ?? 'network error'}) —`,
    (error as Error | undefined)?.message ?? String(error),
  );
  return 'unavailable';
}

// ---------- Public API ----------

/**
 * Fetch the diagnosis analysis for a single CloudHub instance.
 * Never throws — 404/503/network problems all resolve to a normalized status.
 */
export async function getInstanceDiagnosis(
  domain: string,
  instanceId: string,
): Promise<InstanceDiagnosis> {
  const id = toStringValue(instanceId) ?? '';
  if (!toStringValue(domain) || !id) {
    logger.warn('[diagnostics] getInstanceDiagnosis called without a domain/instanceId');
    return { instanceId: id, status: 'unavailable' };
  }

  const base = diagnosticsApplicationsBase();
  if (!base) {
    logger.warn('[diagnostics] getInstanceDiagnosis: no org/env context — skipping request');
    return { instanceId: id, status: 'unavailable' };
  }

  const url = `${base}/${encodeURIComponent(domain)}/instances/${encodeURIComponent(id)}/diagnostics/analysis`;

  try {
    const { data } = await api.get(url);

    if (isHtmlPayload(data)) {
      logger.warn(`[diagnostics] ${domain}/${id}: received HTML instead of JSON — treating as unavailable`);
      return { instanceId: id, status: 'unavailable' };
    }
    if (isEmptyPayload(data)) {
      return { instanceId: id, status: 'none' };
    }

    return { instanceId: id, status: 'available', analysis: parseDiagnosisPayload(data) };
  } catch (error) {
    return { instanceId: id, status: mapErrorStatus(error, `${domain}/${id} analysis`) };
  }
}

/**
 * Fetch analysis readiness for an application.
 * Never throws — same normalized contract as getInstanceDiagnosis.
 *
 * A 404 here means the control plane has no readiness endpoint for this
 * app, so it is remembered for the session (reset when the domain changes)
 * to avoid re-probing a known-missing endpoint.
 */
export async function getAnalysisReadiness(domain: string): Promise<AnalysisReadiness> {
  const appDomain = toStringValue(domain) ?? '';
  const empty = (status: DiagnosisStatus): AnalysisReadiness => ({
    domain: appDomain,
    status,
    ready: null,
    readyInstanceIds: [],
    raw: null,
  });

  if (!appDomain) {
    logger.warn('[diagnostics] getAnalysisReadiness called without a domain');
    return empty('unavailable');
  }

  // Per-domain reset, mirroring the log-endpoint flag handling.
  if (diagnosticsSessionState.readinessDomain !== appDomain) {
    diagnosticsSessionState.readinessDomain = appDomain;
    diagnosticsSessionState.readinessUnsupported = false;
  }
  if (diagnosticsSessionState.readinessUnsupported) {
    return empty('none');
  }

  const base = diagnosticsApplicationsBase();
  if (!base) {
    logger.warn('[diagnostics] getAnalysisReadiness: no org/env context — skipping request');
    return empty('unavailable');
  }

  const url = `${base}/${encodeURIComponent(appDomain)}/instances/diagnostics/analysis-readiness`;

  try {
    const { data } = await api.get(url);

    if (isHtmlPayload(data)) {
      logger.warn(`[diagnostics] ${appDomain}: readiness returned HTML instead of JSON`);
      return empty('unavailable');
    }
    if (isEmptyPayload(data)) {
      return empty('none');
    }

    return parseReadinessPayload(appDomain, data);
  } catch (error) {
    const status = mapErrorStatus(error, `${appDomain} analysis-readiness`);
    if (statusOf(error) === 404) {
      diagnosticsSessionState.readinessUnsupported = true;
      logger.log(`[diagnostics] readiness endpoint unavailable for ${appDomain} — skipping for session`);
    }
    return empty(status);
  }
}

/** Run `task` over `items` with at most `limit` requests in flight. */
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

/**
 * Probe a capped, newest-first list of instances and return only the
 * instances that actually have a diagnosis.
 *
 * The web console fans out one request per historical instance (30+ on a
 * single screen). On mobile the list is capped (`max`, default 5) and the
 * fan-out is bounded (`concurrency`, default 3). Truncation is logged so a
 * coverage limit is never hidden silently.
 */
export async function getRecentDiagnoses(
  domain: string,
  instanceIds: string[],
  options: RecentDiagnosesOptions = {},
): Promise<RecentDiagnosesResult> {
  const appDomain = toStringValue(domain) ?? '';
  const max = Math.max(0, options.max ?? DEFAULT_DIAGNOSES_MAX);
  const concurrency = Math.max(1, options.concurrency ?? DEFAULT_DIAGNOSES_CONCURRENCY);

  const candidates = uniqueStrings(Array.isArray(instanceIds) ? instanceIds : []);
  const requested = candidates.length;

  if (!appDomain || requested === 0) {
    return { domain: appDomain, diagnoses: [], probed: 0, requested, truncated: false };
  }

  // Callers pass instances newest-first (deployments are fetched with
  // orderByDate=DESC), so the cap keeps the most recent ones.
  const probeList = candidates.slice(0, max);
  const truncated = probeList.length < requested;

  if (truncated) {
    logger.warn(
      `[diagnostics] ${appDomain}: probing only ${probeList.length} of ${requested} instances ` +
        `(max=${max}) — diagnosis coverage is intentionally capped on mobile`,
    );
  }

  const results = await mapWithConcurrency(probeList, concurrency, (instanceId) =>
    getInstanceDiagnosis(appDomain, instanceId),
  );

  return {
    domain: appDomain,
    diagnoses: results.filter((result) => result.status === 'available'),
    probed: probeList.length,
    requested,
    truncated,
  };
}
