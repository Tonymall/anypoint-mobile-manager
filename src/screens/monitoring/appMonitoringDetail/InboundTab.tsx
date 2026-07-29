// ============================================================
// App Monitoring Detail - Inbound tab
// ============================================================

import React from 'react';
import { View } from 'react-native';
import { Text, Card, Divider, useTheme } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { anypointColors } from '../../../theme';
import SimpleLineChart from './SimpleLineChart';
import { type AppMonitoringMetrics } from './useAppMonitoringMetrics';
import { type AppMonitoringDetailStyles } from './styles';

interface InboundTabProps {
  metrics: AppMonitoringMetrics;
  styles: AppMonitoringDetailStyles;
  dashStatsLoading: boolean;
}

const InboundTab: React.FC<InboundTabProps> = ({ metrics, styles, dashStatsLoading }) => {
  const theme = useTheme();
  const {
    messageCount,
    hasInboundHttpData,
    inboundAvgResponseTime,
    inboundRequestCount,
    inboundErrorCount,
    inboundRequestSeries,
    inboundResponseTimeSeries,
  } = metrics;

  return (
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
                {inboundAvgResponseTime != null ? `${inboundAvgResponseTime}ms` : '—'}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                {inboundRequestCount != null ? 'Total Requests' : 'Messages'}
              </Text>
              <Text variant="titleLarge" style={{ color: (messageCount != null || inboundRequestCount != null) ? anypointColors.primary : theme.colors.onSurface, fontWeight: '700' }}>
                {inboundRequestCount != null ? String(inboundRequestCount) : messageCount != null ? String(messageCount) : '—'}
              </Text>
            </View>
            <View style={{ flex: 1, alignItems: 'center' }}>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>Errors</Text>
              <Text variant="titleLarge" style={{ color: (inboundErrorCount ?? 0) > 0 ? anypointColors.error : theme.colors.onSurface, fontWeight: '700' }}>
                {inboundErrorCount != null ? String(inboundErrorCount) : '—'}
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
};

export default InboundTab;
