// ============================================================
// Monitoring Screen - Application Health Overview
// Fetches per-app monitoring stats for running apps.
// ============================================================

import React, { useMemo, useCallback, useState, useEffect, useRef } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, useWindowDimensions } from 'react-native';
import { Text, Card, Chip, useTheme, ProgressBar, Icon, ActivityIndicator, type MD3Theme } from 'react-native-paper';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useQueries } from '@tanstack/react-query';
import { useApplications } from '../../hooks/queries';
import * as runtimeService from '../../services/runtimeService';
import { isMonitoringUnavailable, resetSessionFlags } from '../../services/runtimeService';
import { useAuthStore } from '../../stores/authStore';
import { anypointColors } from '../../theme';
import { getAppName, getAppId, getMuleVersion, getWorkerInfo } from '../../utils/appHelpers';
import { getStatusColor, getStatusLabel, formatRelativeTime, formatMB } from '../../utils/statusHelpers';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// --- Summary Card ---

interface SummaryCardProps {
  title: string;
  value: string | number;
  icon: string;
  color: string;
  subtitle?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({ title, value, icon, color, subtitle }) => {
  const theme = useTheme();
  return (
    <Card
      style={{
        flex: 1,
        borderRadius: 14,
        elevation: 0,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.surfaceVariant,
      }}
      mode="contained"
    >
      <Card.Content style={{ paddingVertical: 14, paddingHorizontal: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <View
            style={{
              width: 34,
              height: 34,
              borderRadius: 10,
              backgroundColor: color + '20',
              justifyContent: 'center',
              alignItems: 'center',
            }}
          >
            <Icon source={icon} size={18} color={color} />
          </View>
        </View>
        <Text
          variant="headlineSmall"
          style={{ fontWeight: '800', fontSize: 26, color: theme.colors.onSurface, marginBottom: 2 }}
        >
          {value}
        </Text>
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
          {title}
        </Text>
        {subtitle ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginTop: 6,
              paddingHorizontal: 6,
              paddingVertical: 2,
              borderRadius: 6,
              backgroundColor: color + '15',
              alignSelf: 'flex-start',
            }}
          >
            <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: color, marginRight: 4 }} />
            <Text style={{ color, fontSize: 10, fontWeight: '600' }}>{subtitle}</Text>
          </View>
        ) : null}
      </Card.Content>
    </Card>
  );
};

// --- Extract monitoring metrics from multiple data sources ---

interface MonitoringMetrics {
  cpuPercent: number | null;
  memoryPercent: number | null;
  memoryUsedMB: number | null;
  memoryTotalMB: number | null;
  threadCount: number | null;
  classesLoaded: number | null;
  gcCollections: number | null;
  gcTime: number | null;
  heapUsed: number | null;
  heapCommitted: number | null;
  nonHeapUsed: number | null;
  // App-level metrics (from Observability/Metrics API)
  inboundRequestCount: number | null;
  inboundAvgResponseTime: number | null;
  outboundRequestCount: number | null;
  outboundAvgResponseTime: number | null;
  messageCount: number | null;
  errorCount: number | null;
}

