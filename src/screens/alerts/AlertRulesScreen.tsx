// ============================================================
// Alert Rules — Rule List with Toggle & CRUD
//
// FlatList of alert rule cards with enabled/disabled switch,
// FAB for creating new rules, long-press to delete, and
// pull-to-refresh.
//
// Built on the design token layer: severity resolves to a semantic
// status role, so the accent bar and badge tint stay in step across
// light and dark.
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
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import type { AlertRule, AlertType } from '../../types';
import {
  radii,
  spacing,
  typeScale,
  useTokens,
  type Tokens,
} from '../../theme';
import { Skeleton } from '../../components/ui';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import {
  useAlertRules,
  useUpdateAlertRule,
  useDeleteAlertRule,
} from '../../hooks/queries/useAlertQueries';
import { getSeverityRole } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';
import ConfirmDialog from '../../components/common/ConfirmDialog';
import type { IconName } from '../../types/icons';

// --- Helpers ---
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
  t: Tokens;
}>(({ rule, onToggle, onLongPress, isUpdating, t }) => {
  const sevRole = getSeverityRole(t, rule.severity);
  const typeIcon = getTypeIcon(rule.type);

  const tagStyle = [styles.tag, { backgroundColor: t.color.surface.sunken }];
  const tagTextStyle = [styles.tagText, { color: t.color.text.secondary }];

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
        styles.card,
        {
          backgroundColor: t.color.surface.raised,
          borderColor: t.color.border.subtle,
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      {/* Severity accent border at left */}
      <View
        style={[
          styles.cardAccent,
          {
            backgroundColor: rule.enabled
              ? sevRole.base
              : t.color.status.neutral.base,
          },
        ]}
      />

      <View style={styles.cardBody}>
        {/* Header: name + toggle */}
        <View style={styles.cardHeader}>
          <Text
            style={[
              styles.ruleName,
              {
                color: rule.enabled
                  ? t.color.text.primary
                  : t.color.text.tertiary,
              },
            ]}
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
            color={t.color.brand.base}
          />
        </View>

        {/* Type + Severity badges */}
        <View style={styles.tagRow}>
          <View style={tagStyle}>
            <Icon name={typeIcon} size={12} color={t.color.text.secondary} />
            <Text style={tagTextStyle}>{formatType(rule.type)}</Text>
          </View>

          <View style={[styles.tag, { backgroundColor: sevRole.surface }]}>
            <View style={[styles.sevDot, { backgroundColor: sevRole.base }]} />
            <Text style={[styles.tagText, { color: sevRole.base }]}>
              {rule.severity}
            </Text>
          </View>

          {rule.applicationIds && rule.applicationIds.length > 0 && (
            <View style={tagStyle}>
              <Icon name="application-outline" size={12} color={t.color.text.secondary} />
              <Text style={tagTextStyle}>
                {rule.applicationIds.length} app{rule.applicationIds.length !== 1 ? 's' : ''}
              </Text>
            </View>
          )}
        </View>

        {/* Condition summary */}
        <Text
          style={[styles.condition, { color: t.color.text.tertiary }]}
          numberOfLines={1}
        >
          {rule.condition.metric} {rule.condition.operator} {rule.condition.threshold} over {rule.condition.periodMinutes}m
        </Text>
      </View>
    </Pressable>
  );
});
RuleCard.displayName = 'RuleCard';

// ── Loading placeholder ──
// Card-shaped so the list does not jump when the rules land.
const RuleCardSkeleton = React.memo<{ t: Tokens }>(({ t }) => (
  <View
    style={[
      styles.card,
      {
        backgroundColor: t.color.surface.raised,
        borderColor: t.color.border.subtle,
      },
    ]}
  >
    <View style={[styles.cardAccent, { backgroundColor: t.color.border.default }]} />
    <View style={styles.cardBody}>
      <View style={styles.cardHeader}>
        <Skeleton width="55%" height={15} />
        <Skeleton width={48} height={28} radius={radii.pill} />
      </View>
      <View style={styles.tagRow}>
        <Skeleton width={104} height={20} />
        <Skeleton width={72} height={20} />
      </View>
      <Skeleton width="70%" height={12} style={styles.skeletonCondition} />
    </View>
  </View>
));
RuleCardSkeleton.displayName = 'RuleCardSkeleton';

