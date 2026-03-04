// ============================================================
// Application Detail Screen - Full app info with actions
// Uses real CloudHub API hooks, defensive field access
// Polls for status updates after lifecycle actions.
// ============================================================

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import {
  Text,
  Card,
  Button,
  useTheme,
  Appbar,
  Portal,
  Snackbar,
  TextInput,
  IconButton,
  ActivityIndicator,
} from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { statusColors, anypointColors } from '../../theme';
import { ConfirmDialog } from '../../components/common';
import {
  useApplication,
  useStartApp,
  useStopApp,
  useRestartApp,
} from '../../hooks/queries';
import {
  getAppName,
  getAppId,
  getMuleVersion,
  getWorkerInfo,
  getDeploymentTarget,
} from '../../utils/appHelpers';
import * as runtimeService from '../../services/runtimeService';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// ---------------------------------------------------------------------------
// Status helpers
// ---------------------------------------------------------------------------

/** Transitional statuses — the app is mid-lifecycle change. */
const TRANSITIONAL_STATUSES = [
  'DEPLOYING',
  'UNDEPLOYING',
  'UPDATING',
  'STARTING',
  'STOPPING',
  'DEPLOY_FAILED',
];

const getStatusColor = (status: string): string => {
  switch (status) {
    case 'STARTED':
      return statusColors.started;
    case 'STOPPED':
      return statusColors.stopped;
    case 'FAILED':
    case 'DEPLOY_FAILED':
      return statusColors.failed;
    case 'DEPLOYING':
    case 'UNDEPLOYING':
    case 'UPDATING':
    case 'STARTING':
    case 'STOPPING':
      return statusColors.deploying;
    case 'PARTIALLY_STARTED':
      return statusColors.pending;
    default:
      return statusColors.stopped;
  }
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'STARTED':
      return 'Running';
    case 'STOPPED':
      return 'Stopped';
    case 'FAILED':
    case 'DEPLOY_FAILED':
      return 'Failed';
    case 'DEPLOYING':
      return 'Deploying…';
    case 'UNDEPLOYING':
      return 'Undeploying…';
    case 'UPDATING':
      return 'Updating…';
    case 'STARTING':
      return 'Starting…';
    case 'STOPPING':
      return 'Stopping…';
    case 'PARTIALLY_STARTED':
      return 'Partially started';
    default:
      return status;
  }
};

