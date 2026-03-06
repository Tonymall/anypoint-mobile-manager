// ============================================================
// Users Screen — Searchable list of organization users
// 2026 Modern Dark-First Design
// ============================================================

import React, { useState, useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  Pressable,
  ListRenderItemInfo,
} from 'react-native';
import {
  Appbar,
  Searchbar,
  Text,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { anypointColors } from '../../theme';
import { hapticLight } from '../../utils/haptics';
import { useUsers } from '../../hooks/queries/useAccessManagementQueries';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// ── Types ──
interface UserRole {
  id: string;
  name: string;
  description?: string;
  environmentName?: string;
}

interface User {
  id: string;
  username: string;
  firstName: string;
  lastName: string;
  email: string;
  organizationId: string;
  roles: UserRole[];
}

// ── User Card Component ──
const UserCard = React.memo<{
  user: User;
  onPress: () => void;
  theme: MD3Theme;
}>(({ user, onPress, theme }) => {
  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();

  return (
    <Pressable
      onPress={() => {
        hapticLight();
        onPress();
      }}
      android_ripple={{ color: theme.colors.primaryContainer }}
      accessibilityLabel={`${user.firstName} ${user.lastName}, ${user.email}`}
      accessibilityRole="button"
      accessibilityHint="Double tap to view details"
      style={({ pressed }) => [
        {
          marginBottom: 8,
          borderRadius: 16,
          backgroundColor: theme.colors.surface,
          borderWidth: 1,
          borderColor: theme.colors.outlineVariant,
          overflow: 'hidden',
          opacity: pressed ? 0.92 : 1,
        },
      ]}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, gap: 14 }}>
        {/* Avatar */}
        <View
          style={{
            width: 44,
            height: 44,
            borderRadius: 14,
            backgroundColor: anypointColors.primary + '18',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: '700',
              color: anypointColors.primary,
            }}
          >
            {initials}
          </Text>
        </View>

        {/* Info */}
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
            {user.firstName} {user.lastName}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.onSurfaceVariant,
              marginTop: 2,
            }}
            numberOfLines={1}
          >
            {user.email}
          </Text>
        </View>

        {/* Role count badge */}
        {user.roles?.length > 0 && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 4,
              borderRadius: 10,
              backgroundColor: anypointColors.secondary + '14',
            }}
          >
            <Icon name="shield-account" size={13} color={anypointColors.secondary} />
            <Text
              style={{
                fontSize: 11,
                fontWeight: '700',
                color: anypointColors.secondary,
              }}
            >
              {user.roles.length}
            </Text>
          </View>
        )}

        <Icon name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} style={{ opacity: 0.5 }} />
      </View>
    </Pressable>
  );
});
UserCard.displayName = 'UserCard';

// ── Main Screen ──
const UsersScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const [searchQuery, setSearchQuery] = useState('');
  const { data: users, isLoading, error, refetch, isRefetching } = useUsers();

  const usersList = useMemo(() => (users as any)?.data ?? [], [users]) as User[];

  const filteredUsers = useMemo(() => {
    if (!searchQuery) return usersList;
    const q = searchQuery.toLowerCase();
    return usersList.filter(
      (u) =>
        u.firstName?.toLowerCase().includes(q) ||
        u.lastName?.toLowerCase().includes(q) ||
        u.email?.toLowerCase().includes(q) ||
        u.username?.toLowerCase().includes(q),
    );
  }, [usersList, searchQuery]);

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<User>) => (
      <UserCard
        user={item}
        onPress={() =>
          router.push({
            pathname: '/(main)/admin/user-detail' as any,
            params: { userId: item.id },
          })
        }
        theme={theme}
      />
    ),
    [theme, router],
  );

  const renderEmpty = useCallback(
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
          <Icon name="account-group" size={36} color={theme.colors.onSurfaceVariant} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 6 }}>
          No users found
        </Text>
        <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
          {searchQuery ? 'Try adjusting your search query.' : 'No users in this organization.'}
        </Text>
      </View>
    ),
    [searchQuery, styles, theme],
  );

  if (isLoading) return <LoadingState message="Loading users..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <View style={styles.container}>
      <Appbar.Header
        style={{ backgroundColor: theme.colors.background }}
        statusBarHeight={insets.top}
      >
        <Appbar.BackAction onPress={() => router.replace('/(main)/admin' as any)} />
        <Appbar.Content title="Users" titleStyle={styles.headerTitle} />
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 10,
            backgroundColor: anypointColors.primary + '12',
            marginRight: 12,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: anypointColors.primary }}>
            {usersList.length}
          </Text>
        </View>
      </Appbar.Header>

      {/* Search bar */}
      <View style={styles.searchContainer}>
        <Searchbar
          placeholder="Search users..."
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          inputStyle={styles.searchInput}
          icon="magnify"
        />
      </View>

      {/* User list */}
      <FlatList
        data={filteredUsers}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={renderEmpty}
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
      />
    </View>
  );
};

const createStyles = (theme: MD3Theme) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: theme.colors.background,
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    searchContainer: {
      paddingHorizontal: 16,
      paddingBottom: 8,
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
      paddingTop: 4,
      paddingBottom: 32,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      paddingHorizontal: 32,
    },
  });

export default UsersScreen;
