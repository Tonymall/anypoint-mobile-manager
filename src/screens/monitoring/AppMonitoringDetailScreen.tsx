// ============================================================
// App Monitoring Detail Screen
// Full dashboard view for a single application with CPU,
// memory, response time metrics, date range selection,
// and performance indicators.
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Dimensions, Platform, useWindowDimensions } from 'react-native';
import { Appbar, Text, Card, Chip, useTheme, ProgressBar, Divider } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { useApplication, useAppMetrics, useDashboardStats } from '../../hooks/queries';
import { getAppName, getMuleVersion, getWorkerInfo } from '../../utils/appHelpers';
import { anypointColors } from '../../theme';
import { getStatusColor, getStatusLabel } from '../../utils/statusHelpers';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CONTENT_MAX_WIDTH = 768;

// ---------------------------------------------------------------------------
// Date range presets
// ---------------------------------------------------------------------------

interface DateRange {
  label: string;
  hours: number;
}

const DATE_RANGES: DateRange[] = [
  { label: '1h', hours: 1 },
  { label: '4h', hours: 4 },
  { label: '12h', hours: 12 },
  { label: '24h', hours: 24 },
  { label: '3d', hours: 72 },
  { label: '7d', hours: 168 },
];

// ---------------------------------------------------------------------------
// Mini Bar Chart (simple native visualization)
// ---------------------------------------------------------------------------

interface MiniChartProps {
  data: number[];
  maxValue?: number;
  color: string;
  height?: number;
  theme: MD3Theme;
  label: string;
  unit?: string;
}

const MiniChart: React.FC<MiniChartProps> = ({ data, maxValue, color, height = 60, theme, label, unit = '%' }) => {
  const max = maxValue ?? Math.max(...data, 1);
  const barWidth = Math.max(2, (SCREEN_WIDTH - 100) / Math.max(data.length, 1));
  const latestValue = data.length > 0 ? data[data.length - 1] : 0;

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
          {label}
        </Text>
        <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
          {Math.round(latestValue)}{unit}
        </Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'flex-end',
          height,
          backgroundColor: theme.colors.surfaceVariant,
          borderRadius: 6,
          overflow: 'hidden',
          paddingHorizontal: 2,
        }}
      >
        {data.map((value, idx) => (
          <View
            key={idx}
            style={{
              width: barWidth - 1,
              height: Math.max(1, (value / max) * height),
              backgroundColor: color,
              marginHorizontal: 0.5,
              borderTopLeftRadius: 2,
              borderTopRightRadius: 2,
              opacity: idx === data.length - 1 ? 1 : 0.6 + (idx / data.length) * 0.4,
            }}
          />
        ))}
      </View>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Metric Card
// ---------------------------------------------------------------------------

interface MetricCardProps {
  title: string;
  value: string;
  subtitle?: string;
  icon: string;
  color: string;
  theme: MD3Theme;
}

const MetricCard: React.FC<MetricCardProps> = ({ title, value, subtitle, icon, color, theme }) => (
  <View
    accessibilityLabel={`${title}: ${value}${subtitle ? ', ' + subtitle : ''}`}
    style={{
      flex: 1,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: color + '15',
      overflow: 'hidden',
    }}
  >
    {/* Accent glow at top */}
    <View style={{ height: 2.5, backgroundColor: color, opacity: 0.5 }} />
    <View style={{ padding: 14 }}>
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 12,
          backgroundColor: color + '12',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 10,
        }}
      >
        <Icon name={icon} size={17} color={color} />
      </View>
      <Text
        style={{ fontWeight: '800', fontSize: 24, color: theme.colors.onSurface, marginBottom: 2, letterSpacing: -0.5 }}
      >
        {value}
      </Text>
      <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, fontWeight: '500', letterSpacing: 0.2 }}>
        {title}
      </Text>
      {subtitle ? (
        <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 10, marginTop: 3, opacity: 0.8 }}>
          {subtitle}
        </Text>
      ) : null}
    </View>
  </View>
);

// ---------------------------------------------------------------------------
// Helpers: extract values from CloudHub time-series maps
// ---------------------------------------------------------------------------

/**
 * CloudHub workerStatistics fields like `cpuPercentageUsed`, `memoryPercentageUsed`,
 * `cpu` can be:
 *   - A single number (e.g. threadCount: 42)
 *   - A time-series map: { "1709564000000": 2.5, "1709564060000": 3.1 }
 *   - undefined / null
 *
 * This helper returns the latest numeric value, or the fallback.
 */
