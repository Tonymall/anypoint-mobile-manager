// ============================================================
// Dashboard — incident feed data
// ============================================================
// Merges the three health signals into one prioritised feed.
// Insights is optional: on tenants where the observability API
// is unavailable the service returns [] and the feed simply
// falls back to runtime status + alerts.
// ============================================================

import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';

import { useApplications, usePlatformAlerts } from '../../../hooks/queries';
import * as insightsService from '../../../services/insightsService';
import { deriveIncidents, summarizeIncidents } from '../../../services/incidentFeed';
import { useAuthStore } from '../../../stores/authStore';

/** Insights window used by the feed — the last hour, matching the console default. */
const FEED_WINDOW_MS = 60 * 60 * 1000;
/** How many entities the feed asks Insights for. */
const FEED_ENTITY_LIMIT = 20;

/**
 * The window is resolved when the query runs, not during render — reading the
 * clock is impure. A minute counter in the key is what actually retriggers it,
 * so the cache stays stable within a minute and refreshes across minutes.
 */
function currentWindow(): { startMs: number; endMs: number } {
  const endMs = Math.floor(Date.now() / 60_000) * 60_000;
  return { startMs: endMs - FEED_WINDOW_MS, endMs };
}

export function useIncidentFeed(options?: { enabled?: boolean }) {
  const enabled = options?.enabled ?? true;
  const orgId = useAuthStore((s) => s.currentOrganization?.id);
  const envId = useAuthStore((s) => s.currentEnvironment?.id);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const applicationsQuery = useApplications({ enabled });
  const alertsQuery = usePlatformAlerts(undefined, { enabled });

  // Advances once a minute so the Insights window rolls forward. Updated only
  // from a timer callback, never synchronously during render or an effect body.
  const [minuteTick, setMinuteTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setMinuteTick((tick) => tick + 1), 60_000);
    return () => clearInterval(timer);
  }, []);

  const estateQuery = useQuery({
    queryKey: [
      'incident-feed',
      orgId ?? '_',
      envId ?? '_',
      'estate-health',
      minuteTick,
    ],
    queryFn: () =>
      insightsService.getEstateHealth(currentWindow(), { limit: FEED_ENTITY_LIMIT }),
    enabled: isAuthenticated && enabled,
    // The service degrades to [] on unsupported tenants, so a stale window is
    // never worse than no data; keep it cheap.
    staleTime: 60_000,
  });

  const incidents = useMemo(
    () =>
      deriveIncidents({
        applications: applicationsQuery.data ?? [],
        alerts: alertsQuery.data?.data ?? [],
        entities: estateQuery.data ?? [],
      }),
    [applicationsQuery.data, alertsQuery.data, estateQuery.data],
  );

  const summary = useMemo(() => summarizeIncidents(incidents), [incidents]);

  return {
    incidents,
    summary,
    // Only the runtime query gates the first paint; alerts and insights are
    // enrichment and must never hold back the feed.
    isLoading: applicationsQuery.isLoading,
    isRefreshing:
      applicationsQuery.isFetching || alertsQuery.isFetching || estateQuery.isFetching,
    refetch: () => {
      applicationsQuery.refetch();
      alertsQuery.refetch();
      estateQuery.refetch();
    },
  };
}
