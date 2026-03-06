// ============================================================
// API Manager - API List Screen
// 2026 Modern Dark-First Design with accent borders,
// glassmorphic cards, and refined typography.
// ============================================================

import React, { useState, useMemo } from 'react';
import { View, FlatList, StyleSheet, RefreshControl, Pressable } from 'react-native';
import {
  Searchbar,
  Text,
  useTheme,
  Icon,
  type MD3Theme,
} from 'react-native-paper';

import type { APIStatus, ManagedAPI } from '../../types';
import { statusColors, anypointColors } from '../../theme';
import { useManagedAPIs } from '../../hooks/queries';
import { useDebounce } from '../../hooks/useDebounce';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// ── Status filter options ────────────────────────────────────

type StatusFilter = 'all' | APIStatus;

const STATUS_FILTERS: { label: string; value: StatusFilter; color?: string }[] = [
  { label: 'All', value: 'all' },
  { label: 'Active', value: 'active', color: anypointColors.success },
  { label: 'Inactive', value: 'inactive', color: statusColors.stopped },
  { label: 'Deprecated', value: 'deprecated', color: anypointColors.warning },
];

// ── Helpers ──────────────────────────────────────────────────

const statusBadgeColor = (status: APIStatus): string =>
  statusColors[status] ?? statusColors.stopped;

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

const APICard: React.FC<{ item: ManagedAPI; theme: MD3Theme }> = ({ item, theme }) => {
  const api = item as any;
  const label = api.instanceLabel ?? api.assetId ?? `API ${api.id ?? ''}`;
  const assetInfo = [api.assetId, api.assetVersion].filter(Boolean).join(' v');
  const status = api.status ?? 'unknown';
  const sColor = statusBadgeColor(status);
  const pendingContracts = (api.contracts ?? []).filter(
    (c: any) => c.status === 'PENDING',
  ).length;
  const isActive = status === 'active';

  return (
    <View
      accessibilityLabel={`API: ${label}, status ${String(status).toLowerCase()}`}
      style={[
        cardStyles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.outlineVariant,
          borderLeftColor: sColor,
        },
      ]}
    >
      {/* Header row */}
      <View style={cardStyles.header}>
        <View style={cardStyles.titleWrap}>
          <Text
            variant="titleMedium"
            numberOfLines={1}
            style={{ color: theme.colors.onSurface, fontWeight: '600', letterSpacing: -0.2 }}
          >
            {label}
          </Text>
          {assetInfo ? (
            <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
              {assetInfo}
            </Text>
          ) : null}
        </View>

        {/* Status badge */}
        <View style={[cardStyles.statusBadge, { backgroundColor: sColor + '18' }]}>
          <View
            style={[
              cardStyles.statusDot,
              {
                backgroundColor: sColor,
                ...(isActive && {
                  shadowColor: sColor,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 4,
                }),
              },
            ]}
          />
          <Text style={[cardStyles.statusText, { color: sColor }]}>
            {String(status).toUpperCase()}
          </Text>
        </View>
      </View>

      {/* Endpoint URI */}
      {api.endpointUri && (
        <View style={cardStyles.endpointRow}>
          <Icon source="link-variant" size={13} color={theme.colors.onSurfaceVariant} />
          <Text
            variant="bodySmall"
            numberOfLines={1}
            selectable
            style={{ flex: 1, marginLeft: 6, color: theme.colors.onSurfaceVariant, fontFamily: 'monospace', fontSize: 11 }}
          >
            {api.endpointUri}
          </Text>
        </View>
      )}

      {/* Tags row */}
      <View style={cardStyles.tagsRow}>
        {api.technology && (
          <View style={[cardStyles.tag, { backgroundColor: theme.colors.primary + '14' }]}>
            <Text style={[cardStyles.tagText, { color: theme.colors.primary }]}>
              {technologyLabel(api.technology)}
            </Text>
          </View>
        )}
        {pendingContracts > 0 && (
          <View style={[cardStyles.tag, { backgroundColor: anypointColors.warning + '14' }]}>
            <Icon source="clock-outline" size={12} color={anypointColors.warning} />
            <Text style={[cardStyles.tagText, { color: anypointColors.warning, marginLeft: 3 }]}>
              {pendingContracts} pending
            </Text>
          </View>
        )}
      </View>

      {/* Metrics row */}
      <View style={[cardStyles.metricsRow, { borderTopColor: theme.colors.outlineVariant }]}>
        <View style={cardStyles.metric}>
          <Icon source="shield-lock-outline" size={15} color={theme.colors.primary} />
          <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
            {(api.policies ?? []).length}
          </Text>
          <Text style={[cardStyles.metricLabel, { color: theme.colors.onSurfaceVariant }]}>
            Policies
          </Text>
        </View>
        <View style={[cardStyles.metricDivider, { backgroundColor: theme.colors.outlineVariant }]} />
        <View style={cardStyles.metric}>
          <Icon source="file-sign" size={15} color={theme.colors.secondary} />
          <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
            {(api.contracts ?? []).length}
          </Text>
          <Text style={[cardStyles.metricLabel, { color: theme.colors.onSurfaceVariant }]}>
            Contracts
          </Text>
        </View>
        <View style={[cardStyles.metricDivider, { backgroundColor: theme.colors.outlineVariant }]} />
        <View style={cardStyles.metric}>
          <Icon source="speedometer" size={15} color={theme.colors.tertiary} />
          <Text variant="titleSmall" style={{ color: theme.colors.onSurface, fontWeight: '700' }}>
            {(api.slaTiers ?? []).length}
          </Text>
          <Text style={[cardStyles.metricLabel, { color: theme.colors.onSurfaceVariant }]}>
            SLA Tiers
          </Text>
        </View>
      </View>
    </View>
  );
};

