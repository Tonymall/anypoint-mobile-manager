// ============================================================
// Server Detail — Server info, runtime metrics, and actions
//
// Modern dark-first design with status banner, runtime info
// progress bars, IP list, deployed apps, and restart action.
// ============================================================

import React, { useMemo, useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, Pressable } from 'react-native';
import {
  Text,
  useTheme,
  Appbar,
  Portal,
  Snackbar,
  ProgressBar,
  ActivityIndicator,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import type { ServerStatus } from '../../types';
import { anypointColors } from '../../theme';
import { ConfirmDialog } from '../../components/common';
import {
  useServer,
  useRestartServer,
} from '../../hooks/queries/useInfrastructureQueries';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticSuccess, hapticError } from '../../utils/haptics';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// --- Server status color ---
const SERVER_STATUS_COLOR: Record<ServerStatus, string> = {
  RUNNING: anypointColors.success,
  DISCONNECTED: anypointColors.error,
  CREATED: '#6B7280',
  UPDATED: '#6B7280',
};

const getServerStatusColor = (status: string): string =>
  SERVER_STATUS_COLOR[status as ServerStatus] ?? '#6B7280';

const getServerStatusLabel = (status: string): string => {
  switch (status) {
    case 'RUNNING': return 'Running';
    case 'DISCONNECTED': return 'Disconnected';
    case 'CREATED': return 'Created';
    case 'UPDATED': return 'Updated';
    default: return status;
  }
};

// --- InfoItem ---
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

// --- Resource Bar ---
const ResourceBar: React.FC<{
  label: string;
  icon: string;
  value: number;
  total: number;
  unit: string;
  color: string;
}> = ({ label, icon, value, total, unit, color }) => {
  const theme = useTheme();
  const percent = total > 0 ? value / total : 0;
  const isWarning = percent > 0.8;
  const barColor = isWarning ? anypointColors.error : color;

  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Icon name={icon} size={14} color={barColor} style={{ marginRight: 6 }} />
        <Text style={{ fontSize: 12, fontWeight: '600', color: theme.colors.onSurfaceVariant, flex: 1 }}>
          {label}
        </Text>
        <Text style={{ fontSize: 12, fontWeight: '700', color: isWarning ? anypointColors.error : theme.colors.onSurface }}>
          {Math.round(percent * 100)}%
        </Text>
      </View>
      <ProgressBar
        progress={percent}
        color={barColor}
        style={{ height: 6, borderRadius: 3, backgroundColor: theme.colors.surfaceVariant }}
      />
      <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant, marginTop: 4 }}>
        {value} / {total} {unit}
      </Text>
    </View>
  );
};

// --- Action Button ---
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
        actionBtnStyles.btn,
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

