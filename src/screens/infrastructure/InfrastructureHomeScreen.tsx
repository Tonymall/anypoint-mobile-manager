// ============================================================
// Infrastructure Home — Summary dashboard with category cards
//
// 2x2 grid of summary cards for Servers, Clusters, Server
// Groups, and RTF Deployments with counts and navigation.
//
// Built on the design token layer: each card names an accent role
// rather than a colour, and the counts arrive behind a Skeleton the
// size of the number, so nothing reflows when the data lands.
// ============================================================

import React, { useCallback } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
  Pressable,
} from 'react-native';
import {
  Text,
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter, useIsFocused } from 'expo-router';

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
  useServers,
  useServerGroups,
  useClusters,
  useRTFDeployments,
} from '../../hooks/queries/useInfrastructureQueries';
import { hapticLight } from '../../utils/haptics';
import ErrorState from '../../components/common/ErrorState';
import type { IconName } from '../../types/icons';

// --- Summary Card ---
const SummaryCard = React.memo<{
  icon: IconName;
  role: StatusRole;
  title: string;
  count: number;
  subtitle: string;
  onPress?: () => void;
  t: Tokens;
  isLoading?: boolean;
  hasError?: boolean;
  disabled?: boolean;
}>(({ icon, role, title, count, subtitle, onPress, t, isLoading, hasError, disabled }) => {
  const isInteractive = !hasError && !disabled && !isLoading && !!onPress;
  const dimmed = hasError || disabled;
  const activeRole = hasError ? t.color.status.danger : role;

  const cardContent = (
    <>
      {/* Icon well */}
      <View style={[styles.iconWell, { backgroundColor: activeRole.surface }]}>
        <Icon
          name={hasError ? 'alert-circle-outline' : icon}
          size={22}
          color={activeRole.base}
        />
      </View>

      {/* Title */}
      <Text style={[styles.cardTitle, { color: t.color.text.secondary }]}>
        {title}
      </Text>

      {/* Count — a Skeleton the size of the number while it loads */}
      {isLoading ? (
        <View style={styles.countSkeleton}>
          <Skeleton width={44} height={28} />
        </View>
      ) : (
        <Text
          style={[
            styles.count,
            { color: hasError ? activeRole.base : t.color.text.primary },
          ]}
        >
          {hasError ? '—' : count}
        </Text>
      )}

      {/* Subtitle / CTA */}
      <View style={styles.cardFooter}>
        <Text
          style={[
            styles.cardSubtitle,
            { color: disabled && !hasError ? t.color.text.tertiary : activeRole.base },
          ]}
        >
          {hasError ? 'Failed to load' : subtitle}
        </Text>
        {isInteractive && (
          <Icon name="chevron-right" size={14} color={activeRole.base} />
        )}
      </View>
    </>
  );

  const cardStyle = [
    styles.card,
    {
      backgroundColor: t.color.surface.raised,
      borderColor: hasError ? activeRole.border : t.color.border.subtle,
      opacity: dimmed ? 0.6 : 1,
    },
  ];

  if (!isInteractive) {
    return (
      <View
        style={cardStyle}
        accessibilityLabel={hasError ? `${title}: failed to load` : `${title}: ${count}`}
      >
        {cardContent}
      </View>
    );
  }

  return (
    <Pressable
      onPress={() => { hapticLight(); onPress!(); }}
      accessibilityLabel={`${title}: ${count}. ${subtitle}`}
      accessibilityRole="button"
      style={({ pressed }) => [cardStyle, pressed && styles.cardPressed]}
    >
      {cardContent}
    </Pressable>
  );
});
SummaryCard.displayName = 'SummaryCard';

