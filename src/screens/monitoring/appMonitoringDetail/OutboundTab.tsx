// ============================================================
// App Monitoring Detail - Outbound tab
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Text, Card, Divider, useTheme } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { anypointColors } from '../../../theme';
import SimpleLineChart from './SimpleLineChart';
import { type AppMonitoringMetrics } from './useAppMonitoringMetrics';
import { type AppMonitoringDetailStyles } from './styles';

interface OutboundTabProps {
  metrics: AppMonitoringMetrics;
  styles: AppMonitoringDetailStyles;
  dashStatsLoading: boolean;
}

const OutboundTab: React.FC<OutboundTabProps> = ({ metrics, styles, dashStatsLoading }) => {
  const theme = useTheme();
  const {
    hasOutboundData,
    outboundAvgResponseTime,
    outboundRequestCount,
    outboundErrorCount,
    outboundRequestSeries,
    outboundResponseTimeSeries,
  } = metrics;

  return (
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
                {outboundAvgResponseTime != null ? `${outboundAvgResponseTime}ms` : '—'}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Total Requests</Text>
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
};

export default OutboundTab;
