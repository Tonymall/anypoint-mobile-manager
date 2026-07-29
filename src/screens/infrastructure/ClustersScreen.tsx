// ============================================================
// Clusters & Server Groups — Combined list with sections
//
// Two sections showing clusters and server groups with status
// indicators, badges, and node counts.
//
// Built on the design token layer: status resolves to a semantic
// status role shared with the servers list, so the same server reads
// the same way wherever it appears.
// ============================================================

import React, { useMemo, useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
} from 'react-native';
import {
  Text,
  Appbar,
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';

import type { Cluster, ServerGroup } from '../../types';
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
import {
  useClusters,
  useServerGroups,
} from '../../hooks/queries/useInfrastructureQueries';
import { hapticLight } from '../../utils/haptics';
import ErrorState from '../../components/common/ErrorState';
import { getServerStatusRole, getServerStatusLabel } from './ServersScreen';
import type { IconName } from '../../types/icons';

// --- Cluster Card ---
const ClusterCard = React.memo<{
  cluster: Cluster;
  t: Tokens;
}>(({ cluster, t }) => {
  const role = getServerStatusRole(t, cluster.status);
  const nodeCount = cluster.serverIds?.length ?? 0;

  const tagStyle = [styles.tag, { backgroundColor: t.color.surface.sunken }];
  const tagTextStyle = [styles.tagText, { color: t.color.text.secondary }];

  return (
    <Pressable
      onPress={() => hapticLight()}
      accessibilityLabel={`Cluster ${cluster.name}, ${getServerStatusLabel(cluster.status)}`}
      accessibilityRole="button"
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
            style={[styles.cardName, { color: t.color.text.primary }]}
            numberOfLines={1}
          >
            {cluster.name}
          </Text>

          <View style={[styles.statusBadge, { backgroundColor: role.surface }]}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: role.base },
                cluster.status === 'RUNNING' && {
                  shadowColor: role.base,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 3,
                },
              ]}
            />
            <Text style={[styles.statusText, { color: role.base }]}>
              {getServerStatusLabel(cluster.status)}
            </Text>
          </View>
        </View>

        {/* Meta tags */}
        <View style={styles.tagRow}>
          <View style={tagStyle}>
            <Icon
              name={cluster.multicastEnabled ? 'access-point' : 'access-point-off'}
              size={11}
              color={t.color.text.secondary}
            />
            <Text style={tagTextStyle}>
              {cluster.multicastEnabled ? 'Multicast' : 'Unicast'}
            </Text>
          </View>

          <View style={tagStyle}>
            <Icon name="server" size={11} color={t.color.text.secondary} />
            <Text style={tagTextStyle}>
              {nodeCount} node{nodeCount !== 1 ? 's' : ''}
            </Text>
          </View>

          {cluster.primaryNode != null && (
            <View style={tagStyle}>
              <Icon name="star-outline" size={11} color={t.color.text.secondary} />
              <Text style={tagTextStyle}>Primary: {cluster.primaryNode}</Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});
ClusterCard.displayName = 'ClusterCard';

// --- Server Group Card ---
const ServerGroupCard = React.memo<{
  group: ServerGroup;
  t: Tokens;
}>(({ group, t }) => {
  const role = getServerStatusRole(t, group.status);
  const serverCount = group.serverIds?.length ?? 0;

  return (
    <Pressable
      onPress={() => hapticLight()}
      accessibilityLabel={`Server group ${group.name}, ${getServerStatusLabel(group.status)}`}
      accessibilityRole="button"
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
            style={[styles.cardName, { color: t.color.text.primary }]}
            numberOfLines={1}
          >
            {group.name}
          </Text>

          <View style={[styles.statusBadge, { backgroundColor: role.surface }]}>
            <View
              style={[
                styles.statusDot,
                { backgroundColor: role.base },
                group.status === 'RUNNING' && {
                  shadowColor: role.base,
                  shadowOffset: { width: 0, height: 0 },
                  shadowOpacity: 0.6,
                  shadowRadius: 3,
                },
              ]}
            />
            <Text style={[styles.statusText, { color: role.base }]}>
              {getServerStatusLabel(group.status)}
            </Text>
          </View>
        </View>

        {/* Meta tags */}
        <View style={styles.tagRow}>
          <View style={[styles.tag, { backgroundColor: t.color.surface.sunken }]}>
            <Icon name="server-network" size={11} color={t.color.text.secondary} />
            <Text style={[styles.tagText, { color: t.color.text.secondary }]}>
              {serverCount} server{serverCount !== 1 ? 's' : ''}
            </Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});
ServerGroupCard.displayName = 'ServerGroupCard';

// --- Section Header ---
const SectionTitle: React.FC<{
  title: string;
  count: number;
  role: StatusRole;
  t: Tokens;
}> = ({ title, count, role, t }) => (
  <View style={styles.sectionHeader}>
    <View style={[styles.sectionAccent, { backgroundColor: role.base }]} />
    <Text style={[styles.sectionTitle, { color: t.color.text.tertiary }]}>
      {title}
    </Text>
    <View style={[styles.countBadge, { backgroundColor: role.surface }]}>
      <Text style={[styles.countBadgeText, { color: role.base }]}>{count}</Text>
    </View>
  </View>
);

// --- Empty section ---
// Compact by design: two of these can be on screen at once, so it says
// what would be here without taking over the page.
const EmptySection: React.FC<{
  icon: IconName;
  title: string;
  description: string;
  t: Tokens;
}> = ({ icon, title, description, t }) => (
  <View style={styles.emptySection}>
    <View
      style={[
        styles.emptyIcon,
        {
          backgroundColor: t.color.surface.sunken,
          borderColor: t.color.border.subtle,
        },
      ]}
    >
      <Icon name={icon} size={24} color={t.color.text.tertiary} />
    </View>
    <Text style={[styles.emptyTitle, { color: t.color.text.primary }]}>
      {title}
    </Text>
    <Text style={[styles.emptyBody, { color: t.color.text.secondary }]}>
      {description}
    </Text>
  </View>
);

// ── Loading placeholder ──
const CardSkeleton = React.memo<{ t: Tokens }>(({ t }) => (
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
        <Skeleton width="45%" height={15} />
        <Skeleton width={88} height={22} />
      </View>
      <View style={styles.tagRow}>
        <Skeleton width={84} height={18} />
        <Skeleton width={64} height={18} />
      </View>
    </View>
  </View>
));
CardSkeleton.displayName = 'CardSkeleton';

const SKELETON_ROWS = [0, 1];

// --- Main Screen ---
const ClustersScreen: React.FC = () => {
  const t = useTokens();
  const router = useRouter();

  const clustersQuery = useClusters();
  const serverGroupsQuery = useServerGroups();

  const isLoading = clustersQuery.isLoading && serverGroupsQuery.isLoading;
  const hasError = clustersQuery.isError && serverGroupsQuery.isError;
  const refetchAll = useCallback(
    () => Promise.allSettled([clustersQuery.refetch(), serverGroupsQuery.refetch()]),
    [clustersQuery, serverGroupsQuery],
  );

  // Any one background poll used to open the control; now only a pull does.
  const pullRefresh = usePullRefresh(refetchAll);

  const clusters = useMemo(
    () => (clustersQuery.data ?? []) as Cluster[],
    [clustersQuery.data],
  );
  const serverGroups = useMemo(
    () => (serverGroupsQuery.data ?? []) as ServerGroup[],
    [serverGroupsQuery.data],
  );

  const appbar = (
    <Appbar.Header style={{ backgroundColor: t.color.surface.canvas }} elevated={false}>
      <Appbar.BackAction onPress={() => router.back()} />
      <Appbar.Content title="Clusters & Groups" titleStyle={styles.appbarTitle} />
      <Appbar.Action icon="refresh" onPress={refetchAll} />
    </Appbar.Header>
  );

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
        {appbar}
        <View style={styles.scrollContent}>
          <SectionTitle title="CLUSTERS" count={0} role={t.color.accent.secondary} t={t} />
          {SKELETON_ROWS.map((row) => (
            <CardSkeleton key={`cluster-${row}`} t={t} />
          ))}
          <SectionTitle title="SERVER GROUPS" count={0} role={t.color.status.success} t={t} />
          {SKELETON_ROWS.map((row) => (
            <CardSkeleton key={`group-${row}`} t={t} />
          ))}
        </View>
      </View>
    );
  }
  if (hasError) {
    return (
      <ErrorState
        message="Failed to load clusters and server groups."
        onRetry={refetchAll}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
      {/* Header */}
      {appbar}

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={pullRefresh.refreshing}
            onRefresh={pullRefresh.onRefresh}
            colors={[t.color.brand.base]}
            tintColor={t.color.brand.base}
          />
        }
      >
        {/* Clusters Section */}
        <SectionTitle
          title="CLUSTERS"
          count={clusters.length}
          role={t.color.accent.secondary}
          t={t}
        />
        {clusters.length > 0 ? (
          clusters.map((cluster) => (
            <ClusterCard key={cluster.id} cluster={cluster} t={t} />
          ))
        ) : (
          <EmptySection
            icon="lan-disconnect"
            title="No clusters"
            description="Servers joined into a high-availability cluster appear here with their nodes and primary."
            t={t}
          />
        )}

        {/* Server Groups Section */}
        <SectionTitle
          title="SERVER GROUPS"
          count={serverGroups.length}
          role={t.color.status.success}
          t={t}
        />
        {serverGroups.length > 0 ? (
          serverGroups.map((group) => (
            <ServerGroupCard key={group.id} group={group} t={t} />
          ))
        ) : (
          <EmptySection
            icon="server-network-off"
            title="No server groups"
            description="Groups let you deploy to several servers at once. Any you create in Anypoint show up here."
            t={t}
          />
        )}
      </ScrollView>
    </View>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appbarTitle: typeScale.heading,
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: 40,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: spacing.xs,
    marginTop: spacing.xl,
    marginBottom: spacing.md,
  },
  sectionAccent: {
    width: 3,
    height: 14,
    borderRadius: 2,
  },
  sectionTitle: { ...typeScale.label, letterSpacing: 0.8, flex: 1 },
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
    gap: spacing.sm,
  },
  cardName: { ...typeScale.subheading, flex: 1 },
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
  emptySection: {
    alignItems: 'center',
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  emptyTitle: { ...typeScale.subheading, marginBottom: spacing.xs },
  emptyBody: {
    ...typeScale.bodySmall,
    fontWeight: '400',
    textAlign: 'center',
    maxWidth: 280,
  },
});

export default ClustersScreen;