const SKELETON_ROWS = [0, 1, 2, 3, 4];

// --- Component ---
const AlertRulesScreen: React.FC = () => {
  const t = useTokens();
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const { data: rules, isLoading, error, refetch } = useAlertRules();
  // Only a pull shows the control; background refetches stay invisible.
  const pullRefresh = usePullRefresh(refetch);
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
        t={t}
      />
    ),
    [t, handleToggle, updatingRuleId],
  );

  // No filters on this screen, so there is only one empty case: nothing
  // has been created yet. Say what a rule does and offer to make one.
  const renderEmptyState = useCallback(
    () => (
      <EmptyState
        icon="bell-cog-outline"
        title="No alert rules yet"
        description="A rule watches a metric — CPU, errors, response time — and notifies you when it crosses your threshold."
        actionLabel="Create a rule"
        onAction={() => {
          hapticLight();
          router.push('/(main)/alerts/create-rule' as any);
        }}
      />
    ),
    [router],
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
        <View style={styles.topBar}>
          <View style={styles.titleRow}>
            <View style={[styles.sectionAccent, { backgroundColor: t.color.brand.base }]} />
            <Text style={[styles.screenTitle, { color: t.color.text.primary }]}>
              Alert Rules
            </Text>
          </View>
        </View>
        <View style={styles.listContent}>
          {SKELETON_ROWS.map((row) => (
            <RuleCardSkeleton key={row} t={t} />
          ))}
        </View>
      </View>
    );
  }
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
      {/* ── Header ── */}
      <View style={styles.topBar}>
        <View style={styles.titleRow}>
          <View style={[styles.sectionAccent, { backgroundColor: t.color.brand.base }]} />
          <Text style={[styles.screenTitle, { color: t.color.text.primary }]}>
            Alert Rules
          </Text>
          <View style={[styles.countBadge, { backgroundColor: t.color.brand.surface }]}>
            <Text style={[styles.countBadgeText, { color: t.color.text.accent }]}>
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
        contentContainerStyle={[
          styles.listContent,
          rulesList.length === 0 && styles.listContentEmpty,
        ]}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={pullRefresh.refreshing}
            onRefresh={pullRefresh.onRefresh}
            colors={[t.color.brand.base]}
            tintColor={t.color.brand.base}
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
            backgroundColor: t.color.brand.base,
            bottom: insets.bottom + spacing.lg,
          },
        ]}
        color={t.color.text.inverse}
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
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.xs,
  },
  sectionAccent: {
    width: 3,
    height: 18,
    borderRadius: 1.5,
    marginRight: 10,
  },
  screenTitle: { ...typeScale.title, flex: 1 },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  countBadgeText: { ...typeScale.label, fontWeight: '700' },
  card: {
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardAccent: {
    position: 'absolute',
    left: 0,
    top: spacing.md,
    bottom: spacing.md,
    width: 3,
    borderRadius: 1.5,
  },
  cardBody: {
    padding: spacing.lg,
    paddingLeft: 18,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ruleName: { ...typeScale.subheading, flex: 1 },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radii.sm,
  },
  tagText: { ...typeScale.caption, fontWeight: '500' },
  sevDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
  },
  condition: { ...typeScale.caption, marginTop: spacing.sm },
  skeletonCondition: {
    marginTop: spacing.md,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 96,
    paddingTop: spacing.xs,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
  fab: {
    position: 'absolute',
    right: spacing.lg,
    borderRadius: radii.xl,
  },
});

export default AlertRulesScreen;
