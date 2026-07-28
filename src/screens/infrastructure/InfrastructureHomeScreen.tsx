// ============================================================
// Infrastructure Home — Summary dashboard with category cards
//
// 2x2 grid of summary cards for Servers, Clusters, Server
// Groups, and RTF Deployments with counts and navigation.
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
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter, useIsFocused } from 'expo-router';

import { anypointColors } from '../../theme';
import {
  useServers,
  useServerGroups,
  useClusters,
  useRTFDeployments,
} from '../../hooks/queries/useInfrastructureQueries';
import { hapticLight } from '../../utils/haptics';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// --- Summary Card ---
const SummaryCard = React.memo<{
  icon: string;
  iconColor: string;
  title: string;
  count: number;
  subtitle: string;
  onPress?: () => void;
  theme: MD3Theme;
  hasError?: boolean;
  disabled?: boolean;
}>(({ icon, iconColor, title, count, subtitle, onPress, theme, hasError, disabled }) => {
  const isInteractive = !hasError && !disabled && !!onPress;
  const dimmed = hasError || disabled;

  const cardContent = (
    <>
      {/* Icon circle */}
      <View
        style={{
          width: 44,
          height: 44,
          borderRadius: 14,
          backgroundColor: (hasError ? anypointColors.error : iconColor) + '14',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 14,
        }}
      >
        <Icon name={hasError ? 'alert-circle-outline' : icon} size={22} color={hasError ? anypointColors.error : iconColor} />
      </View>

      {/* Title */}
      <Text
        style={{
          fontSize: 12,
          fontWeight: '600',
          color: theme.colors.onSurfaceVariant,
          letterSpacing: 0.3,
          marginBottom: 4,
        }}
      >
        {title}
      </Text>

      {/* Count */}
      <Text
        style={{
          fontSize: 28,
          fontWeight: '700',
          color: hasError ? anypointColors.error : theme.colors.onSurface,
          letterSpacing: -0.5,
          marginBottom: 8,
        }}
      >
        {hasError ? '—' : count}
      </Text>

      {/* Subtitle / CTA */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
        <Text style={{ fontSize: 12, fontWeight: '600', color: hasError ? anypointColors.error : disabled ? theme.colors.onSurfaceVariant : iconColor }}>
          {hasError ? 'Failed to load' : subtitle}
        </Text>
        {isInteractive && <Icon name="chevron-right" size={14} color={iconColor} />}
      </View>
    </>
  );

  const cardStyle = {
    flex: 1,
    minWidth: 140,
    borderRadius: 18,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: hasError ? anypointColors.error + '40' : theme.colors.outlineVariant,
    overflow: 'hidden' as const,
    opacity: dimmed ? 0.6 : 1,
    padding: 16,
  };

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
      style={({ pressed }) => [cardStyle, pressed && { opacity: 0.92 }]}
    >
      {cardContent}
    </Pressable>
  );
});
SummaryCard.displayName = 'SummaryCard';

