// ============================================================
// Application Detail Screen - Full app info with actions
// Built on the design token layer: every colour, type size and
// radius here names a role, so the screen resolves correctly in
// both colour schemes.
// ============================================================

import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import {
  Text,
  Appbar,
  Portal,
  Snackbar,
  TextInput,
  IconButton,
} from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { ConfirmDialog } from '../../components/common';
import { Skeleton } from '../../components/ui';
import {
  radii,
  spacing,
  typeScale,
  useTokens,
  type Tokens,
} from '../../theme';
import {
  useApplication,
  useStartApp,
  useStopApp,
  useRestartApp,
} from '../../hooks/queries';
import { useRuntimeTransitionStore } from '../../stores/runtimeTransitionStore';
import {
  getAppName,
  getMuleVersion,
  getWorkerInfo,
  getDeploymentTarget,
} from '../../utils/appHelpers';
import * as runtimeService from '../../services/runtimeService';
import { getStatusRole, getStatusLabel, isTransitional } from '../../utils/statusHelpers';
import { hapticSuccess, hapticError } from '../../utils/haptics';
import ErrorState from '../../components/common/ErrorState';
import {
  ActionButton,
  InfoItem,
  MetricBox,
  StatusBanner,
} from './applicationDetail';

/** Placeholder rows shown while the application payload is in flight. */
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5, 6];

// ---------------------------------------------------------------------------
// Main Screen
// ---------------------------------------------------------------------------