const cardStyles = StyleSheet.create({
  card: {
    marginBottom: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderLeftWidth: 3,
    padding: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  titleWrap: {
    flex: 1,
    marginRight: 12,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 6,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.6,
  },
  endpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  tagsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  tag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '600',
  },
  metricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 12,
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
  metricLabel: {
    fontSize: 10,
    fontWeight: '500',
    letterSpacing: 0.3,
  },
});

// ── Main Component ──────────────────────────────────────────

const APIListScreen: React.FC = () => {
  const theme = useTheme<MD3Theme>();
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const debouncedSearch = useDebounce(searchQuery, 300);

  const {
    data: apisResponse,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useManagedAPIs({ query: debouncedSearch || undefined });

  const allApis = useMemo(() => apisResponse ?? [], [apisResponse]);

  const filteredAPIs = useMemo(() => {
    if (statusFilter === 'all') return allApis;
    return allApis.filter((api: any) => api.status === statusFilter);
  }, [allApis, statusFilter]);

  if (isLoading) {
    return <LoadingState message="Loading APIs..." />;
  }

  if (error) {
    return (
      <ErrorState
        message={(error as Error).message}
        onRetry={() => refetch()}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: 12 }]}>
        <Text variant="headlineSmall" style={{ color: theme.colors.onSurface, fontWeight: '700', letterSpacing: -0.3 }}>
          API Manager
        </Text>
        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant, marginTop: 2 }}>
          {allApis.length} managed {allApis.length === 1 ? 'instance' : 'instances'}
        </Text>
      </View>

      {/* Search */}
      <Searchbar
        placeholder="Search APIs..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={[styles.searchbar, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}
        inputStyle={{ fontSize: 14 }}
        elevation={0}
      />

      {/* Filter chips */}
      <View style={styles.chipRow}>
        {STATUS_FILTERS.map((f) => {
          const isSelected = statusFilter === f.value;
          return (
            <Pressable
              key={f.value}
              onPress={() => setStatusFilter(f.value)}
              accessibilityLabel={`Filter: ${f.label}${isSelected ? ', selected' : ''}`}
              accessibilityRole="button"
              style={[
                styles.filterChip,
                {
                  backgroundColor: isSelected
                    ? (f.color ?? theme.colors.primary) + '18'
                    : theme.colors.surface,
                  borderColor: isSelected
                    ? (f.color ?? theme.colors.primary) + '40'
                    : theme.colors.outlineVariant,
                },
              ]}
            >
              {f.color && isSelected && (
                <View style={[styles.chipDot, { backgroundColor: f.color }]} />
              )}
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: isSelected ? '700' : '500',
                  color: isSelected
                    ? (f.color ?? theme.colors.primary)
                    : theme.colors.onSurfaceVariant,
                }}
              >
                {f.label}
              </Text>
            </Pressable>
          );
        })}
      </View>

      {/* API list */}
      <FlatList
        data={filteredAPIs}
        keyExtractor={(item: any, index) => String(item.id ?? item.apiId ?? index)}
        renderItem={({ item }) => <APICard item={item} theme={theme} />}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <View style={[styles.emptyIcon, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Icon source="api-off" size={32} color={theme.colors.onSurfaceVariant} />
            </View>
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant, marginTop: 12 }}>
              No APIs match your search
            </Text>
          </View>
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
    paddingHorizontal: 20,
    marginBottom: 4,
  },
  searchbar: {
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    height: 44,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    gap: 6,
  },
  chipDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
  emptyIcon: {
    width: 64,
    height: 64,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default APIListScreen;
