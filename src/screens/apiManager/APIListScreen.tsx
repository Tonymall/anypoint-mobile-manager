// ============================================================
// API Manager - API List Screen
// Lists all managed API instances with search, filter, and
// pull-to-refresh using real data from React Query.
// ============================================================

import React, { useState, useMemo } from 'react';
import { View, FlatList, StyleSheet, RefreshControl } from 'react-native';
import {
  Searchbar,
  Chip,
  Card,
  Text,
  Badge,
  Divider,
  useTheme,
  IconButton,
  Icon,
} from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import type { APIStatus, ManagedAPI } from '../../types';
import { statusColors } from '../../theme';
import { useManagedAPIs } from '../../hooks/queries';
import { useDebounce } from '../../hooks/useDebounce';
import LoadingState from '../../components/common/LoadingState';
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

const statusBadgeColor = (status: APIStatus): string =>
  statusColors[status] ?? '#9E9E9E';

const technologyLabel = (tech: string): string => {
  const map: Record<string, string> = {
    mule4: 'Mule 4',
    mule3: 'Mule 3',
    http: 'HTTP API',
    raml: 'RAML',
  };
  return map[tech] ?? tech;
};

// ── Component ────────────────────────────────────────────────

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

  const allApis = apisResponse ?? [];

  // Client-side status filter (search is server-side via query param)
  const filteredAPIs = useMemo(() => {
    if (statusFilter === 'all') return allApis;
    return allApis.filter((api: any) => api.status === statusFilter);
  }, [allApis, statusFilter]);

  // ── Render a single API card ───────────────────────────────

  const renderAPICard = ({ item }: { item: ManagedAPI }) => {
    const api = item as any;
    const label = api.instanceLabel ?? api.assetId ?? `API ${api.id ?? ''}`;
    const assetInfo = [api.assetId, api.assetVersion].filter(Boolean).join(' : ');
    const status = api.status ?? 'unknown';
    const pendingContracts = (api.contracts ?? []).filter(
      (c: any) => c.status === 'PENDING',
    ).length;

    return (
      <Card
        style={[styles.card, { backgroundColor: theme.colors.surface }]}
        mode="elevated"
      >
        <Card.Content>
          {/* Header row: name + status badge */}
          <View style={styles.cardHeader}>
            <View style={styles.cardTitleWrap}>
              <Text variant="titleMedium" numberOfLines={1} style={styles.cardTitle}>
                {label}
              </Text>
              {assetInfo ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  {assetInfo}
                </Text>
              ) : null}
            </View>
            <Badge
              style={[
                styles.statusBadge,
                { backgroundColor: statusBadgeColor(status) },
              ]}
            >
              {String(status).toUpperCase()}
            </Badge>
          </View>

          <Divider style={styles.divider} />

          {/* Endpoint URI */}
          {api.endpointUri && (
            <View style={styles.infoRow}>
              <View style={styles.endpointRow}>
                <Icon source="link-variant" size={14} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodySmall" numberOfLines={1} selectable style={{ flex: 1, marginLeft: 6 }}>
                  {api.endpointUri}
                </Text>
              </View>
            </View>
          )}

          {/* Technology + Pending */}
          <View style={styles.techRow}>
            {api.technology && (
              <Chip compact textStyle={styles.chipText} style={styles.techChip}>
                {technologyLabel(api.technology)}
              </Chip>
            )}
            {pendingContracts > 0 && (
              <Chip compact textStyle={[styles.chipText, { color: '#E65100' }]} style={[styles.techChip, { backgroundColor: '#FFF3E0' }]} icon="clock-outline">
                {pendingContracts} pending
              </Chip>
            )}
          </View>

          {/* Metrics row */}
          <View style={[styles.metricsRow, { borderTopColor: theme.colors.outlineVariant }]}>
            <View style={styles.metric}>
              <Icon source="shield-lock-outline" size={16} color={theme.colors.primary} />
              <Text variant="titleMedium" style={{ fontWeight: '700' }}>{(api.policies ?? []).length}</Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Policies
              </Text>
            </View>
            <View style={styles.metric}>
              <Icon source="file-sign" size={16} color={theme.colors.secondary} />
              <Text variant="titleMedium" style={{ fontWeight: '700' }}>{(api.contracts ?? []).length}</Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                Contracts
              </Text>
            </View>
            <View style={styles.metric}>
              <Icon source="speedometer" size={16} color={theme.colors.tertiary} />
              <Text variant="titleMedium" style={{ fontWeight: '700' }}>{(api.slaTiers ?? []).length}</Text>
              <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
                SLA Tiers
              </Text>
            </View>
          </View>
        </Card.Content>
      </Card>
    );
  };

  // ── Main render ────────────────────────────────────────────

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
      {/* Search */}
      <Searchbar
        placeholder="Search APIs..."
        value={searchQuery}
        onChangeText={setSearchQuery}
        style={styles.searchbar}
        elevation={0}
      />

      {/* Filter chips */}
      <View style={styles.chipRow}>
        {STATUS_FILTERS.map((f) => (
          <Chip
            key={f.value}
            selected={statusFilter === f.value}
            onPress={() => setStatusFilter(f.value)}
            style={styles.filterChip}
            showSelectedOverlay
          >
            {f.label}
          </Chip>
        ))}
      </View>

      {/* API list */}
      <FlatList
        data={filteredAPIs}
        keyExtractor={(item: any, index) => String(item.id ?? item.apiId ?? index)}
        renderItem={renderAPICard}
        contentContainerStyle={styles.listContent}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <IconButton icon="api-off" size={48} />
            <Text variant="bodyLarge" style={{ color: theme.colors.onSurfaceVariant }}>
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
  searchbar: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 12,
  },
  chipRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 8,
  },
  filterChip: {
    marginRight: 0,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },
  card: {
    marginBottom: 12,
    borderRadius: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleWrap: {
    flex: 1,
    marginRight: 12,
  },
  cardTitle: {
    marginBottom: 2,
    fontWeight: '600',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },
  divider: {
    marginVertical: 10,
  },
  infoRow: {
    marginBottom: 8,
  },
  endpointRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  techRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 4,
  },
  techChip: {
    alignSelf: 'flex-start',
    height: 28,
  },
  chipText: {
    fontSize: 12,
  },
  metricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  metric: {
    alignItems: 'center',
    gap: 2,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 80,
  },
});

export default APIListScreen;
