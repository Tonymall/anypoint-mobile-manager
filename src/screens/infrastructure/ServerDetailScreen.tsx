// ============================================================
// Server Detail — Server info, runtime metrics, and actions
//
// Status banner, runtime info with usage bars, IP list, deployed
// apps, and a restart action.
//
// Built on the design token layer: status resolves to a semantic
// status role shared with the servers list, and each info section
// names an accent role rather than a colour.
// ============================================================

import React, { useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, Pressable } from 'react-native';
import {
  Text,
  Appbar,
  Portal,
  Snackbar,
  ProgressBar,
  ActivityIndicator,
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import {
  radii,
  spacing,
  typeScale,
  monoFontFamily,
  useTokens,
  type StatusRole,
  type Tokens,
} from '../../theme';
import { Skeleton } from '../../components/ui';
import { ConfirmDialog } from '../../components/common';
import {
  useServer,
  useRestartServer,
} from '../../hooks/queries/useInfrastructureQueries';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticSuccess, hapticError } from '../../utils/haptics';
import ErrorState from '../../components/common/ErrorState';
import { getServerStatusRole, getServerStatusLabel } from './ServersScreen';
import type { IconName } from '../../types/icons';

// --- InfoItem ---
const InfoItem: React.FC<{
  label: string;
  value: string;
  icon?: IconName;
  role?: StatusRole;
  t: Tokens;
}> = ({ label, value, icon, role, t }) => (
  <View style={styles.infoRow}>
    {icon && (
      <View
        style={[
          styles.infoIconWell,
          { backgroundColor: role?.surface ?? t.color.surface.sunken },
        ]}
      >
        <Icon name={icon} size={14} color={role?.base ?? t.color.text.secondary} />
      </View>
    )}
    <Text
      style={[
        styles.infoLabel,
        { color: t.color.text.tertiary, width: icon ? 100 : 110 },
      ]}
      numberOfLines={1}
    >
      {label}
    </Text>
    <Text
      style={[styles.infoValue, { color: t.color.text.primary }]}
      selectable
      numberOfLines={2}
    >
      {value}
    </Text>
  </View>
);

// --- Resource Bar ---
const ResourceBar: React.FC<{
  label: string;
  icon: IconName;
  value: number;
  total: number;
  unit: string;
  role: StatusRole;
  t: Tokens;
}> = ({ label, icon, value, total, unit, role, t }) => {
  const percent = total > 0 ? value / total : 0;
  const isWarning = percent > 0.8;
  const barRole = isWarning ? t.color.status.danger : role;

  return (
    <View style={styles.resourceBar}>
      <View style={styles.resourceHeader}>
        <Icon name={icon} size={14} color={barRole.base} style={styles.resourceIcon} />
        <Text style={[styles.resourceLabel, { color: t.color.text.secondary }]}>
          {label}
        </Text>
        <Text
          style={[
            styles.resourcePercent,
            { color: isWarning ? barRole.base : t.color.text.primary },
          ]}
        >
          {Math.round(percent * 100)}%
        </Text>
      </View>
      <ProgressBar
        progress={percent}
        color={barRole.base}
        style={[styles.progress, { backgroundColor: t.color.surface.sunken }]}
      />
      <Text style={[styles.resourceMeta, { color: t.color.text.tertiary }]}>
        {value} / {total} {unit}
      </Text>
    </View>
  );
};

// --- Action Button ---
const ActionButton: React.FC<{
  icon: IconName;
  label: string;
  role: StatusRole;
  onPress: () => void;
  loading?: boolean;
  disabled?: boolean;
  t: Tokens;
}> = ({ icon, label, role, onPress, loading, disabled, t }) => (
  <Pressable
    onPress={onPress}
    disabled={disabled || loading}
    accessibilityLabel={`${label}${disabled ? ', disabled' : ''}`}
    accessibilityRole="button"
    accessibilityState={{ disabled: !!disabled || !!loading }}
    style={[
      styles.actionBtn,
      {
        backgroundColor: disabled ? t.color.surface.sunken : role.surface,
        borderColor: disabled ? t.color.border.subtle : role.border,
        opacity: disabled ? 0.5 : 1,
      },
    ]}
  >
    {loading ? (
      <ActivityIndicator size={16} color={role.base} />
    ) : (
      <Icon
        name={icon}
        size={16}
        color={disabled ? t.color.text.tertiary : role.base}
      />
    )}
    <Text
      style={[
        styles.actionLabel,
        { color: disabled ? t.color.text.tertiary : role.base },
      ]}
    >
      {label}
    </Text>
  </Pressable>
);

