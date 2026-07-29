// ============================================================
// Runtime Manager — Applications List
//
// Card layout built on the design token layer: status roles drive
// the accent, badge and dot together, so light and dark are defined
// in one place rather than per-screen.
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
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter, useIsFocused } from 'expo-router';

import type { Application, AppStatus } from '../../types';
import {
  radii,
  spacing,
  typeScale,
  useTokens,
  withAlpha,
  type Tokens,
} from '../../theme';
import { useApplications } from '../../hooks/queries';
import { getAppName, getAppId, getMuleVersion, getWorkerInfo } from '../../utils/appHelpers';
import { getStatusRole, getStatusLabel, formatRelativeTime } from '../../utils/statusHelpers';
import { useResponsiveLayout } from '../../hooks/useResponsiveLayout';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import { useRuntimeTransitionStore } from '../../stores/runtimeTransitionStore';
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
  t: Tokens;
}>(({ app, onPress, t }) => {
  const domain = app.domain ?? app.name ?? '';
  const transition = useRuntimeTransitionStore((s) => s.transitions[domain]);
  const role = transition ? t.color.status.info : getStatusRole(t, app.status);
  const statusLabel = transition?.label ?? getStatusLabel(app.status);
  const appName = getAppName(app);
  const muleVer = getMuleVersion(app);
  const workerInfo = getWorkerInfo(app);

  const tagStyle = [styles.tag, { backgroundColor: t.color.surface.sunken }];
  const tagTextStyle = [styles.tagText, { color: t.color.text.secondary }];

  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`${appName}, ${statusLabel}`}
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
      {/* Accent border at left */}
      <View style={[styles.cardAccent, { backgroundColor: role.base }]} />

      <View style={styles.cardBody}>
        {/* Header: name + status */}
        <View style={styles.cardHeader}>
          <View style={styles.cardHeaderText}>
            <Text style={[styles.appName, { color: t.color.text.primary }]} numberOfLines={1}>
              {appName}
            </Text>
            <Text style={[styles.appDomain, { color: t.color.text.tertiary }]} numberOfLines={1}>
              {app.fullDomain ?? app.domain ?? ''}
            </Text>
          </View>

          {/* Status badge */}
          <View style={[styles.statusBadge, { backgroundColor: role.surface }]}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: role.base },
                app.status === 'STARTED' && {
                  shadowColor: role.base,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 3,
                },
              ]}
            />
            <Text style={[styles.statusText, { color: role.base }]}>{statusLabel}</Text>
          </View>
        </View>

        {/* Meta tags */}
        <View style={styles.tagRow}>
          {app.region && (
            <View style={tagStyle}>
              <Icon name="map-marker-outline" size={11} color={t.color.text.secondary} />
              <Text style={tagTextStyle}>{app.region}</Text>
            </View>
          )}
          {muleVer ? (
            <View style={tagStyle}>
              <Icon name="puzzle-outline" size={11} color={t.color.text.secondary} />
              <Text style={tagTextStyle}>Mule {muleVer}</Text>
            </View>
          ) : null}
          <View style={tagStyle}>
            <Icon name="server-network" size={11} color={t.color.text.secondary} />
            <Text style={tagTextStyle}>{workerInfo.amount}x {workerInfo.typeName}</Text>
          </View>
          {app.lastUpdateTime && (
            <View style={tagStyle}>
              <Icon name="clock-outline" size={11} color={t.color.text.secondary} />
              <Text style={tagTextStyle}>{formatRelativeTime(app.lastUpdateTime)}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});
AppCard.displayName = 'AppCard';

// --- Component ---
const CONTENT_MAX_WIDTH = 768;