function extractMetrics(detailedApp: any, dashStats: any): MonitoringMetrics {
  const metrics: MonitoringMetrics = {
    cpuPercent: null,
    memoryPercent: null,
    memoryUsedMB: null,
    memoryTotalMB: null,
    threadCount: null,
    classesLoaded: null,
    gcCollections: null,
    gcTime: null,
    heapUsed: null,
    heapCommitted: null,
    nonHeapUsed: null,
    inboundRequestCount: null,
    inboundAvgResponseTime: null,
    outboundRequestCount: null,
    outboundAvgResponseTime: null,
    messageCount: null,
    errorCount: null,
  };

  // Source 0: `monitoring` field from the Application type definition
  if (detailedApp?.monitoring) {
    const mon = detailedApp.monitoring;
    if (mon.cpuUsage != null) metrics.cpuPercent = Number(mon.cpuUsage);
    if (mon.memoryUsage != null) metrics.memoryUsedMB = Number(mon.memoryUsage);
    if (mon.memoryTotal != null) metrics.memoryTotalMB = Number(mon.memoryTotal);
    if (mon.threadCount != null) metrics.threadCount = Number(mon.threadCount);
    if (mon.memoryTotal > 0 && mon.memoryUsage != null) {
      metrics.memoryPercent = Math.round((mon.memoryUsage / mon.memoryTotal) * 100);
    }
  }

  // Source 1: workerStatuses from detailed app (can be array or keyed object)
  // statisticsByWorker values can be time-series maps { "ts": value } or plain numbers
  if (detailedApp) {
    const raw = detailedApp.workerStatuses ?? detailedApp.workers?.statuses;
    const workerArr: any[] = Array.isArray(raw)
      ? raw
      : (raw && typeof raw === 'object') ? Object.values(raw) : [];

    if (workerArr.length > 0) {
      let w = workerArr[0]?.statisticsByWorker ?? workerArr[0]?.statistics ?? workerArr[0] ?? {};
      // statisticsByWorker may be nested by worker ID: { "id-xxx": { cpu: ..., ... } }
      const metricKeys = ['cpu', 'cpuPercentageUsed', 'memoryTotalUsed', 'memoryPercentageUsed', 'threadCount'];
      const hasDirectMetric = metricKeys.some((k) => k in w);
      if (!hasDirectMetric) {
        const vals = Object.values(w);
        if (vals.length > 0 && vals[0] && typeof vals[0] === 'object') {
          w = vals[0] as any;
        }
      }

      // Helper: extract latest numeric value from a possible time-series map
      const numVal = (field: any): number | null => {
        if (field == null) return null;
        if (typeof field === 'number') return field;
        if (typeof field === 'object' && !Array.isArray(field)) {
          const ks = Object.keys(field);
          if (ks.length === 0) return null;
          const sorted = ks.sort((a, b) => Number(b) - Number(a));
          const v = field[sorted[0]];
          return typeof v === 'number' ? v : null;
        }
        return null;
      };

      if (metrics.cpuPercent == null) metrics.cpuPercent = numVal(w.cpuPercentageUsed) ?? numVal(w.cpu);
      if (metrics.memoryPercent == null) metrics.memoryPercent = numVal(w.memoryPercentageUsed);
      if (metrics.memoryUsedMB == null) metrics.memoryUsedMB = numVal(w.memoryTotalUsed);
      if (metrics.memoryTotalMB == null) metrics.memoryTotalMB = numVal(w.memoryTotalMax);
      if (metrics.threadCount == null) metrics.threadCount = numVal(w.threadCount);

      // JVM from worker statuses
      if (metrics.heapUsed == null) metrics.heapUsed = numVal(w.heapUsed);
      if (metrics.heapCommitted == null) metrics.heapCommitted = numVal(w.heapCommitted);
      if (metrics.nonHeapUsed == null) metrics.nonHeapUsed = numVal(w.nonHeapUsed);
      if (metrics.classesLoaded == null) metrics.classesLoaded = numVal(w.classesLoaded);
      if (metrics.gcCollections == null) metrics.gcCollections = numVal(w.totalGarbageCollections);
      if (metrics.gcTime == null) metrics.gcTime = numVal(w.garbageCollectionTime);
    }
  }

  // Source 2: dashboardStats
  // The CloudHub dashboardStats response looks like:
  // {
  //   "workerStatistics": [
  //     {
  //       "id": "i-xxx",
  //       "statistics": {
  //         "cpu": { "1556825280000": 1.475, "1556825340000": 1.5 },
  //         "memoryTotalUsed": { "ts": bytes, ... },
  //         "memoryPercentageUsed": { "ts": pct, ... },
  //         "memoryTotalMax": 992215040.0   <-- single number, NOT a map
  //       }
  //     }
  //   ]
  // }
  if (dashStats) {
    // Helper: extract the latest value from a time-series map { "timestamp": value }
    // or return the value directly if it's already a number
    const latestVal = (field: any): number | null => {
      if (field == null) return null;
      if (typeof field === 'number') return field;
      if (typeof field === 'object' && !Array.isArray(field)) {
        const keys = Object.keys(field);
        if (keys.length === 0) return null;
        // Sort by timestamp (numeric key) and return the latest
        const sortedKeys = keys.sort((a, b) => Number(b) - Number(a));
        return Number(field[sortedKeys[0]]);
      }
      return null;
    };

    // Parse workerStatistics array (the actual CloudHub response format)
    const workerStats = dashStats.workerStatistics;
    if (Array.isArray(workerStats) && workerStats.length > 0) {
      const stats = workerStats[0]?.statistics ?? workerStats[0] ?? {};

      if (metrics.cpuPercent == null) {
        metrics.cpuPercent = latestVal(stats.cpu);
      }
      if (metrics.memoryPercent == null) {
        metrics.memoryPercent = latestVal(stats.memoryPercentageUsed);
      }
      if (metrics.memoryUsedMB == null) {
        const usedBytes = latestVal(stats.memoryTotalUsed);
        if (usedBytes != null) metrics.memoryUsedMB = usedBytes;
      }
      if (metrics.memoryTotalMB == null) {
        // memoryTotalMax is a single number, not a time series
        const maxBytes = typeof stats.memoryTotalMax === 'number'
          ? stats.memoryTotalMax
          : latestVal(stats.memoryTotalMax);
        if (maxBytes != null) metrics.memoryTotalMB = maxBytes;
      }
    }

    // Fallback: check if dashStats itself has flat metric fields
    // (older API versions or different response shapes)
    const flat = dashStats.workerStatistics?.[0]?.statistics
      ?? dashStats.workerStatistics?.[0]
      ?? dashStats;
    if (typeof flat === 'object' && !Array.isArray(flat)) {
      if (metrics.cpuPercent == null && flat.cpuPercentageUsed != null) {
        metrics.cpuPercent = Number(flat.cpuPercentageUsed);
      }
      if (metrics.memoryPercent == null && flat.memoryPercentageUsed != null && typeof flat.memoryPercentageUsed === 'number') {
        metrics.memoryPercent = Number(flat.memoryPercentageUsed);
      }
    }

    // Handle Anypoint Monitoring time-series response shape
    // (array of { target, datapoints: [[value, timestamp], ...] })
    if (Array.isArray(dashStats)) {
      for (const series of dashStats) {
        const target = series?.target ?? '';
        const points = series?.datapoints ?? series?.data ?? [];
        if (points.length === 0) continue;
        const lastPoint = points[points.length - 1];
        const value = Array.isArray(lastPoint) ? lastPoint[0] : lastPoint?.value;
        if (value == null) continue;

        if (target.includes('cpu') && metrics.cpuPercent == null) {
          metrics.cpuPercent = Number(value);
        } else if (target.includes('memory') && metrics.memoryPercent == null) {
          metrics.memoryPercent = Number(value);
        } else if (target.includes('thread') && metrics.threadCount == null) {
          metrics.threadCount = Number(value);
        }
      }
    }

    // Handle Observability Metrics API AMQL response shape
    if (dashStats?.data && Array.isArray(dashStats.data)) {
      for (const row of dashStats.data) {
        const m = row?.measurements ?? row;
        if (m?.cpuUsage != null && metrics.cpuPercent == null) metrics.cpuPercent = Number(m.cpuUsage);
        if (m?.cpuPercentageUsed != null && metrics.cpuPercent == null) metrics.cpuPercent = Number(m.cpuPercentageUsed);
        if (m?.memoryUsage != null && metrics.memoryPercent == null) metrics.memoryPercent = Number(m.memoryUsage);
        if (m?.memoryPercentageUsed != null && metrics.memoryPercent == null) metrics.memoryPercent = Number(m.memoryPercentageUsed);
        if (m?.threadCount != null && metrics.threadCount == null) metrics.threadCount = Number(m.threadCount);
      }
    }

    // Handle CH2 deployment detail response (from AMC API)
    // These may contain replica-level info but not live CPU/memory
    if (dashStats?.target || dashStats?.application) {
      const target = dashStats.target ?? {};
      const resources = target?.deploymentSettings?.resources ?? {};
      const cpuLimit = resources?.cpu?.limit ?? '';
      const _memLimit = resources?.memory?.limit ?? '';
      // If we found resource configs, set them as "configured" values
      // (these aren't live metrics, but better than nothing)
      if (cpuLimit && metrics.cpuPercent == null) {
        // Don't set CPU percent from config — it's not a live metric
      }
      // Check replica statuses for any runtime metrics
      const replicas = dashStats.replicas ?? [];
      if (Array.isArray(replicas)) {
        for (const replica of replicas) {
          const stats = replica?.statistics ?? replica?.metrics ?? {};
          if (stats.cpu != null && metrics.cpuPercent == null) metrics.cpuPercent = Number(stats.cpu);
          if (stats.memory != null && metrics.memoryPercent == null) metrics.memoryPercent = Number(stats.memory);
        }
      }
    }
  }

  // ── Handle InfluxDB extra metrics (from _extraMetrics field) ──
  if (dashStats?._extraMetrics) {
    const ex = dashStats._extraMetrics;
    if (ex.cpuPercent != null && metrics.cpuPercent == null) metrics.cpuPercent = Number(ex.cpuPercent);
    if (ex.memoryPercent != null && metrics.memoryPercent == null) metrics.memoryPercent = Number(ex.memoryPercent);
    if (ex.memoryUsed != null && metrics.memoryUsedMB == null) {
      const used = Number(ex.memoryUsed);
      metrics.memoryUsedMB = used > 10_000 ? used / (1024 * 1024) : used;
    }
    if (ex.memoryTotal != null && metrics.memoryTotalMB == null) {
      const total = Number(ex.memoryTotal);
      metrics.memoryTotalMB = total > 10_000 ? total / (1024 * 1024) : total;
    }
    if (ex.threadCount != null && metrics.threadCount == null) metrics.threadCount = Number(ex.threadCount);
    if (ex.heapUsed != null && metrics.heapUsed == null) metrics.heapUsed = Number(ex.heapUsed);
    if (ex.heapCommitted != null && metrics.heapCommitted == null) metrics.heapCommitted = Number(ex.heapCommitted);
    if (ex.gcCollections != null && metrics.gcCollections == null) metrics.gcCollections = Number(ex.gcCollections);
    if (ex.gcTime != null && metrics.gcTime == null) metrics.gcTime = Number(ex.gcTime);
    if (ex.nonHeapUsed != null && metrics.nonHeapUsed == null) metrics.nonHeapUsed = Number(ex.nonHeapUsed);
    if (ex.classesLoaded != null && metrics.classesLoaded == null) metrics.classesLoaded = Number(ex.classesLoaded);
    // HTTP metrics from InfluxDB
    if (ex.inboundRequestCount != null && metrics.inboundRequestCount == null) metrics.inboundRequestCount = Number(ex.inboundRequestCount);
    if (ex.inboundAvgResponseTime != null && metrics.inboundAvgResponseTime == null) metrics.inboundAvgResponseTime = Number(ex.inboundAvgResponseTime);
    if (ex.outboundRequestCount != null && metrics.outboundRequestCount == null) metrics.outboundRequestCount = Number(ex.outboundRequestCount);
    if (ex.outboundAvgResponseTime != null && metrics.outboundAvgResponseTime == null) metrics.outboundAvgResponseTime = Number(ex.outboundAvgResponseTime);
    if (ex.messageCount != null && metrics.messageCount == null) metrics.messageCount = Number(ex.messageCount);
  }

  // ── Handle normalized time-series from InfluxDB / Observability ──
  if (Array.isArray(dashStats?._timeSeries) && dashStats._timeSeries.length > 0) {
    const latestPoint = [...dashStats._timeSeries]
      .filter((point: any) => point?.timestamp != null)
      .sort((a: any, b: any) => Number(b.timestamp) - Number(a.timestamp))[0];

    if (latestPoint) {
      if (metrics.cpuPercent == null && latestPoint.cpu != null) {
        metrics.cpuPercent = Number(latestPoint.cpu);
      }
      if (metrics.memoryPercent == null && latestPoint.memory != null) {
        metrics.memoryPercent = Number(latestPoint.memory);
      }
      if (metrics.heapUsed == null && latestPoint.heapUsed != null) {
        metrics.heapUsed = Number(latestPoint.heapUsed);
      }
      if (metrics.heapCommitted == null && latestPoint.heapCommitted != null) {
        metrics.heapCommitted = Number(latestPoint.heapCommitted);
      }
      if (metrics.threadCount == null && latestPoint.threadCount != null) {
        metrics.threadCount = Number(latestPoint.threadCount);
      }
    }
  }

  // ── Handle Observability Metrics API app-level metrics ──
  if (dashStats?._appMetrics) {
    const am = dashStats._appMetrics;
    if (am.inboundRequestCount != null && metrics.inboundRequestCount == null) metrics.inboundRequestCount = Number(am.inboundRequestCount);
    if (am.inboundAvgResponseTime != null && metrics.inboundAvgResponseTime == null) metrics.inboundAvgResponseTime = Number(am.inboundAvgResponseTime);
    if (am.outboundRequestCount != null && metrics.outboundRequestCount == null) metrics.outboundRequestCount = Number(am.outboundRequestCount);
    if (am.outboundAvgResponseTime != null && metrics.outboundAvgResponseTime == null) metrics.outboundAvgResponseTime = Number(am.outboundAvgResponseTime);
    if (am.messageCount != null && metrics.messageCount == null) metrics.messageCount = Number(am.messageCount);
    if (am.errorCount != null && metrics.errorCount == null) metrics.errorCount = Number(am.errorCount);
  }

  // Handle JVM metrics endpoint response
  if (dashStats?._jvmMetrics) {
    const jvm = dashStats._jvmMetrics;
    if (jvm.processCpuLoad != null && metrics.cpuPercent == null) metrics.cpuPercent = Number(jvm.processCpuLoad) * 100;
    if (jvm.systemCpuLoad != null && metrics.cpuPercent == null) metrics.cpuPercent = Number(jvm.systemCpuLoad) * 100;
    if (jvm.cpuUsage != null && metrics.cpuPercent == null) metrics.cpuPercent = Number(jvm.cpuUsage);
    if (jvm.heapUsed != null && metrics.heapUsed == null) metrics.heapUsed = Number(jvm.heapUsed);
    if (jvm.heapMax != null && metrics.heapCommitted == null) metrics.heapCommitted = Number(jvm.heapMax);
    if (jvm.heapCommitted != null && metrics.heapCommitted == null) metrics.heapCommitted = Number(jvm.heapCommitted);
    if (jvm.nonHeapUsed != null && metrics.nonHeapUsed == null) metrics.nonHeapUsed = Number(jvm.nonHeapUsed);
    if (jvm.threadCount != null && metrics.threadCount == null) metrics.threadCount = Number(jvm.threadCount);
    if (jvm.gcCollections != null && metrics.gcCollections == null) metrics.gcCollections = Number(jvm.gcCollections);
    if (jvm.gcTime != null && metrics.gcTime == null) metrics.gcTime = Number(jvm.gcTime);
    if (jvm.classesLoaded != null && metrics.classesLoaded == null) metrics.classesLoaded = Number(jvm.classesLoaded);
    // Derive memory percent from heap
    if (metrics.memoryPercent == null && jvm.heapUsed != null && jvm.heapMax != null && jvm.heapMax > 0) {
      metrics.memoryPercent = Math.round((Number(jvm.heapUsed) / Number(jvm.heapMax)) * 100);
    }
    if (metrics.memoryUsedMB == null && jvm.heapUsed != null) {
      metrics.memoryUsedMB = Number(jvm.heapUsed) / (1024 * 1024);
    }
    if (metrics.memoryTotalMB == null && jvm.heapMax != null) {
      metrics.memoryTotalMB = Number(jvm.heapMax) / (1024 * 1024);
    }
  }

  // Handle monitoring metrics series
  if (dashStats?._metricSeries && Array.isArray(dashStats._metricSeries)) {
    for (const series of dashStats._metricSeries) {
      const name = series?.name ?? series?.metric ?? '';
      const points = series?.datapoints ?? series?.data ?? [];
      if (points.length === 0) continue;
      const lastPoint = points[points.length - 1];
      const value = Array.isArray(lastPoint) ? lastPoint[0] : lastPoint?.value;
      if (value == null) continue;
      if (name.includes('cpu') && metrics.cpuPercent == null) metrics.cpuPercent = Number(value);
      if (name.includes('memory.usage') && metrics.memoryPercent == null) metrics.memoryPercent = Number(value);
      if (name.includes('memory.total') && metrics.memoryTotalMB == null) metrics.memoryTotalMB = Number(value) / (1024 * 1024);
    }
  }

  // Compute memoryPercent from used/total if still null
  if (
    metrics.memoryPercent == null &&
    metrics.memoryUsedMB != null &&
    metrics.memoryTotalMB != null &&
    metrics.memoryTotalMB > 0
  ) {
    metrics.memoryPercent = Math.round((metrics.memoryUsedMB / metrics.memoryTotalMB) * 100);
  }

  return metrics;
}

