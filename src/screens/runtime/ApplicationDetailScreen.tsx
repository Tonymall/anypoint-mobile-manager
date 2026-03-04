// ============================================================
// Application Detail Screen - Full app info with actions
// Uses real CloudHub API hooks, defensive field access
// ============================================================

import React, { useMemo, useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { Text, Card, Button, useTheme, Appbar, Portal } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { statusColors, anypointColors } from '../../theme';
import { ConfirmDialog } from '../../components/common';
import { useApplication, useStartApp, useStopApp, useRestartApp } from '../../hooks/queries';
import { getAppName, getAppId, getMuleVersion, getWorkerInfo, getDeploymentTarget } from '../../utils/appHelpers';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'STARTED':
      return statusColors.started;
    case 'STOPPED':
      return statusColors.stopped;
    case 'FAILED':
      return statusColors.failed;
    case 'DEPLOYING':
    case 'UNDEPLOYING':
      return statusColors.deploying;
    case 'PARTIALLY_STARTED':
      return statusColors.pending;
    default:
      return statusColors.stopped;
  }
};

// ---------------------------------------------------------------------------
// InfoItem — reusable key/value row
// ---------------------------------------------------------------------------

const InfoItem: React.FC<{ label: string; value: string }> = ({ label, value }) => {
  const theme = useTheme();
  return (
    <View style={infoStyles.row}>
      <Text
        variant="labelMedium"
        style={{ color: theme.colors.onSurfaceVariant, width: 140 }}
      >
        {label}
      </Text>
      <Text
        variant="bodyMedium"
        style={{ color: theme.colors.onSurface, flex: 1 }}
        selectable
      >
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

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

const ApplicationDetailScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { domain } = useLocalSearchParams<{ domain: string }>();

  // --- Data fetching ---
  const {
    data: app,
    isLoading,
    isError,
    error,
    refetch,
  } = useApplication(domain as string);

  // --- Mutations ---
  const startMutation = useStartApp();
  const stopMutation = useStopApp();
  const restartMutation = useRestartApp();

  // --- Confirmation dialog state ---
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart' | null>(null);

  // --- Derived values (only computed when app exists) ---
  const status = app?.status ?? 'UNKNOWN';
  const statusColor = useMemo(() => getStatusColor(status), [status]);
  const workerInfo = useMemo(() => getWorkerInfo(app), [app]);

  // Monitoring - may be undefined
  const monitoring = app?.monitoring;
  const cpuPercent = monitoring?.cpuUsage ?? 0;
  const memTotal = monitoring?.memoryTotal ?? 0;
  const memUsage = monitoring?.memoryUsage ?? 0;
  const memPercent = memTotal > 0 ? Math.round((memUsage / memTotal) * 100) : 0;
  const threadCount = monitoring?.threadCount ?? 0;

  // --- Action handlers ---
  const handleAction = useCallback(
    (action: 'start' | 'stop' | 'restart') => {
      if (action === 'stop' || action === 'restart') {
        setConfirmAction(action);
        setConfirmVisible(true);
        return;
      }
      // Start directly
      startMutation.mutate(domain as string);
    },
    [domain, startMutation],
  );

  const handleConfirm = useCallback(() => {
    setConfirmVisible(false);
    if (confirmAction === 'stop') {
      stopMutation.mutate(domain as string);
    } else if (confirmAction === 'restart') {
      restartMutation.mutate(domain as string);
    }
    setConfirmAction(null);
  }, [confirmAction, domain, stopMutation, restartMutation]);

  const handleCancel = useCallback(() => {
    setConfirmVisible(false);
    setConfirmAction(null);
  }, []);

  const navigateToLogs = useCallback(() => {
    router.push({ pathname: '/(main)/runtime/logs' as any, params: { domain: domain as string } });
  }, [router, domain]);

  // --- Loading / Error states ---
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Application" />
        </Appbar.Header>
        <LoadingState message="Loading application details..." />
      </View>
    );
  }

  if (isError || !app) {
    return (
      <View style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Application" />
        </Appbar.Header>
        <ErrorState
          message={error?.message ?? 'Failed to load application details.'}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  // --- Determine which action buttons to show ---
  const isStopped = status === 'STOPPED' || status === 'FAILED' || status === 'UNDEPLOYED';
  const isStarted = status === 'STARTED';
  const isMutating =
    startMutation.isPending || stopMutation.isPending || restartMutation.isPending;

  // --- Properties ---
  const properties = app?.properties as Record<string, string> | undefined;
  const hasProperties = properties && Object.keys(properties).length > 0;

  return (
    <View style={styles.container}>
      {/* ---- Header ---- */}
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={getAppName(app)} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Status Banner ---- */}
        <Card
          style={[styles.statusCard, { borderLeftColor: statusColor }]}
          mode="elevated"
        >
          <Card.Content style={styles.statusContent}>
            <View style={styles.statusRow}>
              <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.onSurface }}
              >
                {status}
              </Text>
            </View>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {app?.domain ?? domain}
            </Text>
          </Card.Content>
        </Card>

        {/* ---- Action Buttons ---- */}
        <View style={styles.actionsRow}>
          {isStopped && (
            <Button
              mode="contained"
              icon="play"
              onPress={() => handleAction('start')}
              loading={startMutation.isPending}
              disabled={isMutating}
              style={styles.actionBtn}
              buttonColor={anypointColors.success}
            >
              Start
            </Button>
          )}
          {isStarted && (
            <Button
              mode="contained"
              icon="stop"
              onPress={() => handleAction('stop')}
              loading={stopMutation.isPending}
              disabled={isMutating}
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
            loading={restartMutation.isPending}
            disabled={isMutating || isStopped}
            style={styles.actionBtn}
          >
            Restart
          </Button>
          <Button
            mode="outlined"
            icon="text-box-search"
            onPress={navigateToLogs}
            style={styles.actionBtn}
          >
            Logs
          </Button>
        </View>

        {/* ---- Monitoring (conditional) ---- */}
        {monitoring && (
          <>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Monitoring
            </Text>
            <Card style={styles.card} mode="elevated">
              <Card.Content>
                <View style={styles.metricsGrid}>
                  <View style={styles.metricItem}>
                    <Text
                      variant="labelSmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      CPU Usage
                    </Text>
                    <Text
                      variant="headlineSmall"
                      style={{
                        color:
                          cpuPercent > 80
                            ? anypointColors.error
                            : theme.colors.onSurface,
                      }}
                    >
                      {cpuPercent}%
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text
                      variant="labelSmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      Memory
                    </Text>
                    <Text
                      variant="headlineSmall"
                      style={{
                        color:
                          memPercent > 80
                            ? anypointColors.error
                            : theme.colors.onSurface,
                      }}
                    >
                      {memPercent}%
                    </Text>
                    <Text
                      variant="bodySmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      {memUsage} / {memTotal} MB
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text
                      variant="labelSmall"
                      style={{ color: theme.colors.onSurfaceVariant }}
                    >
                      Threads
                    </Text>
                    <Text
                      variant="headlineSmall"
                      style={{ color: theme.colors.onSurface }}
                    >
                      {threadCount}
                    </Text>
                  </View>
                </View>
              </Card.Content>
            </Card>
          </>
        )}

        {/* ---- Configuration ---- */}
        <Text variant="titleMedium" style={styles.sectionTitle}>
          Configuration
        </Text>
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            <InfoItem
              label="Deployment Target"
              value={getDeploymentTarget(app)}
            />
            <InfoItem
              label="Mule Version"
              value={getMuleVersion(app) || 'N/A'}
            />
            <InfoItem
              label="Region"
              value={app?.region ?? 'N/A'}
            />
            <InfoItem
              label="Workers"
              value={`${workerInfo.amount} x ${workerInfo.typeName}`}
            />
            <InfoItem
              label="File Name"
              value={app?.fileName ?? 'N/A'}
            />
            <InfoItem
              label="Persistent Queues"
              value={app?.persistentQueues ? 'Enabled' : 'Disabled'}
            />
            <InfoItem
              label="Logging"
              value={
                app?.loggingEnabled !== undefined
                  ? app.loggingEnabled
                    ? 'Enabled'
                    : 'Disabled'
                  : 'N/A'
              }
            />
          </Card.Content>
        </Card>

        {/* ---- Properties (conditional) ---- */}
        {hasProperties && (
          <>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Properties
            </Text>
            <Card style={styles.card} mode="elevated">
              <Card.Content>
                {Object.entries(properties!).map(([key, value]) => (
                  <InfoItem
                    key={key}
                    label={key}
                    value={
                      typeof value === 'string' && value.includes('****')
                        ? '********'
                        : String(value ?? '')
                    }
                  />
                ))}
              </Card.Content>
            </Card>
          </>
        )}
      </ScrollView>

      {/* ---- Confirmation Dialog ---- */}
      <Portal>
        <ConfirmDialog
          visible={confirmVisible}
          title={`${confirmAction === 'stop' ? 'Stop' : 'Restart'} Application`}
          message={`Are you sure you want to ${confirmAction ?? ''} "${getAppName(app)}"?`}
          confirmLabel={confirmAction === 'stop' ? 'Stop' : 'Restart'}
          destructive={confirmAction === 'stop'}
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      </Portal>
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
