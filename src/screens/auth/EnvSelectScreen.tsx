// ============================================================
// Environment Selection Screen - 2026 Modern Design
// ============================================================

import React, { useCallback } from 'react';
import { StyleSheet, View, FlatList } from 'react-native';
import {
  Text,
  useTheme,
  ActivityIndicator,
  TouchableRipple,
  Appbar,
} from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useRouter, useLocalSearchParams } from 'expo-router';

import { useAuthStore } from '../../stores/authStore';
import { useEnvironments } from '../../hooks/queries';
import { setEnvironmentHeader, setOrganizationHeader } from '../../services/api';
import type { Environment } from '../../types';
import { hapticLight } from '../../utils/haptics';
import { anypointColors } from '../../theme';

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
      hapticLight();
      console.log('[EnvSelect] Selected env:', env.name, env.id);
      switchEnvironment(env);
      setEnvironmentHeader(env.id);
      if (currentOrganization?.id) {
        setOrganizationHeader(currentOrganization.id);
      }
      console.log('[EnvSelect] Headers set — Org:', currentOrganization?.id, 'Env:', env.id);

      if (fromSettings === '1' && isAuthenticated) {
        router.replace('/(main)/settings' as any);
      } else {
        completeLogin();
        console.log('[EnvSelect] completeLogin called, navigating to main');
        router.replace('/(main)' as any);
      }
    },
    [switchEnvironment, completeLogin, router, fromSettings, isAuthenticated, currentOrganization],
  );

  const handleBack = useCallback(() => {
    if (fromSettings === '1') {
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
    if (env.isProduction) return anypointColors.success;
    if (env.type === 'sandbox') return anypointColors.warning;
    return anypointColors.info;
  };

  const renderEnv = useCallback(
    ({ item }: { item: Environment }) => {
      const iconName = getEnvIcon(item);
      const envColor = getEnvColor(item);

      return (
        <TouchableRipple
          onPress={() => handleSelect(item)}
          borderless
          style={[styles.envCard, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}
          rippleColor={theme.colors.primaryContainer}
          accessibilityLabel={`Environment: ${item.name}, ${item.isProduction ? 'production' : item.type ?? 'sandbox'}`}
          accessibilityRole="button"
          accessibilityHint="Double tap to select"
        >
          <View style={styles.envRow}>
            <View
              style={[
                styles.envIcon,
                { backgroundColor: `${envColor}14` },
              ]}
            >
              <Icon name={iconName} size={20} color={envColor} />
            </View>
            <View style={styles.envInfo}>
              <Text
                variant="titleMedium"
                style={{ color: theme.colors.onSurface, fontWeight: '600', letterSpacing: -0.2 }}
                numberOfLines={1}
              >
                {item.name}
              </Text>
              <View style={styles.envMeta}>
                <View
                  style={[
                    styles.envBadge,
                    { backgroundColor: `${envColor}14`, borderColor: `${envColor}30`, borderWidth: 1 },
                  ]}
                >
                  <Icon
                    name={item.isProduction ? 'shield-check' : 'test-tube'}
                    size={12}
                    color={envColor}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: envColor,
                      letterSpacing: 0.6,
                    }}
                  >
                    {item.isProduction ? 'PRODUCTION' : item.type?.toUpperCase() ?? 'SANDBOX'}
                  </Text>
                </View>
              </View>
            </View>
            <View style={[styles.chevronCircle, { backgroundColor: theme.colors.surfaceVariant }]}>
              <Icon name="chevron-right" size={18} color={theme.colors.onSurfaceVariant} />
            </View>
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
            { backgroundColor: theme.colors.primary + '14' },
          ]}
        >
          <Icon name="server" size={30} color={theme.colors.primary} />
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
          <View style={[styles.loadingBox, { backgroundColor: theme.colors.surface, borderColor: theme.colors.outlineVariant }]}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.onSurfaceVariant, marginTop: 16 }}
            >
              Loading environments...
            </Text>
          </View>
        </View>
      ) : error ? (
        <View style={styles.center}>
          <View style={[styles.errorBox, { backgroundColor: theme.colors.errorContainer + '30' }]}>
            <Icon name="alert-circle-outline" size={40} color={theme.colors.error} />
            <Text
              variant="bodyMedium"
              style={{ color: theme.colors.error, marginTop: 12 }}
            >
              Failed to load environments
            </Text>
            <Text
              variant="bodySmall"
              style={{ color: theme.colors.onSurfaceVariant, marginTop: 4, textAlign: 'center' }}
            >
              {(error as Error).message}
            </Text>
          </View>
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
    width: 68,
    height: 68,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: -0.3,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  loadingBox: {
    padding: 32,
    borderRadius: 20,
    alignItems: 'center',
    borderWidth: 1,
    width: '100%',
    maxWidth: 320,
  },
  errorBox: {
    padding: 28,
    borderRadius: 20,
    alignItems: 'center',
    width: '100%',
    maxWidth: 360,
  },
  list: {
    paddingHorizontal: 20,
    paddingBottom: 32,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  envCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
  },
  envRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  envIcon: {
    width: 44,
    height: 44,
    borderRadius: 13,
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
    marginTop: 5,
  },
  envBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
  },
  chevronCircle: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
});

export default EnvSelectScreen;