// --- Small stat row ---
const StatRow: React.FC<{ label: string; value: string; theme: MD3Theme }> = ({ label, value, theme }) => (
  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 2 }}>
    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant, fontSize: 11 }}>{label}</Text>
    <Text variant="labelSmall" style={{ color: theme.colors.onSurface, fontWeight: '600', fontSize: 11 }}>{value}</Text>
  </View>
);

// --- App Health Card ---

interface AppHealthCardProps {
  app: any;
  metrics: MonitoringMetrics;
  detailLoading: boolean;
  theme: MD3Theme;
  styles: ReturnType<typeof createStyles>;
  onPress: () => void;
}

const AppHealthCard: React.FC<AppHealthCardProps> = ({ app, metrics, detailLoading, theme, styles, onPress }) => {
  const status = app?.status ?? 'UNKNOWN';
  const color = getStatusColor(status);
  const appName = getAppName(app);
  const muleVer = getMuleVersion(app);
  const workerInfo = getWorkerInfo(app);
  const region = app?.region ?? '';
  const lastUpdated = app?.lastUpdateTime;
  const fileName = app?.fileName ?? '';

  const hasMetrics = metrics.cpuPercent != null || metrics.memoryPercent != null;
  const hasJvm = metrics.threadCount != null || metrics.classesLoaded != null || metrics.gcCollections != null || metrics.heapUsed != null;
  const hasAppMetrics = metrics.inboundRequestCount != null || metrics.messageCount != null || metrics.inboundAvgResponseTime != null;

  return (
    <Card style={styles.appCard} mode="contained" onPress={onPress}>
      <Card.Content style={styles.cardContent}>
        {/* Header */}
        <View style={styles.cardHeader}>
          <View style={[styles.statusIndicator, { backgroundColor: color }]} />
          <View style={styles.appNameWrap}>
            <Text variant="titleMedium" style={styles.appName} numberOfLines={1}>{appName}</Text>
            {region ? <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>{region}</Text> : null}
          </View>
          <View style={[styles.statusChip, { backgroundColor: color + '20', borderColor: color + '40' }]}>
            <Text style={{ color, fontSize: 11, fontWeight: '700' }}>{getStatusLabel(status)}</Text>
          </View>
        </View>

        {/* Info row */}
        <View style={styles.infoRow}>
          <View style={styles.infoItem}>
            <Icon source="server" size={13} color={theme.colors.onSurfaceVariant} />
            <Text variant="bodySmall" style={styles.infoText} numberOfLines={1}>{workerInfo.amount}x {workerInfo.typeName}</Text>
          </View>
          {muleVer ? (
            <View style={styles.infoItem}>
              <Icon source="puzzle" size={13} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={styles.infoText} numberOfLines={1}>Mule {muleVer}</Text>
            </View>
          ) : null}
          {lastUpdated ? (
            <View style={styles.infoItem}>
              <Icon source="clock-outline" size={13} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={styles.infoText} numberOfLines={1}>{formatRelativeTime(lastUpdated)}</Text>
            </View>
          ) : null}
          {fileName ? (
            <View style={styles.infoItem}>
              <Icon source="file-outline" size={13} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={styles.infoText} numberOfLines={1}>{fileName}</Text>
            </View>
          ) : null}
        </View>

        {/* CPU / Memory bars */}
        {hasMetrics ? (
          <View style={styles.monitoringSection}>
            {metrics.cpuPercent != null ? (
              <View style={styles.metricRow}>
                <View style={styles.metricLabelRow}>
                  <Text variant="labelSmall" style={styles.metricLabel}>CPU</Text>
                  <Text variant="labelSmall" style={styles.metricValue}>{Math.round(metrics.cpuPercent)}%</Text>
                </View>
                <ProgressBar
                  progress={Math.min(metrics.cpuPercent / 100, 1)}
                  color={metrics.cpuPercent > 80 ? anypointColors.error : metrics.cpuPercent > 60 ? anypointColors.warning : anypointColors.primary}
                  style={styles.progressBar}
                />
              </View>
            ) : null}
            {metrics.memoryPercent != null ? (
              <View style={styles.metricRow}>
                <View style={styles.metricLabelRow}>
                  <Text variant="labelSmall" style={styles.metricLabel}>
                    Memory
                    {metrics.memoryUsedMB != null && metrics.memoryTotalMB != null
                      ? ` (${formatMB(metrics.memoryUsedMB)}/${formatMB(metrics.memoryTotalMB)} MB)`
                      : ''}
                  </Text>
                  <Text variant="labelSmall" style={styles.metricValue}>{Math.round(metrics.memoryPercent)}%</Text>
                </View>
                <ProgressBar
                  progress={Math.min(metrics.memoryPercent / 100, 1)}
                  color={metrics.memoryPercent > 80 ? anypointColors.error : metrics.memoryPercent > 60 ? anypointColors.warning : anypointColors.accent}
                  style={styles.progressBar}
                />
              </View>
            ) : null}
          </View>
        ) : detailLoading && status === 'STARTED' ? (
          <View style={styles.monitoringSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <ActivityIndicator size={12} color={theme.colors.onSurfaceVariant} />
              <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>Loading stats…</Text>
            </View>
          </View>
        ) : status === 'STARTED' && !detailLoading ? (
          <View style={styles.monitoringSection}>
            {/* Show configured resources when no live metrics */}
            {app?.deploymentTarget === 'cloudhub2' && app?.workers?.type?.cpu ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Icon source="information-outline" size={14} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Configured resources (live metrics require Monitoring subscription)
                  </Text>
                </View>
                <StatRow label="CPU" value={app.workers.type.cpu} theme={theme} />
                <StatRow label="Memory" value={app.workers.type.memory} theme={theme} />
                <StatRow label="Replicas" value={String(app.workers.amount ?? 1)} theme={theme} />
              </>
            ) : workerInfo.typeName ? (
              <>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <Icon source="information-outline" size={14} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                    Configured resources (live metrics require Monitoring subscription)
                  </Text>
                </View>
                <StatRow label="Worker Type" value={workerInfo.typeName} theme={theme} />
                <StatRow label="Workers" value={String(workerInfo.amount)} theme={theme} />
                {muleVer ? <StatRow label="Mule Runtime" value={muleVer} theme={theme} /> : null}
                {region ? <StatRow label="Region" value={region} theme={theme} /> : null}
              </>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Icon source="information-outline" size={14} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  No monitoring data available
                </Text>
              </View>
            )}
          </View>
        ) : null}

        {/* JVM section (threads, heap, GC, classes) */}
        {hasJvm ? (
          <View style={styles.monitoringSection}>
            {metrics.threadCount != null ? (
              <StatRow label="Threads" value={String(metrics.threadCount)} theme={theme} />
            ) : null}
            {metrics.heapUsed != null ? (
              <StatRow label="Heap Used" value={`${formatMB(metrics.heapUsed)} MB`} theme={theme} />
            ) : null}
            {metrics.heapCommitted != null ? (
              <StatRow label="Heap Committed" value={`${formatMB(metrics.heapCommitted)} MB`} theme={theme} />
            ) : null}
            {metrics.nonHeapUsed != null ? (
              <StatRow label="Non-Heap Used" value={`${formatMB(metrics.nonHeapUsed)} MB`} theme={theme} />
            ) : null}
            {metrics.classesLoaded != null ? (
              <StatRow label="Classes Loaded" value={String(metrics.classesLoaded)} theme={theme} />
            ) : null}
            {metrics.gcCollections != null ? (
              <StatRow label="GC Collections" value={String(metrics.gcCollections)} theme={theme} />
            ) : null}
            {metrics.gcTime != null ? (
              <StatRow label="GC Time" value={`${metrics.gcTime} ms`} theme={theme} />
            ) : null}
          </View>
        ) : null}

        {/* App-level metrics (from Observability/Metrics API) */}
        {hasAppMetrics ? (
          <View style={styles.monitoringSection}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
              <Icon source="chart-timeline-variant" size={14} color={theme.colors.primary} />
              <Text variant="labelSmall" style={{ color: theme.colors.primary, fontWeight: '600' }}>
                Application Metrics
              </Text>
            </View>
            {metrics.inboundRequestCount != null ? (
              <StatRow label="Inbound Requests" value={metrics.inboundRequestCount.toLocaleString()} theme={theme} />
            ) : null}
            {metrics.inboundAvgResponseTime != null ? (
              <StatRow label="Avg Response Time" value={`${Math.round(metrics.inboundAvgResponseTime)} ms`} theme={theme} />
            ) : null}
            {metrics.messageCount != null ? (
              <StatRow label="Messages Processed" value={metrics.messageCount.toLocaleString()} theme={theme} />
            ) : null}
            {metrics.errorCount != null && metrics.errorCount > 0 ? (
              <StatRow label="Errors" value={metrics.errorCount.toLocaleString()} theme={theme} />
            ) : null}
            {metrics.outboundRequestCount != null ? (
              <StatRow label="Outbound Requests" value={metrics.outboundRequestCount.toLocaleString()} theme={theme} />
            ) : null}
            {metrics.outboundAvgResponseTime != null ? (
              <StatRow label="Outbound Avg RT" value={`${Math.round(metrics.outboundAvgResponseTime)} ms`} theme={theme} />
            ) : null}
          </View>
        ) : null}

        {/* Info message when app-level metrics are not available */}
        {metrics.inboundRequestCount == null && metrics.messageCount == null && metrics.inboundAvgResponseTime == null && status === 'STARTED' && !detailLoading ? (
          <View style={[styles.monitoringSection, { flexDirection: 'row', alignItems: 'flex-start', gap: 6 }]}>
            <Icon source="information-outline" size={13} color={theme.colors.onSurfaceVariant} />
            <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 11, flex: 1, lineHeight: 15 }}>
              This application is not currently exposing inbound or outbound traffic metrics through the monitoring APIs available on this control plane.
            </Text>
          </View>
        ) : null}
      </Card.Content>
    </Card>
  );
};

