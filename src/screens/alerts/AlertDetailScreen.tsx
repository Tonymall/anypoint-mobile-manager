// ============================================================
// Alert Detail — Single Alert View with Actions
//
// Displays full alert information with severity/status badges,
// info rows, and contextual action buttons (acknowledge,
// resolve, dismiss) protected by confirmation dialogs.
//
// Built on the design token layer: severity and alert status both
// resolve to semantic status roles, so the badges, dot and read-only
// notice stay in step across light and dark.
// ============================================================

import React, { useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {
  Appbar,
  Text,
  Button,
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';

import type { AlertSeverity, AlertStatus } from '../../types';
import {
  radii,
  spacing,
  typeScale,
  useTokens,
  type StatusRole,
  type Tokens,
} from '../../theme';
import { Skeleton } from '../../components/ui';
import {
  usePlatformAlert,
  useAcknowledgeAlert,
  useResolveAlert,
  useDismissAlert,
} from '../../hooks/queries/useAlertQueries';
import { formatRelativeTime, getSeverityRole } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import ErrorState from '../../components/common/ErrorState';
import InfoRow from '../../components/common/InfoRow';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import type { IconName } from '../../types/icons';

// --- Helpers ---
const getSeverityIcon = (severity?: AlertSeverity | null): IconName => {
  switch (severity) {
    case 'CRITICAL': return 'alert-octagon';
    case 'WARNING': return 'alert';
    case 'INFO': return 'information';
    default: return 'bell-outline';
  }
};

/** Alert lifecycle status → semantic status role. */
const getAlertStatusRole = (t: Tokens, status?: AlertStatus | null): StatusRole => {
  switch (status) {
    case 'ACTIVE': return t.color.status.danger;
    case 'ACKNOWLEDGED': return t.color.status.warning;
    case 'RESOLVED': return t.color.status.success;
    case 'DISMISSED': return t.color.status.neutral;
    default: return t.color.status.neutral;
  }
};

const getStatusIcon = (status?: AlertStatus | null): IconName => {
  switch (status) {
    case 'ACTIVE': return 'bell-ring-outline';
    case 'ACKNOWLEDGED': return 'eye-check-outline';
    case 'RESOLVED': return 'check-circle-outline';
    case 'DISMISSED': return 'close-circle-outline';
    default: return 'bell-outline';
  }
};

type ConfirmAction = 'acknowledge' | 'resolve' | 'dismiss' | null;

// ── Loading placeholder ──
// Shaped like the detail content below, so nothing jumps on arrival.
const DetailSkeleton: React.FC<{ t: Tokens }> = ({ t }) => (
  <View style={styles.scrollContent}>
    <View style={styles.badgeRow}>
      <Skeleton width={132} height={38} radius={radii.lg} />
      <Skeleton width={104} height={38} radius={radii.lg} />
    </View>
    <Skeleton width="80%" height={26} style={styles.skeletonName} />
    <View
      style={[styles.messageSection, { backgroundColor: t.color.surface.sunken }]}
    >
      <Skeleton width={72} height={11} />
      <Skeleton width="100%" height={13} style={styles.skeletonLine} />
      <Skeleton width="65%" height={13} style={styles.skeletonLine} />
    </View>
    <View
      style={[
        styles.infoSection,
        styles.infoSectionSkeleton,
        {
          backgroundColor: t.color.surface.raised,
          borderColor: t.color.border.subtle,
        },
      ]}
    >
      {[0, 1, 2, 3, 4, 5].map((row) => (
        <View key={row} style={styles.skeletonInfoRow}>
          <Skeleton width={96} height={13} />
          <Skeleton width={120} height={13} />
        </View>
      ))}
    </View>
  </View>
);

const AlertDetailScreen: React.FC = () => {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { alertId } = useLocalSearchParams<{ alertId: string }>();

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

  const appbar = (
    <Appbar.Header
      style={{ backgroundColor: t.color.surface.canvas }}
      elevated={false}
    >
      <Appbar.BackAction onPress={() => router.back()} />
      <Appbar.Content title="Alert Detail" titleStyle={styles.appbarTitle} />
    </Appbar.Header>
  );

  if (isLoading) {
    return (
      <View
        style={[
          styles.container,
          { backgroundColor: t.color.surface.canvas, paddingBottom: insets.bottom },
        ]}
      >
        {appbar}
        <DetailSkeleton t={t} />
      </View>
    );
  }
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  if (!alert) return <ErrorState message="Alert not found" />;

  const severity = alert.severity ?? 'INFO';
  const status = alert.status ?? 'ACTIVE';
  const sevRole = getSeverityRole(t, severity);
  const statRole = getAlertStatusRole(t, status);
  const isActionable = status === 'ACTIVE' || status === 'ACKNOWLEDGED';
  const isMutating =
    acknowledgeMutation.isPending || resolveMutation.isPending || dismissMutation.isPending;

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: t.color.surface.canvas, paddingBottom: insets.bottom },
      ]}
    >
      {/* ── Header ── */}
      {appbar}

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Severity + Status Badges ── */}
        <View style={styles.badgeRow}>
          <View style={[styles.severityBadge, { backgroundColor: sevRole.surface }]}>
            <Icon name={getSeverityIcon(severity)} size={20} color={sevRole.base} />
            <Text style={[styles.severityText, { color: sevRole.base }]}>
              {severity}
            </Text>
          </View>

          <View style={[styles.statusBadge, { backgroundColor: statRole.surface }]}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: statRole.base },
                status === 'ACTIVE' && {
                  shadowColor: statRole.base,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 4,
                },
              ]}
            />
            <Text style={[styles.statusText, { color: statRole.base }]}>
              {status}
            </Text>
          </View>
        </View>

        {/* ── Alert Name ── */}
        <Text style={[styles.alertName, { color: t.color.text.primary }]}>
          {alert.name}
        </Text>

        {/* ── Message Section ── */}
        <View style={[styles.messageSection, { backgroundColor: t.color.surface.sunken }]}>
          <Text style={[styles.messageLabel, { color: t.color.text.tertiary }]}>
            MESSAGE
          </Text>
          <Text style={[styles.messageBody, { color: t.color.text.primary }]}>
            {alert.message}
          </Text>
        </View>

        {/* ── Info Section ── */}
        <View
          style={[
            styles.infoSection,
            {
              backgroundColor: t.color.surface.raised,
              borderColor: t.color.border.subtle,
            },
          ]}
        >
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
                  buttonColor={t.color.brand.base}
                  textColor={t.color.text.inverse}
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
                  textColor={t.color.text.secondary}
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
                  buttonColor={t.color.status.success.base}
                  textColor={t.color.text.inverse}
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
                  textColor={t.color.text.secondary}
                >
                  Dismiss
                </Button>
              </>
            )}
          </View>
        )}

        {/* Read-only notice for resolved/dismissed */}
        {!isActionable && (
          <View style={[styles.readOnlyNotice, { backgroundColor: t.color.surface.sunken }]}>
            <Icon name={getStatusIcon(status)} size={18} color={statRole.base} />
            <Text style={[styles.readOnlyText, { color: t.color.text.secondary }]}>
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
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appbarTitle: typeScale.heading,
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginTop: spacing.sm,
    marginBottom: spacing.lg,
  },
  severityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: 14,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
  },
  severityText: { ...typeScale.body, fontWeight: '700', letterSpacing: 0.3 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.lg,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: radii.pill,
  },
  statusText: { ...typeScale.bodySmall, fontWeight: '700' },
  alertName: { ...typeScale.title, marginBottom: spacing.lg },
  messageSection: {
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
  },
  messageLabel: { ...typeScale.caption, marginBottom: spacing.sm },
  messageBody: { ...typeScale.body, lineHeight: 22 },
  infoSection: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
    marginBottom: spacing.xxl,
  },
  infoSectionSkeleton: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  actionSection: {
    gap: spacing.md,
    marginBottom: spacing.lg,
  },
  actionButton: {
    borderRadius: radii.lg,
    paddingVertical: spacing.xs,
  },
  readOnlyNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.lg,
    borderRadius: radii.lg,
    marginBottom: spacing.lg,
  },
  readOnlyText: { ...typeScale.bodySmall, flex: 1 },
  skeletonName: {
    marginBottom: spacing.lg,
  },
  skeletonLine: {
    marginTop: spacing.sm,
  },
  skeletonInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});

export default AlertDetailScreen;