// --- Main Screen ---
const InfrastructureHomeScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const isFocused = useIsFocused();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const serversQuery = useServers(undefined, { enabled: isFocused });
  const serverGroupsQuery = useServerGroups({ enabled: isFocused });
  const clustersQuery = useClusters({ enabled: isFocused });
  const rtfQuery = useRTFDeployments(undefined, { enabled: isFocused });

  // Show full-screen loading only when ALL queries are still loading (first mount)
  const isFirstLoad =
    serversQuery.isLoading ||
    serverGroupsQuery.isLoading ||
    clustersQuery.isLoading ||
    rtfQuery.isLoading;

  // Show full-screen error only when ALL queries failed
  const allFailed =
    serversQuery.isError &&
    serverGroupsQuery.isError &&
    clustersQuery.isError &&
    rtfQuery.isError;

  const isRefetching =
    serversQuery.isRefetching ||
    serverGroupsQuery.isRefetching ||
    clustersQuery.isRefetching ||
    rtfQuery.isRefetching;

  const refetchAll = useCallback(() => {
    serversQuery.refetch();
    serverGroupsQuery.refetch();
    clustersQuery.refetch();
    rtfQuery.refetch();
  }, [serversQuery, serverGroupsQuery, clustersQuery, rtfQuery]);

  // getServers() and getRTFDeployments() return PaginatedResponse<T>; getClusters() and getServerGroups() return T[]
  const serverCount = ((serversQuery.data as any)?.data ?? []).length;
  const clusterCount = Array.isArray(clustersQuery.data) ? clustersQuery.data.length : 0;
  const serverGroupCount = Array.isArray(serverGroupsQuery.data) ? serverGroupsQuery.data.length : 0;
  const rtfCount = ((rtfQuery.data as any)?.data ?? []).length;

  if (isFirstLoad) return <LoadingState message="Loading infrastructure..." />;
  if (allFailed) {
    return (
      <ErrorState
        message="Failed to load infrastructure data."
        onRetry={refetchAll}
      />
    );
  }

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[styles.scrollContent, { paddingTop: 12 }]}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetchAll}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 20, paddingHorizontal: 4 }}>
          <View style={styles.sectionAccent} />
          <Text style={{ fontSize: 20, fontWeight: '700', color: theme.colors.onSurface, flex: 1, letterSpacing: -0.3 }}>
            Infrastructure
          </Text>
        </View>

        {/* 2x2 Grid */}
        <View style={styles.grid}>
          {/* Row 1 */}
          <View style={styles.gridRow}>
            <SummaryCard
              icon="server"
              iconColor={anypointColors.primary}
              title="Servers"
              count={serverCount}
              subtitle="View Servers"
              onPress={() => router.push('/(main)/runtime/servers' as any)}
              theme={theme}
              hasError={serversQuery.isError}
            />
            <SummaryCard
              icon="lan"
              iconColor={anypointColors.secondary}
              title="Clusters"
              count={clusterCount}
              subtitle="View Clusters"
              onPress={() => router.push('/(main)/runtime/clusters' as any)}
              theme={theme}
              hasError={clustersQuery.isError}
            />
          </View>

          {/* Row 2 */}
          <View style={styles.gridRow}>
            <SummaryCard
              icon="server-network"
              iconColor={anypointColors.accent}
              title="Server Groups"
              count={serverGroupCount}
              subtitle="View Groups"
              onPress={() => router.push('/(main)/runtime/clusters' as any)}
              theme={theme}
              hasError={serverGroupsQuery.isError}
            />
            <SummaryCard
              icon="kubernetes"
              iconColor={anypointColors.mulePurple}
              title="RTF Deployments"
              count={rtfCount}
              subtitle="Read-only"
              theme={theme}
              hasError={rtfQuery.isError}
              disabled={!rtfQuery.isError}
            />
          </View>
        </View>

        <View
          style={{
            marginTop: 16,
            borderRadius: 14,
            backgroundColor: theme.colors.surface,
            borderWidth: 1,
            borderColor: theme.colors.outlineVariant,
            padding: 14,
          }}
        >
          <Text style={{ color: theme.colors.onSurface, fontSize: 13, fontWeight: '600', marginBottom: 4 }}>
            Infrastructure scope
          </Text>
          <Text style={{ color: theme.colors.onSurfaceVariant, fontSize: 12, lineHeight: 18 }}>
            Servers, server groups, and clusters are hybrid/agent-managed resources. If this environment is CloudHub-only, those sections may stay empty. CloudHub VPC, load balancer, and tunnel views now live in Administration under Cloud Network.
          </Text>
        </View>
      </ScrollView>
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
    scrollContent: {
      paddingHorizontal: 16,
      paddingBottom: 40,
    },
    sectionAccent: {
      width: 3,
      height: 18,
      borderRadius: 1.5,
      backgroundColor: theme.colors.primary,
      marginRight: 10,
    },
    grid: {
      gap: 12,
    },
    gridRow: {
      flexDirection: 'row',
      gap: 12,
    },
  });

export default InfrastructureHomeScreen;