// --- Main Component ---

// Max content width for iPad / large screens — keeps UI readable
const CONTENT_MAX_WIDTH = 768;

const MonitoringScreen: React.FC = () => {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
    isRefetching: appsRefetching,
  } = useApplications();

  const isRefreshing = appsRefetching;

  const handleRefresh = useCallback(() => {
    // Reset monitoring discovery flags so it re-tests endpoints on refresh
    resetSessionFlags();
    setMonitoringDown(false);
    refetchApps();
  }, [refetchApps]);

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
        refetchInterval: 120_000,
        enabled: !!d,
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

  const listHeaderComponent = useMemo(() => (
    <>
      {/* Header */}
      <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
        <Text variant="headlineSmall" style={styles.headerTitle}>Monitoring</Text>
        <Text variant="bodyMedium" style={styles.headerSubtitle}>{envName}</Text>
      </View>

      {/* Summary */}
      <View style={[styles.summaryRow, windowWidth < 420 && styles.summaryRowStacked]}>
        <SummaryCard title="Total Apps" value={totalApps} icon="application-outline" color={anypointColors.primary}
          subtitle={failedApps > 0 ? `${failedApps} failed` : undefined} />
        <SummaryCard title="Running" value={`${runningAppsCount}/${totalApps}`} icon="check-circle-outline" color={anypointColors.success}
          subtitle={totalApps > 0 ? `${Math.round((runningAppsCount / totalApps) * 100)}% healthy` : undefined} />
      </View>

      {/* Monitoring unavailable banner */}
      {monitoringDown && runningAppsCount > 0 ? (
        <View
          style={{
            marginHorizontal: 16,
            marginBottom: 14,
            backgroundColor: anypointColors.warning + '15',
            borderRadius: 12,
            borderWidth: 1,
            borderColor: anypointColors.warning + '30',
            padding: 14,
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <Icon source="information-outline" size={18} color={anypointColors.warning} />
          <View style={{ flex: 1 }}>
            <Text variant="labelMedium" style={{ color: theme.colors.onSurface, fontWeight: '600', marginBottom: 2 }}>
              Live metrics unavailable
            </Text>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, lineHeight: 18 }}>
              This environment currently exposes application traffic metrics, but not live per-app CPU, memory, or JVM telemetry through the available monitoring APIs. Configured worker resources are shown where available.
            </Text>
          </View>
        </View>
      ) : null}

      {/* Section header + sort */}
      <View style={styles.sectionHeader}>
        <Text variant="titleMedium" style={styles.sectionTitle}>Application Health</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Chip
            icon={sortOrder === 'za' ? 'sort-alphabetical-descending' : 'sort-alphabetical-ascending'}
            onPress={() => setSortOrder((p) => p === 'default' ? 'az' : p === 'az' ? 'za' : 'default')}
            selected={sortOrder !== 'default'} showSelectedOverlay compact style={{ borderRadius: 10 }}>
            {sortOrder === 'az' ? 'A → Z' : sortOrder === 'za' ? 'Z → A' : 'Sort'}
          </Chip>
          <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
            {sortedApps.length} app{sortedApps.length !== 1 ? 's' : ''}
          </Text>
        </View>
      </View>
    </>
  ), [styles, insets.top, envName, totalApps, failedApps, runningAppsCount, monitoringDown, theme, sortOrder, sortedApps.length, windowWidth]);

  const listEmptyComponent = useMemo(() => {
    if (appsLoading) {
      return <LoadingState message="Loading monitoring data..." />;
    }
    if (appsError) {
      return <ErrorState message={(appsError as Error)?.message ?? 'Failed to load data'} onRetry={() => refetchApps()} />;
    }
    return (
      <View style={styles.emptyState}>
        <Icon source="monitor-dashboard" size={64} color={theme.colors.outlineVariant} />
        <Text variant="titleMedium" style={styles.emptyTitle}>No applications to monitor</Text>
        <Text variant="bodyMedium" style={styles.emptySubtitle}>Deploy applications to see monitoring data here.</Text>
      </View>
    );
  }, [appsLoading, appsError, refetchApps, styles, theme]);

  const renderAppCard = useCallback(({ item: app }: any) => {
    const d = app?.domain ?? getAppId(app);
    return (
      <AppHealthCard
        key={d}
        app={app}
        metrics={metricsMap.get(d) ?? extractMetrics(null, null)}
        detailLoading={loadingMap.get(d) ?? false}
        theme={theme}
        styles={styles}
        onPress={() => handleAppPress(app)}
      />
    );
  }, [metricsMap, loadingMap, theme, styles, handleAppPress]);

  return (
    <View style={styles.container}>
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
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        windowSize={7}
        maxToRenderPerBatch={10}
      />
    </View>
  );
};

