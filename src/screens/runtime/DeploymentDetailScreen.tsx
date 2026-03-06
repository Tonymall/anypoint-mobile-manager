// ============================================================
// Deployment Detail — Single deployment view with actions
//
// Modern dark-first design with status banner, info sections,
// and redeploy/rollback action buttons with confirmation.
// ============================================================

import React, { useMemo, useState, useCallback } from 'react';
import { StyleSheet, View, ScrollView, Pressable } from 'react-native';
import {
  Text,
  useTheme,
  Appbar,
  Portal,
  Snackbar,
  ActivityIndicator,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import type { DeploymentStatus } from '../../types';
import { anypointColors } from '../../theme';
import { ConfirmDialog } from '../../components/common';
import {
  useDeploymentStatus,
  useRedeploy,
  useRollback,
} from '../../hooks/queries/useDeploymentQueries';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticSuccess, hapticError } from '../../utils/haptics';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// --- Status colors for deployment ---
const DEPLOYMENT_STATUS_COLOR: Record<DeploymentStatus, string> = {
  DEPLOYED: anypointColors.success,
  FAILED: anypointColors.error,
  DEPLOYING: anypointColors.info,
  UNDEPLOYING: anypointColors.warning,
  PARTIALLY_DEPLOYED: '#EAB308',
};

const getDeploymentStatusColor = (status: string): string =>
  DEPLOYMENT_STATUS_COLOR[status as DeploymentStatus] ?? '#6B7280';

