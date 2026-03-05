import React, { useCallback } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import {
  Text,
  useTheme,
  ActivityIndicator,
  TouchableRipple,
  Appbar,
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { useAuthStore } from '../../stores/authStore';
import { useEnvironments } from '../../hooks/queries';
import { setEnvironmentHeader, setOrganizationHeader } from '../../services/api';
import type { Environment } from '../../types';

const EnvSelectScreen: React.FC = () => {
  const theme = useTheme();
  const router = useRouter();
  const { fromSettings } = useLocalSearchParams<{ fromSettings?: string }>();

  const currentOrganization = useAuthStore((s) => s.currentOrganization);
  const switchEnvironment = useAuthStore((s) => s.switchEnvironment);
  const completeLogin = useAuthStore((s) => s.completeLogin);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);

  const { data: environments, isLoading, error } = useEnvironments(
    currentOrganization?.id,
  );

  const handleSelect = useCallback(
    (env: Environment) => {
      console.log('[EnvSelect] Selected env:', env.name, env.id);
      switchEnvironment(env);
      setEnvironmentHeader(env.id);
      // Also re-set org header in case it was cleared
      if (currentOrganization?.id) {
        setOrganizationHeader(currentOrganization.id);
      }
      console.log('[EnvSelect] Headers set — Org:', currentOrganization?.id, 'Env:', env.id);

      if (fromSettings === '1' && isAuthenticated) {
        // Coming from Settings — navigate explicitly to settings tab
        // (router.back() doesn't work reliably between tab groups)
        router.replace('/(main)/settings' as any);
      } else {
        // Initial login flow — complete login and navigate to main
        completeLogin();
        console.log('[EnvSelect] completeLogin called, navigating to main');
        router.replace('/(main)' as any);
      }
    },
    [switchEnvironment, completeLogin, router, fromSettings, isAuthenticated, currentOrganization],
  );

  const handleBack = useCallback(() => {
    if (fromSettings === '1') {
      // Navigate explicitly to settings (back() loses the active tab)
      router.replace('/(main)/settings' as any);
    } else {
      router.back();
    }
  }, [router, fromSettings]);

  const getEnvIcon = (env: Environment) => {
    if (env.isProduction) return 'shield-check';
    if (env.type === 'sandbox') return 'test-tube';
    return 'pencil-ruler';
  };

  const getEnvColor = (env: Environment) => {
    if (env.isProduction) return '#3FB950';
    if (env.type === 'sandbox') return '#D29922';
    return '#58A6FF';
  };

  const renderEnv = useCallback(
    ({ item }: { item: Environment }) => {
      const iconName = getEnvIcon(item);
      const envColor = getEnvColor(item);

      return (
        <TouchableRipple
          onPress={() => handleSelect(item)}
          borderless
          style={[styles.envCard, { backgroundColor: theme.colors.surface }]}
          rippleColor={theme.colors.primaryContainer}
        >
          <View style={styles.envRow}>
            <View
              style={[
                styles.envIcon,
                { backgroundColor: `${envColor}20` },
              ]}
            >
              <Icon name={iconName} size={22} color={envColor} />
            </View>
            <View style={styles.envInfo}>
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.onSurface, fontWeight: '600' }}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <View style={styles.envMeta}>
                <View
                  style={[
                    styles.envBadge,
                    { backgroundColor: `${envColor}25`, borderColor: `${envColor}40`, borderWidth: 1 },
                  ]}
                >
                  <Icon
                    name={item.isProduction ? 'shield-check' : 'test-tube'}
                    size={13}
                    color={envColor}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: envColor,
                      letterSpacing: 0.5,
                    }}
                  >
                    {item.isProduction ? 'PRODUCTION' : item.type?.toUpperCase() ?? 'SANDBOX'}
                  </Text>
                </View>
              </View>
            </View>
            <Icon
              name="chevron-right"
              size={22}
              color={theme.colors.onSurfaceVariant}
            />
          </View>
        </TouchableRipple>
      );
    },
    [handleSelect, theme],
  );

  return (
    <View
      style={[styles.root, { backgroundColor: theme.colors.background }]}
    >
      {/* Back button header */}
      <Appbar.Header style={{ backgroundColor: 'transparent', elevation: 0 }}>
        <Appbar.BackAction onPress={handleBack} />
        <Appbar.Content title="" />
      </Appbar.Header>

      <View style={styles.header}>
        <View
          style={[
            styles.headerIcon,
            { backgroundColor: theme.colors.primaryContainer },
          ]}
        >
          <Icon name="server" size={32} color={theme.colors.primary} />
        </View>
        <Text
          variant="headlineSmall"
          style={[styles.title, { color: theme.colors.onBackground }]}
        >
          Select Environment
        </Text>
        <Text
          variant="bodyMedium"
          style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}
        >
          {currentOrganization?.name ?? 'Organization'} — choose an environment
        </Text>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}
          >
            Loading environments...
          </Text>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Icon name="alert-circle-outline" size={48} color={theme.colors.error} />
          <Text
            variant="bodyMedium"
            style={{ color: theme.colors.error, marginTop: 12 }}
          >
            Failed to load environments
          </Text>
          <Text
            variant="bodySmall"
            style={{ color: theme.colors.onSurfaceVariant, marginTop: 4 }}
          >
            {(error as Error).message}
          </Text>
        </View>
      ) : (
        <FlatList
          data={environments}
          keyExtractor={(item) => item.id}
          renderItem={renderEnv}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  header: {
    alignItems: 'center',
    marginBottom: 28,
    paddingHorizontal: 32,
  },
  headerIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: '700',
    marginBottom: 8,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  envCard: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  envRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  envIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  envInfo: {
    flex: 1,
    marginLeft: 14,
    marginRight: 8,
  },
  envMeta: {
    flexDirection: 'row',
    marginTop: 4,
  },
  envBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
});

export default EnvSelectScreen;