const actionBtnStyles = StyleSheet.create({
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

// --- Helpers ---

// --- Main Screen ---
const ServerDetailScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
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
  const statusColor = getServerStatusColor(status);
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
      <View style={styles.container}>
        <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Server" titleStyle={{ fontWeight: '600' }} />
        </Appbar.Header>
        <LoadingState message="Loading server details..." />
      </View>
    );
  }

  if (isError || !srv) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Server" titleStyle={{ fontWeight: '600' }} />
        </Appbar.Header>
        <ErrorState
          message={error?.message ?? 'Failed to load server details.'}
          onRetry={() => refetch()}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content
          title={srv.name ?? 'Server'}
          titleStyle={{ fontWeight: '600', letterSpacing: -0.3 }}
        />
        <Appbar.Action icon="refresh" onPress={() => refetch()} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* Status Card */}
        <View style={[styles.statusCard, { borderLeftColor: statusColor, borderColor: theme.colors.outlineVariant }]}>
          <View style={[styles.statusGlow, { backgroundColor: statusColor }]} />
          <View style={styles.statusContent}>
            <View style={styles.statusRow}>
              <View
                style={[
                  styles.statusDot,
                  {
                    backgroundColor: statusColor,
                    shadowColor: statusColor,
                    shadowOffset: { width: 0, height: 0 },
                    shadowOpacity: status === 'RUNNING' ? 0.6 : 0,
                    shadowRadius: 6,
                  },
                ]}
              />
              <Text variant="titleMedium" style={{ color: statusColor, fontWeight: '700', letterSpacing: -0.2 }}>
                {statusLabel}
              </Text>
            </View>

            {/* Type badge */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <View style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 10,
                backgroundColor: anypointColors.primary + '12',
              }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: anypointColors.primary }}>
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
            color={anypointColors.warning}
            onPress={handleRestart}
            loading={restartMutation.isPending}
            disabled={restartMutation.isPending}
          />
        </View>

        {/* Server Info */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: theme.colors.secondary }]} />
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
            SERVER INFO
          </Text>
        </View>
        <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
          <InfoItem label="Name" value={srv.name ?? 'N/A'} icon="server" iconColor={theme.colors.primary} />
          <InfoItem label="Type" value={srv.type ?? 'N/A'} icon="shape-outline" iconColor={anypointColors.secondary} />
          <InfoItem label="Status" value={statusLabel} icon="circle-outline" iconColor={statusColor} />
          <InfoItem label="Mule Version" value={srv.muleVersion ?? 'N/A'} icon="puzzle-outline" iconColor={anypointColors.accent} />
          <InfoItem label="Agent Version" value={srv.agentVersion ?? 'N/A'} icon="cog-outline" iconColor={anypointColors.info} />
          <InfoItem
            label="Last Connected"
            value={srv.lastConnected ? formatRelativeTime(srv.lastConnected) : 'N/A'}
            icon="clock-outline"
            iconColor={anypointColors.warning}
          />
        </View>

        {/* Runtime Info */}
        {hasRuntimeInfo && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionAccent, { backgroundColor: anypointColors.primary }]} />
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
                RUNTIME INFO
              </Text>
            </View>
            <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
              {runtime.javaVersion && (
                <InfoItem label="Java" value={runtime.javaVersion} icon="language-java" iconColor={anypointColors.error} />
              )}
              {(runtime.osName || runtime.osVersion) && (
                <InfoItem
                  label="OS"
                  value={`${runtime.osName ?? ''} ${runtime.osVersion ?? ''}`.trim() || 'N/A'}
                  icon="laptop"
                  iconColor={anypointColors.info}
                />
              )}
              {processors > 0 && (
                <InfoItem
                  label="Processors"
                  value={String(processors)}
                  icon="cpu-64-bit"
                  iconColor={anypointColors.mulePurple}
                />
              )}

              {/* CPU progress bar */}
              {cpuUsage > 0 && (
                <View style={{ marginTop: 12 }}>
                  <ResourceBar
                    label="CPU Usage"
                    icon="cpu-64-bit"
                    value={Math.round(cpuUsage)}
                    total={100}
                    unit="%"
                    color={anypointColors.primary}
                  />
                </View>
              )}

              {/* Memory progress bar */}
              {memTotal > 0 && (
                <ResourceBar
                  label="Memory"
                  icon="memory"
                  value={Math.round(memUsed / (1024 * 1024))}
                  total={Math.round(memTotal / (1024 * 1024))}
                  unit="MB"
                  color={anypointColors.secondary}
                />
              )}

              {/* Disk progress bar */}
              {diskTotal > 0 && (
                <ResourceBar
                  label="Disk"
                  icon="harddisk"
                  value={Math.round(diskUsed / (1024 * 1024 * 1024))}
                  total={Math.round(diskTotal / (1024 * 1024 * 1024))}
                  unit="GB"
                  color={anypointColors.accent}
                />
              )}
            </View>
          </>
        )}

        {/* IP Addresses */}
        {srv.addresses && srv.addresses.length > 0 && (
          <>
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionAccent, { backgroundColor: anypointColors.info }]} />
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
                IP ADDRESSES
              </Text>
            </View>
            <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
              {srv.addresses.map((addr: any, idx: number) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 }}>
                  <Icon name="ip-network-outline" size={14} color={anypointColors.info} />
                  <Text
                    variant="bodyMedium"
                    style={{ color: theme.colors.onSurface, flex: 1, fontFamily: 'monospace', fontSize: 13 }}
                    selectable
                  >
                    {addr.ip}
                  </Text>
                  {addr.networkInterface && (
                    <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
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
            <View style={styles.sectionHeader}>
              <View style={[styles.sectionAccent, { backgroundColor: anypointColors.accent }]} />
              <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
                DEPLOYED APPLICATIONS ({srv.applications.length})
              </Text>
            </View>
            <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
              {srv.applications.map((appName: string, idx: number) => (
                <View key={idx} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 8 }}>
                  <Icon name="application-outline" size={14} color={anypointColors.accent} />
                  <Text variant="bodyMedium" style={{ color: theme.colors.onSurface, flex: 1 }}>
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
const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    scrollContent: {
      paddingBottom: 40,
    },
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
    actionsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 16,
      paddingTop: 12,
      gap: 8,
    },
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
    card: {
      marginHorizontal: 16,
      borderRadius: 18,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      padding: 16,
    },
  });

export default ServerDetailScreen;