const isTransitional = (status: string): boolean =>
  TRANSITIONAL_STATUSES.includes(status);

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

  // --- Polling state: after a lifecycle action we poll every 3 s ---
  const [pollInterval, setPollInterval] = useState<number | false>(false);

  // --- Pending action: shown immediately before the API confirms ---
  const [pendingAction, setPendingAction] = useState<string | null>(null);

  /**
   * Mutation phase tracks the lifecycle transition:
   * - 'waiting_for_transition': mutation sent, waiting for status to change to UPDATING/DEPLOYING/etc.
   * - 'in_transition': saw a transitional status, now waiting for it to stabilize
   * - null: no active mutation
   *
   * This prevents the polling from stopping prematurely when the API still shows
   * the old stable status (e.g. STARTED after restart before UPDATING kicks in).
   */
  const [mutationPhase, setMutationPhase] = useState<'waiting_for_transition' | 'in_transition' | null>(null);

  // --- Data fetching (with optional polling) ---
  const {
    data: app,
    isLoading,
    isError,
    error,
    refetch,
  } = useApplication(domain as string, {
    refetchInterval: pollInterval || undefined,
  });

  // --- Track mutation phases and manage pendingAction / polling ---
  useEffect(() => {
    if (!mutationPhase || !app) return;
    const s = app?.status ?? '';

    if (mutationPhase === 'waiting_for_transition') {
      if (isTransitional(s)) {
        // Great — API now shows transitional status. Let real status drive the UI.
        setPendingAction(null);
        setMutationPhase('in_transition');
      }
      // If still showing the old stable status, keep polling — don't stop yet.
      // Safety timeout: after 60s of waiting, give up
      return;
    }

    if (mutationPhase === 'in_transition') {
      if (!isTransitional(s)) {
        // Status has stabilized (STARTED, STOPPED, FAILED, etc.)
        setPendingAction(null);
        setMutationPhase(null);
        // Give one extra poll then stop
        const timer = setTimeout(() => setPollInterval(false), 3000);
        return () => clearTimeout(timer);
      }
    }
  }, [app?.status, mutationPhase]);

  // --- Safety timeout: stop polling after 90 seconds no matter what ---
  useEffect(() => {
    if (!pollInterval) return;
    const timer = setTimeout(() => {
      setPollInterval(false);
      setPendingAction(null);
      setMutationPhase(null);
    }, 90_000);
    return () => clearTimeout(timer);
  }, [pollInterval]);

  // --- Mutations ---
  const startMutation = useStartApp();
  const stopMutation = useStopApp();
  const restartMutation = useRestartApp();

  // --- Confirmation dialog state ---
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart' | null>(null);

  // --- Snackbar state ---
  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);

  // --- Properties editing state ---
  const [editingProps, setEditingProps] = useState(false);
  const [editedProperties, setEditedProperties] = useState<Record<string, string>>({});
  const [savingProps, setSavingProps] = useState(false);

  // --- Derived values (only computed when app exists) ---
  const status = app?.status ?? 'UNKNOWN';
  const statusColor = useMemo(() => getStatusColor(status), [status]);
  const statusLabel = useMemo(() => getStatusLabel(status), [status]);

  // Effective display values: pendingAction overrides until API confirms
  const effectiveLabel = pendingAction || statusLabel;
  const effectiveColor = pendingAction ? statusColors.deploying : statusColor;
  const showSpinner = !!pendingAction || isTransitional(status);
  const workerInfo = useMemo(() => getWorkerInfo(app), [app]);

  // Worker stats from workerStatuses
  const workerStats = useMemo(() => {
    const appObj = app as any;
    const statuses = appObj?.workerStatuses ?? appObj?.workers?.statuses ?? [];
    if (statuses.length > 0) {
      const w = statuses[0];
      return w?.statisticsByWorker ?? w?.statistics ?? w ?? {};
    }
    return appObj?.monitoring ?? {};
  }, [app]);

  const cpuPercent = workerStats?.cpuPercentageUsed ?? workerStats?.cpu ?? workerStats?.cpuUsage ?? 0;
  const memTotalRaw = workerStats?.memoryTotalMax ?? workerStats?.memoryTotal ?? 0;
  const memUsedRaw = workerStats?.memoryTotalUsed ?? workerStats?.memoryUsage ?? 0;
  const memTotal = memTotalRaw > 10_000 ? Math.round(memTotalRaw / (1024 * 1024)) : memTotalRaw;
  const memUsage = memUsedRaw > 10_000 ? Math.round(memUsedRaw / (1024 * 1024)) : memUsedRaw;
  const memPercent = workerStats?.memoryPercentageUsed
    ?? (memTotal > 0 ? Math.round((memUsage / memTotal) * 100) : 0);
  const threadCount = workerStats?.threadCount ?? 0;

  const hasMonitoring = cpuPercent > 0 || memPercent > 0 || threadCount > 0;

  // --- Action handlers ---
  const showSnack = useCallback((msg: string) => {
    setSnackMsg(msg);
    setSnackVisible(true);
  }, []);

  const handleAction = useCallback(
    (action: 'start' | 'stop' | 'restart') => {
      if (action === 'stop' || action === 'restart') {
        setConfirmAction(action);
        setConfirmVisible(true);
        return;
      }
      // Start directly
      setPendingAction('Starting…');
      setMutationPhase('waiting_for_transition');
      startMutation.mutate(domain as string, {
        onSuccess: () => {
          showSnack('Application starting…');
          setPollInterval(3000);
        },
        onError: (err: any) => {
          setPendingAction(null);
          setMutationPhase(null);
          showSnack(`Start failed: ${err?.message ?? 'Unknown error'}`);
        },
      });
    },
    [domain, startMutation, showSnack],
  );

  const handleConfirm = useCallback(() => {
    setConfirmVisible(false);
    if (confirmAction === 'stop') {
      setPendingAction('Stopping…');
      setMutationPhase('waiting_for_transition');
      stopMutation.mutate(domain as string, {
        onSuccess: () => {
          showSnack('Application stopping…');
          setPollInterval(3000);
        },
        onError: (err: any) => {
          setPendingAction(null);
          setMutationPhase(null);
          showSnack(`Stop failed: ${err?.message ?? 'Unknown error'}`);
        },
      });
    } else if (confirmAction === 'restart') {
      setPendingAction('Restarting…');
      setMutationPhase('waiting_for_transition');
      restartMutation.mutate(domain as string, {
        onSuccess: () => {
          showSnack('Application restarting…');
          setPollInterval(3000);
        },
        onError: (err: any) => {
          setPendingAction(null);
          setMutationPhase(null);
          showSnack(`Restart failed: ${err?.message ?? 'Unknown error'}`);
        },
      });
    }
    setConfirmAction(null);
  }, [confirmAction, domain, stopMutation, restartMutation, showSnack]);

  const handleCancel = useCallback(() => {
    setConfirmVisible(false);
    setConfirmAction(null);
  }, []);

  const navigateToLogs = useCallback(() => {
    router.push({ pathname: '/(main)/runtime/logs' as any, params: { domain: domain as string } });
  }, [router, domain]);

  const navigateToSchedulers = useCallback(() => {
    router.push({ pathname: '/(main)/runtime/schedulers' as any, params: { domain: domain as string } });
  }, [router, domain]);

  // --- Properties editing ---
  const properties = (app?.properties ?? {}) as Record<string, string>;
  const hasProperties = Object.keys(properties).length > 0;

  const startEditing = useCallback(() => {
    setEditedProperties({ ...properties });
    setEditingProps(true);
  }, [properties]);

  const cancelEditing = useCallback(() => {
    setEditingProps(false);
    setEditedProperties({});
  }, []);

  const handlePropertyChange = useCallback((key: string, value: string) => {
    setEditedProperties((prev) => ({ ...prev, [key]: value }));
  }, []);

  const saveProperties = useCallback(async () => {
    setSavingProps(true);
    try {
      await runtimeService.updateProperties(domain as string, editedProperties);
      setEditingProps(false);
      showSnack('Properties updated successfully');
      refetch();
    } catch (err: any) {
      showSnack(`Failed to update: ${err?.message ?? 'Unknown error'}`);
    } finally {
      setSavingProps(false);
    }
  }, [domain, editedProperties, showSnack, refetch]);

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
  const isStopped = status === 'STOPPED' || status === 'FAILED' || status === 'UNDEPLOYED' || status === 'DEPLOY_FAILED';
  const isStarted = status === 'STARTED';
  const isInTransition = isTransitional(status);
  const isMutating =
    startMutation.isPending || stopMutation.isPending || restartMutation.isPending || !!pendingAction;

  return (
    <View style={styles.container}>
      {/* ---- Header ---- */}
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={getAppName(app)} />
        <Appbar.Action icon="refresh" onPress={() => refetch()} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ---- Status Banner ---- */}
        <Card
          style={[styles.statusCard, { borderLeftColor: effectiveColor }]}
          mode="elevated"
        >
          <Card.Content style={styles.statusContent}>
            <View style={styles.statusRow}>
              {showSpinner ? (
                <ActivityIndicator
                  size={16}
                  color={effectiveColor}
                  style={{ marginRight: 4 }}
                />
              ) : (
                <View style={[styles.statusDot, { backgroundColor: effectiveColor }]} />
              )}
              <Text
                variant="titleMedium"
                style={{ color: effectiveColor, fontWeight: '700' }}
              >
                {effectiveLabel}
              </Text>
            </View>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant }}
            >
              {app?.domain ?? domain}
            </Text>
            {showSpinner && (
              <Text
                variant="bodySmall"
                style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, fontStyle: 'italic' }}
              >
                Refreshing status automatically…
              </Text>
            )}
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
              disabled={isMutating || isInTransition}
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
              disabled={isMutating || isInTransition}
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
            disabled={isMutating || isStopped || isInTransition}
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

        {/* ---- Second row of actions ---- */}
        <View style={styles.actionsRow}>
          <Button
            mode="outlined"
            icon="calendar-clock"
            onPress={navigateToSchedulers}
            style={styles.actionBtn}
          >
            Schedulers
          </Button>
        </View>

        {/* ---- Monitoring ---- */}
        {hasMonitoring && (
          <>
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
                    <Text
                      variant="headlineSmall"
                      style={{
                        color: cpuPercent > 80 ? anypointColors.error : theme.colors.onSurface,
                      }}
                    >
                      {Math.round(cpuPercent)}%
                    </Text>
                  </View>
                  <View style={styles.metricItem}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Memory
                    </Text>
                    <Text
                      variant="headlineSmall"
                      style={{
                        color: memPercent > 80 ? anypointColors.error : theme.colors.onSurface,
                      }}
                    >
                      {Math.round(memPercent)}%
                    </Text>
                    {memTotal > 0 && (
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {memUsage} / {memTotal} MB
                      </Text>
                    )}
                  </View>
                  <View style={styles.metricItem}>
                    <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                      Threads
                    </Text>
                    <Text variant="headlineSmall" style={{ color: theme.colors.onSurface }}>
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
            <InfoItem label="Deployment Target" value={getDeploymentTarget(app)} />
            <InfoItem label="Mule Version" value={getMuleVersion(app) || 'N/A'} />
            <InfoItem label="Region" value={app?.region ?? 'N/A'} />
            <InfoItem label="Workers" value={`${workerInfo.amount} x ${workerInfo.typeName}`} />
            <InfoItem label="File Name" value={app?.fileName ?? 'N/A'} />
            <InfoItem
              label="Persistent Queues"
              value={app?.persistentQueues ? 'Enabled' : 'Disabled'}
            />
            <InfoItem
              label="Logging"
              value={
                app?.loggingEnabled !== undefined
                  ? app.loggingEnabled ? 'Enabled' : 'Disabled'
                  : 'N/A'
              }
            />
          </Card.Content>
        </Card>

        {/* ---- Properties (editable) ---- */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 }}>
          <Text variant="titleMedium" style={styles.sectionTitle}>
            Properties {hasProperties ? `(${Object.keys(properties).length})` : ''}
          </Text>
          {hasProperties && !editingProps && (
            <IconButton icon="pencil" size={18} onPress={startEditing} />
          )}
          {editingProps && (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <IconButton icon="close" size={18} onPress={cancelEditing} />
              <IconButton
                icon="content-save"
                size={18}
                iconColor={anypointColors.primary}
                onPress={saveProperties}
                disabled={savingProps}
              />
            </View>
          )}
        </View>
        <Card style={styles.card} mode="elevated">
          <Card.Content>
            {hasProperties ? (
              editingProps ? (
                Object.entries(editedProperties).map(([key, value]) => {
                  const isMasked = typeof value === 'string' && value.includes('****');
                  return (
                    <View key={key} style={{ marginBottom: 10 }}>
                      <Text
                        variant="labelSmall"
                        style={{ color: theme.colors.onSurfaceVariant, marginBottom: 2 }}
                      >
                        {key}
                      </Text>
                      <TextInput
                        value={isMasked ? '' : value}
                        placeholder={isMasked ? '••••••••' : 'Value'}
                        onChangeText={(v) => handlePropertyChange(key, v)}
                        mode="outlined"
                        dense
                        disabled={savingProps}
                        style={{ backgroundColor: theme.colors.surface, fontSize: 13 }}
                      />
                    </View>
                  );
                })
              ) : (
                Object.entries(properties).map(([key, value]) => (
                  <InfoItem
                    key={key}
                    label={key}
                    value={
                      typeof value === 'string' && value.includes('****')
                        ? '********'
                        : String(value ?? '')
                    }
                  />
                ))
              )
            ) : (
              <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
                No properties configured
              </Text>
            )}
          </Card.Content>
        </Card>
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

      {/* ---- Snackbar ---- */}
      <Snackbar
        visible={snackVisible}
        onDismiss={() => setSnackVisible(false)}
        duration={3000}
        action={{ label: 'OK', onPress: () => setSnackVisible(false) }}
      >
        {snackMsg}
      </Snackbar>
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
