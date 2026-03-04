// ============================================================
// Runtime Manager - Applications List Screen
// Lists all deployed applications with search & single-row filters
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ListRenderItemInfo,
} from 'react-native';
import {
  Searchbar,
  Card,
  Text,
  Chip,
  Badge,
  Icon,
  useTheme,
  Divider,
  Portal,
  Modal,
  RadioButton,
  Button,
} from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import { useRouter } from 'expo-router';

import type { Application, AppStatus } from '../../types';
import { statusColors } from '../../theme';
import { useApplications } from '../../hooks/queries';
import { getAppName, getAppId, getMuleVersion, getLastUpdateTime, getWorkerInfo, getDeploymentTarget } from '../../utils/appHelpers';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// --- Filter Definitions ---
type StatusFilter = AppStatus | 'ALL';

const STATUS_OPTIONS: { label: string; value: StatusFilter }[] = [
  { label: 'All Statuses', value: 'ALL' },
  { label: 'Running', value: 'STARTED' },
  { label: 'Stopped', value: 'STOPPED' },
  { label: 'Failed', value: 'FAILED' },
  { label: 'Deploying', value: 'DEPLOYING' },
  { label: 'Undeployed', value: 'UNDEPLOYED' },
];

// --- Helpers ---
const getStatusColor = (status: string): string => {
  switch (status) {
    case 'STARTED':
      return statusColors.started;
    case 'STOPPED':
      return statusColors.stopped;
    case 'FAILED':
      return statusColors.failed;
    case 'DEPLOYING':
    case 'UNDEPLOYING':
      return statusColors.deploying;
    case 'PARTIALLY_STARTED':
      return statusColors.pending;
    case 'UNDEPLOYED':
      return '#78716C';
    default:
      return statusColors.stopped;
  }
};

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'STARTED': return 'Running';
    case 'STOPPED': return 'Stopped';
    case 'FAILED': return 'Failed';
    case 'DEPLOYING': return 'Deploying';
    case 'UNDEPLOYING': return 'Undeploying';
    case 'PARTIALLY_STARTED': return 'Partial';
    case 'UNDEPLOYED': return 'Undeployed';
    default: return status;
  }
};

const formatRelativeTime = (raw: any): string => {
  if (!raw) return '';
  const date = typeof raw === 'number' ? new Date(raw) : new Date(raw);
  if (isNaN(date.getTime())) return '';
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
};

