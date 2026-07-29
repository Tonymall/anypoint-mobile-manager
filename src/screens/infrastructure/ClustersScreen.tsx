// ============================================================
// Clusters & Server Groups — Combined list with sections
//
// Two SectionList-style sections showing clusters and server
// groups with status indicators, badges, and node counts.
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
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';

import type { Cluster, ServerGroup, ServerStatus } from '../../types';
import { anypointColors } from '../../theme';
import {
  useClusters,
  useServerGroups,
} from '../../hooks/queries/useInfrastructureQueries';
import { hapticLight } from '../../utils/haptics';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';
import type { IconName } from '../../types/icons';

// --- Status color ---
const STATUS_COLOR: Record<ServerStatus, string> = {
  RUNNING: anypointColors.success,
  DISCONNECTED: anypointColors.error,
  CREATED: '#6B7280',
  UPDATED: '#6B7280',
};

const getStatusColor = (status: string): string =>
  STATUS_COLOR[status as ServerStatus] ?? '#6B7280';

const getStatusLabel = (status: string): string => {
  switch (status) {
    case 'RUNNING': return 'Running';
    case 'DISCONNECTED': return 'Disconnected';
    case 'CREATED': return 'Created';
    case 'UPDATED': return 'Updated';
    default: return status;
  }
};

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

// --- Cluster Card ---
const ClusterCard = React.memo<{
  cluster: Cluster;
  theme: MD3Theme;
}>(({ cluster, theme }) => {
  const color = getStatusColor(cluster.status);
  const nodeCount = cluster.serverIds?.length ?? 0;

  return (
    <Pressable
      onPress={() => hapticLight()}
      accessibilityLabel={`Cluster ${cluster.name}, ${getStatusLabel(cluster.status)}`}
      accessibilityRole="button"
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
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 12,
          bottom: 12,
          width: 3,
          borderRadius: 1.5,
          backgroundColor: color,
        }}
      />

      <View style={{ padding: 16, paddingLeft: 18 }}>
        {/* Header: name + status */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '600',
                color: theme.colors.onSurface,
                letterSpacing: -0.2,
              }}
              numberOfLines={1}
            >
              {cluster.name}
            </Text>
          </View>

          {/* Status badge */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 10,
              backgroundColor: color + '12',
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: color,
                ...(cluster.status === 'RUNNING'
                  ? {
                      shadowColor: color,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.6,
                      shadowRadius: 3,
                    }
                  : {}),
              }}
            />
            <Text style={{ color, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 }}>
              {getStatusLabel(cluster.status)}
            </Text>
          </View>
        </View>

        {/* Meta tags */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {/* Multicast badge */}
          <View style={tagStyle(theme)}>
            <Icon
              name={cluster.multicastEnabled ? 'access-point' : 'access-point-off'}
              size={11}
              color={theme.colors.onSurfaceVariant}
            />
            <Text style={tagTextStyle(theme)}>
              {cluster.multicastEnabled ? 'Multicast' : 'Unicast'}
            </Text>
          </View>

          {/* Node count */}
          <View style={tagStyle(theme)}>
            <Icon name="server" size={11} color={theme.colors.onSurfaceVariant} />
            <Text style={tagTextStyle(theme)}>
              {nodeCount} node{nodeCount !== 1 ? 's' : ''}
            </Text>
          </View>

          {/* Primary node */}
          {cluster.primaryNode != null && (
            <View style={tagStyle(theme)}>
              <Icon name="star-outline" size={11} color={theme.colors.onSurfaceVariant} />
              <Text style={tagTextStyle(theme)}>Primary: {cluster.primaryNode}</Text>
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
  theme: MD3Theme;
}>(({ group, theme }) => {
  const color = getStatusColor(group.status);
  const serverCount = group.serverIds?.length ?? 0;

  return (
    <Pressable
      onPress={() => hapticLight()}
      accessibilityLabel={`Server group ${group.name}, ${getStatusLabel(group.status)}`}
      accessibilityRole="button"
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
      <View
        style={{
          position: 'absolute',
          left: 0,
          top: 12,
          bottom: 12,
          width: 3,
          borderRadius: 1.5,
          backgroundColor: color,
        }}
      />

      <View style={{ padding: 16, paddingLeft: 18 }}>
        {/* Header: name + status */}
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <View style={{ flex: 1 }}>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '600',
                color: theme.colors.onSurface,
                letterSpacing: -0.2,
              }}
              numberOfLines={1}
            >
              {group.name}
            </Text>
          </View>

          {/* Status badge */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 10,
              backgroundColor: color + '12',
            }}
          >
            <View
              style={{
                width: 7,
                height: 7,
                borderRadius: 4,
                backgroundColor: color,
                ...(group.status === 'RUNNING'
                  ? {
                      shadowColor: color,
                      shadowOffset: { width: 0, height: 0 },
                      shadowOpacity: 0.6,
                      shadowRadius: 3,
                    }
                  : {}),
              }}
            />
            <Text style={{ color, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 }}>
              {getStatusLabel(group.status)}
            </Text>
          </View>
        </View>

        {/* Meta tags */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          <View style={tagStyle(theme)}>
            <Icon name="server-network" size={11} color={theme.colors.onSurfaceVariant} />
            <Text style={tagTextStyle(theme)}>
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
  accentColor: string;
  theme: MD3Theme;
}> = ({ title, count, accentColor, theme }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 4, marginTop: 20, marginBottom: 12 }}>
    <View style={{ width: 3, height: 14, borderRadius: 2, backgroundColor: accentColor }} />
    <Text variant="labelLarge" style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8, flex: 1 }}>
      {title}
    </Text>
    <View style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10, backgroundColor: accentColor + '12' }}>
      <Text style={{ fontSize: 12, fontWeight: '700', color: accentColor }}>{count}</Text>
    </View>
  </View>
);

