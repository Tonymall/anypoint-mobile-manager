// ============================================================
// App Monitoring Detail Screen
// Tab-based dashboard for a single application with
// Overview, Inbound, Outbound, JVM, Infrastructure tabs.
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import { View, ScrollView, RefreshControl, useWindowDimensions } from 'react-native';
import { Appbar, Text, Card, Chip, useTheme } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApplication, useAppMetrics, useDashboardStats } from '../../hooks/queries';
import { getAppName } from '../../utils/appHelpers';
import { anypointColors } from '../../theme';
import { getStatusColor, getStatusLabel } from '../../utils/statusHelpers';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import { CONTENT_MAX_WIDTH, TABS, DATE_RANGES, type TabId } from './appMonitoringDetail/constants';
import { useAppMonitoringMetrics } from './appMonitoringDetail/useAppMonitoringMetrics';
import { createStyles } from './appMonitoringDetail/styles';
import OverviewTab from './appMonitoringDetail/OverviewTab';
import InboundTab from './appMonitoringDetail/InboundTab';
import OutboundTab from './appMonitoringDetail/OutboundTab';
import JvmTab from './appMonitoringDetail/JvmTab';
import InfrastructureTab from './appMonitoringDetail/InfrastructureTab';

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

const AppMonitoringDetailScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const { domain } = useLocalSearchParams<{ domain: string }>();
  const { width: windowWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isWide = windowWidth > CONTENT_MAX_WIDTH;
  const sidePadding = isWide ? Math.round((windowWidth - CONTENT_MAX_WIDTH) / 2) : 0;

  const [selectedRange, setSelectedRange] = useState(0); // index 0 = 1h (default)
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  const rangeHours = DATE_RANGES[selectedRange].hours;
  const now = useMemo(() => new Date(), []);
  const startDate = useMemo(
    () => new Date(now.getTime() - rangeHours * 60 * 60 * 1000).toISOString(),
    [rangeHours, now],
  );
  const endDate = useMemo(() => now.toISOString(), [now]);

  // Fetch application details
  const {
    data: app,
    isLoading: appLoading,
    error: appError,
    refetch: refetchApp,
    isRefetching: appRefetching,
  } = useApplication(domain as string);

  const interval = rangeHours <= 4 ? '1m' : rangeHours <= 24 ? '5m' : rangeHours <= 72 ? '15m' : '1h';

  const {
    data: cpuMetrics,
    isLoading: cpuLoading,
    refetch: refetchCpu,
    isRefetching: cpuRefetching,
  } = useAppMetrics(domain as string, { metricName: 'cpu', startDate, endDate, interval });

  const {
    data: memoryMetrics,
    isLoading: memLoading,
    refetch: refetchMem,
    isRefetching: memRefetching,
  } = useAppMetrics(domain as string, { metricName: 'memory', startDate, endDate, interval });

  const {
    data: dashStats,
    isLoading: dashStatsLoading,
    refetch: refetchDashStats,
    isRefetching: dashStatsRefetching,
  } = useDashboardStats(domain as string, rangeHours * 60);

  const isRefreshing = appRefetching || cpuRefetching || memRefetching || dashStatsRefetching;

  const handleRefresh = useCallback(() => {
    refetchApp(); refetchCpu(); refetchMem(); refetchDashStats();
  }, [refetchApp, refetchCpu, refetchMem, refetchDashStats]);

  // Derived metrics, chart series, and availability flags
  const metrics = useAppMonitoringMetrics({ app, cpuMetrics, memoryMetrics, dashStats });
  const {
    hasRealCpu,
    hasRealMem,
    hasConfiguredSystemData,
    influxCpu,
    influxMem,
    cpuPercent,
    memPercent,
  } = metrics;

  // Derived values
  const status = app?.status ?? 'UNKNOWN';
  const sColor = getStatusColor(status);

  // ---- Loading / Error states ----
  if (appLoading) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="App Monitoring" />
        </Appbar.Header>
        <LoadingState message="Loading monitoring data..." />
      </View>
    );
  }

  if (appError || !app) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="App Monitoring" />
        </Appbar.Header>
        <ErrorState
          message={(appError as Error)?.message ?? 'Failed to load application'}
          onRetry={() => refetchApp()}
        />
      </View>
    );
  }

  // ---- Health indicator helpers ----
  const cpuHealthColor = hasRealCpu
    ? (((influxCpu ?? cpuPercent ?? 0)) > 80 ? anypointColors.error : ((influxCpu ?? cpuPercent ?? 0)) > 60 ? anypointColors.warning : anypointColors.success)
    : hasConfiguredSystemData ? anypointColors.secondary : theme.colors.onSurfaceVariant;
  const cpuHealthLabel = hasRealCpu ? (((influxCpu ?? cpuPercent ?? 0)) > 80 ? 'Critical' : ((influxCpu ?? cpuPercent ?? 0)) > 60 ? 'Warning' : 'Healthy') : hasConfiguredSystemData ? 'Configured' : 'No data';
  const cpuVal = influxCpu ?? cpuPercent ?? null;

  const memHealthColor = hasRealMem
    ? (((influxMem ?? memPercent ?? 0)) > 80 ? anypointColors.error : ((influxMem ?? memPercent ?? 0)) > 60 ? anypointColors.warning : anypointColors.success)
    : hasConfiguredSystemData ? anypointColors.secondary : theme.colors.onSurfaceVariant;
  const memHealthLabel = hasRealMem ? (((influxMem ?? memPercent ?? 0)) > 80 ? 'Critical' : ((influxMem ?? memPercent ?? 0)) > 60 ? 'Warning' : 'Healthy') : hasConfiguredSystemData ? 'Configured' : 'No data';
  const memVal = influxMem ?? memPercent ?? null;

  // ===========================================================================
  // TAB CONTENT
  // ===========================================================================

  const renderTabContent = () => {
    switch (activeTab) {
      case 'inbound':
        return <InboundTab metrics={metrics} styles={styles} dashStatsLoading={dashStatsLoading} />;
      case 'outbound':
        return <OutboundTab metrics={metrics} styles={styles} dashStatsLoading={dashStatsLoading} />;
      case 'jvm':
        return <JvmTab metrics={metrics} styles={styles} dashStatsLoading={dashStatsLoading} />;
      case 'infrastructure':
        return <InfrastructureTab metrics={metrics} styles={styles} app={app} status={status} />;
      case 'overview':
      default:
        return (
          <OverviewTab
            metrics={metrics}
            styles={styles}
            app={app}
            status={status}
            sColor={sColor}
            cpuLoading={cpuLoading}
            memLoading={memLoading}
            dashStatsLoading={dashStatsLoading}
            cpuVal={cpuVal}
            memVal={memVal}
            cpuHealthColor={cpuHealthColor}
            cpuHealthLabel={cpuHealthLabel}
            memHealthColor={memHealthColor}
            memHealthLabel={memHealthLabel}
          />
        );
    }
  };

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={getAppName(app)} />
        <Appbar.Action icon="refresh" onPress={handleRefresh} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          isWide && { paddingHorizontal: sidePadding },
        ]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            tintColor={theme.colors.primary}
            colors={[theme.colors.primary]}
          />
        }
      >
        {/* Status Banner */}
        <Card style={[styles.statusCard, { borderLeftColor: sColor }]} mode="contained">
          <Card.Content style={{ paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: sColor }} />
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface, flex: 1 }}>
                {getStatusLabel(status)}
              </Text>
              <View
                style={{
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8,
                  backgroundColor: sColor + '20', borderWidth: 1, borderColor: sColor + '40',
                }}
              >
                <Text style={{ color: sColor, fontSize: 11, fontWeight: '700' }}>{status}</Text>
              </View>
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
              {app?.domain ?? domain} — {app?.region ?? 'N/A'}
            </Text>
          </Card.Content>
        </Card>

        {/* Date Range Selector */}
        <View style={styles.dateRangeRow}>
          <Icon name="clock-outline" size={16} color={theme.colors.onSurfaceVariant} style={{ marginRight: 6 }} />
          <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, marginRight: 10 }}>
            Time Range:
          </Text>
          {DATE_RANGES.map((range, index) => {
            const isSelected = selectedRange === index;
            return (
              <Chip
                key={range.label}
                mode={isSelected ? 'flat' : 'outlined'}
                selected={isSelected}
                onPress={() => setSelectedRange(index)}
                compact
                accessibilityLabel={`Time range: ${range.label}${isSelected ? ', selected' : ''}`}
                accessibilityRole="button"
                style={[styles.dateChip, isSelected && { backgroundColor: theme.colors.primary }]}
                textStyle={[styles.dateChipText, isSelected && { color: '#FFFFFF' }]}
              >
                {range.label}
              </Chip>
            );
          })}
        </View>

        {/* Tab Bar */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.tabBarScroll}
          contentContainerStyle={styles.tabBarContent}
        >
          {TABS.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <Chip
                key={tab.id}
                icon={tab.icon}
                mode={isActive ? 'flat' : 'outlined'}
                selected={isActive}
                onPress={() => setActiveTab(tab.id)}
                compact
                style={[
                  styles.tabChip,
                  isActive && { backgroundColor: theme.colors.primaryContainer },
                ]}
                textStyle={[
                  styles.tabChipText,
                  isActive && { color: theme.colors.onPrimaryContainer, fontWeight: '700' },
                ]}
              >
                {tab.label}
              </Chip>
            );
          })}
        </ScrollView>

        {/* Tab Content */}
        {renderTabContent()}
      </ScrollView>
    </View>
  );
};

export default AppMonitoringDetailScreen;
