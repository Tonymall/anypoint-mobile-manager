// ============================================================
// Application Detail Screen - Full app info with actions
// ============================================================

import React, { useMemo, useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import {
  Text,
  Card,
  Chip,
  Button,
  Divider,
  useTheme,
  Appbar,
  Portal,
} from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import type { Application } from '../../types';
import { statusColors, anypointColors } from '../../theme';
import { ConfirmDialog } from '../../components/common';

interface RouteParams {
  app: Application;
}

const ApplicationDetailScreen: React.FC<{
  navigation: any;
  route: { params: RouteParams };
}> = ({ navigation, route }) => {
  const theme = useTheme();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const app = route.params.app;
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart' | null>(null);

  const statusColor = useMemo(() => {
    switch (app.status) {
      case 'STARTED': return statusColors.started;
      case 'STOPPED': return statusColors.stopped;
      case 'FAILED': return statusColors.failed;
      case 'DEPLOYING': return statusColors.deploying;
      default: return statusColors.stopped;
    }
  }, [app.status]);

  const cpuPercent = app.monitoring.cpuUsage;
  const memPercent = app.monitoring.memoryTotal > 0
    ? Math.round((app.monitoring.memoryUsage / app.monitoring.memoryTotal) * 100)
    : 0;

  const handleAction = useCallback(async (action: 'start' | 'stop' | 'restart') => {
    if (action === 'stop' || action === 'restart') {
      setConfirmAction(action);
      setConfirmVisible(true);
      return;
    }
    setActionLoading(action);
    // Simulate API call
    setTimeout(() => setActionLoading(null), 2000);
  }, []);

  const handleConfirm = useCallback(() => {
    setConfirmVisible(false);
    if (confirmAction) {
      setActionLoading(confirmAction);
      setTimeout(() => setActionLoading(null), 2000);
    }
  }, [confirmAction]);

  return (
    <View style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={app.name} />
        <Appbar.Action icon="dots-vertical" onPress={() => {}} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Status Banner */}
        <Card style={[styles.statusCard, { borderLeftColor: statusColor }]} mode="elevated">
          <Card.Content style={styles.statusContent}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text variant="titleMedium" style={{ color: theme.colors.onSurface }}>
                {app.status}
              </Text>
            </View>
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
              {app.domain}
            </Text>
          </Card.Content>
        </Card>

        {/* Actions */}
        <View style={styles.actionsRow}>
          {app.status === 'STOPPED' || app.status === 'FAILED' ? (
            <Button
              mode="contained"
              icon="play"
              onPress={() => handleAction('start')}
              loading={actionLoading === 'start'}
              style={styles.actionBtn}
              buttonColor={anypointColors.success}
            >
              Start
            </Button>
          ) : (
            <Button
              mode="contained"
              icon="stop"
              onPress={() => handleAction('stop')}
              loading={actionLoading === 'stop'}
              style={styles.actionBtn}
              buttonColor={anypointColors.error}
            >
              Stop
            </Button>
          )}
          <Button
            mode="outlined"
            icon="restart"
            onPress={() => handleAction('restart')}
            loading={actionLoading === 'restart'}
            style={styles.actionBtn}
            disabled={app.status === 'STOPPED'}
          >
            Restart
          </Button>
          <Button
            mode="outlined"
            icon="text-box-search"
            onPress={() => {}}
            style={styles.actionBtn}
          >
            Logs
          </Button>
        </View>

        {/* Monitoring */}
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Monitoring
        </Text>
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <View style={styles.metricsGrid}>
              <View style={styles.metricItem}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  CPU Usage
                </Text>
                <Text variant="headlineSmall" style={{ color: cpuPercent > 80 ? anypointColors.error : theme.colors.onSurface }}>
                  {cpuPercent}%
                </Text>
              </View>
              <View style={styles.metricItem}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Memory
                </Text>
                <Text variant="headlineSmall" style={{ color: memPercent > 80 ? anypointColors.error : theme.colors.onSurface }}>
                  {memPercent}%
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {app.monitoring.memoryUsage} / {app.monitoring.memoryTotal} MB
                </Text>
              </View>
              <View style={styles.metricItem}>
                <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Threads
                </Text>
                <Text variant="headlineSmall" style={{ color: theme.colors.onSurface }}>
                  {app.monitoring.threadCount}
                </Text>
              </View>
            </View>
          </Card.Content>
        </Card>

        {/* Configuration */}
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Configuration
        </Text>
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <InfoItem label="Deployment Target" value={app.deploymentTarget} />
            <InfoItem label="Mule Version" value={app.muleVersion} />
            <InfoItem label="Region" value={app.region} />
            <InfoItem
              label="Workers"
              value={`${app.workers.amount} x ${app.workers.type.name} (${app.workers.type.cpu}, ${app.workers.type.memory})`}
            />
            <InfoItem label="File" value={app.fileName} />
            <InfoItem
              label="Persistent Queues"
              value={app.persistentQueues ? 'Enabled' : 'Disabled'}
            />
            <InfoItem
              label="Logging"
              value={app.loggingEnabled ? 'Enabled' : 'Disabled'}
            />
          </Card.Content>
        </Card>

        {/* Properties */}
        {app.properties && Object.keys(app.properties).length > 0 && (
          <>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Properties
            </Text>
            <Card style={styles.card} mode="elevated">
              <Card.Content>
                {Object.entries(app.properties).map(([key, value]) => (
                  <InfoItem
                    key={key}
                    label={key}
                    value={value.includes('****') ? '********' : value}
                  />
                ))}
              </Card.Content>
            </Card>
          </>
        )}
      </ScrollView>

      <Portal>
        <ConfirmDialog
          visible={confirmVisible}
          title={`${confirmAction === 'stop' ? 'Stop' : 'Restart'} Application`}
          message={`Are you sure you want to ${confirmAction} "${app.name}"?`}
          confirmLabel={confirmAction === 'stop' ? 'Stop' : 'Restart'}
          destructive={confirmAction === 'stop'}
          onConfirm={handleConfirm}
          onCancel={() => setConfirmVisible(false)}
        />
      </Portal>
    </View>
  );
};

const InfoItem: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const theme = useTheme();
  return (
    <View style={infoStyles.row}>
      <Text variant="labelMedium" style={{ color: theme.colors.onSurfaceVariant, width: 140 }}>
        {label}
      </Text>
      <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, flex: 1 }} selectable>
        {value}
      </Text>
    </View>
  );
};

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: 6,
  },
});

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
      marginTop: 12,
      borderLeftWidth: 4,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
    },
    statusContent: {
      paddingVertical: 12,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    statusDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
    },
    actionsRow: {
      flexDirection: 'row',
      paddingHorizontal: 16,
      paddingTop: 16,
      gap: 8,
    },
    actionBtn: {
      flex: 1,
      borderRadius: 8,
    },
    sectionTitle: {
      fontWeight: '600',
      paddingHorizontal: 16,
      marginTop: 24,
      marginBottom: 8,
      color: theme.colors.onBackground,
    },
    card: {
      marginHorizontal: 16,
      borderRadius: 12,
      backgroundColor: theme.colors.surface,
    },
    metricsGrid: {
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    metricItem: {
      alignItems: 'center',
    },
  });

export default ApplicationDetailScreen;
