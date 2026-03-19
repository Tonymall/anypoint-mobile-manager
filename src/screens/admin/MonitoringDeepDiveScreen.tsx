import React, { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Card, Text, useTheme, type MD3Theme } from 'react-native-paper';
import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useIsFocused } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Line, Path } from 'react-native-svg';

import { useApplications } from '../../hooks/queries';
import * as runtimeService from '../../services/runtimeService';
import { useAuthStore } from '../../stores/authStore';
import { anypointColors } from '../../theme';

type TrendPoint = {
  timestamp: number;
  value: number;
};

type MetricPanel = {
  key: string;
  title: string;
  value: string;
  subtitle: string;
  color: string;
  points: TrendPoint[];
};

function formatCount(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return Math.round(value).toLocaleString();
}

function formatPercent(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value)}%`;
}

function formatMillis(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  return `${Math.round(value)} ms`;
}

function formatMegabytes(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return '--';
  const mb = value > 1024 * 1024 ? value / (1024 * 1024) : value;
  return `${Math.round(mb)} MB`;
}

function formatDisplayValue(value: unknown): string {
  if (value == null) return '--';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) {
    const items = value.map((entry) => formatDisplayValue(entry)).filter((entry) => entry !== '--');
    return items.length > 0 ? items.join(', ') : '--';
  }
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;
    const preferred = [
      record.name,
      record.label,
      record.title,
      record.version,
      record.updateVersion,
      record.releaseChannel,
      record.javaVersion,
    ].map((entry) => formatDisplayValue(entry)).filter((entry) => entry !== '--');
    if (preferred.length > 0) {
      return preferred.join(' • ');
    }
    try {
      return JSON.stringify(record);
    } catch {
      return '--';
    }
  }
  return '--';
}

function getAppLabel(app: any): string {
  return formatDisplayValue(app?.name ?? app?.domain ?? app?.instanceLabel);
}

function getAppDomain(app: any): string {
  return formatDisplayValue(app?.domain ?? app?.name ?? app?.instanceLabel);
}

function getAppRuntimeLabel(app: any): string {
  return formatDisplayValue(app?.muleVersion);
}

function getAppSelectionKey(app: any): string {
  return formatDisplayValue(app?.domain ?? app?.name ?? app?.instanceLabel);
}

function buildSparklinePath(points: TrendPoint[], width: number, height: number): string {
  if (points.length === 0) return '';
  const values = points.map((point) => point.value);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return points.map((point, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - ((point.value - min) / range) * height;
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');
}

const Sparkline: React.FC<{
  color: string;
  points: TrendPoint[];
}> = ({ color, points }) => {
  const width = 260;
  const height = 64;
  const path = buildSparklinePath(points, width, height - 8);

  return (
    <Svg width={width} height={height}>
      <Line x1="0" y1={height - 6} x2={width} y2={height - 6} stroke={color + '33'} strokeWidth="1" />
      {path ? (
        <Path d={path} stroke={color} strokeWidth="3" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      ) : null}
    </Svg>
  );
};

const MonitoringDeepDiveScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const isFocused = useIsFocused();
  const currentOrg = useAuthStore((state) => state.currentOrganization);
  const currentEnv = useAuthStore((state) => state.currentEnvironment);
  const { data: applications = [], isLoading: appsLoading } = useApplications({ enabled: isFocused });

  const [periodMinutes, setPeriodMinutes] = useState<60 | 180 | 720>(180);
  const [selectedDomain, setSelectedDomain] = useState<string | null>(null);

  const runningApps = useMemo(
    () => applications.filter((app: any) => /started|running/i.test(app?.status ?? '')),
    [applications],
  );

  const effectiveSelectedDomain = useMemo(() => {
    if (selectedDomain && runningApps.some((app: any) => getAppSelectionKey(app) === selectedDomain)) {
      return selectedDomain;
    }
    return runningApps[0] ? getAppSelectionKey(runningApps[0]) : null;
  }, [runningApps, selectedDomain]);

  const selectedApp = useMemo(
    () => applications.find((app: any) => getAppSelectionKey(app) === effectiveSelectedDomain) ?? null,
    [applications, effectiveSelectedDomain],
  );

  const dashboardQuery = useQuery({
    queryKey: ['admin-monitoring-deep-dive', currentOrg?.id, currentEnv?.id, effectiveSelectedDomain, periodMinutes],
    queryFn: () => runtimeService.getDashboardStats(effectiveSelectedDomain!, periodMinutes, {
      organizationId: currentOrg?.id,
      environmentId: currentEnv?.id,
    }),
    enabled: !!effectiveSelectedDomain && isFocused,
  });

  const dashboardData = dashboardQuery.data as any;
  const timeSeries = Array.isArray(dashboardData?._timeSeries) ? dashboardData._timeSeries : [];
  const jvmMetrics = dashboardData?._jvmMetrics ?? {};
  const appMetrics = dashboardData?._appMetrics ?? {};
  const extraMetrics = dashboardData?._extraMetrics ?? {};

  const panels = useMemo<MetricPanel[]>(() => {
    const toPoints = (key: string) => timeSeries
      .filter((point: any) => point?.timestamp != null && point?.[key] != null)
      .map((point: any) => ({
        timestamp: Number(point.timestamp),
        value: Number(point[key]),
      }));

    return [
      {
        key: 'cpu',
        title: 'CPU Utilization',
        value: formatPercent(extraMetrics.cpuPercent ?? jvmMetrics.cpuUsage),
        subtitle: 'Latest process CPU',
        color: anypointColors.primary,
        points: toPoints('cpu'),
      },
      {
        key: 'memory',
        title: 'Memory Pressure',
        value: formatPercent(extraMetrics.memoryPercent),
        subtitle: 'Latest memory percent',
        color: anypointColors.warning,
        points: toPoints('memory'),
      },
      {
        key: 'heapUsed',
        title: 'Heap Used',
        value: formatMegabytes(jvmMetrics.heapUsed),
        subtitle: 'Current JVM heap',
        color: anypointColors.secondary,
        points: toPoints('heapUsed'),
      },
      {
        key: 'threadCount',
        title: 'Thread Count',
        value: formatCount(jvmMetrics.threadCount),
        subtitle: 'Live JVM threads',
        color: anypointColors.info,
        points: toPoints('threadCount'),
      },
      {
        key: 'inboundRequests',
        title: 'Inbound Requests',
        value: formatCount(appMetrics.inboundRequestCount),
        subtitle: 'Traffic volume',
        color: anypointColors.success,
        points: toPoints('inboundRequests'),
      },
      {
        key: 'inboundResponseTime',
        title: 'Avg Response Time',
        value: formatMillis(appMetrics.inboundAvgResponseTime),
        subtitle: 'Inbound average',
        color: anypointColors.mulePurple,
        points: toPoints('inboundResponseTime'),
      },
      {
        key: 'inboundErrors',
        title: 'Inbound Errors',
        value: formatCount(appMetrics.errorCount),
        subtitle: 'Observed errors',
        color: anypointColors.error,
        points: toPoints('inboundErrors'),
      },
      {
        key: 'messageCount',
        title: 'Messages Processed',
        value: formatCount(appMetrics.messageCount),
        subtitle: 'Flow throughput',
        color: anypointColors.accent,
        points: toPoints('messageCount'),
      },
    ];
  }, [appMetrics, extraMetrics, jvmMetrics, timeSeries]);

  return (
    <View style={styles.container}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} statusBarHeight={insets.top}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Monitoring Deep Dive" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleLarge" style={styles.sectionTitle}>Diagnostics dashboard</Text>
            <Text variant="bodySmall" style={styles.sectionSubtitle}>
              Deeper app-level monitoring view based on the same dashboard and observability endpoints used by the platform. Pick a running app to inspect JVM, traffic, and trend data.
            </Text>

            <View style={styles.summaryRow}>
              <View style={[styles.summaryCard, { backgroundColor: theme.colors.primary + '12' }]}>
                <Text style={[styles.summaryValue, { color: theme.colors.primary }]}>{runningApps.length}</Text>
                <Text style={styles.summaryLabel}>Running apps</Text>
              </View>
              <View style={[styles.summaryCard, { backgroundColor: anypointColors.secondary + '12' }]}>
                <Text style={[styles.summaryValue, { color: anypointColors.secondary }]}>{currentEnv?.name ?? '--'}</Text>
                <Text style={styles.summaryLabel}>Environment</Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>App selection</Text>
            <View style={styles.chipWrap}>
              {runningApps.slice(0, 12).map((app: any) => {
                const domain = getAppSelectionKey(app);
                const selected = domain === effectiveSelectedDomain;
                return (
                  <Pressable
                    key={domain}
                    onPress={() => setSelectedDomain(domain)}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected ? theme.colors.primary : theme.colors.outlineVariant,
                        backgroundColor: selected ? theme.colors.primary + '12' : theme.colors.surface,
                      },
                    ]}
                  >
                    <Text style={{ color: selected ? theme.colors.primary : theme.colors.onSurface }}>
                      {getAppLabel(app)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text variant="titleSmall" style={styles.subSectionTitle}>Time window</Text>
            <View style={styles.chipWrap}>
              {[
                { label: '1h', value: 60 },
                { label: '3h', value: 180 },
                { label: '12h', value: 720 },
              ].map((option) => {
                const selected = option.value === periodMinutes;
                return (
                  <Pressable
                    key={option.value}
                    onPress={() => setPeriodMinutes(option.value as 60 | 180 | 720)}
                    style={[
                      styles.chip,
                      {
                        borderColor: selected ? anypointColors.secondary : theme.colors.outlineVariant,
                        backgroundColor: selected ? anypointColors.secondary + '12' : theme.colors.surface,
                      },
                    ]}
                  >
                    <Text style={{ color: selected ? anypointColors.secondary : theme.colors.onSurface }}>
                      {option.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>Selected app</Text>
            {selectedApp ? (
              <View style={styles.selectedAppWrap}>
                <View>
                  <Text style={styles.selectedAppName}>{getAppLabel(selectedApp)}</Text>
                  <Text style={styles.selectedAppMeta}>
                    {getAppDomain(selectedApp)} • {getAppRuntimeLabel(selectedApp)} • {formatDisplayValue(selectedApp.region)}
                  </Text>
                </View>
                <Text style={[styles.statusBadge, { color: anypointColors.success, borderColor: anypointColors.success + '44' }]}>
                  {formatDisplayValue(selectedApp.status)}
                </Text>
              </View>
            ) : (
              <Text style={styles.emptyCopy}>
                {appsLoading ? 'Loading applications...' : 'No running app is available to inspect yet.'}
              </Text>
            )}
          </Card.Content>
        </Card>

        {panels.map((panel) => (
          <Card key={panel.key} style={styles.card}>
            <Card.Content>
              <View style={styles.panelHeader}>
                <View>
                  <Text variant="titleMedium" style={styles.sectionTitle}>{panel.title}</Text>
                  <Text variant="bodySmall" style={styles.sectionSubtitle}>{panel.subtitle}</Text>
                </View>
                <Text style={[styles.panelValue, { color: panel.color }]}>{panel.value}</Text>
              </View>

              {panel.points.length > 0 ? (
                <View style={styles.chartWrap}>
                  <Sparkline color={panel.color} points={panel.points.slice(-24)} />
                  <Text style={styles.chartHint}>Latest {Math.min(panel.points.length, 24)} samples</Text>
                </View>
              ) : (
                <Text style={styles.emptyCopy}>
                  {dashboardQuery.isLoading
                    ? 'Loading metric trend...'
                    : 'No trend data was returned for this metric in the selected time window.'}
                </Text>
              )}
            </Card.Content>
          </Card>
        ))}

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>JVM rollup</Text>
            <View style={styles.jvmGrid}>
              <View style={styles.jvmItem}>
                <Text style={styles.jvmValue}>{formatMegabytes(jvmMetrics.heapCommitted)}</Text>
                <Text style={styles.jvmLabel}>Heap committed</Text>
              </View>
              <View style={styles.jvmItem}>
                <Text style={styles.jvmValue}>{formatMegabytes(jvmMetrics.nonHeapUsed)}</Text>
                <Text style={styles.jvmLabel}>Non-heap used</Text>
              </View>
              <View style={styles.jvmItem}>
                <Text style={styles.jvmValue}>{formatCount(jvmMetrics.classesLoaded)}</Text>
                <Text style={styles.jvmLabel}>Classes loaded</Text>
              </View>
              <View style={styles.jvmItem}>
                <Text style={styles.jvmValue}>{formatCount(jvmMetrics.gcCollections)}</Text>
                <Text style={styles.jvmLabel}>GC collections</Text>
              </View>
            </View>
          </Card.Content>
        </Card>
      </ScrollView>
    </View>
  );
};

const createStyles = (theme: MD3Theme) => StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  headerTitle: { fontSize: 20, fontWeight: '700', letterSpacing: -0.3 },
  content: { padding: 16, paddingBottom: 32, gap: 12 },
  card: { backgroundColor: theme.colors.surface, borderRadius: 20 },
  sectionTitle: { fontWeight: '700', marginBottom: 6 },
  sectionSubtitle: { color: theme.colors.onSurfaceVariant, marginBottom: 10, lineHeight: 18 },
  summaryRow: { flexDirection: 'row', gap: 10 },
  summaryCard: { flex: 1, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 14 },
  summaryValue: { fontSize: 24, fontWeight: '800', letterSpacing: -0.6 },
  summaryLabel: { marginTop: 4, color: theme.colors.onSurfaceVariant, fontSize: 12, fontWeight: '600' },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 8 },
  subSectionTitle: { marginTop: 12, marginBottom: 8, fontWeight: '700' },
  selectedAppWrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  selectedAppName: { fontSize: 16, fontWeight: '700', color: theme.colors.onSurface },
  selectedAppMeta: { marginTop: 2, color: theme.colors.onSurfaceVariant, fontSize: 12 },
  statusBadge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    fontWeight: '700',
  },
  panelHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 },
  panelValue: { fontSize: 22, fontWeight: '800', letterSpacing: -0.6 },
  chartWrap: { marginTop: 4 },
  chartHint: { color: theme.colors.onSurfaceVariant, fontSize: 11 },
  emptyCopy: { color: theme.colors.onSurfaceVariant, fontSize: 12 },
  jvmGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  jvmItem: {
    width: '48%',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 14,
    backgroundColor: theme.colors.background,
  },
  jvmValue: { fontSize: 18, fontWeight: '800', color: theme.colors.onSurface },
  jvmLabel: { marginTop: 4, color: theme.colors.onSurfaceVariant, fontSize: 12 },
});

export default MonitoringDeepDiveScreen;
