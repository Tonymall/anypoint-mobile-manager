// ============================================================
// API Manager — API List Screen
// ============================================================
// Built on the design token layer: status roles drive the accent,
// badge and dot together, so light and dark are defined in one place.
//
// The empty state distinguishes "this environment has no managed API
// instances" from "your search or filter excluded everything" — those
// are different problems and only one of them is the user's to fix.
// ============================================================

import React, { useState, useMemo, useCallback } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, Pressable } from 'react-native';
import { useRouter, useIsFocused } from 'expo-router';
import { Button, Searchbar, Text } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';

import type { APIStatus, ManagedAPI } from '../../types';
import {
  monoFontFamily,
  radii,
  spacing,
  typeScale,
  useTokens,
  withAlpha,
  type StatusRole,
  type Tokens,
} from '../../theme';
import { Skeleton } from '../../components/ui';
import { useManagedAPIs } from '../../hooks/queries';
import { useDebounce } from '../../hooks/useDebounce';
import ErrorState from '../../components/common/ErrorState';

// ── Status filter options ────────────────────────────────────

type StatusFilter = 'all' | APIStatus;

const STATUS_FILTERS: { label: string; value: StatusFilter }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Inactive', value: 'inactive' },
  { label: 'Deprecated', value: 'deprecated' },
];

// ── Helpers ──────────────────────────────────────────────────

/** API lifecycle status → semantic status role. */
const statusRole = (t: Tokens, status: string): StatusRole => {
  switch (status) {
    case 'active':
      return t.color.status.success;
    case 'deprecated':
      return t.color.status.warning;
    case 'blocked':
      return t.color.status.danger;
    case 'inactive':
    default:
      return t.color.status.neutral;
  }
};

/** The chip for a filter is tinted with the role it selects. */
const filterRole = (t: Tokens, value: StatusFilter): StatusRole =>
  value === 'all' ? t.color.accent.brand : statusRole(t, value);

const technologyLabel = (tech: string): string => {
  const map: Record<string, string> = {
    mule4: 'Mule 4',
    mule3: 'Mule 3',
    http: 'HTTP',
    raml: 'RAML',
  };
  return map[tech] ?? tech;
};

// ── API Card Component ──────────────────────────────────────

