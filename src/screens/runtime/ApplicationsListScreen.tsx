// ============================================================
// Runtime Manager — Applications List (2026 Design)
//
// Modern card layout with glassmorphic borders, glowing status
// indicators, and clean typography hierarchy.
// ============================================================

import React, { useState, useCallback, useMemo, useRef } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ListRenderItemInfo,
  useWindowDimensions,
  Pressable,
} from 'react-native';
import {
  Searchbar,
  Text,
  Chip,
  useTheme,
  Portal,
  Modal,
  RadioButton,
  Button,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';

import type { Application, AppStatus } from '../../types';
import { anypointColors } from '../../theme';
import { useApplications } from '../../hooks/queries';
import { getAppName, getAppId, getMuleVersion, getWorkerInfo } from '../../utils/appHelpers';
import { getStatusColor, getStatusLabel, formatRelativeTime } from '../../utils/statusHelpers';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
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

// ── Application Card ──
const AppCard = React.memo<{
  app: any;
  onPress: () => void;
  theme: MD3Theme;
}>(({ app, onPress, theme }) => {
  const color = getStatusColor(app.status);
  const appName = getAppName(app);
  const muleVer = getMuleVersion(app);
  const workerInfo = getWorkerInfo(app);

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`${appName}, ${getStatusLabel(app.status)}`}
      accessibilityRole="button"
      accessibilityHint="Double tap to view details"
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
      {/* Accent border at left */}
      <View style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 1.5, backgroundColor: color }} />

      <View style={{ padding: 16, paddingLeft: 18 }}>
        {/* Header: name + status */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: theme.colors.onSurface, letterSpacing: -0.2 }} numberOfLines={1}>
              {appName}
            </Text>
            <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, marginTop: 2 }} numberOfLines={1}>
              {app.fullDomain ?? app.domain ?? ''}
            </Text>
          </View>

          {/* Status badge */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 5,
            paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
            backgroundColor: color + '12',
          }}>
            <View style={{
              width: 7, height: 7, borderRadius: 4, backgroundColor: color,
              ...(app.status === 'STARTED' ? {
                shadowColor: color, shadowOffset: { width: 0, height: 0 },
                shadowOpacity: 0.6, shadowRadius: 3,
              } : {}),
            }} />
            <Text style={{ color, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 }}>
              {getStatusLabel(app.status)}
            </Text>
          </View>
        </View>

        {/* Meta tags */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {app.region && (
            <View style={tagStyle(theme)}>
              <Icon name="map-marker-outline" size={11} color={theme.colors.onSurfaceVariant} />
              <Text style={tagTextStyle(theme)}>{app.region}</Text>
            </View>
          )}
          {muleVer ? (
            <View style={tagStyle(theme)}>
              <Icon name="puzzle-outline" size={11} color={theme.colors.onSurfaceVariant} />
              <Text style={tagTextStyle(theme)}>Mule {muleVer}</Text>
            </View>
          ) : null}
          <View style={tagStyle(theme)}>
            <Icon name="server-network" size={11} color={theme.colors.onSurfaceVariant} />
            <Text style={tagTextStyle(theme)}>{workerInfo.amount}x {workerInfo.typeName}</Text>
          </View>
          {app.lastUpdateTime && (
            <View style={tagStyle(theme)}>
              <Icon name="clock-outline" size={11} color={theme.colors.onSurfaceVariant} />
              <Text style={tagTextStyle(theme)}>{formatRelativeTime(app.lastUpdateTime)}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});
AppCard.displayName = 'AppCard';

// Tag helpers
const tagStyle = (theme: MD3Theme) => ({
  flexDirection: 'row' as const,
  alignItems: 'center' as const,
  gap: 4,
  paddingHorizontal: 8,
  paddingVertical: 3,
  borderRadius: 8,
  backgroundColor: theme.colors.surfaceVariant + '80',
});

const tagTextStyle = (theme: MD3Theme) => ({
  fontSize: 11,
  color: theme.colors.onSurfaceVariant,
  fontWeight: '500' as const,
});

// --- Component ---
const CONTENT_MAX_WIDTH = 768;

const ApplicationsListScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const { width: windowWidth } = useWindowDimensions();
  const { columns } = useResponsiveLayout();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const flatListRef = useRef<FlatList>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [filterVisible, setFilterVisible] = useState(false);
  const [sortOrder, setSortOrder] = useState<'default' | 'az' | 'za'>('default');

  const { data: applications, isLoading, error, refetch, isRefetching } = useApplications();

  const appsList = useMemo(() => applications ?? [], [applications]);

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

    if (sortOrder === 'az') return [...filtered].sort((a: any, b: any) => getAppName(a).localeCompare(getAppName(b)));
    if (sortOrder === 'za') return [...filtered].sort((a: any, b: any) => getAppName(b).localeCompare(getAppName(a)));
    return filtered;
  }, [appsList, searchQuery, statusFilter, sortOrder]);

  const activeFilterLabel = statusFilter === 'ALL'
    ? `All (${appsList.length})`
    : `${getStatusLabel(statusFilter)} (${statusCounts[statusFilter] ?? 0})`;

  const renderApplicationCard = useCallback(
    ({ item }: ListRenderItemInfo<Application>) => (
      <View style={columns > 1 ? { flex: 1, paddingHorizontal: 4 } : undefined}>
        <AppCard
          app={item}
          onPress={() => router.push({ pathname: '/(main)/runtime/[domain]' as any, params: { domain: getAppId(item) } })}
          theme={theme}
        />
      </View>
    ),
    [theme, router, columns],
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <View style={{ width: 72, height: 72, borderRadius: 24, backgroundColor: theme.colors.surfaceVariant, justifyContent: 'center', alignItems: 'center', marginBottom: 16 }}>
          <Icon name="application-outline" size={36} color={theme.colors.onSurfaceVariant} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 6 }}>
          No applications found
        </Text>
        <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
          {searchQuery || statusFilter !== 'ALL'
            ? 'Try adjusting your filters or search query.'
            : 'No applications deployed in this environment.'}
        </Text>
      </View>
    ),
    [searchQuery, statusFilter, styles, theme],
  );

  if (isLoading) return <LoadingState message="Loading applications..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const isWide = windowWidth > CONTENT_MAX_WIDTH;
  const sidePadding = isWide ? Math.round((windowWidth - CONTENT_MAX_WIDTH) / 2) : 0;

  return (
    <View style={styles.container}>
      {/* ── Header ── */}
      <View style={[styles.topBar, { paddingTop: 12 }, isWide && { paddingHorizontal: sidePadding + 16 }]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, paddingHorizontal: 4 }}>
          <View style={styles.sectionAccent} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: theme.colors.onSurface, flex: 1, letterSpacing: -0.3 }}>
            Applications
          </Text>
          <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: anypointColors.primary + '12' }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: anypointColors.primary }}>{appsList.length}</Text>
          </View>
        </View>
        <Searchbar
          placeholder="Search apps..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          icon="magnify"
        />
      </View>

      {/* ── Filter chips ── */}
      <View style={[styles.filterRow, isWide && { paddingHorizontal: sidePadding + 16 }]}>
        <Chip
          icon="filter-variant"
          onPress={() => setFilterVisible(true)}
          style={[styles.filterChip, statusFilter !== 'ALL' && { backgroundColor: anypointColors.primary + '15', borderColor: anypointColors.primary + '30' }]}
          selected={statusFilter !== 'ALL'}
          selectedColor={statusFilter !== 'ALL' ? anypointColors.primary : undefined}
          compact
          accessibilityRole="button"
          accessibilityLabel={`Filter: ${activeFilterLabel}`}
        >
          {activeFilterLabel}
        </Chip>
        <Chip
          icon={sortOrder === 'za' ? 'sort-alphabetical-descending' : 'sort-alphabetical-ascending'}
          onPress={() => setSortOrder((prev) => prev === 'default' ? 'az' : prev === 'az' ? 'za' : 'default')}
          style={[styles.filterChip, sortOrder !== 'default' && { backgroundColor: anypointColors.secondary + '15' }]}
          selected={sortOrder !== 'default'}
          compact
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${sortOrder === 'az' ? 'A to Z' : sortOrder === 'za' ? 'Z to A' : 'default'}`}
        >
          {sortOrder === 'az' ? 'A → Z' : sortOrder === 'za' ? 'Z → A' : 'Sort'}
        </Chip>
        {statusFilter !== 'ALL' && (
          <Chip icon="close" onPress={() => setStatusFilter('ALL')} style={styles.filterChip} compact>
            Clear
          </Chip>
        )}
        <View style={{ flex: 1 }} />
        <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
          {filteredApps.length} result{filteredApps.length !== 1 ? 's' : ''}
        </Text>
      </View>

      {/* ── Applications list ── */}
      <FlatList
        key={columns}
        ref={flatListRef}
        data={filteredApps}
        keyExtractor={(item: any) => getAppId(item)}
        renderItem={renderApplicationCard}
        numColumns={columns}
        contentContainerStyle={[
          styles.listContent,
          isWide && { paddingHorizontal: sidePadding + 16 },
        ]}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl refreshing={isRefetching} onRefresh={() => refetch()} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
        maxToRenderPerBatch={10}
        windowSize={7}
        removeClippedSubviews={true}
      />

      {/* ── Filter Modal ── */}
      <Portal>
        <Modal
          visible={filterVisible}
          onDismiss={() => setFilterVisible(false)}
          contentContainerStyle={[styles.filterModal, { backgroundColor: theme.colors.surface }]}
        >
          <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 16 }}>
            Filter by Status
          </Text>
          <RadioButton.Group
            value={statusFilter}
            onValueChange={(v) => { setStatusFilter(v as StatusFilter); setFilterVisible(false); }}
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
          <Button mode="text" onPress={() => setFilterVisible(false)} style={{ marginTop: 8 }}>
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
      paddingBottom: 4,
    },
    sectionAccent: {
      width: 3,
      height: 18,
      borderRadius: 1.5,
      backgroundColor: theme.colors.primary,
      marginRight: 10,
    },
    searchBar: {
      elevation: 0,
      backgroundColor: theme.colors.surfaceVariant,
      borderRadius: 16,
      height: 44,
    },
    searchInput: {
      fontSize: 14,
      minHeight: 44,
    },
    filterRow: {
      flexDirection: 'row',
      alignItems: 'center',
      flexWrap: 'wrap',
      paddingHorizontal: 16,
      paddingVertical: 10,
      gap: 8,
    },
    filterChip: {
      borderRadius: 12,
      borderColor: theme.colors.outline,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingBottom: 32,
      paddingTop: 4,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      paddingHorizontal: 32,
    },
    filterModal: {
      margin: 24,
      padding: 24,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
    },
    radioItem: {
      paddingVertical: 2,
    },
  });

export default ApplicationsListScreen;