function extractNumericValue(val: any, fallback: number = 0): number {
  if (val == null) return fallback;
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && !Array.isArray(val)) {
    // Time-series map — get the value at the latest timestamp
    const keys = Object.keys(val);
    if (keys.length === 0) return fallback;
    // Keys are typically numeric timestamps as strings
    const sorted = keys.sort((a, b) => Number(b) - Number(a));
    const latest = val[sorted[0]];
    return typeof latest === 'number' ? latest : fallback;
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

/**
 * Extract flat statistics from workerStatuses[0].statisticsByWorker.
 * `statisticsByWorker` may contain metrics directly, OR be nested one level
 * deeper keyed by worker ID:
 *   { "workerId123": { cpu: 2.5, memoryPercentageUsed: 50 } }
 */
function flattenWorkerStats(raw: any): Record<string, any> {
  if (!raw || typeof raw !== 'object') return {};
  // If the object has known metric keys at the top level, it's direct
  const metricKeys = ['cpu', 'cpuPercentageUsed', 'memoryTotalUsed', 'memoryPercentageUsed', 'memoryTotalMax', 'threadCount'];
  const hasDirectMetric = metricKeys.some((k) => k in raw);
  if (hasDirectMetric) return raw;
  // Otherwise, try to unwrap the first worker ID key
  const values = Object.values(raw);
  if (values.length > 0 && values[0] && typeof values[0] === 'object') {
    return values[0] as Record<string, any>;
  }
  return raw;
}

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

  const [selectedRange, setSelectedRange] = useState(3); // index 3 = 24h

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

  // Fetch CPU metrics
  const {
    data: cpuMetrics,
    isLoading: cpuLoading,
    refetch: refetchCpu,
    isRefetching: cpuRefetching,
  } = useAppMetrics(domain as string, { metricName: 'cpu', startDate, endDate, interval });

  // Fetch Memory metrics
  const {
    data: memoryMetrics,
    isLoading: memLoading,
    refetch: refetchMem,
    isRefetching: memRefetching,
  } = useAppMetrics(domain as string, { metricName: 'memory', startDate, endDate, interval });

  // Fetch full dashboard stats (handles InfluxDB proxy, monitoring APIs, etc.)
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

  // Process metrics data into simple number arrays for charts
  const cpuData = useMemo(() => {
    if (!cpuMetrics) return [];
    if (Array.isArray(cpuMetrics)) {
      if (cpuMetrics.length === 0) return [];
      // Array of { timestamp, value } from extractTimeSeries
      if (cpuMetrics[0]?.value !== undefined) {
        return cpuMetrics.map((p: any) => p.value ?? 0);
      }
      // Array of { data: [...] } from Monitoring API
      if (cpuMetrics[0]?.data) {
        return cpuMetrics[0].data.map((p: any) => p.value ?? p.y ?? 0);
      }
      // Direct array of numbers
      if (typeof cpuMetrics[0] === 'number') return cpuMetrics;
    }
    return [];
  }, [cpuMetrics]);

  const memData = useMemo(() => {
    if (!memoryMetrics) return [];
    if (Array.isArray(memoryMetrics)) {
      if (memoryMetrics.length === 0) return [];
      if (memoryMetrics[0]?.value !== undefined) {
        return memoryMetrics.map((p: any) => p.value ?? 0);
      }
      if (memoryMetrics[0]?.data) {
        return memoryMetrics[0].data.map((p: any) => p.value ?? p.y ?? 0);
      }
      if (typeof memoryMetrics[0] === 'number') return memoryMetrics;
    }
    return [];
  }, [memoryMetrics]);

  // Derived values
  const status = app?.status ?? 'UNKNOWN';
  const sColor = getStatusColor(status);
  const workerInfo = useMemo(() => getWorkerInfo(app), [app]);

  // CloudHub embeds live metrics in workerStatuses[].statisticsByWorker
  const workerStats = useMemo(() => {
    const appObj = app as any;
    const statuses = appObj?.workerStatuses ?? appObj?.workers?.statuses ?? [];
    if (statuses.length > 0) {
      const w = statuses[0];
      const raw = w?.statisticsByWorker ?? w?.statistics ?? w ?? {};
      return flattenWorkerStats(raw);
    }
    return appObj?.monitoring ?? {};
  }, [app]);

  // Use extractNumericValue to handle time-series maps, plain numbers, or undefined
  const cpuPercent = extractNumericValue(workerStats?.cpuPercentageUsed)
    || extractNumericValue(workerStats?.cpu)
    || extractNumericValue(workerStats?.cpuUsage)
    || (cpuData.length > 0 ? cpuData[cpuData.length - 1] : 0);

  const memTotalRaw = extractNumericValue(workerStats?.memoryTotalMax);
  const memUsedRaw = extractNumericValue(workerStats?.memoryTotalUsed) || extractNumericValue(workerStats?.memoryUsage);
  // Normalise to MB when values look like bytes (> 10 000)
  const memTotal = memTotalRaw > 10_000 ? Math.round(memTotalRaw / (1024 * 1024)) : memTotalRaw;
  const memUsage = memUsedRaw > 10_000 ? Math.round(memUsedRaw / (1024 * 1024)) : memUsedRaw;
  const memPercent = extractNumericValue(workerStats?.memoryPercentageUsed)
    || (memTotal > 0 ? Math.round((memUsage / memTotal) * 100) : 0)
    || (memData.length > 0 ? memData[memData.length - 1] : 0);

  const threadCount = extractNumericValue(workerStats?.threadCount);
  const workerStatuses = (app as any)?.workerStatuses ?? [];
  const numWorkers = workerStatuses.length;

  // ── Extract InfluxDB data when available ──
  const influxData = useMemo(() => {
    if (!dashStats) return null;
    // dashStats._source === 'influxdb' means we have InfluxDB monitoring data
    if (dashStats._source === 'influxdb') {
      return {
        timeSeries: dashStats._timeSeries ?? [],
        extraMetrics: dashStats._extraMetrics ?? {},
      };
    }
    // Even when not from InfluxDB, dashStats may carry workerStatistics
    return null;
  }, [dashStats]);

  // ── Extract Observability API app-level metrics ──
  const observabilityMetrics = useMemo(() => {
    if (!dashStats?._appMetrics) return null;
    return dashStats._appMetrics;
  }, [dashStats]);

  // ── Extract direct JVM endpoint data ──
  const jvmMetrics = useMemo(() => {
    if (!dashStats?._jvmMetrics) return null;
    return dashStats._jvmMetrics;
  }, [dashStats]);

  const messageCount = influxData?.extraMetrics?.messageCount ?? observabilityMetrics?.messageCount ?? null;
  const influxThreadCount = influxData?.extraMetrics?.threadCount ?? jvmMetrics?.threadCount ?? null;
  const influxHeapUsed = influxData?.extraMetrics?.heapUsed ?? jvmMetrics?.heapUsed ?? null;
  // Inbound / Outbound HTTP metrics from InfluxDB or Observability API
  const inboundAvgResponseTime = influxData?.extraMetrics?.inboundAvgResponseTime ?? observabilityMetrics?.inboundAvgResponseTime ?? null;
  const inboundRequestCount = influxData?.extraMetrics?.inboundRequestCount ?? observabilityMetrics?.inboundRequestCount ?? null;
  const inboundErrorCount = influxData?.extraMetrics?.inboundErrorCount ?? observabilityMetrics?.errorCount ?? null;
  const outboundAvgResponseTime = influxData?.extraMetrics?.outboundAvgResponseTime ?? observabilityMetrics?.outboundAvgResponseTime ?? null;
  const outboundRequestCount = influxData?.extraMetrics?.outboundRequestCount ?? observabilityMetrics?.outboundRequestCount ?? null;
  const outboundErrorCount = influxData?.extraMetrics?.outboundErrorCount ?? null;
  const hasOutboundData = outboundAvgResponseTime != null || outboundRequestCount != null || outboundErrorCount != null;
  const hasInboundHttpData = inboundAvgResponseTime != null || inboundRequestCount != null || inboundErrorCount != null;
  const influxCpu = useMemo(() => {
    if (!influxData?.timeSeries) return null;
    const ts = influxData.timeSeries;
    const cpuPts = ts.filter((p: any) => p.cpu != null);
    if (cpuPts.length === 0) return null;
    return cpuPts[cpuPts.length - 1].cpu;
  }, [influxData]);
  const influxMem = useMemo(() => {
    if (!influxData?.timeSeries) return null;
    const ts = influxData.timeSeries;
    const memPts = ts.filter((p: any) => p.memory != null);
    if (memPts.length === 0) return null;
    return memPts[memPts.length - 1].memory;
  }, [influxData]);

  // Detect if we have REAL metrics (vs just defaulting to 0 because monitoring is unavailable)
  const hasRealCpu = workerStats?.cpuPercentageUsed != null
    || workerStats?.cpu != null
    || workerStats?.cpuUsage != null
    || cpuData.length > 0
    || influxCpu != null;
  const hasRealMem = workerStats?.memoryPercentageUsed != null
    || workerStats?.memoryTotalUsed != null
    || workerStats?.memoryUsage != null
    || memData.length > 0
    || influxMem != null;
  const hasRealThreads = workerStats?.threadCount != null || influxThreadCount != null;
  const hasInfluxData = messageCount != null || influxCpu != null || influxMem != null || influxThreadCount != null;
  const hasAnyMetrics = hasRealCpu || hasRealMem || hasRealThreads || hasInfluxData;

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
        {/* ---- Status Banner ---- */}
        <Card style={[styles.statusCard, { borderLeftColor: sColor }]} mode="contained">
          <Card.Content style={{ paddingVertical: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: sColor }} />
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface, flex: 1 }}>
                {getStatusLabel(status)}
              </Text>
              <View
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 8,
                  backgroundColor: sColor + '20',
                  borderWidth: 1,
                  borderColor: sColor + '40',
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

        {/* ---- Date Range Selector ---- */}
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
                style={[
                  styles.dateChip,
                  isSelected && { backgroundColor: theme.colors.primary },
                ]}
                textStyle={[
                  styles.dateChipText,
                  isSelected && { color: '#FFFFFF' },
                ]}
              >
                {range.label}
              </Chip>
            );
          })}
        </View>

        {/* ---- Monitoring unavailable banner ---- */}
        {!hasAnyMetrics && status === 'STARTED' && !cpuLoading && !memLoading && !dashStatsLoading && (
          <Card
            style={{
              marginHorizontal: 16,
              marginBottom: 12,
              borderRadius: 12,
              elevation: 0,
              backgroundColor: anypointColors.warning + '15',
              borderWidth: 1,
              borderColor: anypointColors.warning + '30',
            }}
            mode="contained"
          >
            <Card.Content style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 }}>
              <Icon name="information-outline" size={18} color={anypointColors.warning} />
              <View style={{ flex: 1 }}>
                <Text variant="labelMedium" style={{ color: theme.colors.onSurface, fontWeight: '600', marginBottom: 2 }}>
                  Live metrics unavailable
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
                  CPU, memory, and thread monitoring require an Anypoint Monitoring subscription (Titanium or Platinum). Configured resources and deployment info are shown below.
                </Text>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* ---- Overview Metrics ---- */}
        <View style={styles.metricsRow}>
          <MetricCard
            title="CPU"
            value={hasRealCpu ? `${Math.round(influxCpu ?? cpuPercent)}%` : 'N/A'}
            icon="chip"
            color={hasRealCpu
              ? ((influxCpu ?? cpuPercent) > 80 ? anypointColors.error : (influxCpu ?? cpuPercent) > 60 ? anypointColors.warning : anypointColors.primary)
              : theme.colors.onSurfaceVariant}
            theme={theme}
          />
          <MetricCard
            title="Memory"
            value={hasRealMem ? `${Math.round(influxMem ?? memPercent)}%` : 'N/A'}
            subtitle={hasRealMem && memTotal > 0 ? `${memUsage}/${memTotal} MB` : undefined}
            icon="memory"
            color={hasRealMem
              ? ((influxMem ?? memPercent) > 80 ? anypointColors.error : (influxMem ?? memPercent) > 60 ? anypointColors.warning : anypointColors.accent)
              : theme.colors.onSurfaceVariant}
            theme={theme}
          />
          <MetricCard
            title={messageCount != null ? 'Messages' : 'Threads'}
            value={messageCount != null ? String(messageCount) : (hasRealThreads ? String(influxThreadCount ?? threadCount) : 'N/A')}
            icon={messageCount != null ? 'message-text-outline' : 'format-list-numbered'}
            color={messageCount != null ? anypointColors.primary : (hasRealThreads ? anypointColors.secondary : theme.colors.onSurfaceVariant)}
            theme={theme}
          />
        </View>

        {/* ---- Inbound / Outbound (Anypoint Monitoring style) ---- */}
        <Card style={styles.card} mode="contained">
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Icon name="arrow-down-bold" size={16} color={anypointColors.primary} />
              <Text variant="titleSmall" style={styles.sectionLabel}>Inbound</Text>
              {(messageCount != null || hasInboundHttpData) && (
                <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: anypointColors.primary + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                  <Icon name="database" size={10} color={anypointColors.primary} />
                  <Text style={{ fontSize: 9, fontWeight: '600', color: anypointColors.primary }}>InfluxDB</Text>
                </View>
              )}
            </View>
            <Divider style={{ marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Avg Response Time</Text>
                <Text variant="titleLarge" style={{ color: inboundAvgResponseTime != null ? anypointColors.primary : theme.colors.onSurface, fontWeight: '700' }}>
                  {inboundAvgResponseTime != null ? `${inboundAvgResponseTime}ms` : '—'}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {messageCount != null || inboundRequestCount != null ? 'Requests / Messages' : 'Message Count'}
                </Text>
                <Text variant="titleLarge" style={{ color: (messageCount != null || inboundRequestCount != null) ? anypointColors.primary : theme.colors.onSurface, fontWeight: '700' }}>
                  {inboundRequestCount != null
                    ? String(inboundRequestCount)
                    : messageCount != null ? String(messageCount) : '—'}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Errors</Text>
                <Text variant="titleLarge" style={{ color: (inboundErrorCount ?? 0) > 0 ? anypointColors.error : theme.colors.onSurface, fontWeight: '700' }}>
                  {inboundErrorCount != null ? String(inboundErrorCount) : '—'}
                </Text>
              </View>
            </View>
            {messageCount == null && !hasInboundHttpData && !dashStatsLoading && (
              <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.outlineVariant }}>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic', textAlign: 'center' }}>
                  Inbound metrics require Anypoint Monitoring or an active InfluxDB datasource
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>
        <Card style={styles.card} mode="contained">
          <Card.Content>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
              <Icon name="arrow-up-bold" size={16} color={anypointColors.accent} />
              <Text variant="titleSmall" style={styles.sectionLabel}>Outbound</Text>
              {hasOutboundData && (
                <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: anypointColors.accent + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                  <Icon name="database" size={10} color={anypointColors.accent} />
                  <Text style={{ fontSize: 9, fontWeight: '600', color: anypointColors.accent }}>InfluxDB</Text>
                </View>
              )}
            </View>
            <Divider style={{ marginBottom: 12 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Avg Response Time</Text>
                <Text variant="titleLarge" style={{ color: outboundAvgResponseTime != null ? anypointColors.accent : theme.colors.onSurface, fontWeight: '700' }}>
                  {outboundAvgResponseTime != null ? `${outboundAvgResponseTime}ms` : '—'}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Request Count</Text>
                <Text variant="titleLarge" style={{ color: outboundRequestCount != null ? anypointColors.accent : theme.colors.onSurface, fontWeight: '700' }}>
                  {outboundRequestCount != null ? String(outboundRequestCount) : '—'}
                </Text>
              </View>
              <View style={{ flex: 1, alignItems: 'center' }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Errors</Text>
                <Text variant="titleLarge" style={{ color: (outboundErrorCount ?? 0) > 0 ? anypointColors.error : theme.colors.onSurface, fontWeight: '700' }}>
                  {outboundErrorCount != null ? String(outboundErrorCount) : '—'}
                </Text>
              </View>
            </View>
            {!hasOutboundData && !dashStatsLoading && (
              <View style={{ marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.outlineVariant }}>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic', textAlign: 'center' }}>
                  Outbound metrics require Anypoint Monitoring or an active InfluxDB datasource
                </Text>
              </View>
            )}
          </Card.Content>
        </Card>

        {/* ---- Worker Info ---- */}
        <Card style={styles.card} mode="contained">
          <Card.Content>
            <Text variant="titleSmall" style={styles.sectionLabel}>
              Infrastructure
            </Text>
            <Divider style={{ marginVertical: 8 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Workers</Text>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                  {workerInfo.amount}x {workerInfo.typeName}
                </Text>
              </View>
              <View>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Mule Version</Text>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                  {getMuleVersion(app) || 'N/A'}
                </Text>
              </View>
              <View>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Region</Text>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                  {app?.region ?? 'N/A'}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* ---- CPU Chart ---- */}
        {hasRealCpu && (
          <Card style={styles.card} mode="contained">
            <Card.Content>
              <MiniChart
                data={cpuData.length > 0 ? cpuData : [cpuPercent]}
                maxValue={100}
                color={cpuPercent > 80 ? anypointColors.error : cpuPercent > 60 ? anypointColors.warning : anypointColors.primary}
                height={70}
                theme={theme}
                label="CPU Usage"
              />
            </Card.Content>
          </Card>
        )}

        {/* ---- Memory Chart ---- */}
        {hasRealMem && (
          <Card style={styles.card} mode="contained">
            <Card.Content>
              <MiniChart
                data={memData.length > 0 ? memData : [memPercent]}
                maxValue={100}
                color={memPercent > 80 ? anypointColors.error : memPercent > 60 ? anypointColors.warning : anypointColors.accent}
                height={70}
                theme={theme}
                label="Memory Usage"
              />
            </Card.Content>
          </Card>
        )}

        {/* ---- InfluxDB Metrics Summary (when InfluxDB data is available) ---- */}
        {hasInfluxData && (
          <Card style={styles.card} mode="contained">
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Icon name="database" size={16} color={anypointColors.primary} />
                <Text variant="titleSmall" style={styles.sectionLabel}>Monitoring Data</Text>
                <View style={{ marginLeft: 'auto', backgroundColor: anypointColors.success + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                  <Text style={{ fontSize: 9, fontWeight: '600', color: anypointColors.success }}>CONNECTED</Text>
                </View>
              </View>
              <Divider style={{ marginBottom: 12 }} />
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12 }}>
                {influxCpu != null && (
                  <View style={{ minWidth: 80 }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>CPU Usage</Text>
                    <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
                      {Math.round(influxCpu)}%
                    </Text>
                  </View>
                )}
                {influxMem != null && (
                  <View style={{ minWidth: 80 }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Memory Usage</Text>
                    <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
                      {Math.round(influxMem)}%
                    </Text>
                  </View>
                )}
                {influxThreadCount != null && (
                  <View style={{ minWidth: 80 }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Thread Count</Text>
                    <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
                      {Math.round(influxThreadCount)}
                    </Text>
                  </View>
                )}
                {influxHeapUsed != null && (
                  <View style={{ minWidth: 80 }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Heap Used</Text>
                    <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
                      {influxHeapUsed > 10_000 ? `${Math.round(influxHeapUsed / (1024 * 1024))} MB` : `${Math.round(influxHeapUsed)}`}
                    </Text>
                  </View>
                )}
                {messageCount != null && (
                  <View style={{ minWidth: 80 }}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Total Messages</Text>
                    <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
                      {messageCount}
                    </Text>
                  </View>
                )}
              </View>
            </Card.Content>
          </Card>
        )}

        {/* ---- JVM Metrics (combined CPU / Heap / Threads section) ---- */}
        {(hasRealCpu || hasRealMem || hasRealThreads) && (
          <Card style={styles.card} mode="contained">
            <Card.Content>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <Icon name="coffee" size={16} color={anypointColors.mulePurple} />
                <Text variant="titleSmall" style={styles.sectionLabel}>JVM</Text>
              </View>
              <Divider style={{ marginBottom: 12 }} />
              {/* JVM CPU */}
              {hasRealCpu && (
                <MiniChart
                  data={cpuData.length > 0 ? cpuData : [cpuPercent]}
                  maxValue={100}
                  color={anypointColors.primary}
                  height={55}
                  theme={theme}
                  label="CPU % Utilization"
                />
              )}
              {/* JVM Heap Used */}
              {hasRealMem && (
                <MiniChart
                  data={memData.length > 0 ? memData : [memPercent]}
                  maxValue={100}
                  color={anypointColors.accent}
                  height={55}
                  theme={theme}
                  label="Heap Used"
                  unit={memTotal > 0 ? ' MB' : '%'}
                />
              )}
              {/* JVM Thread Count */}
              {hasRealThreads && (
                <MiniChart
                  data={[threadCount]}
                  color={anypointColors.warning}
                  height={55}
                  theme={theme}
                  label="Thread Count"
                  unit=""
                />
              )}
            </Card.Content>
          </Card>
        )}

        {/* ---- Configured Resources (when no live metrics) ---- */}
        {!hasAnyMetrics && status === 'STARTED' && (
          <Card style={styles.card} mode="contained">
            <Card.Content>
              <Text variant="titleSmall" style={styles.sectionLabel}>
                Configured Resources
              </Text>
              <Divider style={{ marginVertical: 8 }} />
              <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                <View>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Worker Type</Text>
                  <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                    {workerInfo.typeName}
                  </Text>
                </View>
                <View>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Workers</Text>
                  <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                    {workerInfo.amount}
                  </Text>
                </View>
                <View>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Mule Version</Text>
                  <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                    {getMuleVersion(app) || 'N/A'}
                  </Text>
                </View>
              </View>
            </Card.Content>
          </Card>
        )}

        {/* ---- Performance Indicators ---- */}
        <Card style={styles.card} mode="contained">
          <Card.Content>
            <Text variant="titleSmall" style={styles.sectionLabel}>
              Health Indicators
            </Text>
            <Divider style={{ marginVertical: 8 }} />

            {/* CPU Health */}
            <View style={styles.healthRow}>
              <View style={styles.healthLabelRow}>
                <View style={[styles.healthDot, {
                  backgroundColor: !hasRealCpu ? theme.colors.onSurfaceVariant
                    : cpuPercent > 80 ? anypointColors.error : cpuPercent > 60 ? anypointColors.warning : anypointColors.success,
                }]} />
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>CPU Health</Text>
              </View>
              <Text
                variant="labelMedium"
                style={{
                  color: !hasRealCpu ? theme.colors.onSurfaceVariant
                    : cpuPercent > 80 ? anypointColors.error : cpuPercent > 60 ? anypointColors.warning : anypointColors.success,
                  fontWeight: '700',
                }}
              >
                {!hasRealCpu ? 'No data' : cpuPercent > 80 ? 'Critical' : cpuPercent > 60 ? 'Warning' : 'Healthy'}
              </Text>
            </View>
            {hasRealCpu && (
              <ProgressBar
                progress={Math.min(cpuPercent / 100, 1)}
                color={cpuPercent > 80 ? anypointColors.error : cpuPercent > 60 ? anypointColors.warning : anypointColors.success}
                style={styles.healthBar}
              />
            )}

            {/* Memory Health */}
            <View style={[styles.healthRow, { marginTop: 12 }]}>
              <View style={styles.healthLabelRow}>
                <View style={[styles.healthDot, {
                  backgroundColor: !hasRealMem ? theme.colors.onSurfaceVariant
                    : memPercent > 80 ? anypointColors.error : memPercent > 60 ? anypointColors.warning : anypointColors.success,
                }]} />
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>Memory Health</Text>
              </View>
              <Text
                variant="labelMedium"
                style={{
                  color: !hasRealMem ? theme.colors.onSurfaceVariant
                    : memPercent > 80 ? anypointColors.error : memPercent > 60 ? anypointColors.warning : anypointColors.success,
                  fontWeight: '700',
                }}
              >
                {!hasRealMem ? 'No data' : memPercent > 80 ? 'Critical' : memPercent > 60 ? 'Warning' : 'Healthy'}
              </Text>
            </View>
            {hasRealMem && (
              <ProgressBar
                progress={Math.min(memPercent / 100, 1)}
                color={memPercent > 80 ? anypointColors.error : memPercent > 60 ? anypointColors.warning : anypointColors.success}
                style={styles.healthBar}
              />
            )}

            {/* Overall Status */}
            <View style={[styles.healthRow, { marginTop: 12 }]}>
              <View style={styles.healthLabelRow}>
                <View style={[styles.healthDot, { backgroundColor: sColor }]} />
                <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>Application Status</Text>
              </View>
              <Text variant="labelMedium" style={{ color: sColor, fontWeight: '700' }}>
                {getStatusLabel(status)}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* ---- Per-Worker Details ---- */}
        {numWorkers > 0 && (
          <Card style={styles.card} mode="contained">
            <Card.Content>
              <Text variant="titleSmall" style={styles.sectionLabel}>
                Worker Details ({numWorkers} worker{numWorkers !== 1 ? 's' : ''})
              </Text>
              <Divider style={{ marginVertical: 8 }} />
              {workerStatuses.map((worker: any, idx: number) => {
                const rawStats = worker?.statisticsByWorker ?? worker?.statistics ?? {};
                const wStats = flattenWorkerStats(rawStats);
                const wCpu = extractNumericValue(wStats?.cpuPercentageUsed) || extractNumericValue(wStats?.cpu);
                const wMem = extractNumericValue(wStats?.memoryPercentageUsed);
                const wMemUsed = extractNumericValue(wStats?.memoryTotalUsed);
                const wMemMax = extractNumericValue(wStats?.memoryTotalMax);
                const wMemUsedMB = wMemUsed > 10_000 ? Math.round(wMemUsed / (1024 * 1024)) : wMemUsed;
                const wMemMaxMB = wMemMax > 10_000 ? Math.round(wMemMax / (1024 * 1024)) : wMemMax;
                const wThreads = extractNumericValue(wStats?.threadCount);
                const wStatus = worker?.status ?? 'UNKNOWN';
                const wRegion = worker?.deployedRegion ?? worker?.region ?? '';
                const wHost = worker?.host ?? '';
                const wPort = worker?.port ?? '';

                return (
                  <View
                    key={worker?.id ?? `worker-${idx}`}
                    style={{
                      marginBottom: idx < numWorkers - 1 ? 12 : 0,
                      paddingBottom: idx < numWorkers - 1 ? 12 : 0,
                      borderBottomWidth: idx < numWorkers - 1 ? StyleSheet.hairlineWidth : 0,
                      borderBottomColor: theme.colors.outlineVariant,
                    }}
                  >
                    {/* Worker header */}
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <Icon name="server" size={14} color={theme.colors.onSurfaceVariant} />
                        <Text variant="labelMedium" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                          Worker {idx + 1}
                        </Text>
                      </View>
                      <View style={{
                        paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
                        backgroundColor: (wStatus === 'STARTED' ? anypointColors.success : anypointColors.error) + '20',
                      }}>
                        <Text style={{
                          fontSize: 10, fontWeight: '700',
                          color: wStatus === 'STARTED' ? anypointColors.success : anypointColors.error,
                        }}>
                          {wStatus}
                        </Text>
                      </View>
                    </View>

                    {/* Worker stats */}
                    <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                      {wHost ? (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                          Host: {wHost}{wPort ? `:${wPort}` : ''}
                        </Text>
                      ) : null}
                      {wRegion ? (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>
                          Region: {wRegion}
                        </Text>
                      ) : null}
                    </View>

                    {/* CPU bar */}
                    <View style={{ marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>CPU</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                          {Math.round(wCpu)}%
                        </Text>
                      </View>
                      <ProgressBar
                        progress={Math.min(wCpu / 100, 1)}
                        color={wCpu > 80 ? anypointColors.error : wCpu > 60 ? anypointColors.warning : anypointColors.primary}
                        style={styles.healthBar}
                      />
                    </View>

                    {/* Memory bar */}
                    <View style={{ marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Memory</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                          {Math.round(wMem)}% {wMemMaxMB > 0 ? `(${wMemUsedMB}/${wMemMaxMB} MB)` : ''}
                        </Text>
                      </View>
                      <ProgressBar
                        progress={Math.min(wMem / 100, 1)}
                        color={wMem > 80 ? anypointColors.error : wMem > 60 ? anypointColors.warning : anypointColors.accent}
                        style={styles.healthBar}
                      />
                    </View>

                    {/* Threads */}
                    {wThreads > 0 && (
                      <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Threads: {wThreads}
                      </Text>
                    )}
                  </View>
                );
              })}
            </Card.Content>
          </Card>
        )}

        {/* ---- Application Details ---- */}
        <Card style={styles.card} mode="contained">
          <Card.Content>
            <Text variant="titleSmall" style={styles.sectionLabel}>
              Application Details
            </Text>
            <Divider style={{ marginVertical: 8 }} />
            {[
              { label: 'Domain', value: (app as any)?.domain },
              { label: 'Full Domain', value: (app as any)?.fullDomain },
              { label: 'Last Updated', value: (app as any)?.lastUpdateTime ? new Date((app as any).lastUpdateTime).toLocaleString() : undefined },
              { label: 'Deploy Date', value: (app as any)?.deploymentUpdateDate ? new Date((app as any).deploymentUpdateDate).toLocaleString() : undefined },
              { label: 'Runtime Version', value: getMuleVersion(app) },
              { label: 'Region', value: (app as any)?.region },
              { label: 'Persistent Queues', value: (app as any)?.persistentQueues != null ? ((app as any).persistentQueues ? 'Enabled' : 'Disabled') : undefined },
              { label: 'Object Store V2', value: (app as any)?.objectStoreV2 != null ? ((app as any).objectStoreV2 ? 'Enabled' : 'Disabled') : undefined },
              { label: 'Monitoring Enabled', value: (app as any)?.monitoringEnabled != null ? ((app as any).monitoringEnabled ? 'Yes' : 'No') : undefined },
              { label: 'Static IPs', value: (app as any)?.staticIPsEnabled != null ? ((app as any).staticIPsEnabled ? 'Enabled' : 'Disabled') : undefined },
            ]
              .filter((item) => item.value != null && item.value !== '')
              .map((item) => (
                <View key={item.label} style={{ flexDirection: 'row', paddingVertical: 4 }}>
                  <Text
                    variant="labelSmall"
                    style={{ color: theme.colors.onSurfaceVariant, width: 140 }}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurface, flex: 1 }}
                    numberOfLines={1}
                  >
                    {item.value}
                  </Text>
                </View>
              ))}
          </Card.Content>
        </Card>

        {/* ---- Properties Summary ---- */}
        {app?.properties && Object.keys(app.properties).length > 0 && (
          <Card style={styles.card} mode="contained">
            <Card.Content>
              <Text variant="titleSmall" style={styles.sectionLabel}>
                Properties ({Object.keys(app.properties).length})
              </Text>
              <Divider style={{ marginVertical: 8 }} />
              {Object.entries(app.properties as Record<string, string>).slice(0, 8).map(([key, value]) => (
                <View key={key} style={{ flexDirection: 'row', paddingVertical: 4 }}>
                  <Text
                    variant="labelSmall"
                    style={{ color: theme.colors.onSurfaceVariant, width: 140 }}
                    numberOfLines={1}
                  >
                    {key}
                  </Text>
                  <Text
                    variant="bodySmall"
                    style={{ color: theme.colors.onSurface, flex: 1 }}
                    numberOfLines={1}
                  >
                    {typeof value === 'string' && value.includes('****') ? '********' : String(value ?? '')}
                  </Text>
                </View>
              ))}
              {Object.keys(app.properties).length > 8 && (
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
                  +{Object.keys(app.properties).length - 8} more properties
                </Text>
              )}
            </Card.Content>
          </Card>
        )}
      </ScrollView>
    </View>
  );
};

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      paddingBottom: 32,
    },
    statusCard: {
      marginHorizontal: 16,
      marginTop: 8,
      borderLeftWidth: 4,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      elevation: 0,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
    },
    dateRangeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexWrap: 'wrap',
      gap: 6,
    },
    dateChip: {
      borderColor: theme.colors.outline,
    },
    dateChipText: {
      fontSize: 12,
      color: theme.colors.onSurfaceVariant,
    },
    metricsRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      gap: 10,
      marginBottom: 12,
    },
    card: {
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      elevation: 0,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
    },
    sectionLabel: {
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    healthRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    healthLabelRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    healthDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    healthBar: {
      height: 4,
      borderRadius: 2,
      backgroundColor: theme.colors.surfaceVariant,
    },
  });

export default AppMonitoringDetailScreen;