const getDeploymentStatusLabel = (status: string): string => {
  switch (status) {
    case 'DEPLOYED': return 'Deployed';
    case 'FAILED': return 'Failed';
    case 'DEPLOYING': return 'Deploying';
    case 'UNDEPLOYING': return 'Undeploying';
    case 'PARTIALLY_DEPLOYED': return 'Partially Deployed';
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

// --- Main Screen ---
const DeploymentDetailScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const { deploymentId } = useLocalSearchParams<{ deploymentId: string }>();

  const {
    data: deployment,
    isLoading,
    isError,
    error,
    refetch,
  } = useDeploymentStatus(deploymentId as string);

  const redeployMutation = useRedeploy();
  const rollbackMutation = useRollback();

  const [confirmVisible, setConfirmVisible] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'redeploy' | 'rollback' | null>(null);
  const [snackMsg, setSnackMsg] = useState('');
  const [snackVisible, setSnackVisible] = useState(false);

  const showSnack = useCallback((msg: string) => {
    setSnackMsg(msg);
    setSnackVisible(true);
  }, []);

  const dep = deployment as any;
  const status: string = dep?.status ?? 'UNKNOWN';
  const statusColor = getDeploymentStatusColor(status);
  const statusLabel = getDeploymentStatusLabel(status);
  const isDeploying = status === 'DEPLOYING' || status === 'UNDEPLOYING';
  const isMutating = redeployMutation.isPending || rollbackMutation.isPending;

  const handleActionPress = useCallback((action: 'redeploy' | 'rollback') => {
    setConfirmAction(action);
    setConfirmVisible(true);
  }, []);

  const handleConfirm = useCallback(() => {
    setConfirmVisible(false);
    if (confirmAction === 'redeploy') {
      redeployMutation.mutate(dep?.applicationName ?? '', {
        onSuccess: () => {
          hapticSuccess();
          showSnack('Redeployment triggered successfully');
          refetch();
        },
        onError: (err: any) => {
          hapticError();
          showSnack(`Redeploy failed: ${err?.message ?? 'Unknown error'}`);
        },
      });
    } else if (confirmAction === 'rollback') {
      rollbackMutation.mutate(
        { applicationName: dep?.applicationName ?? '', deploymentId: deploymentId as string },
        {
          onSuccess: () => {
            hapticSuccess();
            showSnack('Rollback initiated successfully');
            refetch();
          },
          onError: (err: any) => {
            hapticError();
            showSnack(`Rollback failed: ${err?.message ?? 'Unknown error'}`);
          },
        },
      );
    }
    setConfirmAction(null);
  }, [confirmAction, dep?.applicationName, deploymentId, redeployMutation, rollbackMutation, showSnack, refetch]);

  const handleCancel = useCallback(() => {
    setConfirmVisible(false);
    setConfirmAction(null);
  }, []);

  // --- Loading / Error states ---
  if (isLoading) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Deployment" titleStyle={{ fontWeight: '600' }} />
        </Appbar.Header>
        <LoadingState message="Loading deployment details..." />
      </View>
    );
  }

  if (isError || !dep) {
    return (
      <View style={styles.container}>
        <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="Deployment" titleStyle={{ fontWeight: '600' }} />
        </Appbar.Header>
        <ErrorState
          message={error?.message ?? 'Failed to load deployment details.'}
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
          title={dep.applicationName ?? 'Deployment'}
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
              {isDeploying ? (
                <ActivityIndicator size={14} color={statusColor} style={{ marginRight: 6 }} />
              ) : (
                <View
                  style={[
                    styles.statusDot,
                    {
                      backgroundColor: statusColor,
                      shadowColor: statusColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: status === 'DEPLOYED' ? 0.6 : 0,
                      shadowRadius: 6,
                    },
                  ]}
                />
              )}
              <Text variant="titleMedium" style={{ color: statusColor, fontWeight: '700', letterSpacing: -0.2 }}>
                {statusLabel}
              </Text>
            </View>

            {/* Version + target type badges */}
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <View style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 10,
                backgroundColor: anypointColors.primary + '12',
              }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: anypointColors.primary }}>
                  v{dep.version}
                </Text>
              </View>
              <View style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 10,
                backgroundColor: anypointColors.secondary + '12',
              }}>
                <Text style={{ fontSize: 12, fontWeight: '700', color: anypointColors.secondary }}>
                  {dep.targetType}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Actions */}
        <View style={styles.actionsRow}>
          <ActionButton
            icon="rocket-launch-outline"
            label="Redeploy"
            color={anypointColors.primary}
            onPress={() => handleActionPress('redeploy')}
            loading={redeployMutation.isPending}
            disabled={isMutating || isDeploying}
          />
          <ActionButton
            icon="undo-variant"
            label="Rollback"
            color={anypointColors.warning}
            onPress={() => handleActionPress('rollback')}
            loading={rollbackMutation.isPending}
            disabled={isMutating || isDeploying}
          />
        </View>

        {/* Deployment Info */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: theme.colors.secondary }]} />
          <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8 }}>
            DEPLOYMENT INFO
          </Text>
        </View>
        <View style={[styles.card, { borderColor: theme.colors.outlineVariant }]}>
          <InfoItem
            label="Application"
            value={dep.applicationName ?? 'N/A'}
            icon="application-outline"
            iconColor={theme.colors.primary}
          />
          <InfoItem
            label="Version"
            value={dep.version ?? 'N/A'}
            icon="tag-outline"
            iconColor={anypointColors.secondary}
          />
          {dep.buildNumber && (
            <InfoItem
              label="Build"
              value={dep.buildNumber}
              icon="pound"
              iconColor={anypointColors.accent}
            />
          )}
          <InfoItem
            label="Target"
            value={dep.target ?? 'N/A'}
            icon="bullseye-arrow"
            iconColor={anypointColors.info}
          />
          <InfoItem
            label="Target Type"
            value={dep.targetType ?? 'N/A'}
            icon="cloud-outline"
            iconColor={anypointColors.mulePurple}
          />
          <InfoItem
            label="Started At"
            value={dep.startedAt ? formatRelativeTime(dep.startedAt) : 'N/A'}
            icon="clock-start"
            iconColor={anypointColors.warning}
          />
          <InfoItem
            label="Completed"
            value={dep.completedAt ? formatRelativeTime(dep.completedAt) : 'In progress'}
            icon="clock-check-outline"
            iconColor={anypointColors.success}
          />
          <InfoItem
            label="Initiated By"
            value={dep.initiatedBy ?? 'N/A'}
            icon="account-outline"
            iconColor={theme.colors.secondary}
          />
        </View>
      </ScrollView>

      {/* Confirmation Dialog */}
      <Portal>
        <ConfirmDialog
          visible={confirmVisible}
          title={confirmAction === 'redeploy' ? 'Redeploy Application' : 'Rollback Deployment'}
          message={
            confirmAction === 'redeploy'
              ? `Are you sure you want to redeploy "${dep.applicationName}"?`
              : `Are you sure you want to rollback "${dep.applicationName}" to a previous version?`
          }
          confirmLabel={confirmAction === 'redeploy' ? 'Redeploy' : 'Rollback'}
          destructive={confirmAction === 'rollback'}
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

export default DeploymentDetailScreen;
