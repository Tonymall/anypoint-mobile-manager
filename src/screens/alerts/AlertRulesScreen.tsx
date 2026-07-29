// ============================================================
// Alert Rules — Rule List with Toggle & CRUD (2026 Design)
//
// FlatList of alert rule cards with enabled/disabled switch,
// FAB for creating new rules, long-press to delete, and
// pull-to-refresh.
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ListRenderItemInfo,
  Pressable,
} from 'react-native';
import {
  Text,
  Switch,
  FAB,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import type { AlertRule, AlertSeverity, AlertType } from '../../types';
import { anypointColors, severityColors } from '../../theme';
import {
  useAlertRules,
  useUpdateAlertRule,
  useDeleteAlertRule,
} from '../../hooks/queries/useAlertQueries';
import { hapticLight } from '../../utils/haptics';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import type { IconName } from '../../types/icons';

// --- Helpers ---
const getSeverityColor = (severity: AlertSeverity): string => {
  return severityColors[severity] ?? anypointColors.info;
};

const getTypeIcon = (type: AlertType): IconName => {
  switch (type) {
    case 'response-time': return 'timer-outline';
    case 'error-count': return 'alert-circle-outline';
    case 'request-count': return 'swap-horizontal';
    case 'cpu-usage': return 'chip';
    case 'memory-usage': return 'memory';
    case 'worker-unresponsive': return 'server-off';
    case 'deployment-failed': return 'cloud-off-outline';
    case 'custom': return 'tune-variant';
    default: return 'bell-outline';
  }
};

const formatType = (type: AlertType): string => {
  return type
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
};

// ── Rule Card ──
const RuleCard = React.memo<{
  rule: AlertRule;
  onToggle: (enabled: boolean) => void;
  onLongPress: () => void;
  isUpdating: boolean;
  theme: MD3Theme;
}>(({ rule, onToggle, onLongPress, isUpdating, theme }) => {
  const sevColor = getSeverityColor(rule.severity);
  const typeIcon = getTypeIcon(rule.type);

  return (
    <Pressable
      onLongPress={() => {
        hapticLight();
        onLongPress();
      }}
      accessibilityLabel={`Alert rule: ${rule.name}, ${rule.enabled ? 'enabled' : 'disabled'}`}
      accessibilityRole="button"
      accessibilityHint="Long press to delete"
      style={({ pressed }) => [
        {
          marginBottom: 8,
          borderRadius: 18,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.outlineVariant,
          overflow: 'hidden',
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      {/* Severity accent border at left */}
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 12,
          bottom: 12,
          width: 3,
          borderRadius: 1.5,
          backgroundColor: rule.enabled ? sevColor : theme.colors.outline,
        }}
      />

      <View style={{ padding: 16, paddingLeft: 18 }}>
        {/* Header: name + toggle */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '600',
              color: rule.enabled ? theme.colors.onSurface : theme.colors.onSurfaceVariant,
              letterSpacing: -0.2,
              flex: 1,
            }}
            numberOfLines={1}
          >
            {rule.name}
          </Text>
          <Switch
            value={rule.enabled}
            onValueChange={(val) => {
              hapticLight();
              onToggle(val);
            }}
            disabled={isUpdating}
            color={anypointColors.primary}
          />
        </View>

        {/* Type + Severity badges */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {/* Type badge */}
          <View style={badgeStyle(theme)}>
            <Icon name={typeIcon} size={12} color={theme.colors.onSurfaceVariant} />
            <Text style={badgeTextStyle(theme)}>{formatType(rule.type)}</Text>
          </View>

          {/* Severity badge */}
          <View
            style={[
              badgeStyle(theme),
              { backgroundColor: sevColor + '15' },
            ]}
          >
            <View
              style={{
                width: 6,
                height: 6,
                borderRadius: 3,
                backgroundColor: sevColor,
              }}
            />
            <Text style={[badgeTextStyle(theme), { color: sevColor }]}>
              {rule.severity}
            </Text>
          </View>

          {/* Applications count */}
          {rule.applicationIds && rule.applicationIds.length > 0 && (
            <View style={badgeStyle(theme)}>
              <Icon name="application-outline" size={12} color={theme.colors.onSurfaceVariant} />
              <Text style={badgeTextStyle(theme)}>
                {rule.applicationIds.length} app{rule.applicationIds.length !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Condition summary */}
        <Text
          style={{
            fontSize: 12,
            color: theme.colors.onSurfaceVariant,
            marginTop: 8,
          }}
          numberOfLines={1}
        >
          {rule.condition.metric} {rule.condition.operator} {rule.condition.threshold} over {rule.condition.periodMinutes}m
        </Text>
      </View>
    </Pressable>
  );
});
RuleCard.displayName = 'RuleCard';

// Badge helpers
const badgeStyle = (theme: MD3Theme) => ({
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 4,
  paddingHorizontal: 8,
  paddingVertical: 3,
  borderRadius: 8,
  backgroundColor: theme.colors.surfaceVariant + '80',
});

const badgeTextStyle = (theme: MD3Theme) => ({
  fontSize: 11,
  color: theme.colors.onSurfaceVariant,
  fontWeight: '500' as const,
});

// --- Component ---
const AlertRulesScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: rules, isLoading, error, refetch, isRefetching } = useAlertRules();
  const updateMutation = useUpdateAlertRule();
  const deleteMutation = useDeleteAlertRule();

  const [deleteTarget, setDeleteTarget] = useState<AlertRule | null>(null);
  const [updatingRuleId, setUpdatingRuleId] = useState<string | null>(null);

  const rulesList = useMemo(() => ((rules as any)?.data ?? []) as AlertRule[], [rules]);

  const handleToggle = useCallback(
    (rule: AlertRule, enabled: boolean) => {
      setUpdatingRuleId(rule.id);
      updateMutation.mutate(
        { ruleId: rule.id, updates: { enabled } },
        { onSettled: () => setUpdatingRuleId(null) },
      );
    },
    [updateMutation],
  );

  const handleDelete = useCallback(() => {
    if (!deleteTarget) return;
    hapticLight();
    deleteMutation.mutate(deleteTarget.id, {
      onSettled: () => setDeleteTarget(null),
    });
  }, [deleteTarget, deleteMutation]);

  const renderRuleCard = useCallback(
    ({ item }: ListRenderItemInfo<AlertRule>) => (
      <RuleCard
        rule={item}
        onToggle={(enabled) => handleToggle(item, enabled)}
        onLongPress={() => setDeleteTarget(item)}
        isUpdating={updatingRuleId === item.id}
        theme={theme}
      />
    ),
    [theme, handleToggle, updatingRuleId],
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            backgroundColor: theme.colors.surfaceVariant,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <Icon name="bell-cog-outline" size={36} color={theme.colors.onSurfaceVariant} />
        </View>
        <Text
          style={{
            fontSize: 17,
            fontWeight: '700',
            color: theme.colors.onSurface,
            marginBottom: 6,
          }}
        >
          No alert rules configured
        </Text>
        <Text
          style={{
            fontSize: 13,
            color: theme.colors.onSurfaceVariant,
            textAlign: 'center',
          }}
        >
          Create an alert rule to get notified when conditions are met.
        </Text>
      </View>
    ),
    [theme],
  );

  if (isLoading) return <LoadingState message="Loading alert rules..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* ── Header ── */}
      <View style={[styles.topBar, { paddingTop: 12 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 4 }}>
          <View style={[styles.sectionAccent, { backgroundColor: theme.colors.primary }]} />
          <Text
            style={{
              fontSize: 20,
              fontWeight: '700',
              color: theme.colors.onSurface,
              flex: 1,
              letterSpacing: -0.3,
            }}
          >
            Alert Rules
          </Text>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 10,
              backgroundColor: anypointColors.primary + '12',
            }}
          >
            <Text style={{ fontSize: 12, fontWeight: '700', color: anypointColors.primary }}>
              {rulesList.length}
            </Text>
          </View>
        </View>
      </View>

      {/* ── Rules list ── */}
      <FlatList
        data={rulesList}
        keyExtractor={(item) => item.id}
        renderItem={renderRuleCard}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews
      />

      {/* ── FAB: Create Rule ── */}
      <FAB
        icon="plus"
        style={[
          styles.fab,
          {
            backgroundColor: anypointColors.primary,
            bottom: insets.bottom + 16,
          },
        ]}
        color="#FFFFFF"
        onPress={() => {
          hapticLight();
          router.push('/(main)/alerts/create-rule' as any);
        }}
        accessibilityLabel="Create alert rule"
      />

      {/* ── Delete Confirm Dialog ── */}
      <ConfirmDialog
        visible={deleteTarget !== null}
        title="Delete Alert Rule"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This action cannot be undone.`}
        confirmLabel="Delete"
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        destructive
      />
    </View>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  topBar: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  sectionAccent: {
    width: 3,
    height: 18,
    borderRadius: 1.5,
    marginRight: 10,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 96,
    paddingTop: 4,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  fab: {
    position: 'absolute',
    right: 16,
    borderRadius: 18,
  },
});

export default AlertRulesScreen;