const APICard = React.memo<{ item: ManagedAPI; t: Tokens; onPress: () => void }>(
  ({ item, t, onPress }) => {
    const api = item as any;
    const label = api.instanceLabel ?? api.assetId ?? `API ${api.id ?? ''}`;
    const assetInfo = [api.assetId, api.assetVersion].filter(Boolean).join(' v');
    const status = api.status ?? 'unknown';
    const role = statusRole(t, status);
    const pendingContracts = (api.contracts ?? []).filter(
      (c: any) => c.status === 'PENDING',
    ).length;
    const isActive = status === 'active';

    return (
      <Pressable
        onPress={onPress}
        accessibilityLabel={`API: ${label}, status ${String(status).toLowerCase()}`}
        accessibilityRole="button"
        accessibilityHint="Double tap to view details"
        style={({ pressed }) => [
          cardStyles.card,
          {
            backgroundColor: t.color.surface.raised,
            borderColor: t.color.border.subtle,
            borderLeftColor: role.base,
            opacity: pressed ? 0.92 : 1,
          },
        ]}
      >
        {/* Header row */}
        <View style={cardStyles.header}>
          <View style={cardStyles.titleWrap}>
            <Text
              numberOfLines={1}
              style={[typeScale.subheading, { color: t.color.text.primary }]}
            >
              {label}
            </Text>
            {assetInfo ? (
              <Text style={[typeScale.caption, cardStyles.assetInfo, { color: t.color.text.tertiary }]}>
                {assetInfo}
              </Text>
            ) : null}
          </View>

          {/* Status badge */}
          <View style={[cardStyles.statusBadge, { backgroundColor: role.surface }]}>
            <View
              style={[
                cardStyles.statusDot,
                { backgroundColor: role.base },
                isActive && {
                  shadowColor: role.base,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 4,
                },
              ]}
            />
            <Text style={[cardStyles.statusText, { color: role.base }]}>
              {String(status).toUpperCase()}
            </Text>
          </View>
        </View>

        {/* Endpoint URI */}
        {api.endpointUri && (
          <View style={cardStyles.endpointRow}>
            <Icon name="link-variant" size={13} color={t.color.text.tertiary} />
            <Text
              numberOfLines={1}
              selectable
              style={[cardStyles.endpointText, { color: t.color.text.secondary }]}
            >
              {api.endpointUri}
            </Text>
          </View>
        )}

        {/* Tags row */}
        <View style={cardStyles.tagsRow}>
          {api.technology && (
            <View style={[cardStyles.tag, { backgroundColor: t.color.brand.surface }]}>
              <Text style={[cardStyles.tagText, { color: t.color.text.accent }]}>
                {technologyLabel(api.technology)}
              </Text>
            </View>
          )}
          {pendingContracts > 0 && (
            <View style={[cardStyles.tag, { backgroundColor: t.color.status.warning.surface }]}>
              <Icon name="clock-outline" size={12} color={t.color.status.warning.base} />
              <Text style={[cardStyles.tagText, { color: t.color.status.warning.base }]}>
                {pendingContracts} pending
              </Text>
            </View>
          )}
        </View>

        {/* Metrics row */}
        <View style={[cardStyles.metricsRow, { borderTopColor: t.color.border.subtle }]}>
          <View style={cardStyles.metric}>
            <Icon name="shield-lock-outline" size={15} color={t.color.accent.brand.base} />
            <Text style={[typeScale.subheading, { color: t.color.text.primary }]}>
              {(api.policies ?? []).length}
            </Text>
            <Text style={[typeScale.micro, { color: t.color.text.tertiary }]}>Policies</Text>
          </View>
          <View style={[cardStyles.metricDivider, { backgroundColor: t.color.border.subtle }]} />
          <View style={cardStyles.metric}>
            <Icon name="file-sign" size={15} color={t.color.accent.secondary.base} />
            <Text style={[typeScale.subheading, { color: t.color.text.primary }]}>
              {(api.contracts ?? []).length}
            </Text>
            <Text style={[typeScale.micro, { color: t.color.text.tertiary }]}>Contracts</Text>
          </View>
          <View style={[cardStyles.metricDivider, { backgroundColor: t.color.border.subtle }]} />
          <View style={cardStyles.metric}>
            <Icon name="speedometer" size={15} color={t.color.accent.tertiary.base} />
            <Text style={[typeScale.subheading, { color: t.color.text.primary }]}>
              {(api.slaTiers ?? []).length}
            </Text>
            <Text style={[typeScale.micro, { color: t.color.text.tertiary }]}>SLA Tiers</Text>
          </View>
        </View>
      </Pressable>
    );
  },
);
APICard.displayName = 'APICard';

const cardStyles = StyleSheet.create({
  card: {
    marginBottom: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: spacing.lg,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleWrap: {
    flex: 1,
    marginRight: spacing.md,
  },
  assetInfo: {
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: radii.pill,
  },
  statusText: { ...typeScale.micro, fontWeight: '700', letterSpacing: 0.6 },
  endpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  endpointText: { ...typeScale.caption, flex: 1, fontFamily: monoFontFamily, fontWeight: '400' },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: spacing.md,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 9,
    paddingVertical: spacing.xs,
    borderRadius: radii.sm,
  },
  tagText: { ...typeScale.caption, fontWeight: '600' },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.md,
  },
  metric: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  metricDivider: {
    width: StyleSheet.hairlineWidth,
    height: 28,
  },
});

// ── Loading placeholder ─────────────────────────────────────

