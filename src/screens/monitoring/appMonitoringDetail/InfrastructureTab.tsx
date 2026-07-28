// ============================================================
// App Monitoring Detail - Infrastructure tab
// ============================================================

import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Text, Card, ProgressBar, Divider, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { anypointColors } from '../../../theme';
import { getMuleVersion } from '../../../utils/appHelpers';
import { extractOptionalNumericValue, flattenWorkerStats } from './metricHelpers';
import { type AppMonitoringMetrics } from './useAppMonitoringMetrics';
import { type AppMonitoringDetailStyles } from './styles';

interface InfrastructureTabProps {
  metrics: AppMonitoringMetrics;
  styles: AppMonitoringDetailStyles;
  app: any;
  status: string;
}

const InfrastructureTab: React.FC<InfrastructureTabProps> = ({ metrics, styles, app, status }) => {
  const theme = useTheme();
  const {
    workerInfo,
    workerStatuses,
    numWorkers,
    hasRealCpu,
    hasRealMem,
    hasAnyMetrics,
    influxCpu,
    influxMem,
    influxThreadCount,
    cpuPercent,
    memPercent,
    memUsedRaw,
    memTotalRaw,
    configuredCpu,
    configuredMemory,
    configuredMemoryMB,
    threadCount,
  } = metrics;

  return (
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
              const hasLiveWorkerCpu = hasRealCpu && wCpu != null;
              const hasLiveWorkerMem = hasRealMem && wMem != null;

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
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Configured worker CPU limit
                      </Text>
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
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        Configured worker memory limit
                      </Text>
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
};

export default InfrastructureTab;