const ApplicationDetailScreen: React.FC = () => {
  const t = useTokens();
  const router = useRouter();
  const styles = useMemo(() => createStyles(t), [t]);
  const { domain } = useLocalSearchParams<{ domain: string }>();
  const transition = useRuntimeTransitionStore((s) => (domain ? s.transitions[String(domain)] : undefined));

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

  useEffect(() => {
    if (transition && !pollInterval) {
      setPollInterval(3000);
    }
  }, [transition, pollInterval]);

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
  const statusRole = useMemo(() => getStatusRole(t, status), [t, status]);
  const statusLabel = useMemo(() => getStatusLabel(status), [status]);

  const effectiveLabel = pendingAction || transition?.label || statusLabel;
  const effectiveRole = (pendingAction || transition) ? t.color.status.warning : statusRole;
  const showSpinner = !!pendingAction || !!transition || isTransitional(status);
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
        <Appbar.Header style={styles.appbar}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Application" titleStyle={styles.appbarTitle} />
        </Appbar.Header>
        {/* Shaped like the real content so nothing jumps when it lands. */}
        <View style={[styles.card, styles.skeletonCard, styles.skeletonBanner]}>
          <Skeleton width="45%" height={18} />
          <Skeleton width="65%" height={13} />
        </View>
        <View style={styles.actionsRow}>
          <Skeleton height={40} radius={radii.md} style={styles.skeletonAction} />
          <Skeleton height={40} radius={radii.md} style={styles.skeletonAction} />
          <Skeleton height={40} radius={radii.md} style={styles.skeletonAction} />
        </View>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: t.color.accent.secondary.base }]} />
          <Text style={styles.sectionTitle}>CONFIGURATION</Text>
        </View>
        <View style={[styles.card, styles.skeletonCard]}>
          {SKELETON_ROWS.map((row) => (
            <Skeleton key={row} height={14} />
          ))}
        </View>
      </View>
    );
  }

  if (isError || !app) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={styles.appbar}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Application" titleStyle={styles.appbarTitle} />
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
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={getAppName(app)} titleStyle={styles.appbarTitle} />
        <Appbar.Action icon="refresh" onPress={() => refetch()} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ── Status Banner ── */}
        <StatusBanner
          role={effectiveRole}
          label={effectiveLabel}
          domain={String(app?.domain ?? domain ?? '')}
          busy={showSpinner}
          glowing={isStarted}
        />

        {/* ── Action Buttons ── */}
        <View style={styles.actionsRow}>
          {isStopped && (
            <ActionButton
              icon="play"
              label="Start"
              role={t.color.status.success}
              onPress={() => handleAction('start')}
              loading={startMutation.isPending}
              disabled={isMutating || isInTransition}
            />
          )}
          {isStarted && (
            <ActionButton
              icon="stop"
              label="Stop"
              role={t.color.status.danger}
              onPress={() => handleAction('stop')}
              loading={stopMutation.isPending}
              disabled={isMutating || isInTransition}
            />
          )}
          <ActionButton
            icon="restart"
            label="Restart"
            role={t.color.status.warning}
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
              <View style={[styles.sectionAccent, { backgroundColor: t.color.accent.brand.base }]} />
              <Text style={styles.sectionTitle}>MONITORING</Text>
            </View>
            <View style={styles.card}>
              <View style={styles.metricsGrid}>
                <MetricBox
                  icon="cpu-64-bit"
                  label="CPU"
                  value={`${Math.round(cpuPercent)}%`}
                  role={t.color.accent.brand}
                  warning={cpuPercent > 80}
                />
                <View style={styles.metricDivider} />
                <MetricBox
                  icon="memory"
                  label={memTotal > 0 ? `${memUsage}/${memTotal} MB` : 'Memory'}
                  value={`${Math.round(memPercent)}%`}
                  role={t.color.accent.secondary}
                  warning={memPercent > 80}
                />
                <View style={styles.metricDivider} />
                <MetricBox
                  icon="chart-timeline-variant"
                  label="Threads"
                  value={String(threadCount)}
                  role={t.color.status.success}
                />
              </View>
            </View>
          </>
        )}

        {/* ── Configuration ── */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: t.color.accent.secondary.base }]} />
          <Text style={styles.sectionTitle}>CONFIGURATION</Text>
        </View>
        <View style={styles.card}>
          <InfoItem label="Target" value={getDeploymentTarget(app)} icon="cloud-outline" iconColor={t.color.accent.brand.base} />
          <InfoItem label="Mule" value={getMuleVersion(app) || 'N/A'} icon="cog-outline" iconColor={t.color.accent.secondary.base} />
          <InfoItem label="Region" value={app?.region ?? 'N/A'} icon="earth" iconColor={t.color.status.info.base} />
          <InfoItem label="Workers" value={`${workerInfo.amount} x ${workerInfo.typeName}`} icon="server" iconColor={t.color.status.success.base} />
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
            <View style={[styles.sectionAccent, { backgroundColor: t.color.accent.tertiary.base }]} />
            <Text style={styles.sectionTitle}>
              PROPERTIES {hasProperties ? `(${Object.keys(properties).length})` : ''}
            </Text>
          </View>
          {hasProperties && !editingProps && (
            <IconButton icon="pencil-outline" size={18} onPress={startEditing} />
          )}
          {editingProps && (
            <View style={styles.propsActions}>
              <IconButton icon="close" size={18} onPress={cancelEditing} />
              <IconButton
                icon="content-save-outline"
                size={18}
                iconColor={t.color.accent.brand.base}
                onPress={saveProperties}
                disabled={savingProps}
              />
            </View>
          )}
        </View>
        <View style={styles.card}>
          {hasProperties ? (
            editingProps ? (
              Object.entries(editedProperties).map(([key, value]) => {
                const isMasked = typeof value === 'string' && value.includes('****');
                return (
                  <View key={key} style={styles.propField}>
                    <Text style={styles.propLabel}>{key}</Text>
                    <TextInput
                      value={isMasked ? '' : value}
                      placeholder={isMasked ? '••••••••' : 'Value'}
                      onChangeText={(v) => handlePropertyChange(key, v)}
                      mode="outlined"
                      dense
                      disabled={savingProps}
                      style={styles.propInput}
                      outlineStyle={styles.propInputOutline}
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
            <Text style={styles.emptyText}>No properties configured</Text>
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

const createStyles = (t: Tokens) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: t.color.surface.canvas,
    },
    appbar: {
      backgroundColor: t.color.surface.raised,
      elevation: 0,
    },
    appbarTitle: {
      ...typeScale.title,
      color: t.color.text.primary,
    },
    scrollContent: {
      paddingBottom: 40,
    },
    // ── Actions ──
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.md,
      gap: spacing.sm,
    },
    // ── Section ──
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingHorizontal: spacing.xl,
      marginTop: spacing.xxl,
      marginBottom: spacing.sm,
    },
    sectionAccent: {
      width: 3,
      height: 14,
      borderRadius: 2,
    },
    sectionTitle: {
      ...typeScale.label,
      color: t.color.text.secondary,
      letterSpacing: 0.8,
    },
    // ── Cards ──
    card: {
      marginHorizontal: spacing.lg,
      borderRadius: radii.lg,
      backgroundColor: t.color.surface.raised,
      borderWidth: 1,
      borderColor: t.color.border.subtle,
      padding: spacing.lg,
    },
    metricsGrid: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    metricDivider: {
      width: StyleSheet.hairlineWidth,
      height: 40,
      backgroundColor: t.color.border.subtle,
    },
    // ── Props ──
    propsHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingRight: spacing.sm,
    },
    propsActions: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    propField: {
      marginBottom: spacing.sm,
    },
    propLabel: {
      ...typeScale.caption,
      color: t.color.text.secondary,
      marginBottom: 2,
    },
    propInput: {
      backgroundColor: t.color.surface.raised,
      fontSize: typeScale.bodySmall.fontSize,
    },
    propInputOutline: {
      borderRadius: radii.sm,
    },
    emptyText: {
      ...typeScale.body,
      color: t.color.text.secondary,
    },
    // ── Loading placeholders ──
    skeletonCard: {
      gap: spacing.md,
    },
    skeletonBanner: {
      marginTop: spacing.md,
    },
    skeletonAction: {
      flex: 1,
    },
  });

export default ApplicationDetailScreen;
