// ============================================================
// Connected Apps Screen — Read-only list of registered apps
// 2026 Modern Dark-First Design
// ============================================================

import React, { useCallback, useMemo } from 'react';
import {
  View,
  FlatList,
  StyleSheet,
  RefreshControl,
  ListRenderItemInfo,
} from 'react-native';
import {
  Appbar,
  Text,
  useTheme,
  type MD3Theme,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';

import { anypointColors } from '../../theme';
import { useConnectedApps } from '../../hooks/queries/useAccessManagementQueries';
import { formatRelativeTime } from '../../utils/statusHelpers';
import LoadingState from '../../components/common/LoadingState';
import ErrorState from '../../components/common/ErrorState';

// ── Types ──
interface ConnectedApp {
  id: string;
  name: string;
  clientId: string;
  grantTypes: string[];
  redirectUris: string[];
  scopes: string[];
  enabled: boolean;
  createdAt: string;
}

// ── Mask client ID ──
const maskClientId = (clientId: string): string => {
  if (!clientId) return '---';
  if (clientId.length <= 8) return clientId;
  return `${clientId.substring(0, 8)}...`;
};

// ── Connected App Card Component ──
const AppCard = React.memo<{
  app: ConnectedApp;
  theme: MD3Theme;
}>(({ app, theme }) => {
  const enabledColor = app.enabled ? anypointColors.success : anypointColors.error;

  return (
    <View
      style={{
        marginBottom: 8,
        borderRadius: 16,
        backgroundColor: theme.colors.surface,
        borderWidth: 1,
        borderColor: theme.colors.outlineVariant,
        overflow: 'hidden',
        padding: 16,
      }}
    >
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
        <View
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            backgroundColor: anypointColors.accent + '14',
            justifyContent: 'center',
            alignItems: 'center',
          }}
        >
          <Icon name="connection" size={20} color={anypointColors.accent} />
        </View>
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
            {app.name}
          </Text>
          <Text
            style={{
              fontSize: 12,
              color: theme.colors.onSurfaceVariant,
              marginTop: 2,
              fontFamily: 'monospace',
            }}
            numberOfLines={1}
          >
            {maskClientId(app.clientId)}
          </Text>
        </View>

        {/* Enabled/disabled indicator */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 10,
            backgroundColor: enabledColor + '12',
          }}
        >
          <View
            style={{
              width: 7,
              height: 7,
              borderRadius: 4,
              backgroundColor: enabledColor,
            }}
          />
          <Text style={{ color: enabledColor, fontSize: 11, fontWeight: '700', letterSpacing: 0.2 }}>
            {app.enabled ? 'Enabled' : 'Disabled'}
          </Text>
        </View>
      </View>

      {/* Grant types as chips */}
      {app.grantTypes?.length > 0 && (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
          {app.grantTypes.map((grant) => (
            <View
              key={grant}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
                backgroundColor: theme.colors.surfaceVariant + '80',
              }}
            >
              <Text style={{ fontSize: 10, color: theme.colors.onSurfaceVariant, fontWeight: '600' }}>
                {grant}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* Footer meta */}
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 10 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 4,
            paddingHorizontal: 8,
            paddingVertical: 3,
            borderRadius: 8,
            backgroundColor: theme.colors.surfaceVariant + '80',
          }}
        >
          <Icon name="key-variant" size={11} color={theme.colors.onSurfaceVariant} />
          <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
            {app.scopes?.length ?? 0} scope{(app.scopes?.length ?? 0) !== 1 ? 's' : ''}
          </Text>
        </View>
        {app.createdAt && (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 8,
              backgroundColor: theme.colors.surfaceVariant + '80',
            }}
          >
            <Icon name="clock-outline" size={11} color={theme.colors.onSurfaceVariant} />
            <Text style={{ fontSize: 11, color: theme.colors.onSurfaceVariant, fontWeight: '500' }}>
              {formatRelativeTime(app.createdAt)}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
});
AppCard.displayName = 'AppCard';

// ── Main Screen ──
const ConnectedAppsScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(theme), [theme]);

  const { data: apps, isLoading, error, refetch, isRefetching } = useConnectedApps();

  const appsList = useMemo(() => (apps as any)?.data ?? [], [apps]) as ConnectedApp[];

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<ConnectedApp>) => (
      <AppCard app={item} theme={theme} />
    ),
    [theme],
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
          <Icon name="connection" size={36} color={theme.colors.onSurfaceVariant} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: '700', color: theme.colors.onSurface, marginBottom: 6 }}>
          No connected apps
        </Text>
        <Text style={{ fontSize: 13, color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
          No client applications registered in this organization.
        </Text>
      </View>
    ),
    [styles, theme],
  );

  if (isLoading) return <LoadingState message="Loading connected apps..." />;
  if (error) return <ErrorState message={(error as Error).message} onRetry={() => refetch()} />;

  return (
    <View style={styles.container}>
      <Appbar.Header
        style={{ backgroundColor: theme.colors.background }}
        statusBarHeight={insets.top}
      >
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Connected Apps" titleStyle={styles.headerTitle} />
        <View
          style={{
            paddingHorizontal: 10,
            paddingVertical: 4,
            borderRadius: 10,
            backgroundColor: anypointColors.accent + '12',
            marginRight: 12,
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: '700', color: anypointColors.accent }}>
            {appsList.length}
          </Text>
        </View>
      </Appbar.Header>

      <FlatList
        data={appsList}
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
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 32,
    },
    emptyState: {
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 80,
      paddingHorizontal: 32,
    },
  });

export default ConnectedAppsScreen;
