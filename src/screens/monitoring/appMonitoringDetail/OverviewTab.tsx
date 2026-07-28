// ============================================================
// App Monitoring Detail - Overview tab
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Text, Card, ProgressBar, Divider, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { anypointColors } from '../../../theme';
import { getMuleVersion } from '../../../utils/appHelpers';
import { getStatusLabel } from '../../../utils/statusHelpers';
import SimpleLineChart from './SimpleLineChart';
import MetricCard from './MetricCard';
import { type AppMonitoringMetrics } from './useAppMonitoringMetrics';
import { type AppMonitoringDetailStyles } from './styles';

interface OverviewTabProps {
  metrics: AppMonitoringMetrics;
  styles: AppMonitoringDetailStyles;
  app: any;
  status: string;
  sColor: string;
  cpuLoading: boolean;
  memLoading: boolean;
  dashStatsLoading: boolean;
  cpuVal: any;
  memVal: any;
  cpuHealthColor: string;
  cpuHealthLabel: string;
  memHealthColor: string;
  memHealthLabel: string;
}

const OverviewTab: React.FC<OverviewTabProps> = ({
  metrics,
  styles,
  app,
  status,
  sColor,
  cpuLoading,
  memLoading,
  dashStatsLoading,
  cpuVal,
  memVal,
  cpuHealthColor,
  cpuHealthLabel,
  memHealthColor,
  memHealthLabel,
}) => {
  const theme = useTheme();
  const {
    hasAnyMetrics,
    hasRealCpu,
    hasRealMem,
    hasRealThreads,
    configuredCpu,
    configuredMemory,
    cpuData,
    memData,
    cpuPercent,
    memPercent,
    memTotal,
    memUsage,
    messageCount,
    influxThreadCount,
    threadCount,
  } = metrics;

  return (
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
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
              Configured CPU limit: {configuredCpu}
            </Text>
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
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 6 }}>
              Configured memory limit: {configuredMemory}
            </Text>
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
};

export default OverviewTab;
