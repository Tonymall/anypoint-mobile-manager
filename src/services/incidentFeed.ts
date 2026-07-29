// ============================================================
// Anypoint Mobile Platform - Incident Feed
// ============================================================
// Turns the three health signals we already fetch into one
// prioritised "what needs me right now" list:
//   - runtime application status (stopped / failed / undeployed)
//   - active ARM alerts
//   - entity error rates from Insights (observability)
//
// Pure derivation: no I/O here so it can be unit tested and so
// the screen stays a thin renderer.
// ============================================================

import type { Alert, InsightsEntityHealth } from '../types';
import { getAppId, getAppName } from '../utils/appHelpers';

export type IncidentSeverity = 'critical' | 'warning' | 'info';
export type IncidentSource = 'runtime' | 'alert' | 'insights';

export interface Incident {
  /** Stable across refetches so list rows keep their identity. */
  id: string;
  severity: IncidentSeverity;
  source: IncidentSource;
  title: string;
  detail: string;
  /** Epoch ms when known — used only for tie-breaking and display. */
  timestamp?: number;
  /** Where tapping the row should navigate. */
  route?: string;
  routeParams?: Record<string, string>;
}

/** A deploy that actually broke — urgent regardless of age. */
const FAILED_STATUSES = new Set(['FAILED', 'DEPLOY_FAILED']);
/**
 * Deliberate states. An app someone undeployed or stopped is only news while
 * it is fresh: after a while it is inventory, not an incident. Reporting a
 * week-old undeployment as critical is what trains people to ignore the feed.
 */
const IDLE_STATUSES = new Set(['UNDEPLOYED', 'UNDEPLOYING', 'STOPPED']);

/** Within this window a deliberate stop/undeploy is still worth surfacing. */
export const RECENT_CHANGE_MS = 24 * 60 * 60 * 1000;
/** Past this, a deliberate state drops out of the feed entirely. */
export const STALE_CHANGE_MS = 7 * 24 * 60 * 60 * 1000;

/** Error rate above which an entity is considered critical rather than degraded. */
export const CRITICAL_ERROR_RATE = 0.1;
/** Below this we don't surface the entity at all — noise, not an incident. */
export const MIN_REPORTED_ERROR_RATE = 0.01;
/** Entities need at least this much traffic before a rate is meaningful. */
export const MIN_TRAFFIC_FOR_ERROR_RATE = 20;

const SEVERITY_RANK: Record<IncidentSeverity, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

function normalizeStatus(value: unknown): string {
  return typeof value === 'string' ? value.toUpperCase() : '';
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (!Number.isNaN(parsed)) return parsed;
  }
  return undefined;
}

function idleDetail(status: string): string {
  if (status === 'STOPPED') return 'Application is stopped';
  if (status === 'UNDEPLOYING') return 'Application is being undeployed';
  return 'Application is undeployed';
}

/**
 * Applications that are not serving traffic.
 *
 * A failed deploy is always critical. A deliberate stop or undeploy is a
 * warning while it is recent, drops to info for the rest of the week, and
 * then leaves the feed — the estate always has some parked applications and
 * listing them forever would bury the things that actually need a human.
 *
 * `now` is injected so the ageing is testable.
 */
export function incidentsFromApplications(
  applications: readonly any[],
  now: number = Date.now(),
): Incident[] {
  const incidents: Incident[] = [];

  for (const app of applications ?? []) {
    if (!app) continue;
    const status = normalizeStatus(app.status);
    const name = getAppName(app);
    const domain = getAppId(app) || name;
    const timestamp = parseTimestamp(app.lastUpdateTime ?? app.updatedAt);

    if (FAILED_STATUSES.has(status)) {
      incidents.push({
        id: `runtime:${domain}:${status}`,
        severity: 'critical',
        source: 'runtime',
        title: name,
        detail: 'Application failed to deploy',
        timestamp,
        route: '/(main)/runtime/[domain]',
        routeParams: { domain },
      });
      continue;
    }

    if (IDLE_STATUSES.has(status)) {
      // No timestamp means we cannot tell fresh from ancient. Treat it as
      // recent so a genuine outage is never hidden by missing metadata.
      const age = timestamp === undefined ? 0 : now - timestamp;
      if (age > STALE_CHANGE_MS) continue;

      incidents.push({
        id: `runtime:${domain}:${status}`,
        severity: age <= RECENT_CHANGE_MS ? 'warning' : 'info',
        source: 'runtime',
        title: name,
        detail: idleDetail(status),
        timestamp,
        route: '/(main)/runtime/[domain]',
        routeParams: { domain },
      });
    }
  }

  return incidents;
}