// ── Section header ──
const SectionHeading: React.FC<{ title: string; role: StatusRole; t: Tokens }> = ({
  title,
  role,
  t,
}) => (
  <View style={styles.sectionHeader}>
    <View style={[styles.sectionAccent, { backgroundColor: role.base }]} />
    <Text style={[styles.sectionTitle, { color: t.color.text.tertiary }]}>
      {title}
    </Text>
  </View>
);

// ── Loading placeholder ──
// Shaped like the status card and the first info section below it.
const DetailSkeleton: React.FC<{ t: Tokens }> = ({ t }) => (
  <View style={styles.skeletonWrap}>
    <View
      style={[
        styles.card,
        styles.skeletonStatusCard,
        {
          backgroundColor: t.color.surface.raised,
          borderColor: t.color.border.subtle,
        },
      ]}
    >
      <Skeleton width={132} height={20} />
      <Skeleton width={72} height={22} style={styles.skeletonGap} />
    </View>
    <View
      style={[
        styles.card,
        styles.skeletonInfoCard,
        {
          backgroundColor: t.color.surface.raised,
          borderColor: t.color.border.subtle,
        },
      ]}
    >
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <View key={row} style={styles.skeletonRow}>
          <Skeleton width={26} height={26} radius={radii.sm} />
          <Skeleton width={88} height={12} />
          <Skeleton width="40%" height={12} />
        </View>
      ))}
    </View>
  </View>
);