// --- Empty State ---
const EmptySection: React.FC<{ icon: IconName; message: string; theme: MD3Theme }> = ({
  icon,
  message,
  theme,
}) => (
  <View style={{ alignItems: 'center', paddingVertical: 32 }}>
    <View
      style={{
        width: 56,
        height: 56,
        borderRadius: 18,
        backgroundColor: theme.colors.surfaceVariant,
        justifyContent: 'center',
        alignItems: 'center',
        marginBottom: 12,
      }}
    >
      <Icon name={icon} size={28} color={theme.colors.onSurfaceVariant} />
    </View>
    <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
      {message}
    </Text>
  </View>
);

// --- Main Screen ---
const ClustersScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const clustersQuery = useClusters();
  const serverGroupsQuery = useServerGroups();

  const isLoading = clustersQuery.isLoading && serverGroupsQuery.isLoading;
  const hasError = clustersQuery.isError && serverGroupsQuery.isError;
  const isRefetching = clustersQuery.isRefetching || serverGroupsQuery.isRefetching;

  const refetchAll = useCallback(() => {
    clustersQuery.refetch();
    serverGroupsQuery.refetch();
  }, [clustersQuery, serverGroupsQuery]);

  const clusters = (clustersQuery.data ?? []) as Cluster[];
  const serverGroups = (serverGroupsQuery.data ?? []) as ServerGroup[];

  if (isLoading) return <LoadingState message="Loading clusters and server groups..." />;
  if (hasError) {
    return (
      <ErrorState
        message="Failed to load clusters and server groups."
        onRetry={refetchAll}
      />
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Clusters & Groups" titleStyle={{ fontWeight: '600', letterSpacing: -0.3 }} />
        <Appbar.Action icon="refresh" onPress={refetchAll} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={styles.scrollContent}
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
        {/* Clusters Section */}
        <SectionTitle
          title="CLUSTERS"
          count={clusters.length}
          accentColor={anypointColors.secondary}
          theme={theme}
        />
        {clusters.length > 0 ? (
          clusters.map((cluster) => (
            <ClusterCard key={cluster.id} cluster={cluster} theme={theme} />
          ))
        ) : (
          <EmptySection icon="lan-disconnect" message="No clusters configured" theme={theme} />
        )}

        {/* Server Groups Section */}
        <SectionTitle
          title="SERVER GROUPS"
          count={serverGroups.length}
          accentColor={anypointColors.accent}
          theme={theme}
        />
        {serverGroups.length > 0 ? (
          serverGroups.map((group) => (
            <ServerGroupCard key={group.id} group={group} theme={theme} />
          ))
        ) : (
          <EmptySection icon="server-network-off" message="No server groups configured" theme={theme} />
        )}
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
  });

export default ClustersScreen;
