// ============================================================
// Anypoint Mobile Platform - CloudHub instance diagnostics hooks
// ============================================================
// TanStack Query v5 wrappers around src/services/diagnosticsService.
//
// Diagnoses change rarely (they are produced once per instance and then
// stay put), and the service never throws — 404/503 come back as a
// normalized status — so these queries use a long staleTime, no polling
// and no retries.
// ============================================================

import { useQuery } from '@tanstack/react-query';

import * as diagnosticsService from '../../services/diagnosticsService';
import { useAuthStore } from '../../stores/authStore';

/**
 * Query key factory — scoped by org + env so a tenant switch can never
 * serve a diagnosis cached under a different context.
 * (Enforced by src/__tests__/queryKeyScoping.test.ts conventions.)
 */
function scopePrefix(): readonly string[] {
  const { currentOrganization, currentEnvironment } = useAuthStore.getState();
  return ['diagnostics', currentOrganization?.id ?? '_', currentEnvironment?.id ?? '_'] as const;
}

export const diagnosticsKeys = {
  all: () => scopePrefix(),
  instance: (domain: string, instanceId: string) =>
    [...scopePrefix(), 'instance', domain, instanceId] as const,
  readiness: (domain: string) => [...scopePrefix(), 'readiness', domain] as const,
  recent: (domain: string, instanceIds: string[], max: number) =>
    [...scopePrefix(), 'recent', domain, max, instanceIds.join('|')] as const,
};

// Diagnoses are effectively static once produced — keep them warm.
const DIAGNOSIS_STALE_TIME = 5 * 60_000; // 5 minutes
const DIAGNOSIS_GC_TIME = 30 * 60_000; // 30 minutes

/** Diagnosis for a single CloudHub instance. Lazy — pass `enabled: false` to defer. */
export function useInstanceDiagnosis(
  domain: string,
  instanceId: string,
  options?: { enabled?: boolean },
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: diagnosticsKeys.instance(domain, instanceId),
    queryFn: () => diagnosticsService.getInstanceDiagnosis(domain, instanceId),
    enabled: isAuthenticated && !!domain && !!instanceId && (options?.enabled ?? true),
    staleTime: DIAGNOSIS_STALE_TIME,
    gcTime: DIAGNOSIS_GC_TIME,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

/** Whether the diagnosis service has anything to analyse for this app. */
export function useAnalysisReadiness(domain: string, options?: { enabled?: boolean }) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  return useQuery({
    queryKey: diagnosticsKeys.readiness(domain),
    queryFn: () => diagnosticsService.getAnalysisReadiness(domain),
    enabled: isAuthenticated && !!domain && (options?.enabled ?? true),
    staleTime: DIAGNOSIS_STALE_TIME,
    gcTime: DIAGNOSIS_GC_TIME,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
  });
}

/**
 * Capped, bounded-concurrency batch of diagnoses for recent instances.
 * `instanceIds` must be newest-first; only the first `max` are probed.
 */
export function useRecentDiagnoses(
  domain: string,
  instanceIds: string[],
  options?: { max?: number; concurrency?: number; enabled?: boolean },
) {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const max = options?.max ?? diagnosticsService.DEFAULT_DIAGNOSES_MAX;
  const concurrency = options?.concurrency ?? diagnosticsService.DEFAULT_DIAGNOSES_CONCURRENCY;
  const ids = Array.isArray(instanceIds) ? instanceIds : [];

  return useQuery({
    queryKey: diagnosticsKeys.recent(domain, ids, max),
    queryFn: () => diagnosticsService.getRecentDiagnoses(domain, ids, { max, concurrency }),
    enabled: isAuthenticated && !!domain && ids.length > 0 && (options?.enabled ?? true),
    staleTime: DIAGNOSIS_STALE_TIME,
    gcTime: DIAGNOSIS_GC_TIME,
    refetchInterval: false,
    refetchOnMount: false,
    refetchOnReconnect: false,
    retry: false,
  });
}
