// ============================================================
// App Monitoring Detail Screen
// Tab-based dashboard for a single application with
// Overview, Inbound, Outbound, JVM, Infrastructure tabs.
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import { View, ScrollView, StyleSheet, RefreshControl, Dimensions, useWindowDimensions } from 'react-native';
import { Appbar, Text, Card, Chip, useTheme, ProgressBar, Divider, type MD3Theme } from 'react-native-paper';
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
// Tab definitions
// ---------------------------------------------------------------------------

type TabId = 'overview' | 'inbound' | 'outbound' | 'jvm' | 'infrastructure';

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: 'overview', label: 'Overview', icon: 'view-dashboard-outline' },
  { id: 'inbound', label: 'Inbound', icon: 'arrow-down-bold' },
  { id: 'outbound', label: 'Outbound', icon: 'arrow-up-bold' },
  { id: 'jvm', label: 'JVM', icon: 'coffee' },
  { id: 'infrastructure', label: 'Infra', icon: 'server' },
];

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
// Simple Line Chart (pure React Native visualization)
// ---------------------------------------------------------------------------

interface SimpleLineChartProps {
  data: number[];
  maxValue?: number;
  color: string;
  height?: number;
  theme: MD3Theme;
  label: string;
  unit?: string;
  fillOpacity?: number;
}

