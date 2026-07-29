import React, { useCallback, useMemo } from 'react';
import {
  FlatList,
  ListRenderItemInfo,
  Pressable,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { Appbar, Text, useTheme, type MD3Theme } from 'react-native-paper';
import Icon from '@expo/vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import ErrorState from '../../components/common/ErrorState';
import LoadingState from '../../components/common/LoadingState';
import { useSecretGroups } from '../../hooks/queries/useSecretManagerQueries';
import { usePullRefresh } from '../../hooks/usePullRefresh';
import { anypointColors } from '../../theme';
import { hapticLight } from '../../utils/haptics';
import { formatRelativeTime } from '../../utils/statusHelpers';

interface SecretGroup {
  id: string;
  name: string;
  downloadable: boolean;
  createdAt: string;
}

const SecretGroupCard: React.FC<{
  group: SecretGroup;
  onPress: () => void;
  theme: MD3Theme;
}> = ({ group, onPress, theme }) => (
  <Pressable
    onPress={() => {
      hapticLight();
      onPress();
    }}
    android_ripple={{ color: theme.colors.primaryContainer }}
    accessibilityLabel={`${group.name}, ${group.downloadable ? 'downloadable' : 'not downloadable'}`}
    accessibilityRole="button"
    accessibilityHint="Double tap to view details"
    style={({ pressed }) => [
      styles.card,
      {
        backgroundColor: theme.colors.surface,
        borderColor: theme.colors.outlineVariant,
        opacity: pressed ? 0.92 : 1,
      },
    ]}
  >
    <View style={styles.cardContent}>
      <View style={styles.iconWrap}>
        <Icon name="lock" size={22} color={anypointColors.error} />
      </View>

      <View style={styles.textCol}>
        <Text style={[styles.cardTitle, { color: theme.colors.onSurface }]} numberOfLines={1}>
          {group.name}
        </Text>
        {group.createdAt ? (
          <Text style={[styles.cardSubtitle, { color: theme.colors.onSurfaceVariant }]}>
            Created {formatRelativeTime(group.createdAt)}
          </Text>
        ) : null}
      </View>

      {group.downloadable ? (
        <View style={styles.badge}>
          <Icon name="download" size={13} color={anypointColors.success} />
          <Text style={styles.badgeText}>DL</Text>
        </View>
      ) : null}

      <Icon name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.5 }} />
    </View>
  </Pressable>
);

const SecretGroupsScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { data: groups, isLoading, error, refetch } = useSecretGroups();
  const pullRefresh = usePullRefresh(refetch);

  const groupsList = useMemo(() => (groups as SecretGroup[]) ?? [], [groups]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<SecretGroup>) => (
      <SecretGroupCard
        group={item}
        onPress={() =>
          router.push({
            pathname: '/(main)/admin/secret-detail' as any,
            params: { groupId: item.id },
          })
        }
        theme={theme}
      />
    ),
    [router, theme],
  );

  const renderEmpty = useCallback(
    () => (
      <View style={styles.emptyState}>
        <View style={[styles.emptyIconWrap, { backgroundColor: theme.colors.surfaceVariant }]}>
          <Icon name="lock" size={36} color={theme.colors.onSurfaceVariant} />
        </View>
        <Text style={[styles.emptyTitle, { color: theme.colors.onSurface }]}>No secret groups</Text>
        <Text style={[styles.emptyText, { color: theme.colors.onSurfaceVariant }]}>
          No secret groups are available in this environment.
        </Text>
      </View>
    ),
    [theme],
  );

  if (isLoading) return <LoadingState message="Loading secret groups..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header style={{ backgroundColor: theme.colors.background }} statusBarHeight={insets.top}>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Secret Groups" titleStyle={styles.headerTitle} />
        <View style={styles.countBadge}>
          <Text style={styles.countText}>{groupsList.length}</Text>
        </View>
      </Appbar.Header>

      <FlatList
        data={groupsList}
        keyExtractor={(item, index) => `${item.id ?? item.name ?? 'secret-group'}-${index}`}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
        refreshControl={
          <RefreshControl
            refreshing={pullRefresh.refreshing}
            onRefresh={pullRefresh.onRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
        showsVerticalScrollIndicator={false}
        initialNumToRender={15}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  countBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: anypointColors.error + '12',
    marginRight: 12,
  },
  countText: {
    fontSize: 12,
    fontWeight: '700',
    color: anypointColors.error,
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 32,
  },
  card: {
    marginBottom: 8,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    gap: 14,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: anypointColors.error + '14',
    justifyContent: 'center',
    alignItems: 'center',
  },
  textCol: {
    flex: 1,
  },
  cardTitle: {
    fontSize: 15,
    fontWeight: '600',
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 12,
    marginTop: 2,
  },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: anypointColors.success + '12',
  },
  badgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: anypointColors.success,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
    paddingHorizontal: 32,
  },
  emptyIconWrap: {
    width: 72,
    height: 72,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 17,
    fontWeight: '700',
    marginBottom: 6,
  },
  emptyText: {
    fontSize: 13,
    textAlign: 'center',
  },
});

export default SecretGroupsScreen;