// --- Main Screen ---
const ServerDetailScreen: React.FC = () => {
  const t = useTokens();
  const router = useRouter();
  const { serverId } = useLocalSearchParams<{ serverId: string }>();

  const {
    data: server,
    isLoading,
    isError,
    error,
    refetch,
  } = useServer(Number(serverId));

  const restartMutation = useRestartServer();

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);

  const showSnack = useCallback((msg: string) => {
    setSnackMsg(msg);
    setSnackVisible(true);
  }, []);

  const srv = server as any;
  const status: string = srv?.status ?? 'UNKNOWN';
  const statusRole = getServerStatusRole(t, status);
  const statusLabel = getServerStatusLabel(status);
  const runtime = srv?.runtimeInformation ?? {};

  const handleRestart = useCallback(() => {
    setConfirmVisible(true);
  }, []);

  const handleConfirm = useCallback(() => {
    setConfirmVisible(false);
    restartMutation.mutate(Number(serverId), {
      onSuccess: () => {
        hapticSuccess();
        showSnack('Server restart initiated');
        refetch();
      },
      onError: (err: any) => {
        hapticError();
        showSnack(`Restart failed: ${err?.message ?? 'Unknown error'}`);
      },
    });
  }, [serverId, restartMutation, showSnack, refetch]);

  const handleCancel = useCallback(() => {
    setConfirmVisible(false);
  }, []);

  // --- Memory and disk calculations ---
  const memTotal = runtime.memoryTotal ?? 0;
  const memFree = runtime.memoryFree ?? 0;
  const memUsed = memTotal - memFree;
  const diskTotal = runtime.diskTotal ?? 0;
  const diskFree = runtime.diskFree ?? 0;
  const diskUsed = diskTotal - diskFree;
  const cpuUsage = runtime.cpuUsage ?? 0;
  const processors = runtime.processors ?? 0;

  const hasRuntimeInfo =
    runtime.javaVersion || runtime.osName || cpuUsage > 0 || memTotal > 0 || diskTotal > 0;

  // --- Loading / Error states ---
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
        <Appbar.Header style={{ backgroundColor: t.color.surface.canvas }} elevated={false}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Server" titleStyle={styles.appbarTitle} />
        </Appbar.Header>
        <DetailSkeleton t={t} />
      </View>
    );
  }

  if (isError || !srv) {
    return (
      <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
        <Appbar.Header style={{ backgroundColor: t.color.surface.canvas }} elevated={false}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Server" titleStyle={styles.appbarTitle} />
        </Appbar.Header>
        <ErrorState
          message={error?.message ?? 'Failed to load server details.'}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
      {/* Header */}
      <Appbar.Header style={{ backgroundColor: t.color.surface.canvas }} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title={srv.name ?? 'Server'}
          titleStyle={styles.appbarTitle}
        />
        <Appbar.Action icon="refresh" onPress={() => refetch()} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View
          style={[
            styles.statusCard,
            {
              backgroundColor: t.color.surface.raised,
              borderColor: statusRole.border,
            },
          ]}
        >
          <View style={[styles.statusGlow, { backgroundColor: statusRole.base }]} />
          <View style={styles.statusContent}>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: statusRole.base,
                    shadowColor: statusRole.base,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: status === 'RUNNING' ? 0.6 : 0,
                    shadowRadius: 6,
                  },
                ]}
              />
              <Text style={[styles.statusLabel, { color: statusRole.base }]}>
                {statusLabel}
              </Text>
            </View>

            {/* Type badge */}
            <View style={styles.typeRow}>
              <View style={[styles.typeBadge, { backgroundColor: t.color.brand.surface }]}>
                <Text style={[styles.typeBadgeText, { color: t.color.text.accent }]}>
                  {srv.type}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <ActionButton
            icon="restart"
            label="Restart Server"
            role={t.color.status.warning}
            onPress={handleRestart}
            loading={restartMutation.isPending}
            disabled={restartMutation.isPending}
            t={t}
          />
        </View>

        {/* Server Info */}
        <SectionHeading title="SERVER INFO" role={t.color.accent.secondary} t={t} />
        <View
          style={[
            styles.card,
            {
              backgroundColor: t.color.surface.raised,
              borderColor: t.color.border.subtle,
            },
          ]}
        >
          <InfoItem t={t} label="Name" value={srv.name ?? 'N/A'} icon="server" role={t.color.accent.brand} />
          <InfoItem t={t} label="Type" value={srv.type ?? 'N/A'} icon="shape-outline" role={t.color.accent.secondary} />
          <InfoItem t={t} label="Status" value={statusLabel} icon="circle-outline" role={statusRole} />
          <InfoItem t={t} label="Mule Version" value={srv.muleVersion ?? 'N/A'} icon="puzzle-outline" role={t.color.status.success} />
          <InfoItem t={t} label="Agent Version" value={srv.agentVersion ?? 'N/A'} icon="cog-outline" role={t.color.status.info} />
          <InfoItem
            t={t}
            label="Last Connected"
            value={srv.lastConnected ? formatRelativeTime(srv.lastConnected) : 'N/A'}
            icon="clock-outline"
            role={t.color.status.warning}
          />
        </View>

        {/* Runtime Info */}
        {hasRuntimeInfo && (
          <>
            <SectionHeading title="RUNTIME INFO" role={t.color.accent.brand} t={t} />
            <View
              style={[
                styles.card,
                {
                  backgroundColor: t.color.surface.raised,
                  borderColor: t.color.border.subtle,
                },
              ]}
            >
              {runtime.javaVersion && (
                <InfoItem t={t} label="Java" value={runtime.javaVersion} icon="language-java" role={t.color.status.danger} />
              )}
              {(runtime.osName || runtime.osVersion) && (
                <InfoItem
                  t={t}
                  label="OS"
                  value={`${runtime.osName ?? ''} ${runtime.osVersion ?? ''}`.trim() || 'N/A'}
                  icon="laptop"
                  role={t.color.status.info}
                />
              )}
              {processors > 0 && (
                <InfoItem
                  t={t}
                  label="Processors"
                  value={String(processors)}
                  icon="cpu-64-bit"
                  role={t.color.accent.tertiary}
                />
              )}

              {/* CPU progress bar */}
              {cpuUsage > 0 && (
                <View style={styles.firstBar}>
                  <ResourceBar
                    t={t}
                    label="CPU Usage"
                    icon="cpu-64-bit"
                    value={Math.round(cpuUsage)}
                    total={100}
                    unit="%"
                    role={t.color.accent.brand}
                  />
                </View>
              )}

              {/* Memory progress bar */}
              {memTotal > 0 && (
                <ResourceBar
                  t={t}
                  label="Memory"
                  icon="memory"
                  value={Math.round(memUsed / (1024 * 1024))}
                  total={Math.round(memTotal / (1024 * 1024))}
                  unit="MB"
                  role={t.color.accent.secondary}
                />
              )}

              {/* Disk progress bar */}
              {diskTotal > 0 && (
                <ResourceBar
                  t={t}
                  label="Disk"
                  icon="harddisk"
                  value={Math.round(diskUsed / (1024 * 1024 * 1024))}
                  total={Math.round(diskTotal / (1024 * 1024 * 1024))}
                  unit="GB"
                  role={t.color.status.success}
                />
              )}
            </View>
          </>
        )}

        {/* IP Addresses */}
        {srv.addresses && srv.addresses.length > 0 && (
          <>
            <SectionHeading title="IP ADDRESSES" role={t.color.status.info} t={t} />
            <View
              style={[
                styles.card,
                {
                  backgroundColor: t.color.surface.raised,
                  borderColor: t.color.border.subtle,
                },
              ]}
            >
              {srv.addresses.map((addr: any, idx: number) => (
                <View key={idx} style={styles.listRow}>
                  <Icon name="ip-network-outline" size={14} color={t.color.status.info.base} />
                  <Text
                    style={[styles.monoValue, { color: t.color.text.primary }]}
                    selectable
                  >
                    {addr.ip}
                  </Text>
                  {addr.networkInterface && (
                    <Text style={[styles.listMeta, { color: t.color.text.tertiary }]}>
                      {addr.networkInterface}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          </>
        )}

        {/* Deployed Applications */}
        {srv.applications && srv.applications.length > 0 && (
          <>
            <SectionHeading
              title={`DEPLOYED APPLICATIONS (${srv.applications.length})`}
              role={t.color.status.success}
              t={t}
            />
            <View
              style={[
                styles.card,
                {
                  backgroundColor: t.color.surface.raised,
                  borderColor: t.color.border.subtle,
                },
              ]}
            >
              {srv.applications.map((appName: string, idx: number) => (
                <View key={idx} style={styles.listRow}>
                  <Icon name="application-outline" size={14} color={t.color.status.success.base} />
                  <Text style={[styles.listValue, { color: t.color.text.primary }]}>
                    {appName}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>

      {/* Confirmation Dialog */}
      <Portal>
        <ConfirmDialog
          visible={confirmVisible}
          title="Restart Server"
          message={`Are you sure you want to restart "${srv.name}"? This will temporarily disrupt all running applications.`}
          confirmLabel="Restart"
          destructive
          onConfirm={handleConfirm}
          onCancel={handleCancel}
        />
      </Portal>

      {/* Snackbar */}
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

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appbarTitle: typeScale.heading,
  scrollContent: {
    paddingBottom: 40,
  },
  statusCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  statusGlow: {
    height: 3,
  },
  statusContent: {
    padding: spacing.lg,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.xs,
  },
  statusDot: {
    width: 10,
    height: 10,
    borderRadius: radii.pill,
  },
  statusLabel: typeScale.heading,
  typeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  typeBadgeText: { ...typeScale.label, fontWeight: '700' },
  actionsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    minWidth: 80,
    flex: 1,
  },
  actionLabel: typeScale.label,
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.xl,
    marginTop: spacing.xxl,
    marginBottom: 10,
  },
  sectionAccent: {
    width: 3,
    height: 14,
    borderRadius: 2,
  },
  sectionTitle: { ...typeScale.label, letterSpacing: 0.8 },
  card: {
    marginHorizontal: spacing.lg,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.lg,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    gap: spacing.sm,
  },
  infoIconWell: {
    width: 26,
    height: 26,
    borderRadius: radii.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoLabel: { ...typeScale.label, flexShrink: 0 },
  infoValue: { ...typeScale.body, flex: 1 },
  resourceBar: {
    marginBottom: 14,
  },
  resourceHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  resourceIcon: {
    marginRight: 6,
  },
  resourceLabel: { ...typeScale.label, flex: 1 },
  resourcePercent: { ...typeScale.label, fontWeight: '700' },
  progress: {
    height: 6,
    borderRadius: 3,
  },
  resourceMeta: { ...typeScale.micro, marginTop: spacing.xs },
  firstBar: {
    marginTop: spacing.md,
  },
  listRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    gap: spacing.sm,
  },
  listValue: { ...typeScale.body, flex: 1 },
  listMeta: typeScale.bodySmall,
  monoValue: {
    ...typeScale.bodySmall,
    fontFamily: monoFontFamily,
    flex: 1,
  },
  skeletonWrap: {
    paddingTop: spacing.md,
  },
  skeletonStatusCard: {
    marginBottom: spacing.xxl,
  },
  skeletonInfoCard: {
    gap: spacing.md,
  },
  skeletonGap: {
    marginTop: spacing.sm,
  },
  skeletonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});

export default ServerDetailScreen;