const SimpleLineChart: React.FC<SimpleLineChartProps> = ({
  data, maxValue, color, height = 80, theme, label, unit = '%', fillOpacity = 0.1
}) => {
  const chartWidth = SCREEN_WIDTH - 80;
  const max = maxValue ?? Math.max(...data, 1);
  const latestValue = data.length > 0 ? data[data.length - 1] : 0;
  const minValue = data.length > 0 ? Math.min(...data) : 0;
  const avgValue = data.length > 0 ? data.reduce((a, b) => a + b, 0) / data.length : 0;

  const points = data.map((value, idx) => ({
    x: (idx / Math.max(data.length - 1, 1)) * chartWidth,
    y: height - Math.max(1, (value / max) * height),
  }));

  return (
    <View style={{ marginBottom: 16 }}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
          {label}
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
          <Text variant="titleMedium" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
            {unit === ' MB' ? Math.round(latestValue).toLocaleString() : Math.round(latestValue)}
          </Text>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{unit}</Text>
        </View>
      </View>
      {data.length > 1 && (
        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 6 }}>
          <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant }}>
            Min: {Math.round(minValue)}{unit}
          </Text>
          <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant }}>
            Avg: {Math.round(avgValue)}{unit}
          </Text>
          <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant }}>
            Max: {Math.round(Math.max(...data))}{unit}
          </Text>
        </View>
      )}
      <View
        style={{
          height,
          backgroundColor: theme.colors.surfaceVariant + '40',
          borderRadius: 8,
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {[0.25, 0.5, 0.75].map((pct) => (
          <View
            key={pct}
            style={{
              position: 'absolute',
              top: height * pct,
              left: 0,
              right: 0,
              height: StyleSheet.hairlineWidth,
              backgroundColor: theme.colors.outlineVariant,
              opacity: 0.5,
            }}
          />
        ))}
        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0 }}>
          {points.map((point, idx) => {
            if (idx >= points.length - 1) return null;
            const nextPoint = points[idx + 1];
            const segWidth = nextPoint.x - point.x;
            const maxY = Math.max(height - point.y, height - nextPoint.y);
            return (
              <View
                key={`fill-${idx}`}
                style={{
                  position: 'absolute',
                  left: point.x,
                  bottom: 0,
                  width: segWidth + 1,
                  height: maxY,
                  backgroundColor: color,
                  opacity: fillOpacity,
                }}
              />
            );
          })}
        </View>
        {points.map((point, idx) => (
          <React.Fragment key={idx}>
            {idx < points.length - 1 && (() => {
              const nextPoint = points[idx + 1];
              const dx = nextPoint.x - point.x;
              const dy = nextPoint.y - point.y;
              const length = Math.sqrt(dx * dx + dy * dy);
              const angle = Math.atan2(dy, dx) * (180 / Math.PI);
              return (
                <View
                  style={{
                    position: 'absolute',
                    left: point.x,
                    top: point.y,
                    width: length,
                    height: 2,
                    backgroundColor: color,
                    transformOrigin: 'left center',
                    transform: [{ rotate: `${angle}deg` }],
                  }}
                />
              );
            })()}
            {(idx === points.length - 1 || data.length <= 10) && (
              <View
                style={{
                  position: 'absolute',
                  left: point.x - 3,
                  top: point.y - 3,
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: color,
                  borderWidth: 1.5,
                  borderColor: theme.colors.surface,
                }}
              />
            )}
          </React.Fragment>
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

function extractNumericValue(val: any, fallback: number = 0): number {
  if (val == null) return fallback;
  if (typeof val === 'number') return val;
  if (typeof val === 'object' && !Array.isArray(val)) {
    const keys = Object.keys(val);
    if (keys.length === 0) return fallback;
    const sorted = keys.sort((a, b) => Number(b) - Number(a));
    const latest = val[sorted[0]];
    return typeof latest === 'number' ? latest : fallback;
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : fallback;
}

function extractOptionalNumericValue(val: any): number | null {
  if (val == null) return null;
  if (typeof val === 'number') return Number.isFinite(val) ? val : null;
  if (typeof val === 'object' && !Array.isArray(val)) {
    const keys = Object.keys(val);
    if (keys.length === 0) return null;
    const sorted = keys.sort((a, b) => Number(b) - Number(a));
    const latest = val[sorted[0]];
    return typeof latest === 'number' && Number.isFinite(latest) ? latest : null;
  }
  const num = Number(val);
  return Number.isFinite(num) ? num : null;
}

function flattenWorkerStats(raw: any): Record<string, any> {
  if (!raw || typeof raw !== 'object') return {};
  const metricKeys = ['cpu', 'cpuPercentageUsed', 'memoryTotalUsed', 'memoryPercentageUsed', 'memoryTotalMax', 'threadCount'];
  const hasDirectMetric = metricKeys.some((k) => k in raw);
  if (hasDirectMetric) return raw;
  const values = Object.values(raw);
  if (values.length > 0 && values[0] && typeof values[0] === 'object') {
    return values[0] as Record<string, any>;
  }
  return raw;
}

function parseConfiguredMemoryToMB(value: unknown): number | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const match = trimmed.match(/^([\d.]+)\s*([A-Za-z]+)?$/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount)) return null;
  const unit = (match[2] ?? 'MB').toUpperCase();
  if (unit === 'GB' || unit === 'GIB') return Math.round(amount * 1024);
  if (unit === 'MB' || unit === 'MIB') return Math.round(amount);
  if (unit === 'KB' || unit === 'KIB') return Math.round(amount / 1024);
  return Math.round(amount);
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

  // Process metrics data into simple number arrays for charts
  const cpuData = useMemo(() => {
    if (!cpuMetrics) return [];
    if (Array.isArray(cpuMetrics)) {
      if (cpuMetrics.length === 0) return [];
      if (cpuMetrics[0]?.value !== undefined) return cpuMetrics.map((p: any) => p.value ?? 0);
      if (cpuMetrics[0]?.data) return cpuMetrics[0].data.map((p: any) => p.value ?? p.y ?? 0);
      if (typeof cpuMetrics[0] === 'number') return cpuMetrics;
    }
    return [];
  }, [cpuMetrics]);

  const memData = useMemo(() => {
    if (!memoryMetrics) return [];
    if (Array.isArray(memoryMetrics)) {
      if (memoryMetrics.length === 0) return [];
      if (memoryMetrics[0]?.value !== undefined) return memoryMetrics.map((p: any) => p.value ?? 0);
      if (memoryMetrics[0]?.data) return memoryMetrics[0].data.map((p: any) => p.value ?? p.y ?? 0);
      if (typeof memoryMetrics[0] === 'number') return memoryMetrics;
    }
    return [];
  }, [memoryMetrics]);

  // Derived values
  const status = app?.status ?? 'UNKNOWN';
  const sColor = getStatusColor(status);
  const workerInfo = useMemo(() => getWorkerInfo(app), [app]);
  const configuredCpu = (app as any)?.workers?.type?.cpu ? String((app as any).workers.type.cpu) : null;
  const configuredMemory = (app as any)?.workers?.type?.memory ? String((app as any).workers.type.memory) : null;
  const configuredMemoryMB = parseConfiguredMemoryToMB(configuredMemory);

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

  const normalizedExtraMetrics = useMemo(() => dashStats?._extraMetrics ?? null, [dashStats]);
  const observabilityMetrics = useMemo(() => dashStats?._appMetrics ?? null, [dashStats]);
  const jvmMetrics = useMemo(() => dashStats?._jvmMetrics ?? null, [dashStats]);

  const rawCpuPercent =
    normalizedExtraMetrics?.cpuPercent
    ?? jvmMetrics?.cpuUsage
    ?? workerStats?.cpuPercentageUsed
    ?? workerStats?.cpu
    ?? workerStats?.cpuUsage
    ?? (cpuData.length > 0 ? cpuData[cpuData.length - 1] : null);
  const cpuPercent = rawCpuPercent != null ? Number(rawCpuPercent) : null;

  const memTotalRaw = Number(
    normalizedExtraMetrics?.memoryTotal
    ?? jvmMetrics?.heapMax
    ?? jvmMetrics?.heapCommitted
    ?? workerStats?.memoryTotalMax
  ) || extractNumericValue(workerStats?.memoryTotalMax);
  const memUsedRaw = Number(
    normalizedExtraMetrics?.memoryUsed
    ?? jvmMetrics?.heapUsed
    ?? workerStats?.memoryTotalUsed
    ?? workerStats?.memoryUsage
  ) || extractNumericValue(workerStats?.memoryTotalUsed) || extractNumericValue(workerStats?.memoryUsage);
  const memTotal = memTotalRaw > 10_000 ? Math.round(memTotalRaw / (1024 * 1024)) : memTotalRaw;
  const memUsage = memUsedRaw > 10_000 ? Math.round(memUsedRaw / (1024 * 1024)) : memUsedRaw;
  const rawMemPercent =
    normalizedExtraMetrics?.memoryPercent
    ?? workerStats?.memoryPercentageUsed
    ?? (memTotal > 0 && memUsage > 0 ? Math.round((memUsage / memTotal) * 100) : null)
    ?? (memData.length > 0 ? memData[memData.length - 1] : null);
  const memPercent = rawMemPercent != null ? Number(rawMemPercent) : null;

  const rawThreadCount =
    normalizedExtraMetrics?.threadCount
    ?? jvmMetrics?.threadCount
    ?? workerStats?.threadCount
    ?? extractNumericValue(workerStats?.threadCount);
  const threadCount = rawThreadCount != null ? Number(rawThreadCount) : null;
  const workerStatuses = (app as any)?.workerStatuses ?? [];
  const numWorkers = workerStatuses.length;

  // ── Extract InfluxDB data ──
  const influxData = useMemo(() => {
    if (!dashStats) return null;
    if (dashStats._timeSeries || dashStats._extraMetrics) {
      return { timeSeries: dashStats._timeSeries ?? [], extraMetrics: dashStats._extraMetrics ?? {} };
    }
    return null;
  }, [dashStats]);

  const messageCount = influxData?.extraMetrics?.messageCount ?? observabilityMetrics?.messageCount ?? null;
  const influxThreadCount = influxData?.extraMetrics?.threadCount ?? jvmMetrics?.threadCount ?? null;
  const influxHeapUsed = influxData?.extraMetrics?.heapUsed ?? jvmMetrics?.heapUsed ?? null;
  const inboundAvgResponseTime = influxData?.extraMetrics?.inboundAvgResponseTime ?? observabilityMetrics?.inboundAvgResponseTime ?? null;
  const inboundRequestCount = influxData?.extraMetrics?.inboundRequestCount ?? observabilityMetrics?.inboundRequestCount ?? null;
  const inboundErrorCount = influxData?.extraMetrics?.inboundErrorCount ?? observabilityMetrics?.errorCount ?? (
    (inboundAvgResponseTime != null || inboundRequestCount != null || messageCount != null) ? 0 : null
  );
  const outboundAvgResponseTime = influxData?.extraMetrics?.outboundAvgResponseTime ?? observabilityMetrics?.outboundAvgResponseTime ?? null;
  const outboundRequestCount = influxData?.extraMetrics?.outboundRequestCount ?? observabilityMetrics?.outboundRequestCount ?? null;
  const outboundErrorCount = influxData?.extraMetrics?.outboundErrorCount ?? (
    (outboundAvgResponseTime != null || outboundRequestCount != null) ? 0 : null
  );
  const hasOutboundData = outboundAvgResponseTime != null || outboundRequestCount != null || outboundErrorCount != null;
  const hasInboundHttpData = inboundAvgResponseTime != null || inboundRequestCount != null || inboundErrorCount != null;

  const influxCpu = useMemo(() => {
    if (!influxData?.timeSeries) return null;
    const cpuPts = influxData.timeSeries.filter((p: any) => p.cpu != null);
    return cpuPts.length > 0 ? cpuPts[cpuPts.length - 1].cpu : null;
  }, [influxData]);

  const influxMem = useMemo(() => {
    if (!influxData?.timeSeries) return null;
    const memPts = influxData.timeSeries.filter((p: any) => p.memory != null);
    return memPts.length > 0 ? memPts[memPts.length - 1].memory : null;
  }, [influxData]);

  // ── Chart series ──
  const inboundRequestSeries = useMemo(() => {
    if (!influxData?.timeSeries) return [];
    return influxData.timeSeries
      .filter((p: any) => p.inboundRequests != null || p.inbound_request_count != null)
      .map((p: any) => p.inboundRequests ?? p.inbound_request_count ?? 0);
  }, [influxData]);

  const inboundResponseTimeSeries = useMemo(() => {
    if (!influxData?.timeSeries) return [];
    return influxData.timeSeries
      .filter((p: any) => p.inboundResponseTime != null || p.inbound_avg_response_time != null)
      .map((p: any) => p.inboundResponseTime ?? p.inbound_avg_response_time ?? 0);
  }, [influxData]);

  const outboundRequestSeries = useMemo(() => {
    if (!influxData?.timeSeries) return [];
    return influxData.timeSeries
      .filter((p: any) => p.outboundRequests != null || p.outbound_request_count != null)
      .map((p: any) => p.outboundRequests ?? p.outbound_request_count ?? 0);
  }, [influxData]);

  const outboundResponseTimeSeries = useMemo(() => {
    if (!influxData?.timeSeries) return [];
    return influxData.timeSeries
      .filter((p: any) => p.outboundResponseTime != null || p.outbound_avg_response_time != null)
      .map((p: any) => p.outboundResponseTime ?? p.outbound_avg_response_time ?? 0);
  }, [influxData]);

  const jvmCpuSeries = useMemo(() => {
    if (cpuData.length > 0) return cpuData;
    if (!influxData?.timeSeries) return [];
    return influxData.timeSeries.filter((p: any) => p.cpu != null).map((p: any) => p.cpu ?? 0);
  }, [cpuData, influxData]);

  const jvmHeapSeries = useMemo(() => {
    if (memData.length > 0) return memData;
    if (!influxData?.timeSeries) return [];
    return influxData.timeSeries
      .filter((p: any) => p.memory != null || p.heapUsed != null)
      .map((p: any) => {
        const val = p.memory ?? p.heapUsed ?? 0;
        return val > 10_000 ? val / (1024 * 1024) : val;
      });
  }, [memData, influxData]);

  const jvmThreadSeries = useMemo(() => {
    if (!influxData?.timeSeries) return threadCount != null ? [threadCount] : [];
    return influxData.timeSeries
      .filter((p: any) => p.threadCount != null || p.threads != null)
      .map((p: any) => p.threadCount ?? p.threads ?? 0);
  }, [influxData, threadCount]);

  // Detect real metrics availability
  const hasRealCpu = cpuPercent != null || cpuData.length > 0 || influxCpu != null;
  const hasRealMem = memPercent != null || normalizedExtraMetrics?.memoryUsed != null || jvmMetrics?.heapUsed != null || workerStats?.memoryTotalUsed != null || workerStats?.memoryUsage != null || memData.length > 0 || influxMem != null;
  const hasRealThreads = normalizedExtraMetrics?.threadCount != null || workerStats?.threadCount != null || influxThreadCount != null;
  const hasInfluxData = messageCount != null || influxCpu != null || influxMem != null || influxThreadCount != null;
  const hasAnyMetrics = hasRealCpu || hasRealMem || hasRealThreads || hasInfluxData;
  const hasConfiguredSystemData = !hasRealCpu && !hasRealMem && (configuredCpu != null || configuredMemory != null);
  const configuredCpuProgress = configuredCpu ? 1 : 0;
  const configuredMemProgress = configuredMemory ? 1 : 0;

  // JVM extra metrics
  const jvmGcCollections = influxData?.extraMetrics?.gcCollections ?? jvmMetrics?.gcCollections ?? null;
  const jvmGcTime = influxData?.extraMetrics?.gcTime ?? jvmMetrics?.gcTime ?? null;
  const jvmClassesLoaded = influxData?.extraMetrics?.classesLoaded ?? jvmMetrics?.classesLoaded ?? null;
  const jvmHeapCommitted = influxData?.extraMetrics?.heapCommitted ?? jvmMetrics?.heapCommitted ?? jvmMetrics?.heapMax ?? null;
  const jvmNonHeapUsed = influxData?.extraMetrics?.nonHeapUsed ?? jvmMetrics?.nonHeapUsed ?? null;

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
  // TAB CONTENT RENDERERS
  // ===========================================================================

  const renderOverviewTab = () => (
    <>
      {/* Monitoring unavailable banner */}
      {!hasAnyMetrics && status === 'STARTED' && !cpuLoading && !memLoading && !dashStatsLoading && (
        <Card style={styles.card} mode="contained">
          <Card.Content style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 }}>
            <Icon name="information-outline" size={18} color={anypointColors.warning} />
            <View style={{ flex: 1 }}>
              <Text variant="labelMedium" style={{ color: theme.colors.onSurface, fontWeight: '600', marginBottom: 2 }}>
                Live system metrics unavailable
              </Text>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
                This environment exposes application traffic metrics, but not live per-app CPU, memory, or JVM telemetry through the available monitoring APIs. Configured worker resources are shown where available.
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Overview Metric Cards */}
      <View style={styles.metricsRow}>
        <MetricCard
          title={hasRealCpu ? 'CPU' : configuredCpu ? 'CPU Limit' : 'CPU'}
          value={hasRealCpu && cpuVal != null ? `${Math.round(cpuVal)}%` : configuredCpu ?? 'N/A'}
          subtitle={!hasRealCpu && configuredCpu ? 'Configured' : undefined}
          icon="chip"
          color={hasRealCpu
            ? ((cpuVal ?? 0) > 80 ? anypointColors.error : (cpuVal ?? 0) > 60 ? anypointColors.warning : anypointColors.primary)
            : configuredCpu ? anypointColors.secondary : theme.colors.onSurfaceVariant}
          theme={theme}
        />
        <MetricCard
          title={hasRealMem ? 'Memory' : configuredMemory ? 'Memory Limit' : 'Memory'}
          value={hasRealMem && memVal != null ? `${Math.round(memVal)}%` : configuredMemory ?? 'N/A'}
          subtitle={hasRealMem && memTotal > 0 ? `${memUsage}/${memTotal} MB` : (!hasRealMem && configuredMemory ? 'Configured' : undefined)}
          icon="memory"
          color={hasRealMem
            ? ((memVal ?? 0) > 80 ? anypointColors.error : (memVal ?? 0) > 60 ? anypointColors.warning : anypointColors.accent)
            : configuredMemory ? anypointColors.secondary : theme.colors.onSurfaceVariant}
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

      {/* Health Indicators */}
      <Card style={styles.card} mode="contained">
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Icon name="heart-pulse" size={16} color={anypointColors.primary} />
            <Text variant="titleSmall" style={styles.sectionLabel}>Health Indicators</Text>
          </View>
          <Divider style={{ marginBottom: 12 }} />

          {/* CPU Health */}
          <View style={styles.healthRow}>
            <View style={styles.healthLabelRow}>
              <View style={[styles.healthDot, { backgroundColor: cpuHealthColor }]} />
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>CPU Health</Text>
            </View>
            <Text variant="labelMedium" style={{ color: cpuHealthColor, fontWeight: '700' }}>
              {cpuHealthLabel}
            </Text>
          </View>
          {hasRealCpu && (
            <ProgressBar
              progress={Math.min(cpuVal / 100, 1)}
              color={cpuHealthColor}
              style={styles.healthBar}
            />
          )}
          {!hasRealCpu && configuredCpu && (
            <>
              <ProgressBar
                progress={configuredCpuProgress}
                color={anypointColors.secondary}
                style={styles.healthBar}
              />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
                Configured CPU limit: {configuredCpu}
              </Text>
            </>
          )}

          {/* Memory Health */}
          <View style={[styles.healthRow, { marginTop: 14 }]}>
            <View style={styles.healthLabelRow}>
              <View style={[styles.healthDot, { backgroundColor: memHealthColor }]} />
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurface }}>Memory Health</Text>
            </View>
            <Text variant="labelMedium" style={{ color: memHealthColor, fontWeight: '700' }}>
              {memHealthLabel}
            </Text>
          </View>
          {hasRealMem && (
            <ProgressBar
              progress={Math.min(memVal / 100, 1)}
              color={memHealthColor}
              style={styles.healthBar}
            />
          )}
          {!hasRealMem && configuredMemory && (
            <>
              <ProgressBar
                progress={configuredMemProgress}
                color={anypointColors.secondary}
                style={styles.healthBar}
              />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
                Configured memory limit: {configuredMemory}
              </Text>
            </>
          )}

          {/* Application Status */}
          <View style={[styles.healthRow, { marginTop: 14 }]}>
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

      {/* CPU + Memory Charts (quick overview) */}
      {hasRealCpu && (
        <Card style={styles.card} mode="contained">
          <Card.Content>
            <SimpleLineChart
              data={cpuData.length > 0 ? cpuData : cpuPercent != null ? [cpuPercent] : []}
              maxValue={100}
              color={(cpuPercent ?? 0) > 80 ? anypointColors.error : (cpuPercent ?? 0) > 60 ? anypointColors.warning : anypointColors.primary}
              height={70}
              theme={theme}
              label="CPU Usage"
            />
          </Card.Content>
        </Card>
      )}
      {hasRealMem && (
        <Card style={styles.card} mode="contained">
          <Card.Content>
            <SimpleLineChart
              data={memData.length > 0 ? memData : memPercent != null ? [memPercent] : []}
              maxValue={100}
              color={(memPercent ?? 0) > 80 ? anypointColors.error : (memPercent ?? 0) > 60 ? anypointColors.warning : anypointColors.accent}
              height={70}
              theme={theme}
              label="Memory Usage"
            />
          </Card.Content>
        </Card>
      )}

      {/* Application Details */}
      <Card style={styles.card} mode="contained">
        <Card.Content>
          <Text variant="titleSmall" style={styles.sectionLabel}>Application Details</Text>
          <Divider style={{ marginVertical: 8 }} />
          {[
            { label: 'Domain', value: (app as any)?.domain },
            { label: 'Full Domain', value: (app as any)?.fullDomain },
            { label: 'Last Updated', value: (app as any)?.lastUpdateTime ? new Date((app as any).lastUpdateTime).toLocaleString() : undefined },
            { label: 'Runtime Version', value: getMuleVersion(app) },
            { label: 'Region', value: (app as any)?.region },
            { label: 'Monitoring Enabled', value: (app as any)?.monitoringEnabled != null ? ((app as any).monitoringEnabled ? 'Yes' : 'No') : undefined },
          ]
            .filter((item) => item.value != null && item.value !== '')
            .map((item) => (
              <View key={item.label} style={{ flexDirection: 'row', paddingVertical: 4 }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, width: 140 }} numberOfLines={1}>
                  {item.label}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurface, flex: 1 }} numberOfLines={1}>
                  {item.value}
                </Text>
              </View>
            ))}
        </Card.Content>
      </Card>
    </>
  );

  const renderInboundTab = () => (
    <>
      <Card style={styles.card} mode="contained">
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Icon name="arrow-down-bold" size={16} color={anypointColors.primary} />
            <Text variant="titleSmall" style={styles.sectionLabel}>Inbound Metrics</Text>
            {(messageCount != null || hasInboundHttpData) && (
              <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: anypointColors.primary + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                <Icon name="database" size={10} color={anypointColors.primary} />
                <Text style={{ fontSize: 9, fontWeight: '600', color: anypointColors.primary }}>Monitoring API</Text>
              </View>
            )}
          </View>
          <Divider style={{ marginBottom: 12 }} />

          {/* Summary stats */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Avg Response Time</Text>
              <Text variant="titleLarge" style={{ color: inboundAvgResponseTime != null ? anypointColors.primary : theme.colors.onSurface, fontWeight: '700' }}>
                {inboundAvgResponseTime != null ? `${inboundAvgResponseTime}ms` : '\u2014'}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {inboundRequestCount != null ? 'Total Requests' : 'Messages'}
              </Text>
              <Text variant="titleLarge" style={{ color: (messageCount != null || inboundRequestCount != null) ? anypointColors.primary : theme.colors.onSurface, fontWeight: '700' }}>
                {inboundRequestCount != null ? String(inboundRequestCount) : messageCount != null ? String(messageCount) : '\u2014'}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Errors</Text>
              <Text variant="titleLarge" style={{ color: (inboundErrorCount ?? 0) > 0 ? anypointColors.error : theme.colors.onSurface, fontWeight: '700' }}>
                {inboundErrorCount != null ? String(inboundErrorCount) : '\u2014'}
              </Text>
            </View>
          </View>

          {/* Charts */}
          {inboundRequestSeries.length > 1 && (
            <SimpleLineChart
              data={inboundRequestSeries}
              color={anypointColors.primary}
              height={80}
              theme={theme}
              label="Total Requests"
              unit=""
            />
          )}
          {inboundResponseTimeSeries.length > 1 && (
            <SimpleLineChart
              data={inboundResponseTimeSeries}
              color={anypointColors.secondary}
              height={80}
              theme={theme}
              label="Average Response Time"
              unit="ms"
            />
          )}

          {messageCount == null && !hasInboundHttpData && !dashStatsLoading && (
            <View style={{ paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.outlineVariant }}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic', textAlign: 'center' }}>
                No inbound HTTP latency or error series are exposed for this application in the current monitoring APIs.
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>
    </>
  );

  const renderOutboundTab = () => (
    <>
      <Card style={styles.card} mode="contained">
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Icon name="arrow-up-bold" size={16} color={anypointColors.accent} />
            <Text variant="titleSmall" style={styles.sectionLabel}>Outbound Metrics</Text>
            {hasOutboundData && (
              <View style={{ marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: anypointColors.accent + '15', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 }}>
                <Icon name="database" size={10} color={anypointColors.accent} />
                <Text style={{ fontSize: 9, fontWeight: '600', color: anypointColors.accent }}>Monitoring API</Text>
              </View>
            )}
          </View>
          <Divider style={{ marginBottom: 12 }} />

          {/* Summary stats */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 16 }}>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Avg Response Time</Text>
              <Text variant="titleLarge" style={{ color: outboundAvgResponseTime != null ? anypointColors.accent : theme.colors.onSurface, fontWeight: '700' }}>
                {outboundAvgResponseTime != null ? `${outboundAvgResponseTime}ms` : '\u2014'}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Total Requests</Text>
              <Text variant="titleLarge" style={{ color: outboundRequestCount != null ? anypointColors.accent : theme.colors.onSurface, fontWeight: '700' }}>
                {outboundRequestCount != null ? String(outboundRequestCount) : '\u2014'}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Errors</Text>
              <Text variant="titleLarge" style={{ color: (outboundErrorCount ?? 0) > 0 ? anypointColors.error : theme.colors.onSurface, fontWeight: '700' }}>
                {outboundErrorCount != null ? String(outboundErrorCount) : '\u2014'}
              </Text>
            </View>
          </View>

          {/* Charts */}
          {outboundRequestSeries.length > 1 && (
            <SimpleLineChart
              data={outboundRequestSeries}
              color={anypointColors.accent}
              height={80}
              theme={theme}
              label="Total Requests"
              unit=""
            />
          )}
          {outboundResponseTimeSeries.length > 1 && (
            <SimpleLineChart
              data={outboundResponseTimeSeries}
              color={anypointColors.warning}
              height={80}
              theme={theme}
              label="Average Response Time"
              unit="ms"
            />
          )}

          {!hasOutboundData && !dashStatsLoading && (
            <View style={{ paddingTop: 8, borderTopWidth: 1, borderTopColor: theme.colors.outlineVariant }}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic', textAlign: 'center' }}>
                No outbound HTTP latency or error series are exposed for this application in the current monitoring APIs.
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>
    </>
  );

  const renderJvmTab = () => (
    <>
      {/* JVM Charts */}
      <Card style={styles.card} mode="contained">
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Icon name="coffee" size={16} color={anypointColors.mulePurple} />
            <Text variant="titleSmall" style={styles.sectionLabel}>JVM Performance</Text>
          </View>
          <Divider style={{ marginBottom: 12 }} />

          {hasRealCpu ? (
            <SimpleLineChart
              data={jvmCpuSeries.length > 0 ? jvmCpuSeries : cpuPercent != null ? [cpuPercent] : []}
              maxValue={100}
              color={anypointColors.primary}
              height={80}
              theme={theme}
              label="CPU % Utilization"
            />
          ) : (
            <View style={{ paddingVertical: 12 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic', textAlign: 'center' }}>
                No CPU data available
              </Text>
            </View>
          )}

          {hasRealMem ? (
            <SimpleLineChart
              data={jvmHeapSeries.length > 0 ? jvmHeapSeries : memPercent != null ? [memPercent] : []}
              maxValue={memTotal > 0 ? memTotal : 100}
              color={anypointColors.accent}
              height={80}
              theme={theme}
              label="Heap Used"
              unit={memTotal > 0 ? ' MB' : '%'}
            />
          ) : (
            <View style={{ paddingVertical: 12 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic', textAlign: 'center' }}>
                No heap data available
              </Text>
            </View>
          )}

          {hasRealThreads ? (
            <SimpleLineChart
              data={jvmThreadSeries.length > 0 ? jvmThreadSeries : threadCount != null ? [threadCount] : []}
              color={anypointColors.warning}
              height={80}
              theme={theme}
              label="Thread Count"
              unit=""
            />
          ) : (
            <View style={{ paddingVertical: 12 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontStyle: 'italic', textAlign: 'center' }}>
                No thread data available
              </Text>
            </View>
          )}
        </Card.Content>
      </Card>

      {/* JVM Detail Stats */}
      {(jvmGcCollections != null || jvmClassesLoaded != null || jvmHeapCommitted != null || jvmNonHeapUsed != null) && (
        <Card style={styles.card} mode="contained">
          <Card.Content>
            <Text variant="titleSmall" style={[styles.sectionLabel, { marginBottom: 8 }]}>JVM Details</Text>
            <Divider style={{ marginBottom: 8 }} />
            {influxHeapUsed != null && (
              <DetailRow label="Heap Used" value={influxHeapUsed > 10_000 ? `${Math.round(influxHeapUsed / (1024 * 1024))} MB` : `${Math.round(influxHeapUsed)}`} theme={theme} />
            )}
            {jvmHeapCommitted != null && (
              <DetailRow label="Heap Committed" value={jvmHeapCommitted > 10_000 ? `${Math.round(jvmHeapCommitted / (1024 * 1024))} MB` : `${Math.round(jvmHeapCommitted)}`} theme={theme} />
            )}
            {jvmNonHeapUsed != null && (
              <DetailRow label="Non-Heap Used" value={jvmNonHeapUsed > 10_000 ? `${Math.round(jvmNonHeapUsed / (1024 * 1024))} MB` : `${Math.round(jvmNonHeapUsed)}`} theme={theme} />
            )}
            {jvmClassesLoaded != null && (
              <DetailRow label="Classes Loaded" value={String(jvmClassesLoaded)} theme={theme} />
            )}
            {jvmGcCollections != null && (
              <DetailRow label="GC Collections" value={String(jvmGcCollections)} theme={theme} />
            )}
            {jvmGcTime != null && (
              <DetailRow label="GC Time" value={`${jvmGcTime} ms`} theme={theme} />
            )}
          </Card.Content>
        </Card>
      )}

      {!hasRealCpu && !hasRealMem && !hasRealThreads && !dashStatsLoading && (
        <Card style={styles.card} mode="contained">
          <Card.Content style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 12 }}>
            <Icon name="information-outline" size={18} color={anypointColors.warning} />
            <View style={{ flex: 1 }}>
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
                Live per-app JVM, CPU, and memory metrics are not exposed by the monitoring APIs available on this control plane for this environment.
              </Text>
            </View>
          </Card.Content>
        </Card>
      )}
    </>
  );

  const renderInfrastructureTab = () => (
    <>
      {/* Worker Info */}
      <Card style={styles.card} mode="contained">
        <Card.Content>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
            <Icon name="server" size={16} color={anypointColors.secondary} />
            <Text variant="titleSmall" style={styles.sectionLabel}>Infrastructure</Text>
          </View>
          <Divider style={{ marginBottom: 12 }} />
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

      {/* Per-Worker Details */}
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
              const fallbackCpu = numWorkers === 1 ? (influxCpu ?? cpuPercent) : null;
              const fallbackMem = numWorkers === 1 ? (influxMem ?? memPercent) : null;
              const fallbackMemUsed = numWorkers === 1 ? (memUsedRaw || null) : null;
              const fallbackMemMax = numWorkers === 1 ? (memTotalRaw || configuredMemoryMB || null) : null;
              const fallbackThreads = numWorkers === 1 ? (influxThreadCount ?? threadCount) : null;
              const wCpu = extractOptionalNumericValue(wStats?.cpuPercentageUsed) ?? extractOptionalNumericValue(wStats?.cpu) ?? fallbackCpu;
              const wMem = extractOptionalNumericValue(wStats?.memoryPercentageUsed) ?? fallbackMem;
              const wMemUsed = extractOptionalNumericValue(wStats?.memoryTotalUsed) ?? fallbackMemUsed;
              const wMemMax = extractOptionalNumericValue(wStats?.memoryTotalMax) ?? fallbackMemMax;
              const wMemUsedMB = wMemUsed == null
                ? null
                : wMemUsed > 10_000
                  ? Math.round(wMemUsed / (1024 * 1024))
                  : wMemUsed;
              const wMemMaxMB = wMemMax == null
                ? null
                : wMemMax > 10_000
                  ? Math.round(wMemMax / (1024 * 1024))
                  : wMemMax;
              const wThreads = extractOptionalNumericValue(wStats?.threadCount) ?? fallbackThreads;
              const wStatus = worker?.status ?? 'UNKNOWN';
              const wRegion = worker?.deployedRegion ?? worker?.region ?? '';
              const wHost = worker?.host ?? '';
              const wPort = worker?.port ?? '';
              const hasLiveWorkerCpu = wCpu != null;
              const hasLiveWorkerMem = wMem != null;

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

                  <View style={{ flexDirection: 'row', gap: 12, flexWrap: 'wrap', marginBottom: 6 }}>
                    {wHost ? <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>Host: {wHost}{wPort ? `:${wPort}` : ''}</Text> : null}
                    {wRegion ? <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>Region: {wRegion}</Text> : null}
                  </View>

                  {hasLiveWorkerCpu ? (
                    <View style={{ marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>CPU</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>{Math.round(wCpu)}%</Text>
                      </View>
                      <ProgressBar
                        progress={Math.min((wCpu ?? 0) / 100, 1)}
                        color={(wCpu ?? 0) > 80 ? anypointColors.error : (wCpu ?? 0) > 60 ? anypointColors.warning : anypointColors.primary}
                        style={styles.healthBar}
                      />
                    </View>
                  ) : configuredCpu ? (
                    <View style={{ marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>CPU</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                          {configuredCpu}
                        </Text>
                      </View>
                      <ProgressBar
                        progress={1}
                        color={anypointColors.secondary}
                        style={styles.healthBar}
                      />
                    </View>
                  ) : null}

                  {hasLiveWorkerMem ? (
                    <View style={{ marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Memory</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                          {Math.round(wMem ?? 0)}% {wMemMaxMB && wMemUsedMB != null ? `(${wMemUsedMB}/${wMemMaxMB} MB)` : ''}
                        </Text>
                      </View>
                      <ProgressBar
                        progress={Math.min((wMem ?? 0) / 100, 1)}
                        color={(wMem ?? 0) > 80 ? anypointColors.error : (wMem ?? 0) > 60 ? anypointColors.warning : anypointColors.accent}
                        style={styles.healthBar}
                      />
                    </View>
                  ) : configuredMemory ? (
                    <View style={{ marginBottom: 6 }}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 2 }}>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Memory</Text>
                        <Text variant="labelSmall" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>
                          {configuredMemory}
                        </Text>
                      </View>
                      <ProgressBar
                        progress={1}
                        color={anypointColors.secondary}
                        style={styles.healthBar}
                      />
                    </View>
                  ) : null}

                  {wThreads != null && wThreads > 0 && (
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

      {/* Configured Resources (when no live metrics) */}
      {!hasAnyMetrics && status === 'STARTED' && (
        <Card style={styles.card} mode="contained">
          <Card.Content>
            <Text variant="titleSmall" style={styles.sectionLabel}>Configured Resources</Text>
            <Divider style={{ marginVertical: 8 }} />
            <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
              <View>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Worker Type</Text>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>{workerInfo.typeName}</Text>
              </View>
              {configuredCpu ? (
                <View>
                  <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>CPU Limit</Text>
                  <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>{configuredCpu}</Text>
                </View>
              ) : null}
              <View>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>{configuredMemory ? 'Memory Limit' : 'Workers'}</Text>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>{configuredMemory ?? workerInfo.amount}</Text>
              </View>
              {!configuredMemory ? (
              <View>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Mule Version</Text>
                <Text variant="bodyLarge" style={{ color: theme.colors.onSurface, fontWeight: '600' }}>{getMuleVersion(app) || 'N/A'}</Text>
              </View>
              ) : null}
            </View>
          </Card.Content>
        </Card>
      )}

      {/* Properties */}
      {app?.properties && Object.keys(app.properties).length > 0 && (
        <Card style={styles.card} mode="contained">
          <Card.Content>
            <Text variant="titleSmall" style={styles.sectionLabel}>
              Properties ({Object.keys(app.properties).length})
            </Text>
            <Divider style={{ marginVertical: 8 }} />
            {Object.entries(app.properties as Record<string, string>).slice(0, 8).map(([key, value]) => (
              <View key={key} style={{ flexDirection: 'row', paddingVertical: 4 }}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, width: 140 }} numberOfLines={1}>
                  {key}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurface, flex: 1 }} numberOfLines={1}>
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
    </>
  );

  const renderTabContent = () => {
    switch (activeTab) {
      case 'overview': return renderOverviewTab();
      case 'inbound': return renderInboundTab();
      case 'outbound': return renderOutboundTab();
      case 'jvm': return renderJvmTab();
      case 'infrastructure': return renderInfrastructureTab();
      default: return renderOverviewTab();
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

// ---------------------------------------------------------------------------
// Detail Row helper
// ---------------------------------------------------------------------------

const DetailRow: React.FC<{ label: string; value: string; theme: MD3Theme }> = ({ label, value, theme }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3 }}>
    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 12 }}>{label}</Text>
    <Text variant="labelSmall" style={{ color: theme.colors.onSurface, fontWeight: '600', fontSize: 12 }}>{value}</Text>
  </View>
);

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
      paddingVertical: 10,
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
    tabBarScroll: {
      maxHeight: 48,
      marginBottom: 8,
    },
    tabBarContent: {
      paddingHorizontal: 16,
      gap: 8,
      alignItems: 'center',
    },
    tabChip: {
      borderColor: theme.colors.outline,
    },
    tabChipText: {
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
      height: 6,
      borderRadius: 3,
      backgroundColor: theme.colors.surfaceVariant,
    },
  });

export default AppMonitoringDetailScreen;
