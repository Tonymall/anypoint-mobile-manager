// ============================================================
// App Monitoring Detail - JVM tab
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Text, Card, Divider, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { anypointColors } from '../../../theme';
import SimpleLineChart from './SimpleLineChart';
import DetailRow from './DetailRow';
import { type AppMonitoringMetrics } from './useAppMonitoringMetrics';
import { type AppMonitoringDetailStyles } from './styles';

interface JvmTabProps {
  metrics: AppMonitoringMetrics;
  styles: AppMonitoringDetailStyles;
  dashStatsLoading: boolean;
}

const JvmTab: React.FC<JvmTabProps> = ({ metrics, styles, dashStatsLoading }) => {
  const theme = useTheme();
  const {
    hasRealCpu,
    hasRealMem,
    hasRealThreads,
    jvmCpuSeries,
    jvmHeapSeries,
    jvmThreadSeries,
    cpuPercent,
    memPercent,
    memTotal,
    threadCount,
    influxHeapUsed,
    jvmGcCollections,
    jvmGcTime,
    jvmClassesLoaded,
    jvmHeapCommitted,
    jvmNonHeapUsed,
  } = metrics;

  return (
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
};

export default JvmTab;