// --- Styles ---

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.colors.background },
    header: { paddingHorizontal: 20, paddingBottom: 16 },
    headerTitle: { fontWeight: '700', color: theme.colors.onBackground },
    headerSubtitle: { color: theme.colors.onSurfaceVariant, marginTop: 2 },
    summaryRow: { flexDirection: 'row', paddingHorizontal: 16, gap: 10, marginBottom: 20 },
    summaryRowStacked: { flexDirection: 'column' },
    sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 20, marginBottom: 10 },
    sectionTitle: { fontWeight: '600', color: theme.colors.onBackground },
    listContent: { paddingBottom: 32 },
    appCard: { marginHorizontal: 16, marginBottom: 10, backgroundColor: theme.colors.surface, borderRadius: 14, borderWidth: 1, borderColor: theme.colors.surfaceVariant, elevation: 0 },
    cardContent: { paddingVertical: 14, paddingHorizontal: 14 },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    statusIndicator: { width: 4, height: 36, borderRadius: 2 },
    appNameWrap: { flex: 1 },
    appName: { fontWeight: '600', color: theme.colors.onSurface },
    statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
    infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.outlineVariant },
    infoItem: { flexDirection: 'row', alignItems: 'center', gap: 3, maxWidth: '48%' },
    infoText: { color: theme.colors.onSurfaceVariant, fontSize: 12, flexShrink: 1 },
    monitoringSection: { marginTop: 10, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: theme.colors.outlineVariant, gap: 6 },
    metricRow: { gap: 4 },
    metricLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    metricLabel: { color: theme.colors.onSurfaceVariant, fontWeight: '500' },
    metricValue: { color: theme.colors.onSurface, fontWeight: '600' },
    progressBar: { height: 4, borderRadius: 2, backgroundColor: theme.colors.surfaceVariant },
    emptyState: { alignItems: 'center', justifyContent: 'center', paddingVertical: 80, paddingHorizontal: 32 },
    emptyTitle: { marginTop: 16, color: theme.colors.onSurface },
    emptySubtitle: { marginTop: 8, textAlign: 'center', color: theme.colors.onSurfaceVariant },
  });

export default MonitoringScreen;