// --- Component ---
const ApplicationsListScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [filterVisible, setFilterVisible] = useState(false);
  const [sortOrder, setSortOrder] = useState<'default' | 'az' | 'za'>('default');

  const {
    data: applications,
    isLoading,
    error,
    refetch,
    isRefetching,
  } = useApplications();

  const appsList = applications ?? [];

  // Count apps by status for filter badges
  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    appsList.forEach((app: any) => {
      const s = app.status ?? 'UNKNOWN';
      counts[s] = (counts[s] ?? 0) + 1;
    });
    return counts;
  }, [appsList]);

  const filteredApps = useMemo(() => {
    const filtered = appsList.filter((app: any) => {
      const name = getAppName(app);
      const domain = app.domain ?? '';
      const matchesSearch =
        searchQuery === '' ||
        name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        domain.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesStatus = statusFilter === 'ALL' || app.status === statusFilter;
      return matchesSearch && matchesStatus;
    });

    // Apply sort
    if (sortOrder === 'az') {
      return [...filtered].sort((a: any, b: any) =>
        getAppName(a).localeCompare(getAppName(b)),
      );
    }
    if (sortOrder === 'za') {
      return [...filtered].sort((a: any, b: any) =>
        getAppName(b).localeCompare(getAppName(a)),
      );
    }
    return filtered;
  }, [appsList, searchQuery, statusFilter, sortOrder]);

  const activeFilterLabel = statusFilter === 'ALL'
    ? `All (${appsList.length})`
    : `${getStatusLabel(statusFilter)} (${statusCounts[statusFilter] ?? 0})`;

  const renderApplicationCard = useCallback(
    ({ item }: ListRenderItemInfo<Application>) => {
      const app = item as any;
      const color = getStatusColor(app.status);
      const appName = getAppName(app);
      const muleVer = getMuleVersion(app);
      const workerInfo = getWorkerInfo(app);
      const target = getDeploymentTarget(app);

      return (
        <Card
          style={styles.appCard}
          mode="contained"
          onPress={() => router.push({ pathname: '/(main)/runtime/[domain]' as any, params: { domain: getAppId(app) } })}
        >
          <Card.Content style={styles.cardContent}>
            <View style={styles.cardHeader}>
              {/* Status indicator + name */}
              <View style={[styles.statusIndicator, { backgroundColor: color }]} />
              <View style={styles.appNameWrap}>
                <Text variant="titleMedium" style={styles.appName} numberOfLines={1}>
                  {appName}
                </Text>
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }} numberOfLines={1}>
                  {app.fullDomain ?? app.domain ?? ''}
                </Text>
              </View>
              <View style={[styles.statusChip, { backgroundColor: color + '20', borderColor: color + '40' }]}>
                <Text style={{ color, fontSize: 11, fontWeight: '700' }}>
                  {getStatusLabel(app.status)}
                </Text>
              </View>
            </View>

            {/* Info row */}
            <View style={styles.infoRow}>
              {app.region && (
                <View style={styles.infoItem}>
                  <Icon source="map-marker" size={13} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={styles.infoText}>{app.region}</Text>
                </View>
              )}
              {muleVer ? (
                <View style={styles.infoItem}>
                  <Icon source="puzzle" size={13} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={styles.infoText}>Mule {muleVer}</Text>
                </View>
              ) : null}
              <View style={styles.infoItem}>
                <Icon source="server" size={13} color={theme.colors.onSurfaceVariant} />
                <Text variant="bodySmall" style={styles.infoText}>
                  {workerInfo.amount}x {workerInfo.typeName}
                </Text>
              </View>
              {app.lastUpdateTime && (
                <View style={styles.infoItem}>
                  <Icon source="clock-outline" size={13} color={theme.colors.onSurfaceVariant} />
                  <Text variant="bodySmall" style={styles.infoText}>
                    {formatRelativeTime(app.lastUpdateTime)}
                  </Text>
                </View>
              )}
            </View>
          </Card.Content>
        </Card>
      );
    },
    [styles, theme, router],
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <Icon source="application-outline" size={64} color={theme.colors.outlineVariant} />
        <Text variant="titleMedium" style={styles.emptyTitle}>
          No applications found
        </Text>
        <Text variant="bodyMedium" style={styles.emptySubtitle}>
          {searchQuery || statusFilter !== 'ALL'
            ? 'Try adjusting your filters or search query.'
            : 'No applications deployed in this environment.'}
        </Text>
      </View>
    ),
    [searchQuery, statusFilter, styles, theme],
  );

  if (isLoading) {
    return <LoadingState message="Loading applications..." />;
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
    <View style={styles.container}>
      {/* Search + Filter row */}
      <View style={styles.topBar}>
        <Searchbar
          placeholder="Search apps..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
        />
      </View>

      {/* Filter chips row */}
      <View style={styles.filterRow}>
        <Chip
          icon="filter-variant"
          onPress={() => setFilterVisible(true)}
          style={styles.filterChip}
          selected={statusFilter !== 'ALL'}
          showSelectedOverlay
          compact
        >
          {activeFilterLabel}
        </Chip>
        <Chip
          icon={sortOrder === 'za' ? 'sort-alphabetical-descending' : 'sort-alphabetical-ascending'}
          onPress={() =>
            setSortOrder((prev) =>
              prev === 'default' ? 'az' : prev === 'az' ? 'za' : 'default',
            )
          }
          style={styles.filterChip}
          selected={sortOrder !== 'default'}
          showSelectedOverlay
          compact
        >
          {sortOrder === 'az' ? 'A → Z' : sortOrder === 'za' ? 'Z → A' : 'Sort'}
        </Chip>
        {statusFilter !== 'ALL' && (
          <Chip
            icon="close"
            onPress={() => setStatusFilter('ALL')}
            style={styles.clearChip}
            compact
          >
            Clear
          </Chip>
        )}
        <View style={{ flex: 1 }} />
        <Text variant="labelSmall" style={{ color: theme.colors.onSurfaceVariant }}>
          {filteredApps.length} app{filteredApps.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* Applications list */}
      <FlatList
        data={filteredApps}
        keyExtractor={(item: any) => getAppId(item)}
        renderItem={renderApplicationCard}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            colors={[theme.colors.primary]}
          />
        }
        showsVerticalScrollIndicator={false}
      />

      {/* Filter Modal */}
      <Portal>
        <Modal
          visible={filterVisible}
          onDismiss={() => setFilterVisible(false)}
          contentContainerStyle={[styles.filterModal, { backgroundColor: theme.colors.surface }]}
        >
          <Text variant="titleMedium" style={{ fontWeight: '700', marginBottom: 16 }}>
            Filter by Status
          </Text>
          <RadioButton.Group
            value={statusFilter}
            onValueChange={(v) => {
              setStatusFilter(v as StatusFilter);
              setFilterVisible(false);
            }}
          >
            {STATUS_OPTIONS.map((opt) => (
              <RadioButton.Item
                key={opt.value}
                label={`${opt.label}${opt.value !== 'ALL' ? ` (${statusCounts[opt.value] ?? 0})` : ` (${appsList.length})`}`}
                value={opt.value}
                style={styles.radioItem}
              />
            ))}
          </RadioButton.Group>
          <Button
            mode="text"
            onPress={() => setFilterVisible(false)}
            style={{ marginTop: 8 }}
          >
            Cancel
          </Button>
        </Modal>
      </Portal>
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
    topBar: {
      paddingHorizontal: 16,
      paddingTop: 12,
      paddingBottom: 4,
    },
    searchBar: {
      elevation: 0,
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 14,
    },
    searchInput: {
      fontSize: 14,
    },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      paddingHorizontal: 16,
      paddingVertical: 8,
      gap: 8,
    },
    filterChip: {
      borderRadius: 10,
    },
    clearChip: {
      borderRadius: 10,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
    },
    appCard: {
      marginBottom: 10,
      backgroundColor: theme.colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: theme.colors.surfaceVariant,
      overflow: 'hidden',
    },
    cardContent: {
      paddingVertical: 14,
      paddingHorizontal: 14,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    statusIndicator: {
      width: 4,
      height: 36,
      borderRadius: 2,
    },
    appNameWrap: {
      flex: 1,
    },
    appName: {
      fontWeight: '600',
      color: theme.colors.onSurface,
    },
    statusChip: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: 8,
      borderWidth: 1,
    },
    infoRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 12,
      marginTop: 10,
      paddingTop: 10,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: theme.colors.outlineVariant,
      overflow: 'hidden',
    },
    infoItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 3,
    },
    infoText: {
      color: theme.colors.onSurfaceVariant,
      fontSize: 12,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      paddingHorizontal: 32,
    },
    emptyTitle: {
      marginTop: 16,
      color: theme.colors.onSurface,
    },
    emptySubtitle: {
      marginTop: 8,
      textAlign: 'center',
      color: theme.colors.onSurfaceVariant,
    },
    filterModal: {
      margin: 24,
      padding: 24,
      borderRadius: 20,
    },
    radioItem: {
      paddingVertical: 2,
    },
  });

export default ApplicationsListScreen;
