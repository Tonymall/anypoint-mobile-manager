// ============================================================
// Platform Alerts — Alert List
//
// Card-based alert list with severity filtering, search,
// pull-to-refresh, and navigation to alert detail.
//
// Built on the design token layer: severity and alert status both
// resolve to semantic status roles, so the accent bar, badge tint
// and dot stay in step across light and dark.
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
  Searchbar,
  Text,
  Chip,
  useTheme,
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import { useRouter, useIsFocused } from 'expo-router';

import type { Alert, AlertSeverity } from '../../types';
import {
  radii,
  spacing,
  typeScale,
  useTokens,
  type StatusRole,
  type Tokens,
} from '../../theme';
import { Skeleton } from '../../components/ui';
import { usePlatformAlerts } from '../../hooks/queries/useAlertQueries';
import { formatRelativeTime, getSeverityRole } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import ErrorState from '../../components/common/ErrorState';
import type { IconName } from '../../types/icons';

// --- Filter Definitions ---
type SeverityFilter = AlertSeverity | 'ALL';

const SEVERITY_FILTERS: { label: string; value: SeverityFilter; icon: string }[] = [
  { label: 'All', value: 'ALL', icon: 'bell-outline' },
  { label: 'Critical', value: 'CRITICAL', icon: 'alert-octagon' },
  { label: 'Warning', value: 'WARNING', icon: 'alert' },
  { label: 'Info', value: 'INFO', icon: 'information' },
];

// --- Severity helpers ---
const getSeverityIcon = (severity: AlertSeverity): IconName => {
  switch (severity) {
    case 'CRITICAL': return 'alert-octagon';
    case 'WARNING': return 'alert';
    case 'INFO': return 'information';
    default: return 'bell-outline';
  }
};

/** Alert lifecycle status → semantic status role. */
const getAlertStatusRole = (t: Tokens, status: string): StatusRole => {
  switch (status) {
    case 'ACTIVE': return t.color.status.danger;
    case 'ACKNOWLEDGED': return t.color.status.warning;
    case 'RESOLVED': return t.color.status.success;
    case 'DISMISSED': return t.color.status.neutral;
    default: return t.color.status.neutral;
  }
};

// ── Alert Card ──
const AlertCard = React.memo<{
  alert: Alert;
  onPress: () => void;
  t: Tokens;
}>(({ alert, onPress, t }) => {
  const sevRole = getSeverityRole(t, alert.severity);
  const statRole = getAlertStatusRole(t, alert.status);

  const tagStyle = [styles.tag, { backgroundColor: t.color.surface.sunken }];
  const tagTextStyle = [styles.tagText, { color: t.color.text.secondary }];

  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      accessibilityLabel={`${alert.name}, ${alert.severity} alert, ${alert.status}`}
      accessibilityRole="button"
      accessibilityHint="Double tap to view details"
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
      <View style={[styles.cardAccent, { backgroundColor: sevRole.base }]} />

      <View style={styles.cardBody}>
        {/* Header: name + status badge */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <Icon name={getSeverityIcon(alert.severity)} size={18} color={sevRole.base} />
            <Text
              style={[styles.alertName, { color: t.color.text.primary }]}
              numberOfLines={1}
            >
              {alert.name}
            </Text>
          </View>

          {/* Status chip badge */}
          <View style={[styles.statusBadge, { backgroundColor: statRole.surface }]}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: statRole.base },
                alert.status === 'ACTIVE' && {
                  shadowColor: statRole.base,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 3,
                },
              ]}
            />
            <Text style={[styles.statusText, { color: statRole.base }]}>
              {alert.status}
            </Text>
          </View>
        </View>

        {/* Message (2 lines max) */}
        <Text
          style={[styles.message, { color: t.color.text.secondary }]}
          numberOfLines={2}
        >
          {alert.message}
        </Text>

        {/* Meta: source app + relative time */}
        <View style={styles.tagRow}>
          {alert.applicationName && (
            <View style={tagStyle}>
              <Icon name="application-outline" size={11} color={t.color.text.secondary} />
              <Text style={tagTextStyle}>{alert.applicationName}</Text>
            </View>
          )}
          {alert.source && (
            <View style={tagStyle}>
              <Icon name="source-branch" size={11} color={t.color.text.secondary} />
              <Text style={tagTextStyle}>{alert.source}</Text>
            </View>
          )}
          <View style={tagStyle}>
            <Icon name="clock-outline" size={11} color={t.color.text.secondary} />
            <Text style={tagTextStyle}>{formatRelativeTime(alert.createdAt)}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});
AlertCard.displayName = 'AlertCard';

// ── Loading placeholder ──
// Card-shaped so the list does not jump when the alerts land.
const AlertCardSkeleton = React.memo<{ t: Tokens }>(({ t }) => (
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
        <View style={styles.cardHeaderText}>
          <Skeleton width={18} height={18} radius={radii.pill} />
          <Skeleton width="55%" height={15} />
        </View>
        <Skeleton width={72} height={20} />
      </View>
      <View style={styles.skeletonMessage}>
        <Skeleton width="100%" height={12} />
        <Skeleton width="70%" height={12} />
      </View>
      <View style={styles.tagRow}>
        <Skeleton width={96} height={18} />
        <Skeleton width={72} height={18} />
      </View>
    </View>
  </View>
));
AlertCardSkeleton.displayName = 'AlertCardSkeleton';

const SKELETON_ROWS = [0, 1, 2, 3, 4];

