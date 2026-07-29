import { useQuery } from '@tanstack/react-query';

import * as insightsService from '../../services/insightsService';
import { useAuthStore } from '../../stores/authStore';
import type { InsightsTimeRange } from '../../types';

/**
 * Query key factory — scoped by org + env so tenant switches never
 * serve stale insights from a previous context.
 */
function scopePrefix(): readonly string[] {
  const { currentOrganization, currentEnvironment } = useAuthStore.getState();
  return ['insights', currentOrganization?.id ?? '_', currentEnvironment?.id ?? '_'] as const;
}

function rangeKey(range: InsightsTimeRange): string {
  return `${range?.startMs ?? '_'}-${range?.endMs ?? '_'}`;
}

function entityIdsKey(entityIds: readonly string[]): string {
  return [...(entityIds ?? [])].sort().join(',');
}

export const insightsKeys = {
  all: () => scopePrefix(),
  entityOverview: (range: InsightsTimeRange, limit?: number) =>
    [...scopePrefix(), 'entityOverview', rangeKey(range), limit ?? insightsService.DEFAULT_OVERVIEW_LIMIT] as const,
  estateHealth: (range: InsightsTimeRange, limit?: number) =>
    [...scopePrefix(), 'estateHealth', rangeKey(range), limit ?? insightsService.DEFAULT_OVERVIEW_LIMIT] as const,
  slowestEntities: (range: InsightsTimeRange, limit?: number) =>
    [...scopePrefix(), 'slowestEntities', rangeKey(range), limit ?? insightsService.DEFAULT_DETAIL_LIMIT] as const,
  entityErrorCounts: (entityIds: readonly string[], range: InsightsTimeRange) =>
    [...scopePrefix(), 'entityErrorCounts', rangeKey(range), entityIdsKey(entityIds)] as const,
  entityRequestTotals: (entityIds: readonly string[], range: InsightsTimeRange) =>
    [...scopePrefix(), 'entityRequestTotals', rangeKey(range), entityIdsKey(entityIds)] as const,
  entityTimeSeries: (entityIds: readonly string[], range: InsightsTimeRange, failedOnly: boolean) =>
    [...scopePrefix(), 'entityTimeSeries', rangeKey(range), entityIdsKey(entityIds), failedOnly ? 'failed' : 'all'] as const,
  metricDescriptor: () => [...scopePrefix(), 'metricDescriptor'] as const,
};

const DEFAULT_REFETCH_MS = 60_000;

/** Entity inventory with p99 latency + request volume, ordered by traffic. */
export function useEntityOverview(
  range: InsightsTimeRange,
  options?: { limit?: number; enabled?: boolean; refetchInterval?: number | false },
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: insightsKeys.entityOverview(range, options?.limit),
    queryFn: () => insightsService.getEntityOverview({ ...range, limit: options?.limit }),
    enabled: isAuthenticated && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval ?? DEFAULT_REFETCH_MS,
  });
}

/** Entities enriched with error counts + error rate, sorted worst-first. */
export function useEstateHealth(
  range: InsightsTimeRange,
  options?: { limit?: number; enabled?: boolean; refetchInterval?: number | false },
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: insightsKeys.estateHealth(range, options?.limit),
    queryFn: () => insightsService.getEstateHealth(range, { limit: options?.limit }),
    enabled: isAuthenticated && (options?.enabled ?? true),
    refetchInterval: options?.refetchInterval ?? DEFAULT_REFETCH_MS,
  });
}

/** Slowest entities by p99 response time. */
export function useSlowestEntities(
  range: InsightsTimeRange,
  options?: { limit?: number; enabled?: boolean },
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: insightsKeys.slowestEntities(range, options?.limit),
    queryFn: () => insightsService.getSlowestEntities(range, options?.limit),
    enabled: isAuthenticated && (options?.enabled ?? true),
    refetchInterval: DEFAULT_REFETCH_MS,
  });
}

/** Failed-request counts keyed by entity id. */
export function useEntityErrorCounts(
  entityIds: readonly string[],
  range: InsightsTimeRange,
  options?: { enabled?: boolean },
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: insightsKeys.entityErrorCounts(entityIds, range),
    queryFn: () => insightsService.getEntityErrorCounts(entityIds, range),
    enabled: isAuthenticated && entityIds.length > 0 && (options?.enabled ?? true),
    refetchInterval: DEFAULT_REFETCH_MS,
  });
}

/** Total request counts keyed by entity id. */
export function useEntityRequestTotals(
  entityIds: readonly string[],
  range: InsightsTimeRange,
  options?: { enabled?: boolean },
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: insightsKeys.entityRequestTotals(entityIds, range),
    queryFn: () => insightsService.getEntityRequestTotals(entityIds, range),
    enabled: isAuthenticated && entityIds.length > 0 && (options?.enabled ?? true),
    refetchInterval: DEFAULT_REFETCH_MS,
  });
}

/** Time-bucketed request volume (pass failedOnly for the error series). */
export function useEntityTimeSeries(
  entityIds: readonly string[],
  range: InsightsTimeRange,
  options?: { failedOnly?: boolean; enabled?: boolean },
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const failedOnly = options?.failedOnly ?? false;
  return useQuery({
    queryKey: insightsKeys.entityTimeSeries(entityIds, range, failedOnly),
    queryFn: () => insightsService.getEntityTimeSeries(entityIds, range, { failedOnly }),
    enabled: isAuthenticated && entityIds.length > 0 && (options?.enabled ?? true),
    refetchInterval: DEFAULT_REFETCH_MS,
  });
}

/** Metric descriptor for "mulesoft.entity" — rarely changes, cached long. */
export function useEntityMetricDescriptor(options?: { enabled?: boolean }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: insightsKeys.metricDescriptor(),
    queryFn: () => insightsService.getEntityMetricDescriptor(),
    enabled: isAuthenticated && (options?.enabled ?? true),
    staleTime: 15 * 60_000,
  });
}
