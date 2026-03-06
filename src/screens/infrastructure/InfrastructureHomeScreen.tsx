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
import { useRouter } from 'expo-router';

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
  onPress: () => void;
  theme: MD3Theme;
}>(({ icon, iconColor, title, count, subtitle, onPress, theme }) => (
  <Pressable
    onPress={() => {
      hapticLight();
      onPress();
    }}
    accessibilityLabel={`${title}: ${count}. ${subtitle}`}
    accessibilityRole="button"
    style={({ pressed }) => [
      {
        flex: 1,
        minWidth: 140,
        borderRadius: 18,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
        overflow: 'hidden',
        opacity: pressed ? 0.92 : 1,
        padding: 16,
      },
    ]}
  >
    {/* Icon circle */}
    <View
      style={{
        width: 44,
        height: 44,
        borderRadius: 14,
        backgroundColor: iconColor + '14',
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 14,
      }}
    >
      <Icon name={icon} size={22} color={iconColor} />
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
        color: theme.colors.onSurface,
        letterSpacing: -0.5,
        marginBottom: 8,
      }}
    >
      {count}
    </Text>

    {/* Subtitle / CTA */}
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      <Text style={{ fontSize: 12, fontWeight: '600', color: iconColor }}>
        {subtitle}
      </Text>
      <Icon name="chevron-right" size={14} color={iconColor} />
    </View>
  </Pressable>
));
SummaryCard.displayName = 'SummaryCard';

// --- Main Screen ---
const InfrastructureHomeScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const serversQuery = useServers();
  const serverGroupsQuery = useServerGroups();
  const clustersQuery = useClusters();
  const rtfQuery = useRTFDeployments();

  const isLoading =
    serversQuery.isLoading &&
    serverGroupsQuery.isLoading &&
    clustersQuery.isLoading &&
    rtfQuery.isLoading;

  const hasError =
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

  const serverCount = Array.isArray(serversQuery.data) ? serversQuery.data.length : 0;
  const clusterCount = Array.isArray(clustersQuery.data) ? clustersQuery.data.length : 0;
  const serverGroupCount = Array.isArray(serverGroupsQuery.data) ? serverGroupsQuery.data.length : 0;
  const rtfCount = Array.isArray(rtfQuery.data) ? rtfQuery.data.length : 0;

  if (isLoading) return <LoadingState message="Loading infrastructure..." />;
  if (hasError) {
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
            />
            <SummaryCard
              icon="lan"
              iconColor={anypointColors.secondary}
              title="Clusters"
              count={clusterCount}
              subtitle="View Clusters"
              onPress={() => router.push('/(main)/runtime/clusters' as any)}
              theme={theme}
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
            />
            <SummaryCard
              icon="kubernetes"
              iconColor={anypointColors.mulePurple}
              title="RTF Deployments"
              count={rtfCount}
              subtitle="View RTF"
              onPress={() => router.push('/(main)/runtime/clusters' as any)}
              theme={theme}
            />
          </View>
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
