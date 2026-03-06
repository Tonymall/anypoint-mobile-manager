// ============================================================
// Servers List — Searchable server list with status indicators
//
// Modern card layout with status dots, search filtering,
// Mule version badges, and relative timestamps.
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
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter } from 'expo-router';

import type { Server, ServerStatus } from '../../types';
import { anypointColors } from '../../theme';
import { useServers } from '../../hooks/queries/useInfrastructureQueries';
import { formatRelativeTime } from '../../utils/statusHelpers';
import { hapticLight } from '../../utils/haptics';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// --- Server status color ---
const SERVER_STATUS_COLOR: Record<ServerStatus, string> = {
  RUNNING: anypointColors.success,
  DISCONNECTED: anypointColors.error,
  CREATED: '#6B7280',
  UPDATED: '#6B7280',
};

const getServerStatusColor = (status: string): string =>
  SERVER_STATUS_COLOR[status as ServerStatus] ?? '#6B7280';

const getServerStatusLabel = (status: string): string => {
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
  theme: MD3Theme;
}>(({ server, onPress, theme }) => {
  const color = getServerStatusColor(server.status);
  const firstIp = server.addresses?.[0]?.ip ?? 'N/A';

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
              {server.name}
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
                ...(server.status === 'RUNNING'
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
              {getServerStatusLabel(server.status)}
            </Text>
          </View>
        </View>

        {/* Meta tags */}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {/* Type */}
          <View style={tagStyle(theme)}>
            <Icon name="server" size={11} color={theme.colors.onSurfaceVariant} />
            <Text style={tagTextStyle(theme)}>{server.type}</Text>
          </View>

          {/* Mule Version */}
          {server.muleVersion && (
            <View style={tagStyle(theme)}>
              <Icon name="puzzle-outline" size={11} color={theme.colors.onSurfaceVariant} />
              <Text style={tagTextStyle(theme)}>Mule {server.muleVersion}</Text>
            </View>
          )}

          {/* Last Connected */}
          {server.lastConnected && (
            <View style={tagStyle(theme)}>
              <Icon name="clock-outline" size={11} color={theme.colors.onSurfaceVariant} />
              <Text style={tagTextStyle(theme)}>{formatRelativeTime(server.lastConnected)}</Text>
            </View>
          )}

          {/* IP address */}
          <View style={tagStyle(theme)}>
            <Icon name="ip-network-outline" size={11} color={theme.colors.onSurfaceVariant} />
            <Text style={tagTextStyle(theme)}>{firstIp}</Text>
          </View>
        </View>
      </View>
    </Pressable>
  );
});
ServerCard.displayName = 'ServerCard';

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

// --- Main Screen ---
const ServersScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [searchQuery, setSearchQuery] = useState('');

  const { data: servers, isLoading, error, refetch, isRefetching } = useServers();

  const serverList = useMemo(() => {
    const items = (servers ?? []) as Server[];
    if (!searchQuery) return items;
    const q = searchQuery.toLowerCase();
    return items.filter(
      (s) =>
        s.name.toLowerCase().includes(q) ||
        s.muleVersion?.toLowerCase().includes(q) ||
        s.addresses?.some((a) => a.ip.includes(q)),
    );
  }, [servers, searchQuery]);

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
        theme={theme}
      />
    ),
    [theme, router],
  );

  const renderEmptyState = useCallback(
    () => (
      <View style={styles.emptyState}>
        <View
          style={{
            width: 72,
            height: 72,
            borderRadius: 24,
            backgroundColor: theme.colors.surfaceVariant,
            justifyContent: 'center',
            alignItems: 'center',
            marginBottom: 16,
          }}
        >
          <Icon name="server-off" size={36} color={theme.colors.onSurfaceVariant} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 6 }}>
          No servers found
        </Text>
        <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
          {searchQuery
            ? 'Try adjusting your search query.'
            : 'No servers registered in this environment.'}
        </Text>
      </View>
    ),
    [searchQuery, styles, theme],
  );

  if (isLoading) return <LoadingState message="Loading servers..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <View style={styles.container}>
      {/* Header */}
      <Appbar.Header style={{ backgroundColor: theme.colors.surface, elevation: 0 }}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Servers" titleStyle={{ fontWeight: '600', letterSpacing: -0.3 }} />
        <Appbar.Action icon="refresh" onPress={() => refetch()} />
      </Appbar.Header>

      {/* Search */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search servers..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          icon="magnify"
        />
      </View>

      {/* Server list */}
      <FlatList
        data={serverList}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => refetch()}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
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
const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    searchContainer: {
      paddingHorizontal: 16,
      paddingVertical: 8,
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
  });

export default ServersScreen;
