// ============================================================
// Servers List — Searchable server list with status indicators
//
// Card layout built on the design token layer: server status resolves
// to a semantic status role, so the accent bar, badge tint and dot
// stay in step across light and dark.
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
  Appbar,
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';

import type { Server } from '../../types';
import {
  radii,
  spacing,
  typeScale,
  useTokens,
  type StatusRole,
  type Tokens,
} from '../../theme';
import { Skeleton } from '../../components/ui';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import { useServers } from '../../hooks/queries/useInfrastructureQueries';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import EmptyState from '../../components/common/EmptyState';
import ErrorState from '../../components/common/ErrorState';

// --- Server status → semantic status role ---
export const getServerStatusRole = (t: Tokens, status: string): StatusRole => {
  switch (status) {
    case 'RUNNING': return t.color.status.success;
    case 'DISCONNECTED': return t.color.status.danger;
    case 'CREATED':
    case 'UPDATED':
    default: return t.color.status.neutral;
  }
};

export const getServerStatusLabel = (status: string): string => {
  switch (status) {
    case 'RUNNING': return 'Running';
    case 'DISCONNECTED': return 'Disconnected';
    case 'CREATED': return 'Created';
    case 'UPDATED': return 'Updated';
    default: return status;
  }
};

// --- Server Card ---
const ServerCard = React.memo<{
  server: Server;
  onPress: () => void;
  t: Tokens;
}>(({ server, onPress, t }) => {
  const role = getServerStatusRole(t, server.status);
  const firstIp = server.addresses?.[0]?.ip ?? 'N/A';

  const tagStyle = [styles.tag, { backgroundColor: t.color.surface.sunken }];
  const tagTextStyle = [styles.tagText, { color: t.color.text.secondary }];

  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      accessibilityLabel={`${server.name}, ${getServerStatusLabel(server.status)}`}
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
          <Text
            style={[styles.serverName, { color: t.color.text.primary }]}
            numberOfLines={1}
          >
            {server.name}
          </Text>

          <View style={[styles.statusBadge, { backgroundColor: role.surface }]}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: role.base },
                server.status === 'RUNNING' && {
                  shadowColor: role.base,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 3,
                },
              ]}
            />
            <Text style={[styles.statusText, { color: role.base }]}>
              {getServerStatusLabel(server.status)}
            </Text>
          </View>
        </View>

        {/* Meta tags */}
        <View style={styles.tagRow}>
          <View style={tagStyle}>
            <Icon name="server" size={11} color={t.color.text.secondary} />
            <Text style={tagTextStyle}>{server.type}</Text>
          </View>

          {server.muleVersion && (
            <View style={tagStyle}>
              <Icon name="puzzle-outline" size={11} color={t.color.text.secondary} />
              <Text style={tagTextStyle}>Mule {server.muleVersion}</Text>
            </View>
          )}

          {server.lastConnected && (
            <View style={tagStyle}>
              <Icon name="clock-outline" size={11} color={t.color.text.secondary} />
              <Text style={tagTextStyle}>{formatRelativeTime(server.lastConnected)}</Text>
            </View>
          )}

          <View style={tagStyle}>
            <Icon name="ip-network-outline" size={11} color={t.color.text.secondary} />
            <Text style={tagTextStyle}>{firstIp}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});
ServerCard.displayName = 'ServerCard';

// ── Loading placeholder ──
// Card-shaped so the list does not jump when the servers land.
const ServerCardSkeleton = React.memo<{ t: Tokens }>(({ t }) => (
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
        <Skeleton width="50%" height={15} />
        <Skeleton width={88} height={22} />
      </View>
      <View style={styles.tagRow}>
        <Skeleton width={72} height={18} />
        <Skeleton width={96} height={18} />
        <Skeleton width={84} height={18} />
      </View>
    </View>
  </View>
));
ServerCardSkeleton.displayName = 'ServerCardSkeleton';

const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];

// --- Main Screen ---
const ServersScreen: React.FC = () => {
  const t = useTokens();
  const router = useRouter();

  const [searchQuery, setSearchQuery] = useState('');

  const { data: servers, isLoading, error, refetch } = useServers();
  // Only a pull shows the control; background refetches stay invisible.
  const pullRefresh = usePullRefresh(refetch);

  const allServers = useMemo(() => (servers ?? []) as Server[], [servers]);

  const serverList = useMemo(() => {
    if (!searchQuery) return allServers;
    const q = searchQuery.toLowerCase();
    return allServers.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.muleVersion?.toLowerCase().includes(q) ||
        s.addresses?.some((a) => a.ip.includes(q)),
    );
  }, [allServers, searchQuery]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Server>) => (
      <ServerCard
        server={item}
        onPress={() =>
          router.push({
            pathname: '/(main)/runtime/server-detail' as any,
            params: { serverId: String(item.id) },
          })
        }
        t={t}
      />
    ),
    [t, router],
  );

  // A search that matched nothing is a different situation from an
  // environment with no servers — say which one it is, and offer the
  // way out when there is one.
  const renderEmptyState = useCallback(
    () =>
      searchQuery ? (
        <EmptyState
          icon="magnify-close"
          title="No servers match your search"
          description={`None of the ${allServers.length} server${allServers.length === 1 ? '' : 's'} in this environment match this search.`}
          actionLabel="Clear search"
          onAction={() => {
            hapticLight();
            setSearchQuery('');
          }}
        />
      ) : (
        <EmptyState
          icon="server-off"
          title="No servers registered"
          description="Standalone Mule runtimes registered with the Runtime Manager agent appear here. A CloudHub-only environment stays empty."
        />
      ),
    [searchQuery, allServers.length],
  );

  const appbar = (
    <Appbar.Header style={{ backgroundColor: t.color.surface.canvas }} elevated={false}>
      <Appbar.BackAction onPress={() => router.back()} />
      <Appbar.Content title="Servers" titleStyle={styles.appbarTitle} />
      <Appbar.Action icon="refresh" onPress={() => refetch()} />
    </Appbar.Header>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
        {appbar}
        <View style={styles.searchContainer}>
          <Skeleton width="100%" height={44} radius={radii.lg} />
        </View>
        <View style={styles.listContent}>
          {SKELETON_ROWS.map((row) => (
            <ServerCardSkeleton key={row} t={t} />
          ))}
        </View>
      </View>
    );
  }
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
      {/* Header */}
      {appbar}

      {/* Search */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search servers..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={[styles.searchBar, { backgroundColor: t.color.surface.sunken }]}
          inputStyle={styles.searchInput}
          icon="magnify"
        />
      </View>

      {/* Server list */}
      <FlatList
        data={serverList}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={[
          styles.listContent,
          serverList.length === 0 && styles.listContentEmpty,
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
  searchContainer: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  searchBar: {
    elevation: 0,
    borderRadius: radii.lg,
    height: 44,
  },
  searchInput: {
    ...typeScale.body,
    minHeight: 44,
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
    gap: spacing.sm,
  },
  serverName: { ...typeScale.subheading, flex: 1 },
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
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.xxxl,
    paddingTop: spacing.xs,
  },
  listContentEmpty: {
    flexGrow: 1,
  },
});

export default ServersScreen;
