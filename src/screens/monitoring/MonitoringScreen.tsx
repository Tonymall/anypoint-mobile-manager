// ============================================================
// Monitoring Screen — Application Health Overview
// ============================================================
// Fetches per-app monitoring stats for running apps.
//
// Built on the design token layer. The summary is two compact
// horizontal tiles rather than two full-width stacked cards, the sort
// control is the same quiet chip ApplicationsListScreen uses, and each
// health row leads with identity and status instead of embedding a
// configuration table — that detail lives on the screen the row
// already navigates to.
// ============================================================

import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, useWindowDimensions } from 'react-native';
import { Text, Chip } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useIsFocused } from 'expo-router';
import { useQueries } from '@tanstack/react-query';

import { useApplications } from '../../hooks/queries';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import * as runtimeService from '../../services/runtimeService';
import { isMonitoringUnavailable, resetSessionFlags } from '../../services/runtimeService';
import { useAuthStore } from '../../stores/authStore';
import { radii, spacing, typeScale, useTokens } from '../../theme';
import { getAppName, getAppId } from '../../utils/appHelpers';
import ErrorState from '../../components/common/ErrorState';
import {
  AppHealthCard,
  AppHealthSkeleton,
  SummaryTile,
  extractMetrics,
  type MonitoringMetrics,
} from './monitoringList';

// --- Main Component ---

// Max content width for iPad / large screens — keeps UI readable
const CONTENT_MAX_WIDTH = 768;

