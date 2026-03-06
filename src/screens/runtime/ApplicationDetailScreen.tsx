// ============================================================
// Application Detail Screen - Full app info with actions
// 2026 Modern Dark-First Design with glassmorphic cards,
// accent borders, and refined metric displays.
// ============================================================

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { StyleSheet, View, ScrollView, Pressable } from 'react-native';
import {
  Text,
  useTheme,
  Appbar,
  Portal,
  Snackbar,
  TextInput,
  IconButton,
  ActivityIndicator,
  type MD3Theme,
} from 'react-native-paper';
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
  getMuleVersion,
  getWorkerInfo,
  getDeploymentTarget,
} from '../../utils/appHelpers';
import * as runtimeService from '../../services/runtimeService';
import { getStatusColor, getStatusLabel, isTransitional } from '../../utils/statusHelpers';
import { hapticSuccess, hapticError } from '../../utils/haptics';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// ---------------------------------------------------------------------------
// InfoItem — reusable key/value row
// ---------------------------------------------------------------------------

const InfoItem: React.FC<{ label: string; value: string; icon?: string; iconColor?: string }> = ({
  label, value, icon, iconColor,
}) => {
  const theme = useTheme();
  return (
    <View style={infoStyles.row}>
      {icon && (
        <View style={[infoStyles.iconBox, { backgroundColor: (iconColor ?? theme.colors.onSurfaceVariant) + '14' }]}>
          <Icon name={icon} size={14} color={iconColor ?? theme.colors.onSurfaceVariant} />
        </View>
      )}
      <Text
        variant="labelMedium"
        style={{ color: theme.colors.onSurfaceVariant, width: icon ? 100 : 110, flexShrink: 0 }}
        numberOfLines={1}
      >
        {label}
      </Text>
      <Text
        variant="bodyMedium"
        style={{ color: theme.colors.onSurface, flex: 1 }}
        selectable
        numberOfLines={2}
      >
        {value}
      </Text>
    </View>
  );
};

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: 8,
  },
  iconBox: {
    width: 26,
    height: 26,
    borderRadius: 7,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

// ---------------------------------------------------------------------------
// MetricBox — compact metric display
// ---------------------------------------------------------------------------

const MetricBox: React.FC<{
  label: string;
  value: string;
  color: string;
  icon: string;
  warning?: boolean;
}> = ({ label, value, color, icon, warning }) => {
  const theme = useTheme();
  return (
    <View style={metricStyles.box}>
      <View style={[metricStyles.iconCircle, { backgroundColor: color + '14' }]}>
        <Icon name={icon} size={18} color={color} />
      </View>
      <Text
        variant="headlineSmall"
        style={{
          color: warning ? anypointColors.error : theme.colors.onSurface,
          fontWeight: '700',
          letterSpacing: -0.5,
        }}
      >
        {value}
      </Text>
      <Text style={[metricStyles.label, { color: theme.colors.onSurfaceVariant }]}>
        {label}
      </Text>
    </View>
  );
};

const metricStyles = StyleSheet.create({
  box: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 11,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 2,
  },
  label: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});

// ---------------------------------------------------------------------------
// Action Button
// ---------------------------------------------------------------------------

const ActionButton: React.FC<{
  icon: string;
  label: string;
  color?: string;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
}> = ({ icon, label, color, onPress, loading, disabled }) => {
  const theme = useTheme();
  const btnColor = color ?? theme.colors.primary;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityLabel={`${label}${disabled ? ', disabled' : ''}`}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled || !!loading }}
      style={[
        actionStyles.btn,
        {
          backgroundColor: disabled ? theme.colors.surfaceVariant : btnColor + '14',
          borderColor: disabled ? theme.colors.outlineVariant : btnColor + '30',
          opacity: disabled ? 0.5 : 1,
        },
      ]}
    >
      {loading ? (
        <ActivityIndicator size={16} color={btnColor} />
      ) : (
        <Icon name={icon} size={16} color={disabled ? theme.colors.onSurfaceVariant : btnColor} />
      )}
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: disabled ? theme.colors.onSurfaceVariant : btnColor,
          letterSpacing: 0.2,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
};

