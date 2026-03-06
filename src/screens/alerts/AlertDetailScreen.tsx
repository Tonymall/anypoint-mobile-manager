// ============================================================
// Alert Detail — Single Alert View with Actions (2026 Design)
//
// Displays full alert information with severity/status badges,
// info rows, and contextual action buttons (acknowledge,
// resolve, dismiss) protected by confirmation dialogs.
// ============================================================

import React, { useState, useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {
  Appbar,
  Text,
  Button,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';

import type { AlertSeverity, AlertStatus } from '../../types';
import { anypointColors, severityColors } from '../../theme';
import {
  usePlatformAlert,
  useAcknowledgeAlert,
  useResolveAlert,
  useDismissAlert,
} from '../../hooks/queries/useAlertQueries';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import InfoRow from '../../components/common/InfoRow';
import ConfirmDialog from '../../components/common/ConfirmDialog';

// --- Helpers ---
const getSeverityColor = (severity?: AlertSeverity | null): string => {
  return severity ? (severityColors[severity] ?? anypointColors.info) : anypointColors.info;
};

const getSeverityIcon = (severity?: AlertSeverity | null): string => {
  switch (severity) {
    case 'CRITICAL': return 'alert-octagon';
    case 'WARNING': return 'alert';
    case 'INFO': return 'information';
    default: return 'bell-outline';
  }
};

const getStatusColor = (status?: AlertStatus | null): string => {
  switch (status) {
    case 'ACTIVE': return anypointColors.error;
    case 'ACKNOWLEDGED': return anypointColors.warning;
    case 'RESOLVED': return anypointColors.success;
    case 'DISMISSED': return '#6B7280';
    default: return '#6B7280';
  }
};

const getStatusIcon = (status?: AlertStatus | null): string => {
  switch (status) {
    case 'ACTIVE': return 'bell-ring-outline';
    case 'ACKNOWLEDGED': return 'eye-check-outline';
    case 'RESOLVED': return 'check-circle-outline';
    case 'DISMISSED': return 'close-circle-outline';
    default: return 'bell-outline';
  }
};

type ConfirmAction = 'acknowledge' | 'resolve' | 'dismiss' | null;

const AlertDetailScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { alertId } = useLocalSearchParams<{ alertId: string }>();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { data: alert, isLoading, error, refetch } = usePlatformAlert(alertId ?? '');
  const acknowledgeMutation = useAcknowledgeAlert();
  const resolveMutation = useResolveAlert();
  const dismissMutation = useDismissAlert();

  const [confirmAction, setConfirmAction] = useState<ConfirmAction>(null);

  const handleConfirm = () => {
    if (!alert || !confirmAction) return;
    hapticLight();

    switch (confirmAction) {
      case 'acknowledge':
        acknowledgeMutation.mutate(alert.id, {
          onSuccess: () => router.back(),
        });
        break;
      case 'resolve':
        resolveMutation.mutate(alert.id, {
          onSuccess: () => router.back(),
        });
        break;
      case 'dismiss':
        dismissMutation.mutate(alert.id, {
          onSuccess: () => router.back(),
        });
        break;
    }
    setConfirmAction(null);
  };

  const getConfirmDialogProps = () => {
    switch (confirmAction) {
      case 'acknowledge':
        return {
          title: 'Acknowledge Alert',
          message: 'Mark this alert as acknowledged? You will still need to resolve it later.',
          confirmLabel: 'Acknowledge',
        };
      case 'resolve':
        return {
          title: 'Resolve Alert',
          message: 'Mark this alert as resolved? This indicates the issue has been fixed.',
          confirmLabel: 'Resolve',
        };
      case 'dismiss':
        return {
          title: 'Dismiss Alert',
          message: 'Dismiss this alert? It will no longer appear in active alerts.',
          confirmLabel: 'Dismiss',
          destructive: true,
        };
      default:
        return { title: '', message: '', confirmLabel: '' };
    }
  };

  if (isLoading) return <LoadingState message="Loading alert..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (!alert) return <ErrorState message="Alert not found" />;

  const severity = alert.severity ?? 'INFO';
  const status = alert.status ?? 'ACTIVE';
  const sevColor = getSeverityColor(severity);
  const statColor = getStatusColor(status);
  const isActionable = status === 'ACTIVE' || status === 'ACKNOWLEDGED';
  const isMutating =
    acknowledgeMutation.isPending || resolveMutation.isPending || dismissMutation.isPending;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {/* ── Header ── */}
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} elevated={false}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Alert Detail" titleStyle={{ fontWeight: '600' }} />
      </Appbar.Header>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Severity + Status Badges ── */}
        <View style={styles.badgeRow}>
          {/* Severity badge (large) */}
          <View
            style={[
              styles.severityBadge,
              { backgroundColor: sevColor + '18' },
            ]}
          >
            <Icon name={getSeverityIcon(severity)} size={20} color={sevColor} />
            <Text style={[styles.severityText, { color: sevColor }]}>
              {severity}
            </Text>
          </View>

          {/* Status badge */}
          <View
            style={[
              styles.statusBadge,
              { backgroundColor: statColor + '12' },
            ]}
          >
            <View
              style={{
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: statColor,
                ...(status === 'ACTIVE'
                  ? {
                      shadowColor: statColor,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.6,
                      shadowRadius: 4,
                    }
                  : {}),
              }}
            />
            <Text style={[styles.statusText, { color: statColor }]}>
              {status}
            </Text>
          </View>
        </View>

        {/* ── Alert Name ── */}
        <Text style={[styles.alertName, { color: theme.colors.onSurface }]}>
          {alert.name}
        </Text>

        {/* ── Message Section ── */}
        <View style={[styles.messageSection, { backgroundColor: theme.colors.surfaceVariant + '60' }]}>
          <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.onSurfaceVariant, letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>
            Message
          </Text>
          <Text style={{ fontSize: 14, color: theme.colors.onSurface, lineHeight: 22 }}>
            {alert.message}
          </Text>
        </View>

        {/* ── Info Section ── */}
        <View style={[styles.infoSection, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
          <InfoRow label="Type" value={alert.type} icon="tag-outline" />
          <InfoRow label="Source" value={alert.source} icon="source-branch" />
          {alert.applicationName && (
            <InfoRow label="Application" value={alert.applicationName} icon="application-outline" />
          )}
          <InfoRow label="Environment" value={alert.environmentId} icon="cloud-outline" />
          <InfoRow
            label="Created"
            value={formatRelativeTime(alert.createdAt)}
            icon="clock-outline"
          />
          <InfoRow
            label="Updated"
            value={formatRelativeTime(alert.updatedAt)}
            icon="update"
          />
          {alert.acknowledgedBy && (
            <InfoRow
              label="Acknowledged By"
              value={alert.acknowledgedBy}
              icon="account-check-outline"
            />
          )}
          {alert.resolvedAt && (
            <InfoRow
              label="Resolved At"
              value={formatRelativeTime(alert.resolvedAt)}
              icon="check-circle-outline"
            />
          )}
        </View>

        {/* ── Action Buttons ── */}
        {isActionable && (
          <View style={styles.actionSection}>
            {status === 'ACTIVE' && (
              <>
                <Button
                  mode="contained"
                  onPress={() => {
                    hapticLight();
                    setConfirmAction('acknowledge');
                  }}
                  icon="eye-check-outline"
                  style={styles.actionButton}
                  loading={acknowledgeMutation.isPending}
                  disabled={isMutating}
                  buttonColor={anypointColors.primary}
                >
                  Acknowledge
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => {
                    hapticLight();
                    setConfirmAction('dismiss');
                  }}
                  icon="close-circle-outline"
                  style={styles.actionButton}
                  loading={dismissMutation.isPending}
                  disabled={isMutating}
                  textColor={theme.colors.onSurfaceVariant}
                >
                  Dismiss
                </Button>
              </>
            )}
            {status === 'ACKNOWLEDGED' && (
              <>
                <Button
                  mode="contained"
                  onPress={() => {
                    hapticLight();
                    setConfirmAction('resolve');
                  }}
                  icon="check-circle-outline"
                  style={styles.actionButton}
                  loading={resolveMutation.isPending}
                  disabled={isMutating}
                  buttonColor={anypointColors.success}
                >
                  Resolve
                </Button>
                <Button
                  mode="outlined"
                  onPress={() => {
                    hapticLight();
                    setConfirmAction('dismiss');
                  }}
                  icon="close-circle-outline"
                  style={styles.actionButton}
                  loading={dismissMutation.isPending}
                  disabled={isMutating}
                  textColor={theme.colors.onSurfaceVariant}
                >
                  Dismiss
                </Button>
              </>
            )}
          </View>
        )}

        {/* Read-only notice for resolved/dismissed */}
        {!isActionable && (
          <View style={[styles.readOnlyNotice, { backgroundColor: theme.colors.surfaceVariant + '60' }]}>
            <Icon name={getStatusIcon(status)} size={18} color={statColor} />
            <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, marginLeft: 8 }}>
              This alert has been {String(status).toLowerCase()}. No further actions available.
            </Text>
          </View>
        )}
      </ScrollView>

      {/* ── Confirm Dialog ── */}
      <ConfirmDialog
        visible={confirmAction !== null}
        onConfirm={handleConfirm}
        onCancel={() => setConfirmAction(null)}
        {...getConfirmDialogProps()}
      />
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
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: 8,
      marginBottom: 16,
    },
    severityBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      paddingHorizontal: 14,
      paddingVertical: 8,
      borderRadius: 14,
    },
    severityText: {
      fontSize: 14,
      fontWeight: '700',
      letterSpacing: 0.3,
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 14,
    },
    statusText: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    alertName: {
      fontSize: 22,
      fontWeight: '700',
      letterSpacing: -0.3,
      marginBottom: 16,
    },
    messageSection: {
      padding: 16,
      borderRadius: 16,
      marginBottom: 16,
    },
    infoSection: {
      borderRadius: 18,
      borderWidth: 1,
      overflow: 'hidden',
      marginBottom: 24,
    },
    actionSection: {
      gap: 12,
      marginBottom: 16,
    },
    actionButton: {
      borderRadius: 16,
      paddingVertical: 4,
    },
    readOnlyNotice: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      borderRadius: 14,
      marginBottom: 16,
    },
  });

export default AlertDetailScreen;
