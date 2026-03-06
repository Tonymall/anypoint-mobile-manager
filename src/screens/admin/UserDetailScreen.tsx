// ============================================================
// User Detail Screen — User info + role list (read-only MVP)
// 2026 Modern Dark-First Design
// ============================================================

import React, { useMemo } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
} from 'react-native';
import {
  Appbar,
  Text,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { anypointColors } from '../../theme';
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

// ── Info Row ──
const InfoRow: React.FC<{
  icon: string;
  label: string;
  value: string;
  theme: MD3Theme;
}> = ({ icon, label, value, theme }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10, paddingHorizontal: 16, gap: 14 }}>
    <View
      style={{
        width: 32,
        height: 32,
        borderRadius: 10,
        backgroundColor: theme.colors.surfaceVariant,
        justifyContent: 'center',
        alignItems: 'center',
      }}
    >
      <Icon name={icon} size={16} color={theme.colors.onSurfaceVariant} />
    </View>
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, fontWeight: '500', letterSpacing: 0.4 }}>
        {label}
      </Text>
      <Text
        style={{ fontSize: 14, color: theme.colors.onSurface, fontWeight: '500', marginTop: 1 }}
        numberOfLines={1}
        selectable
      >
        {value}
      </Text>
    </View>
  </View>
);

// ── Role Card ──
const RoleCard: React.FC<{ role: UserRole; theme: MD3Theme }> = ({ role, theme }) => (
  <View
    style={{
      marginBottom: 8,
      borderRadius: 14,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      padding: 14,
    }}
  >
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 10,
          backgroundColor: anypointColors.secondary + '14',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <Icon name="shield-check" size={16} color={anypointColors.secondary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text
          style={{
            fontSize: 14,
            fontWeight: '600',
            color: theme.colors.onSurface,
          }}
          numberOfLines={1}
        >
          {role.name}
        </Text>
        {role.description ? (
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.onSurfaceVariant,
              marginTop: 2,
            }}
            numberOfLines={2}
          >
            {role.description}
          </Text>
        ) : null}
      </View>
    </View>

    {role.environmentName ? (
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 8, marginLeft: 42 }}>
        <Icon name="server" size={11} color={anypointColors.warning} />
        <Text style={{ fontSize: 11, color: anypointColors.warning, fontWeight: '600' }}>
          {role.environmentName}
        </Text>
      </View>
    ) : null}
  </View>
);

// ── Main Screen ──
const UserDetailScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { userId } = useLocalSearchParams<{ userId: string }>();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { data: users, isLoading, error, refetch } = useUsers();

  const user = useMemo(() => {
    const list = ((users as any)?.data ?? []) as User[];
    return list.find((u) => u.id === userId);
  }, [users, userId]);

  if (isLoading) return <LoadingState message="Loading user..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  if (!user) {
    return (
      <View style={styles.container}>
        <Appbar.Header
          style={{ backgroundColor: theme.colors.background }}
          statusBarHeight={insets.top}
        >
          <Appbar.BackAction onPress={() => router.back()} />
          <Appbar.Content title="User" titleStyle={styles.headerTitle} />
        </Appbar.Header>
        <ErrorState message="User not found" />
      </View>
    );
  }

  const initials = `${user.firstName?.[0] ?? ''}${user.lastName?.[0] ?? ''}`.toUpperCase();
  const fullName = `${user.firstName} ${user.lastName}`;

  return (
    <View style={styles.container}>
      <Appbar.Header
        style={{ backgroundColor: theme.colors.background }}
        statusBarHeight={insets.top}
      >
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={fullName} titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <ScrollView
        contentContainerStyle={{ paddingBottom: 40 }}
        showsVerticalScrollIndicator={false}
      >
        {/* ── User Info Card ── */}
        <View style={styles.card}>
          <View style={styles.profileAccent} />
          <View style={styles.profileContent}>
            {/* Avatar */}
            <View style={[styles.avatar, { backgroundColor: anypointColors.primary + '18' }]}>
              <Text style={{ fontSize: 26, fontWeight: '700', color: anypointColors.primary }}>
                {initials}
              </Text>
            </View>
            <Text
              style={{
                fontSize: 20,
                fontWeight: '700',
                color: theme.colors.onSurface,
                letterSpacing: -0.3,
                marginBottom: 2,
              }}
            >
              {fullName}
            </Text>
            <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant }}>
              @{user.username}
            </Text>
          </View>

          <View style={[styles.separator, { backgroundColor: theme.colors.outlineVariant }]} />
          <InfoRow icon="account" label="Username" value={user.username} theme={theme} />
          <View style={[styles.separator, { backgroundColor: theme.colors.outlineVariant }]} />
          <InfoRow icon="email" label="Email" value={user.email} theme={theme} />
          <View style={[styles.separator, { backgroundColor: theme.colors.outlineVariant }]} />
          <InfoRow icon="domain" label="Organization ID" value={user.organizationId} theme={theme} />
        </View>

        {/* ── Roles Section ── */}
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionAccent, { backgroundColor: anypointColors.secondary }]} />
          <Text
            variant="labelLarge"
            style={{ color: theme.colors.onSurfaceVariant, letterSpacing: 0.8, flex: 1 }}
          >
            ROLES
          </Text>
          <View
            style={{
              paddingHorizontal: 10,
              paddingVertical: 3,
              borderRadius: 10,
              backgroundColor: anypointColors.secondary + '14',
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: anypointColors.secondary }}>
              {user.roles?.length ?? 0}
            </Text>
          </View>
        </View>

        <View style={{ paddingHorizontal: 16 }}>
          {user.roles?.length > 0 ? (
            user.roles.map((role) => (
              <RoleCard key={role.id} role={role} theme={theme} />
            ))
          ) : (
            <View
              style={{
                padding: 24,
                alignItems: 'center',
                borderRadius: 14,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.outlineVariant,
              }}
            >
              <Icon name="shield-off-outline" size={32} color={theme.colors.onSurfaceVariant} />
              <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, marginTop: 8 }}>
                No roles assigned
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
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
    card: {
      marginHorizontal: 16,
      marginTop: 8,
      borderRadius: 20,
      backgroundColor: theme.colors.surface,
      borderWidth: 1,
      borderColor: theme.colors.outlineVariant,
      overflow: 'hidden',
    },
    profileAccent: {
      height: 3,
      backgroundColor: anypointColors.primary,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
    },
    profileContent: {
      alignItems: 'center',
      padding: 24,
      paddingTop: 20,
    },
    avatar: {
      width: 72,
      height: 72,
      borderRadius: 18,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    separator: {
      height: StyleSheet.hairlineWidth,
      marginLeft: 62,
    },
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 20,
      marginTop: 24,
      marginBottom: 10,
    },
    sectionAccent: {
      width: 3,
      height: 14,
      borderRadius: 2,
    },
  });

export default UserDetailScreen;