const actionStyles = StyleSheet.create({
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 80,
    flex: 1,
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

  const [pollInterval, setPollInterval] = useState<number | false>(false);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [mutationPhase, setMutationPhase] = useState<'waiting_for_transition' | 'in_transition' | null>(null);

  const {
    data: app,
    isLoading,
    isError,
    error,
    refetch,
  } = useApplication(domain as string, {
    refetchInterval: pollInterval || undefined,
  });

  useEffect(() => {
    if (!mutationPhase || !app) return;
    const s = app?.status ?? '';
    if (mutationPhase === 'waiting_for_transition') {
      if (isTransitional(s)) {
        setPendingAction(null);
        setMutationPhase('in_transition');
      }
      return;
    }
    if (mutationPhase === 'in_transition') {
      if (!isTransitional(s)) {
        setPendingAction(null);
        setMutationPhase(null);
        const timer = setTimeout(() => setPollInterval(false), 3000);
        return () => clearTimeout(timer);
      }
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- only re-run when status or phase changes, not the full app object
  }, [app?.status, mutationPhase]);

  useEffect(() => {
    if (!pollInterval) return;
    const timer = setTimeout(() => {
      setPollInterval(false);
      setPendingAction(null);
      setMutationPhase(null);
    }, 90_000);
    return () => clearTimeout(timer);
  }, [pollInterval]);

  const startMutation = useStartApp();
  const stopMutation = useStopApp();
  const restartMutation = useRestartApp();

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'stop' | 'restart' | null>(null);
  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);
  const [editingProps, setEditingProps] = useState(false);
  const [editedProperties, setEditedProperties] = useState<Record<string, string>>({});
  const [savingProps, setSavingProps] = useState(false);

  const status = app?.status ?? 'UNKNOWN';
  const statusColor = useMemo(() => getStatusColor(status), [status]);
  const statusLabel = useMemo(() => getStatusLabel(status), [status]);

  const effectiveLabel = pendingAction || statusLabel;
  const effectiveColor = pendingAction ? statusColors.deploying : statusColor;
  const showSpinner = !!pendingAction || isTransitional(status);
  const workerInfo = useMemo(() => getWorkerInfo(app), [app]);

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
      setPendingAction('Starting…');
      setMutationPhase('waiting_for_transition');
      startMutation.mutate(domain as string, {
        onSuccess: () => { showSnack('Application starting…'); hapticSuccess(); setPollInterval(3000); },
        onError: (err: any) => { hapticError(); setPendingAction(null); setMutationPhase(null); showSnack(`Start failed: ${err?.message ?? 'Unknown error'}`); },
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
        onSuccess: () => { showSnack('Application stopping…'); hapticSuccess(); setPollInterval(3000); },
        onError: (err: any) => { hapticError(); setPendingAction(null); setMutationPhase(null); showSnack(`Stop failed: ${err?.message ?? 'Unknown error'}`); },
      });
    } else if (confirmAction === 'restart') {
      setPendingAction('Restarting…');
      setMutationPhase('waiting_for_transition');
      restartMutation.mutate(domain as string, {
        onSuccess: () => { showSnack('Application restarting…'); hapticSuccess(); setPollInterval(3000); },
        onError: (err: any) => { hapticError(); setPendingAction(null); setMutationPhase(null); showSnack(`Restart failed: ${err?.message ?? 'Unknown error'}`); },
      });
    }
    setConfirmAction(null);
  }, [confirmAction, domain, stopMutation, restartMutation, showSnack]);

  const handleCancel = useCallback(() => { setConfirmVisible(false); setConfirmAction(null); }, []);

  const navigateToLogs = useCallback(() => {
    router.push({ pathname: '/(main)/runtime/logs' as any, params: { domain: domain as string } });
  }, [router, domain]);

  const navigateToSchedulers = useCallback(() => {
    router.push({ pathname: '/(main)/runtime/schedulers' as any, params: { domain: domain as string } });
  }, [router, domain]);

  const properties = useMemo(() => (app?.properties ?? {}) as Record<string, string>, [app?.properties]);
  const hasProperties = Object.keys(properties).length > 0;

  const startEditing = useCallback(() => { setEditedProperties({ ...properties }); setEditingProps(true); }, [properties]);
  const cancelEditing = useCallback(() => { setEditingProps(false); setEditedProperties({}); }, []);
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
        <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Application" titleStyle={{ fontWeight: '600' }} />
        </Appbar.Header>
        <LoadingState message="Loading application details..." />
      </View>
    );
  }

  if (isError || !app) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Application" titleStyle={{ fontWeight: '600' }} />
        </Appbar.Header>
        <ErrorState
          message={error?.message ?? 'Failed to load application details.'}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  const isStopped = status === 'STOPPED' || status === 'FAILED' || status === 'UNDEPLOYED' || status === 'DEPLOY_FAILED';
  const isStarted = status === 'STARTED';
  const isInTransition = isTransitional(status);
  const isMutating = startMutation.isPending || stopMutation.isPending || restartMutation.isPending || !!pendingAction;

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={getAppName(app)} titleStyle={{ fontWeight: '600', letterSpacing: -0.3 }} />
        <Appbar.Action icon="refresh" onPress={() => refetch()} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Status Banner ── */}
        <View style={[styles.statusCard, { borderLeftColor: effectiveColor, borderColor: theme.colors.outlineVariant }]}>
          {/* Accent glow */}
          <View style={[styles.statusGlow, { backgroundColor: effectiveColor }]} />
          <View style={styles.statusContent}>
            <View style={styles.statusRow}>
              {showSpinner ? (
                <ActivityIndicator size={14} color={effectiveColor} style={{ marginRight: 6 }} />
              ) : (
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: effectiveColor,
                      shadowColor: effectiveColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: isStarted ? 0.6 : 0,
                      shadowRadius: 6,
                    },
                  ]}
                />
              )}
              <Text
                variant="titleMedium"
                style={{ color: effectiveColor, fontWeight: '700', letterSpacing: -0.2 }}
              >
                {effectiveLabel}
              </Text>
            </View>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant, fontFamily: 'monospace', fontSize: 12 }}
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
          </View>
        </View>

        {/* ── Action Buttons ── */}
        <View style={styles.actionsRow}>
          {isStopped && (
            <ActionButton
              icon="play"
              label="Start"
              color={anypointColors.success}
              onPress={() => handleAction('start')}
              loading={startMutation.isPending}
              disabled={isMutating || isInTransition}
            />
          )}
          {isStarted && (
            <ActionButton
              icon="stop"
              label="Stop"
              color={anypointColors.error}
              onPress={() => handleAction('stop')}
              loading={stopMutation.isPending}
              disabled={isMutating || isInTransition}
            />
          )}
          <ActionButton
            icon="restart"
            label="Restart"
            color={anypointColors.warning}
            onPress={() => handleAction('restart')}
            loading={restartMutation.isPending}
            disabled={isMutating || isStopped || isInTransition}
          />
          <ActionButton
            icon="text-box-search-outline"
            label="Logs"
            onPress={navigateToLogs}
          />
        </View>

        <View style={styles.actionsRow}>
          <ActionButton
            icon="calendar-clock"
            label="Schedulers"
            onPress={navigateToSchedulers}
          />
        </View>

        {/* ── Monitoring ── */}
        {hasMonitoring && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionAccent, { backgroundColor: anypointColors.primary }]} />
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
                MONITORING
              </Text>
            </View>
            <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
              <View style={styles.metricsGrid}>
                <MetricBox
                  icon="cpu-64-bit"
                  label="CPU"
                  value={`${Math.round(cpuPercent)}%`}
                  color={anypointColors.primary}
                  warning={cpuPercent > 80}
                />
                <View style={[styles.metricDivider, { backgroundColor: theme.colors.outlineVariant }]} />
                <MetricBox
                  icon="memory"
                  label={memTotal > 0 ? `${memUsage}/${memTotal} MB` : 'Memory'}
                  value={`${Math.round(memPercent)}%`}
                  color={anypointColors.secondary}
                  warning={memPercent > 80}
                />
                <View style={[styles.metricDivider, { backgroundColor: theme.colors.outlineVariant }]} />
                <MetricBox
                  icon="chart-timeline-variant"
                  label="Threads"
                  value={String(threadCount)}
                  color={anypointColors.accent}
                />
              </View>
            </View>
          </>
        )}

        {/* ── Configuration ── */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: theme.colors.secondary }]} />
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
            CONFIGURATION
          </Text>
        </View>
        <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
          <InfoItem label="Target" value={getDeploymentTarget(app)} icon="cloud-outline" iconColor={theme.colors.primary} />
          <InfoItem label="Mule" value={getMuleVersion(app) || 'N/A'} icon="cog-outline" iconColor={theme.colors.secondary} />
          <InfoItem label="Region" value={app?.region ?? 'N/A'} icon="earth" iconColor={anypointColors.info} />
          <InfoItem label="Workers" value={`${workerInfo.amount} x ${workerInfo.typeName}`} icon="server" iconColor={anypointColors.accent} />
          <InfoItem label="File" value={app?.fileName ?? 'N/A'} icon="file-outline" />
          <InfoItem label="Queues" value={app?.persistentQueues ? 'Enabled' : 'Disabled'} icon="swap-horizontal" />
          <InfoItem
            label="Logging"
            value={app?.loggingEnabled !== undefined ? (app.loggingEnabled ? 'Enabled' : 'Disabled') : 'N/A'}
            icon="text-box-outline"
          />
        </View>

        {/* ── Properties ── */}
        <View style={styles.propsHeader}>
          <View style={styles.sectionHeader}>
            <View style={[styles.sectionAccent, { backgroundColor: anypointColors.mulePurple }]} />
            <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
              PROPERTIES {hasProperties ? `(${Object.keys(properties).length})` : ''}
            </Text>
          </View>
          {hasProperties && !editingProps && (
            <IconButton icon="pencil-outline" size={18} onPress={startEditing} />
          )}
          {editingProps && (
            <View style={{ flexDirection: 'row', gap: 4 }}>
              <IconButton icon="close" size={18} onPress={cancelEditing} />
              <IconButton
                icon="content-save-outline"
                size={18}
                iconColor={anypointColors.primary}
                onPress={saveProperties}
                disabled={savingProps}
              />
            </View>
          )}
        </View>
        <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
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
                      outlineStyle={{ borderRadius: 10 }}
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
        </View>
      </ScrollView>

      {/* ── Confirmation Dialog ── */}
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

      {/* ── Snackbar ── */}
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
      paddingBottom: 40,
    },
    // ── Status Card ──
    statusCard: {
      marginHorizontal: 16,
      marginTop: 12,
      borderLeftWidth: 3,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      overflow: 'hidden',
    },
    statusGlow: {
      height: 2,
      borderTopLeftRadius: 18,
      borderTopRightRadius: 18,
    },
    statusContent: {
      padding: 16,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 4,
    },
    statusDot: {
      width: 10,
      height: 10,
      borderRadius: 5,
    },
    // ── Actions ──
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 16,
      paddingTop: 12,
      gap: 8,
    },
    // ── Section ──
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      marginTop: 24,
      marginBottom: 10,
    },
    sectionAccent: {
      width: 3,
      height: 14,
      borderRadius: 2,
    },
    // ── Cards ──
    card: {
      marginHorizontal: 16,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      padding: 16,
    },
    metricsGrid: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    metricDivider: {
      width: StyleSheet.hairlineWidth,
      height: 40,
    },
    // ── Props Header ──
    propsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingRight: 8,
    },
  });

export default ApplicationDetailScreen;