// --- Component ---
const PlatformAlertsScreen: React.FC = () => {
  const theme = useTheme();
  const t = useTokens();
  const router = useRouter();
  const isFocused = useIsFocused();

  const [searchQuery, setSearchQuery] = useState('');
  const [severityFilter, setSeverityFilter] = useState<SeverityFilter>('ALL');

  const { data: alerts, isLoading, error, refetch, isRefetching } = usePlatformAlerts(undefined, { enabled: isFocused });

  const alertsList = useMemo(() => ((alerts as any)?.data ?? []) as Alert[], [alerts]);

  const severityCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    alertsList.forEach((a) => {
      counts[a.severity] = (counts[a.severity] ?? 0) + 1;
    });
    return counts;
  }, [alertsList]);

  const filteredAlerts = useMemo(() => {
    return alertsList.filter((alert) => {
      const matchesSearch =
        searchQuery === '' ||
        alert.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (alert.applicationName ?? '').toLowerCase().includes(searchQuery.toLowerCase());
      const matchesSeverity = severityFilter === 'ALL' || alert.severity === severityFilter;
      return matchesSearch && matchesSeverity;
    });
  }, [alertsList, searchQuery, severityFilter]);

  const renderAlertCard = useCallback(
    ({ item }: ListRenderItemInfo<Alert>) => (
      <AlertCard
        alert={item}
        onPress={() =>
          router.push({
            pathname: '/(main)/alerts/detail' as any,
            params: { alertId: item.id },
          })
        }
        t={t}
      />
    ),
    [t, router],
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <View style={[styles.emptyIcon, { backgroundColor: t.color.surface.sunken }]}>
          <Icon name="bell-off-outline" size={36} color={t.color.text.tertiary} />
        </View>
        <Text style={[styles.emptyTitle, { color: t.color.text.primary }]}>
          No platform alerts
        </Text>
        <Text style={[styles.emptyBody, { color: t.color.text.secondary }]}>
          {searchQuery || severityFilter !== 'ALL'
            ? 'Try adjusting your filters or search query.'
            : 'All clear! No alerts have been triggered.'}
        </Text>
      </View>
    ),
    [searchQuery, severityFilter, t],
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
        <View style={styles.topBar}>
          <View style={styles.titleRow}>
            <View style={[styles.sectionAccent, { backgroundColor: t.color.brand.base }]} />
            <Text style={[styles.screenTitle, { color: t.color.text.primary }]}>
              Alerts
            </Text>
          </View>
          <Skeleton width="100%" height={44} radius={radii.lg} />
        </View>
        <View style={styles.listContent}>
          {SKELETON_ROWS.map((row) => (
            <AlertCardSkeleton key={row} t={t} />
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
            Alerts
          </Text>
          <View style={[styles.countBadge, { backgroundColor: t.color.brand.surface }]}>
            <Text style={[styles.countBadgeText, { color: t.color.text.accent }]}>
              {alertsList.length}
            </Text>
          </View>
        </View>
        <Searchbar
          placeholder="Search by name or app..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[styles.searchBar, { backgroundColor: t.color.surface.sunken }]}
          inputStyle={styles.searchInput}
          icon="magnify"
        />
      </View>

      {/* ── Severity filter chips ── */}
      <View style={styles.filterRow}>
        {SEVERITY_FILTERS.map((f) => {
          const isActive = severityFilter === f.value;
          const chipRole =
            f.value === 'ALL'
              ? t.color.accent.brand
              : getSeverityRole(t, f.value);
          const count =
            f.value === 'ALL' ? alertsList.length : (severityCounts[f.value] ?? 0);

          return (
            <Chip
              key={f.value}
              icon={f.icon}
              onPress={() => {
                hapticLight();
                setSeverityFilter(f.value);
              }}
              style={[
                styles.filterChip,
                { borderColor: t.color.border.default },
                isActive && {
                  backgroundColor: chipRole.surface,
                  borderColor: chipRole.border,
                },
              ]}
              selected={isActive}
              selectedColor={isActive ? chipRole.base : undefined}
              compact
              accessibilityRole="button"
              accessibilityLabel={`Filter: ${f.label} (${count})`}
            >
              {`${f.label} (${count})`}
            </Chip>
          );
        })}
        <View style={styles.spacer} />
        <Text style={[styles.resultCount, { color: t.color.text.tertiary }]}>
          {filteredAlerts.length} result{filteredAlerts.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* ── Alerts list ── */}
      <FlatList
        data={filteredAlerts}
        keyExtractor={(item) => item.id}
        renderItem={renderAlertCard}
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
    </View>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
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
  },
  cardHeaderText: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    gap: spacing.sm,
  },
  alertName: { ...typeScale.subheading, flex: 1 },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radii.pill,
  },
  statusText: { ...typeScale.caption, fontWeight: '700' },
  message: { ...typeScale.bodySmall, marginTop: spacing.sm },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: spacing.md,
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
  skeletonMessage: {
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  topBar: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.md,
    paddingHorizontal: spacing.xs,
  },
  sectionAccent: {
    width: 3,
    height: 18,
    borderRadius: 1.5,
    marginRight: 10,
  },
  screenTitle: { ...typeScale.title, fontSize: 20, flex: 1 },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  countBadgeText: { ...typeScale.label, fontWeight: '700' },
  searchBar: {
    elevation: 0,
    borderRadius: radii.lg,
    height: 44,
  },
  searchInput: {
    ...typeScale.body,
    minHeight: 44,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  filterChip: {
    borderRadius: radii.md,
  },
  spacer: {
    flex: 1,
  },
  resultCount: { ...typeScale.caption, fontWeight: '500' },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.xs,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: spacing.xxxl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radii.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: { ...typeScale.heading, marginBottom: 6 },
  emptyBody: { ...typeScale.bodySmall, textAlign: 'center' },
});

export default PlatformAlertsScreen;