const APIListSkeleton: React.FC = () => {
  const t = useTokens();
  return (
    <View style={styles.skeletonList} accessibilityLabel="Loading APIs">
      {Array.from({ length: 4 }, (_, i) => (
        <View
          key={i}
          style={[
            styles.skeletonCard,
            { backgroundColor: t.color.surface.raised, borderColor: t.color.border.subtle },
          ]}
        >
          <View style={styles.skeletonHeader}>
            <View style={styles.skeletonHeaderText}>
              <Skeleton width="60%" height={16} />
              <Skeleton width="35%" height={11} />
            </View>
            <Skeleton width={76} height={22} radius={radii.sm} />
          </View>
          <Skeleton width="80%" height={12} />
          <View style={styles.skeletonMetrics}>
            <Skeleton width="22%" height={28} />
            <Skeleton width="22%" height={28} />
            <Skeleton width="22%" height={28} />
          </View>
        </View>
      ))}
    </View>
  );
};

// ── Main Component ──────────────────────────────────────────

const APIListScreen: React.FC = () => {
  const t = useTokens();
  const isFocused = useIsFocused();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const debouncedSearch = useDebounce(searchQuery, 300);

  const {
    data: apisResponse,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useManagedAPIs({ query: debouncedSearch || undefined }, { enabled: isFocused });

  const allApis = useMemo(() => apisResponse ?? [], [apisResponse]);

  const filteredAPIs = useMemo(() => {
    if (statusFilter === 'all') return allApis;
    return allApis.filter((api: any) => api.status === statusFilter);
  }, [allApis, statusFilter]);

  // Is the list empty because nothing exists, or because we excluded it?
  const isNarrowed = searchQuery.trim() !== '' || statusFilter !== 'all';

  const clearFilters = useCallback(() => {
    setSearchQuery('');
    setStatusFilter('all');
  }, []);

  if (error) {
    return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;
  }

  return (
    <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <Text style={[typeScale.title, { color: t.color.text.primary }]}>API Manager</Text>
            {isLoading ? (
              <Skeleton width={120} height={12} style={styles.headerCountSkeleton} />
            ) : (
              <Text style={[typeScale.caption, styles.headerCount, { color: t.color.text.tertiary }]}>
                {allApis.length} managed {allApis.length === 1 ? 'instance' : 'instances'}
              </Text>
            )}
          </View>
          <Button
            compact
            mode="outlined"
            icon="file-chart-outline"
            onPress={() => router.push('/(main)/admin/usage-reports' as any)}
          >
            Usage
          </Button>
        </View>
      </View>

      {/* Search */}
      <Searchbar
        placeholder="Search APIs..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={[
          styles.searchbar,
          { backgroundColor: t.color.surface.sunken, borderColor: t.color.border.subtle },
        ]}
        inputStyle={styles.searchInput}
        elevation={0}
      />

      {/* Filter chips */}
      <View style={styles.chipRow}>
        {STATUS_FILTERS.map((f) => {
          const isSelected = statusFilter === f.value;
          const role = filterRole(t, f.value);
          return (
            <Pressable
              key={f.value}
              onPress={() => setStatusFilter(f.value)}
              accessibilityLabel={`Filter: ${f.label}${isSelected ? ', selected' : ''}`}
              accessibilityRole="button"
              accessibilityState={{ selected: isSelected }}
              style={[
                styles.filterChip,
                {
                  backgroundColor: isSelected ? role.surface : t.color.surface.raised,
                  borderColor: isSelected ? role.border : t.color.border.subtle,
                },
              ]}
            >
              {isSelected && f.value !== 'all' && (
                <View style={[styles.chipDot, { backgroundColor: role.base }]} />
              )}
              <Text
                style={[
                  typeScale.label,
                  {
                    fontWeight: isSelected ? '700' : '500',
                    color: isSelected ? role.base : t.color.text.secondary,
                  },
                ]}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* API list */}
      <FlatList
        data={isLoading ? [] : filteredAPIs}
        keyExtractor={(item: any, index) => String(item.id ?? item.apiId ?? index)}
        renderItem={({ item }) => (
          <APICard
            item={item}
            t={t}
            onPress={() =>
              router.push({
                pathname: '/(main)/apis/api-detail' as any,
                params: { apiId: String((item as any).id ?? (item as any).apiId) },
              })
            }
          />
        )}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            colors={[t.color.brand.base]}
            tintColor={t.color.brand.base}
          />
        }
        ListEmptyComponent={
          isLoading ? (
            <APIListSkeleton />
          ) : isNarrowed ? (
            // Something exists (or might) — the filter is what is hiding it.
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIcon, { backgroundColor: t.color.surface.sunken }]}>
                <Icon name="filter-remove-outline" size={32} color={t.color.text.tertiary} />
              </View>
              <Text style={[typeScale.heading, styles.emptyTitle, { color: t.color.text.primary }]}>
                No APIs match your filters
              </Text>
              <Text style={[typeScale.bodySmall, styles.emptyBody, { color: t.color.text.secondary }]}>
                {searchQuery.trim() !== '' && statusFilter !== 'all'
                  ? `Nothing matches “${searchQuery.trim()}” with a status of ${statusFilter}.`
                  : searchQuery.trim() !== ''
                    ? `Nothing matches “${searchQuery.trim()}” in this environment.`
                    : `No API instances currently have a status of ${statusFilter}.`}
              </Text>
              <Button mode="contained-tonal" onPress={clearFilters} style={styles.emptyAction}>
                Clear filters
              </Button>
            </View>
          ) : (
            // Genuinely nothing here — explain what would put something here.
            <View style={styles.emptyContainer}>
              <View style={[styles.emptyIcon, { backgroundColor: t.color.surface.sunken }]}>
                <Icon name="api-off" size={32} color={t.color.text.tertiary} />
              </View>
              <Text style={[typeScale.heading, styles.emptyTitle, { color: t.color.text.primary }]}>
                No managed APIs yet
              </Text>
              <Text style={[typeScale.bodySmall, styles.emptyBody, { color: t.color.text.secondary }]}>
                An API instance appears here once an API from Exchange is managed by API Manager
                in this environment. Instances carry the policies, contracts and SLA tiers that
                govern traffic to that API.
              </Text>
              <View
                style={[
                  styles.emptyHint,
                  {
                    backgroundColor: t.color.brand.surface,
                    borderColor: withAlpha(t.color.brand.base, 'border'),
                  },
                ]}
              >
                <Icon name="information-outline" size={14} color={t.color.text.accent} />
                <Text style={[typeScale.caption, styles.emptyHintText, { color: t.color.text.secondary }]}>
                  Instances are scoped to the environment you have selected. Switch environments
                  in Settings if you expected to see something here.
                </Text>
              </View>
            </View>
          )
        }
      />
    </View>
  );
};

// ── Styles ───────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    marginBottom: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
  },
  headerCount: {
    marginTop: 2,
  },
  headerCountSkeleton: {
    marginTop: 4,
  },
  searchbar: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
    height: 44,
  },
  searchInput: {
    ...typeScale.body,
    minHeight: 44,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: spacing.lg,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: radii.md,
    borderWidth: 1,
    gap: 6,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: radii.pill,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxl,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 64,
    paddingHorizontal: spacing.sm,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: radii.xl,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.lg,
  },
  emptyTitle: {
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyBody: {
    textAlign: 'center',
  },
  emptyAction: {
    marginTop: spacing.lg,
  },
  emptyHint: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    marginTop: spacing.lg,
    padding: spacing.md,
    borderRadius: radii.md,
    borderWidth: 1,
  },
  emptyHintText: {
    flex: 1,
    fontWeight: '500',
  },
  skeletonList: {
    gap: spacing.md,
  },
  skeletonCard: {
    borderRadius: radii.xl,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: spacing.lg,
    gap: spacing.md,
  },
  skeletonHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  skeletonHeaderText: {
    flex: 1,
    gap: 6,
  },
  skeletonMetrics: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
});

export default APIListScreen;