// --- Main Screen ---
const InfrastructureHomeScreen: React.FC = () => {
  const t = useTokens();
  const router = useRouter();
  const isFocused = useIsFocused();

  const serversQuery = useServers(undefined, { enabled: isFocused });
  const serverGroupsQuery = useServerGroups({ enabled: isFocused });
  const clustersQuery = useClusters({ enabled: isFocused });
  const rtfQuery = useRTFDeployments(undefined, { enabled: isFocused });

  // Show full-screen error only when ALL queries failed
  const allFailed =
    serversQuery.isError &&
    serverGroupsQuery.isError &&
    clustersQuery.isError &&
    rtfQuery.isError;

  const refetchAll = useCallback(
    () =>
      Promise.allSettled([
        serversQuery.refetch(),
        serverGroupsQuery.refetch(),
        clustersQuery.refetch(),
        rtfQuery.refetch(),
      ]),
    [serversQuery, serverGroupsQuery, clustersQuery, rtfQuery],
  );

  // The OR of four isRefetching flags meant any single poll opened the
  // control. Only a pull should.
  const pullRefresh = usePullRefresh(refetchAll);

  // getServers() and getRTFDeployments() return PaginatedResponse<T>; getClusters() and getServerGroups() return T[]
  const serverCount = ((serversQuery.data as any)?.data ?? []).length;
  const clusterCount = Array.isArray(clustersQuery.data) ? clustersQuery.data.length : 0;
  const serverGroupCount = Array.isArray(serverGroupsQuery.data) ? serverGroupsQuery.data.length : 0;
  const rtfCount = ((rtfQuery.data as any)?.data ?? []).length;

  if (allFailed) {
    return (
      <ErrorState
        message="Failed to load infrastructure data."
        onRetry={refetchAll}
      />
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: t.color.surface.canvas }]}>
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
        {/* Header */}
        <View style={styles.titleRow}>
          <View style={[styles.sectionAccent, { backgroundColor: t.color.brand.base }]} />
          <Text style={[styles.screenTitle, { color: t.color.text.primary }]}>
            Infrastructure
          </Text>
        </View>

        {/* 2x2 Grid */}
        <View style={styles.grid}>
          {/* Row 1 */}
          <View style={styles.gridRow}>
            <SummaryCard
              icon="server"
              role={t.color.accent.brand}
              title="Servers"
              count={serverCount}
              subtitle="View Servers"
              onPress={() => router.push('/(main)/runtime/servers' as any)}
              t={t}
              isLoading={serversQuery.isLoading}
              hasError={serversQuery.isError}
            />
            <SummaryCard
              icon="lan"
              role={t.color.accent.secondary}
              title="Clusters"
              count={clusterCount}
              subtitle="View Clusters"
              onPress={() => router.push('/(main)/runtime/clusters' as any)}
              t={t}
              isLoading={clustersQuery.isLoading}
              hasError={clustersQuery.isError}
            />
          </View>

          {/* Row 2 */}
          <View style={styles.gridRow}>
            <SummaryCard
              icon="server-network"
              role={t.color.status.success}
              title="Server Groups"
              count={serverGroupCount}
              subtitle="View Groups"
              onPress={() => router.push('/(main)/runtime/clusters' as any)}
              t={t}
              isLoading={serverGroupsQuery.isLoading}
              hasError={serverGroupsQuery.isError}
            />
            <SummaryCard
              icon="kubernetes"
              role={t.color.accent.tertiary}
              title="RTF Deployments"
              count={rtfCount}
              subtitle="Read-only"
              t={t}
              isLoading={rtfQuery.isLoading}
              hasError={rtfQuery.isError}
              disabled={!rtfQuery.isError}
            />
          </View>
        </View>

        <View
          style={[
            styles.noteCard,
            {
              backgroundColor: t.color.surface.raised,
              borderColor: t.color.border.subtle,
            },
          ]}
        >
          <Text style={[styles.noteTitle, { color: t.color.text.primary }]}>
            Infrastructure scope
          </Text>
          <Text style={[styles.noteBody, { color: t.color.text.secondary }]}>
            Servers, server groups, and clusters are hybrid/agent-managed resources. If this environment is CloudHub-only, those sections may stay empty. CloudHub VPC, load balancer, and tunnel views now live in Administration under Cloud Network.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
};

// --- Styles ---
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    paddingBottom: 40,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.xl,
    paddingHorizontal: spacing.xs,
  },
  sectionAccent: {
    width: 3,
    height: 18,
    borderRadius: 1.5,
    marginRight: 10,
  },
  screenTitle: { ...typeScale.title, flex: 1 },
  grid: {
    gap: spacing.md,
  },
  gridRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  card: {
    flex: 1,
    minWidth: 140,
    borderRadius: radii.lg,
    borderWidth: 1,
    overflow: 'hidden',
    padding: spacing.lg,
  },
  cardPressed: {
    opacity: 0.92,
  },
  iconWell: {
    width: 44,
    height: 44,
    borderRadius: radii.md,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 14,
  },
  cardTitle: { ...typeScale.label, marginBottom: spacing.xs },
  count: { ...typeScale.metric, marginBottom: spacing.sm },
  countSkeleton: {
    height: 32,
    justifyContent: 'center',
    marginBottom: spacing.sm,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  cardSubtitle: typeScale.label,
  noteCard: {
    marginTop: spacing.lg,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: 14,
  },
  noteTitle: { ...typeScale.bodySmall, fontWeight: '700', marginBottom: spacing.xs },
  noteBody: { ...typeScale.label, fontWeight: '400', lineHeight: 18 },
});

export default InfrastructureHomeScreen;
