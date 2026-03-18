// ============================================================
// Admin Home Screen — Dashboard grid of admin feature cards
// 2026 Modern Dark-First Design
// ============================================================

import React, { useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  Pressable,
  ListRenderItemInfo,
  useWindowDimensions,
} from 'react-native';
import { Appbar, Text, useTheme, type MD3Theme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { anypointColors } from '../../theme';
import { hapticLight } from '../../utils/haptics';

// ── Feature Card Data ──
interface AdminFeature {
  id: string;
  title: string;
  subtitle: string;
  icon: string;
  iconColor: string;
  route: string;
}

const ADMIN_FEATURES: AdminFeature[] = [
  {
    id: 'users',
    title: 'Users',
    subtitle: 'Manage organization users and roles',
    icon: 'account-group',
    iconColor: anypointColors.primary,
    route: '/(main)/admin/users',
  },
  // Teams hidden until the tenant-specific GET endpoint is validated.
  // Current tenant returns HTTP 405 for GET /accounts/api/organizations/{orgId}/teams.
  {
    id: 'connected-apps',
    title: 'Connected Apps',
    subtitle: 'View registered client applications',
    icon: 'connection',
    iconColor: anypointColors.accent,
    route: '/(main)/admin/connected-apps',
  },
  {
    id: 'governance',
    title: 'API Governance',
    subtitle: 'Profiles, rulesets, and conformance status',
    icon: 'shield-check-outline',
    iconColor: anypointColors.warning,
    route: '/(main)/admin/governance',
  },
  {
    id: 'environment-comparison',
    title: 'Environment Comparison',
    subtitle: 'Compare runtime and API drift between envs',
    icon: 'source-branch',
    iconColor: anypointColors.info,
    route: '/(main)/admin/environment-comparison',
  },
  {
    id: 'platform-activity',
    title: 'Platform Activity',
    subtitle: 'MQ and Object Store audit activity',
    icon: 'database-outline',
    iconColor: anypointColors.secondary,
    route: '/(main)/admin/platform-activity',
  },
  // Permissions card hidden until `/accounts/api/cs/.../permissions/products`
  // response shape is validated and PermissionsScreen is updated to match.
  // {
  //   id: 'permissions',
  //   title: 'Permissions',
  //   subtitle: 'Review resource permissions',
  //   icon: 'shield-check',
  //   iconColor: anypointColors.warning,
  //   route: '/(main)/admin/permissions',
  // },
  {
    id: 'business-groups',
    title: 'Business Groups',
    subtitle: 'Organization hierarchy tree',
    icon: 'domain',
    iconColor: anypointColors.mulePurple,
    route: '/(main)/admin/business-groups',
  },
  {
    id: 'secrets',
    title: 'Secrets',
    subtitle: 'Secret groups, keystores, and certs',
    icon: 'lock',
    iconColor: anypointColors.error,
    route: '/(main)/admin/secrets',
  },
  {
    id: 'backend-ops',
    title: 'Backend Ops',
    subtitle: 'Bug reports, alerts, and mobile config',
    icon: 'server-security',
    iconColor: anypointColors.info,
    route: '/(main)/admin/backend-ops',
  },
];

// ── Feature Card Component ──
const FeatureCard = React.memo<{
  item: AdminFeature;
  onPress: () => void;
  theme: MD3Theme;
}>(({ item, onPress, theme }) => (
  <Pressable
    onPress={() => {
      hapticLight();
      onPress();
    }}
    android_ripple={{ color: theme.colors.primaryContainer }}
    accessibilityLabel={`${item.title}: ${item.subtitle}`}
    accessibilityRole="button"
    accessibilityHint="Double tap to open"
    style={({ pressed }) => [
      {
        flex: 1,
        margin: 6,
        borderRadius: 18,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
        overflow: 'hidden',
        opacity: pressed ? 0.92 : 1,
      },
    ]}
  >
    <View style={{ padding: 20, alignItems: 'flex-start' }}>
      {/* Icon container */}
      <View
        style={{
          width: 48,
          height: 48,
          borderRadius: 14,
          backgroundColor: item.iconColor + '14',
          justifyContent: 'center',
          alignItems: 'center',
          marginBottom: 16,
        }}
      >
        <Icon name={item.icon} size={24} color={item.iconColor} />
      </View>

      {/* Title */}
      <Text
        style={{
          fontSize: 15,
          fontWeight: '600',
          color: theme.colors.onSurface,
          letterSpacing: -0.2,
          marginBottom: 4,
        }}
        numberOfLines={1}
      >
        {item.title}
      </Text>

      {/* Subtitle */}
      <Text
        style={{
          fontSize: 12,
          color: theme.colors.onSurfaceVariant,
          lineHeight: 16,
        }}
        numberOfLines={2}
      >
        {item.subtitle}
      </Text>
    </View>
  </Pressable>
));
FeatureCard.displayName = 'FeatureCard';

// ── Main Screen ──
const AdminHomeScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const styles = useMemo(() => createStyles(theme), [theme]);
  const numColumns = width < 420 ? 1 : 2;

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<AdminFeature>) => (
      <FeatureCard
        item={item}
        onPress={() => router.push(item.route as any)}
        theme={theme}
      />
    ),
    [theme, router],
  );

  return (
    <View style={styles.container}>
      <Appbar.Header
        style={{ backgroundColor: theme.colors.background }}
        statusBarHeight={insets.top}
      >
        <Appbar.BackAction onPress={() => router.replace('/(main)/settings' as any)} />
        <Appbar.Content title="Administration" titleStyle={styles.headerTitle} />
      </Appbar.Header>

      <FlatList
        data={ADMIN_FEATURES}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        key={`admin-cols-${numColumns}`}
        numColumns={numColumns}
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
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
    listContent: {
      paddingHorizontal: 10,
      paddingTop: 8,
      paddingBottom: 32,
    },
  });

export default AdminHomeScreen;