const MonitoringScreen: React.FC = () => {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const isFocused = useIsFocused();
  const { width: windowWidth } = useWindowDimensions();
  const scrollRef = useRef<FlatList>(null);

  const currentEnv = useAuthStore((s) => s.currentEnvironment);
  const currentOrg = useAuthStore((s) => s.currentOrganization);
  const [sortOrder, setSortOrder] = useState<'default' | 'az' | 'za'>('default');
  const [monitoringDown, setMonitoringDown] = useState(false);

  const {
    data: applications,
    isLoading: appsLoading,
    error: appsError,
    refetch: refetchApps,
  } = useApplications({ enabled: isFocused });

  const handleRefresh = useCallback(() => {
    // Reset monitoring discovery flags so it re-tests endpoints on refresh
    resetSessionFlags();
    setMonitoringDown(false);
    return refetchApps();
  }, [refetchApps]);

  // A pull is the only thing that should show the control; the 120s poll
  // was popping it open and shifting the list under the user's thumb.
  const pullRefresh = usePullRefresh(handleRefresh);

  const appsList = useMemo(() => applications ?? [], [applications]);

  const sortedApps = useMemo(() => {
    if (sortOrder === 'az') return [...appsList].sort((a: any, b: any) => getAppName(a).localeCompare(getAppName(b)));
    if (sortOrder === 'za') return [...appsList].sort((a: any, b: any) => getAppName(b).localeCompare(getAppName(a)));
    return appsList;
  }, [appsList, sortOrder]);

  // --- Limit to first 10 running apps to avoid hammering the API ---
  const runningApps = useMemo(
    () => (appsList as any[]).filter((a: any) => a?.status === 'STARTED').slice(0, 10),
    [appsList],
  );

  // --- Fetch dashboardStats for running apps ---
  const monitoringContext = useMemo(() => ({
    organizationId: currentOrg?.id,
    environmentId: currentEnv?.id,
  }), [currentOrg?.id, currentEnv?.id]);

  const dashStatsQueries = useQueries({
    queries: runningApps.map((app: any) => {
      const d = app?.domain ?? getAppId(app);
      return {
        queryKey: ['runtime', 'dashStats', d],
        queryFn: () => runtimeService.getDashboardStats(d, 60, monitoringContext),
        staleTime: 60_000,
        refetchInterval: isFocused ? 120_000 : false,
        enabled: !!d && isFocused,
      };
    }),
  });

  // Build lookup maps — use stable serialized keys to prevent re-render loops
  const dashDataKey = dashStatsQueries.map((q) => q.dataUpdatedAt).join(',');
  const dashStatsMap = useMemo(() => {
    const map = new Map<string, any>();
    runningApps.forEach((app: any, i: number) => {
      const d = app?.domain ?? getAppId(app);
      if (dashStatsQueries[i]?.data) {
        map.set(d, dashStatsQueries[i].data);
      }
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dashDataKey, runningApps]);

  const loadingKey = dashStatsQueries.map((q) => q.isLoading ? '1' : '0').join('');
  const loadingMap = useMemo(() => {
    const map = new Map<string, boolean>();
    runningApps.forEach((app: any, i: number) => {
      const d = app?.domain ?? getAppId(app);
      map.set(d, dashStatsQueries[i]?.isLoading ?? false);
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingKey, runningApps]);

  // Build metrics map
  const metricsMap = useMemo(() => {
    const map = new Map<string, MonitoringMetrics>();
    (appsList as any[]).forEach((app: any) => {
      const d = app?.domain ?? getAppId(app);
      const dash = dashStatsMap.get(d);
      map.set(d, extractMetrics(app, dash));
    });
    return map;
  }, [appsList, dashStatsMap]);

  const totalApps = appsList.length;
  const runningAppsCount = useMemo(() => appsList.filter((a: any) => a?.status === 'STARTED').length, [appsList]);
  const failedApps = useMemo(() => appsList.filter((a: any) => a?.status === 'FAILED').length, [appsList]);
  const envName = currentEnv?.name ?? 'No environment';

  // Check monitoring availability after dashboardStats discovery completes.
  const anyDashLoading = dashStatsQueries.some((q) => q.isLoading);
  useEffect(() => {
    if (!anyDashLoading && runningAppsCount > 0) {
      const timer = setTimeout(() => {
        if (isMonitoringUnavailable()) setMonitoringDown(true);
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [anyDashLoading, runningAppsCount]);

  const handleAppPress = useCallback((app: any) => {
    const domain = app?.domain ?? getAppId(app);
    router.push({ pathname: '/(main)/monitoring/[domain]' as any, params: { domain } });
  }, [router]);

  // Responsive horizontal padding for wide screens (iPad)
  const isWide = windowWidth > CONTENT_MAX_WIDTH;
  const sidePadding = isWide ? Math.round((windowWidth - CONTENT_MAX_WIDTH) / 2) : 0;

  const healthPercent = totalApps > 0 ? Math.round((runningAppsCount / totalApps) * 100) : null;

  const listHeaderComponent = useMemo(() => (
    <>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={[typeScale.title, { color: t.color.text.primary }]}>Monitoring</Text>
        <Text style={[typeScale.bodySmall, styles.headerSubtitle, { color: t.color.text.tertiary }]}>
          {envName}
        </Text>
      </View>

      {/* Summary — two numbers, two compact tiles, one row */}
      <View style={styles.summaryRow}>
        <SummaryTile
          label="Total apps"
          value={totalApps}
          icon="application-outline"
          role={failedApps > 0 ? t.color.status.danger : t.color.status.info}
          note={failedApps > 0 ? `${failedApps} failed` : undefined}
          loading={appsLoading}
        />
        <SummaryTile
          label="Running"
          value={`${runningAppsCount}/${totalApps}`}
          icon="check-circle-outline"
          role={t.color.status.success}
          note={healthPercent != null ? `${healthPercent}% healthy` : undefined}
          loading={appsLoading}
        />
      </View>

      {/* Monitoring unavailable — once, for the whole environment */}
      {monitoringDown && runningAppsCount > 0 ? (
        <View
          style={[
            styles.envNote,
            {
              backgroundColor: t.color.status.warning.surface,
              borderColor: t.color.status.warning.border,
            },
          ]}
        >
          <Icon name="information-outline" size={16} color={t.color.status.warning.base} />
          <View style={styles.envNoteBody}>
            <Text style={[typeScale.label, { color: t.color.text.primary }]}>
              Live metrics unavailable
            </Text>
            <Text style={[typeScale.caption, styles.envNoteText, { color: t.color.text.secondary }]}>
              This environment exposes application traffic metrics but not live per-app CPU,
              memory or JVM telemetry. Configured resources are shown where available.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Section header + sort */}
      <View style={styles.sectionHeader}>
        <Text style={[typeScale.heading, styles.sectionTitle, { color: t.color.text.primary }]}>
          Application Health
        </Text>
        <Chip
          icon={sortOrder === 'za' ? 'sort-alphabetical-descending' : 'sort-alphabetical-ascending'}
          onPress={() => setSortOrder((p) => p === 'default' ? 'az' : p === 'az' ? 'za' : 'default')}
          style={[
            styles.sortChip,
            {
              backgroundColor:
                sortOrder === 'default'
                  ? t.color.surface.sunken
                  : t.color.accent.secondary.surface,
              borderColor:
                sortOrder === 'default'
                  ? t.color.border.subtle
                  : t.color.accent.secondary.border,
            },
          ]}
          textStyle={{
            color:
              sortOrder === 'default'
                ? t.color.text.secondary
                : t.color.accent.secondary.base,
          }}
          showSelectedOverlay={false}
          compact
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${sortOrder === 'az' ? 'A to Z' : sortOrder === 'za' ? 'Z to A' : 'default'}`}
        >
          {sortOrder === 'az' ? 'A → Z' : sortOrder === 'za' ? 'Z → A' : 'Sort'}
        </Chip>
        <Text style={[typeScale.caption, { color: t.color.text.tertiary }]}>
          {sortedApps.length} app{sortedApps.length !== 1 ? 's' : ''}
        </Text>
      </View>
    </>
  ), [insets.top, envName, totalApps, failedApps, runningAppsCount, healthPercent, monitoringDown, appsLoading, t, sortOrder, sortedApps.length]);

  const listEmptyComponent = useMemo(() => {
    if (appsLoading) {
      return <AppHealthSkeleton />;
    }
    if (appsError) {
      return <ErrorState message={(appsError as Error)?.message ?? 'Failed to load data'} onRetry={() => refetchApps()} />;
    }
    return (
      <View style={styles.emptyState}>
        <View style={[styles.emptyIcon, { backgroundColor: t.color.surface.sunken }]}>
          <Icon name="monitor-dashboard" size={36} color={t.color.text.tertiary} />
        </View>
        <Text style={[typeScale.heading, styles.emptyTitle, { color: t.color.text.primary }]}>
          No applications to monitor
        </Text>
        <Text style={[typeScale.bodySmall, styles.emptySubtitle, { color: t.color.text.secondary }]}>
          Deploy applications to this environment and their health will appear here.
        </Text>
      </View>
    );
  }, [appsLoading, appsError, refetchApps, t]);

  const renderAppCard = useCallback(({ item: app }: any) => {
    const d = app?.domain ?? getAppId(app);
    return (
      <AppHealthCard
        key={d}
        app={app}
        metrics={metricsMap.get(d) ?? extractMetrics(null, null)}
        detailLoading={loadingMap.get(d) ?? false}
        onPress={() => handleAppPress(app)}
      />
    );
  }, [metricsMap, loadingMap, handleAppPress]);

  return (
    <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
      <FlatList
        ref={scrollRef}
        data={appsLoading || appsError ? [] : sortedApps}
        keyExtractor={(item: any) => item?.domain ?? getAppId(item)}
        renderItem={renderAppCard}
        ListHeaderComponent={listHeaderComponent}
        ListEmptyComponent={listEmptyComponent}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[
          styles.listContent,
          isWide && { paddingHorizontal: sidePadding },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={pullRefresh.refreshing}
            onRefresh={pullRefresh.onRefresh}
            colors={[t.color.brand.base]}
            tintColor={t.color.brand.base}
          />
        }
        windowSize={7}
        maxToRenderPerBatch={10}
      />
    </View>
  );
};

// --- Styles ---

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  headerSubtitle: { marginTop: 2 },
  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  envNote: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  envNoteBody: { flex: 1, gap: 2 },
  envNoteText: { fontWeight: '500' },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  sectionTitle: { flex: 1 },
  sortChip: { borderRadius: radii.md, borderWidth: StyleSheet.hairlineWidth },
  listContent: { paddingBottom: spacing.xxxl },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 64,
    paddingHorizontal: spacing.xxl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radii.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: { marginBottom: 6 },
  emptySubtitle: { textAlign: 'center' },
});

export default MonitoringScreen;