const ApplicationsListScreen: React.FC = () => {
  const theme = useTheme();
  const t = useTokens();
  const router = useRouter();
  const isFocused = useIsFocused();
  const { width: windowWidth } = useWindowDimensions();
  const { columns } = useResponsiveLayout();
  const themedStyles = useMemo(() => createStyles(theme), [theme]);
  const flatListRef = useRef<FlatList>(null);

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('ALL');
  const [filterVisible, setFilterVisible] = useState(false);
  const [sortOrder, setSortOrder] = useState<'default' | 'az' | 'za'>('default');

  const { data: applications, isLoading, error, refetch } = useApplications({ enabled: isFocused });
  // Only a pull shows the spinner — the 30s background poll must stay invisible.
  const pullRefresh = usePullRefresh(refetch);

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
      <View style={columns > 1 ? styles.gridCell : undefined}>
        <AppCard
          app={item}
          onPress={() => router.push({ pathname: '/(main)/runtime/[domain]' as any, params: { domain: getAppId(item) } })}
          t={t}
        />
      </View>
    ),
    [t, router, columns],
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <View style={[styles.emptyIcon, { backgroundColor: t.color.surface.sunken }]}>
          <Icon name="application-outline" size={36} color={t.color.text.tertiary} />
        </View>
        <Text style={[styles.emptyTitle, { color: t.color.text.primary }]}>
          No applications found
        </Text>
        <Text style={[styles.emptyBody, { color: t.color.text.secondary }]}>
          {searchQuery || statusFilter !== 'ALL'
            ? 'Try adjusting your filters or search query.'
            : 'No applications deployed in this environment.'}
        </Text>
      </View>
    ),
    [searchQuery, statusFilter, t],
  );

  if (isLoading) return <LoadingState message="Loading applications..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  const isWide = windowWidth > CONTENT_MAX_WIDTH;
  const sidePadding = isWide ? Math.round((windowWidth - CONTENT_MAX_WIDTH) / 2) : 0;
  const widePadding = isWide ? { paddingHorizontal: sidePadding + spacing.lg } : null;

  return (
    <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
      {/* ── Header ── */}
      <View style={[styles.topBar, widePadding]}>
        <View style={styles.titleRow}>
          <View style={[styles.sectionAccent, { backgroundColor: t.color.brand.base }]} />
          <Text style={[styles.screenTitle, { color: t.color.text.primary }]}>
            Applications
          </Text>
          <View style={[styles.countBadge, { backgroundColor: t.color.brand.surface }]}>
            <Text style={[styles.countBadgeText, { color: t.color.text.accent }]}>
              {appsList.length}
            </Text>
          </View>
        </View>
        <Searchbar
          placeholder="Search apps..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[themedStyles.searchBar, { backgroundColor: t.color.surface.sunken }]}
          inputStyle={styles.searchInput}
          icon="magnify"
        />
      </View>

      {/* ── Filter chips ── */}
      <View style={[styles.filterRow, widePadding]}>
        <Chip
          icon="filter-variant"
          onPress={() => setFilterVisible(true)}
          style={[
            themedStyles.filterChip,
            statusFilter !== 'ALL' && {
              backgroundColor: t.color.brand.surface,
              borderColor: withAlpha(t.color.brand.base, 'border'),
            },
          ]}
          selected={statusFilter !== 'ALL'}
          selectedColor={statusFilter !== 'ALL' ? t.color.text.accent : undefined}
          compact
          accessibilityRole="button"
          accessibilityLabel={`Filter: ${activeFilterLabel}`}
        >
          {activeFilterLabel}
        </Chip>
        <Chip
          icon={sortOrder === 'za' ? 'sort-alphabetical-descending' : 'sort-alphabetical-ascending'}
          onPress={() => setSortOrder((prev) => prev === 'default' ? 'az' : prev === 'az' ? 'za' : 'default')}
          style={[
            themedStyles.filterChip,
            sortOrder !== 'default' && { backgroundColor: t.color.accent.secondary.surface },
          ]}
          selected={sortOrder !== 'default'}
          compact
          accessibilityRole="button"
          accessibilityLabel={`Sort: ${sortOrder === 'az' ? 'A to Z' : sortOrder === 'za' ? 'Z to A' : 'default'}`}
        >
          {sortOrder === 'az' ? 'A → Z' : sortOrder === 'za' ? 'Z → A' : 'Sort'}
        </Chip>
        {statusFilter !== 'ALL' && (
          <Chip icon="close" onPress={() => setStatusFilter('ALL')} style={themedStyles.filterChip} compact>
            Clear
          </Chip>
        )}
        <View style={styles.spacer} />
        <Text style={[styles.resultCount, { color: t.color.text.tertiary }]}>
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
        contentContainerStyle={[styles.listContent, widePadding]}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl {...pullRefresh} colors={[theme.colors.primary]} tintColor={theme.colors.primary} />
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
          contentContainerStyle={[
            styles.filterModal,
            {
              backgroundColor: t.color.surface.raised,
              borderColor: t.color.border.subtle,
            },
          ]}
        >
          <Text style={[styles.modalTitle, { color: t.color.text.primary }]}>
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
          <Button mode="text" onPress={() => setFilterVisible(false)} style={styles.modalCancel}>
            Cancel
          </Button>
        </Modal>
      </Portal>
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
    flex: 1,
  },
  appName: typeScale.subheading,
  appDomain: { ...typeScale.caption, marginTop: 2 },
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
  gridCell: {
    flex: 1,
    paddingHorizontal: spacing.xs,
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
  filterModal: {
    margin: spacing.xxl,
    padding: spacing.xxl,
    borderRadius: radii.xl,
    borderWidth: 1,
  },
  modalTitle: { ...typeScale.heading, marginBottom: spacing.lg },
  modalCancel: {
    marginTop: spacing.sm,
  },
  radioItem: {
    paddingVertical: 2,
  },
});

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    searchBar: {
      elevation: 0,
      borderRadius: radii.lg,
      height: 44,
    },
    filterChip: {
      borderRadius: radii.md,
      borderColor: theme.colors.outline,
    },
  });

export default ApplicationsListScreen;