function alertSeverity(alert: Alert): IncidentSeverity {
  const severity = normalizeStatus(alert.severity);
  if (severity === 'CRITICAL' || severity === 'HIGH') return 'critical';
  if (severity === 'LOW' || severity === 'INFO') return 'info';
  return 'warning';
}

/** Alerts that are still open — resolved and dismissed ones are not incidents. */
export function incidentsFromAlerts(alerts: readonly Alert[]): Incident[] {
  const incidents: Incident[] = [];

  for (const alert of alerts ?? []) {
    if (!alert) continue;
    const status = normalizeStatus(alert.status);
    if (status === 'RESOLVED' || status === 'DISMISSED') continue;

    incidents.push({
      id: `alert:${alert.id}`,
      severity: alertSeverity(alert),
      source: 'alert',
      title: alert.name || alert.applicationName || 'Alert',
      detail: alert.message || 'Active alert',
      timestamp: parseTimestamp(alert.createdAt),
      route: '/(main)/alerts/[id]',
      routeParams: { id: String(alert.id) },
    });
  }

  return incidents;
}

function formatRate(rate: number): string {
  const percent = rate * 100;
  return percent >= 10 ? `${Math.round(percent)}%` : `${percent.toFixed(1)}%`;
}

/**
 * Entities whose failed-request rate is meaningful. Low-traffic entities are
 * skipped: one failure out of three requests is 33% but not an incident.
 */
export function incidentsFromEstateHealth(
  entities: readonly InsightsEntityHealth[],
): Incident[] {
  const incidents: Incident[] = [];

  for (const entity of entities ?? []) {
    if (!entity) continue;
    if (entity.requestVolume < MIN_TRAFFIC_FOR_ERROR_RATE) continue;
    if (entity.errorRate < MIN_REPORTED_ERROR_RATE) continue;

    incidents.push({
      id: `insights:${entity.id}`,
      severity: entity.errorRate >= CRITICAL_ERROR_RATE ? 'critical' : 'warning',
      source: 'insights',
      title: entity.name || entity.id,
      detail: `${formatRate(entity.errorRate)} of ${entity.requestVolume.toLocaleString()} requests failing`,
      route: '/(main)/monitoring/[domain]',
      routeParams: { domain: entity.name || entity.id },
    });
  }

  return incidents;
}

/**
 * Merge every signal into one feed, worst first. Newer incidents win ties so a
 * fresh failure surfaces above an old one of the same severity.
 */
export function deriveIncidents(
  input: {
    applications?: readonly any[];
    alerts?: readonly Alert[];
    entities?: readonly InsightsEntityHealth[];
  },
  now: number = Date.now(),
): Incident[] {
  const incidents = [
    ...incidentsFromApplications(input.applications ?? [], now),
    ...incidentsFromAlerts(input.alerts ?? []),
    ...incidentsFromEstateHealth(input.entities ?? []),
  ];

  const deduped = new Map<string, Incident>();
  for (const incident of incidents) {
    if (!deduped.has(incident.id)) deduped.set(incident.id, incident);
  }

  return [...deduped.values()].sort((a, b) => {
    const bySeverity = SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity];
    if (bySeverity !== 0) return bySeverity;
    if (a.timestamp !== b.timestamp) {
      if (a.timestamp === undefined) return 1;
      if (b.timestamp === undefined) return -1;
      return b.timestamp - a.timestamp;
    }
    return a.title.localeCompare(b.title);
  });
}

/** Counts per severity for the summary header. */
export function summarizeIncidents(incidents: readonly Incident[]): {
  critical: number;
  warning: number;
  info: number;
  total: number;
} {
  const summary = { critical: 0, warning: 0, info: 0, total: incidents.length };
  for (const incident of incidents) summary[incident.severity] += 1;
  return summary;
}
