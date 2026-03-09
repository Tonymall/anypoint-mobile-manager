import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, useColorScheme, View } from 'react-native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ExpoSplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { lightTheme, darkTheme } from '../src/theme';
import { useAppStore } from '../src/stores/appStore';
import { useAuthStore } from '../src/stores/authStore';
import { useNotificationStore } from '../src/stores/notificationStore';
import { useRemoteConfigStore } from '../src/stores/remoteConfigStore';
import {
  restoreRegion,
  setOrganizationHeader,
  setEnvironmentHeader,
  getStoredAccessToken,
  clearTokens,
} from '../src/services/api';
import {
  fetchAlertHistory,
  fetchMobileRemoteConfig,
  getAppVersion,
  mapBackendAlertToNotification,
} from '../src/services/backendService';
import { QueryProvider } from '../src/providers/QueryProvider';
import SplashScreen from '../src/components/common/SplashScreen';
import ErrorBoundary from '../src/components/common/ErrorBoundary';
import AppErrorDialog from '../src/components/common/AppErrorDialog';
import UpdateRequiredScreen from '../src/components/common/UpdateRequiredScreen';
import { setupNotificationChannel } from '../src/services/notificationService';
import { isVersionBelowMinimum } from '../src/utils/version';
import logger from '../src/utils/logger';

ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const themeSetting = useAppStore((s) => s.settings.theme);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const userId = useAuthStore((s) => s.user?.id);
  const replaceNotificationsForActiveUser = useNotificationStore((s) => s.replaceNotificationsForActiveUser);
  const remoteConfig = useRemoteConfigStore((s) => s.config);
  const updateRequired = useRemoteConfigStore((s) => s.updateRequired);
  const setRemoteConfig = useRemoteConfigStore((s) => s.setConfig);
  const setConfigLoading = useRemoteConfigStore((s) => s.setLoading);
  const setUpdateRequired = useRemoteConfigStore((s) => s.setUpdateRequired);
  const [ready, setReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const appVersion = useMemo(() => getAppVersion(), []);

  const isDark =
    themeSetting === 'dark' || (themeSetting === 'system' && systemScheme === 'dark');
  const theme = isDark ? darkTheme : lightTheme;

  useEffect(() => {
    async function restore() {
      const hasHydrated = useAuthStore.persist?.hasHydrated?.();
      if (!hasHydrated) {
        await new Promise<void>((resolve) => {
          const unsub = useAuthStore.persist.onFinishHydration(() => {
            unsub();
            resolve();
          });
          if (useAuthStore.persist.hasHydrated()) {
            unsub();
            resolve();
          }
        });
      }

      await AsyncStorage.multiRemove([
        'anypoint-auth-storage',
        'anypoint-auth-v2',
      ]).catch(() => {});

      await restoreRegion();
      const token = await getStoredAccessToken();
      const state = useAuthStore.getState();

      if (!token) {
        if (state.isAuthenticated) {
          state.logout();
        }
      } else if (!state.isAuthenticated && !state.user) {
        await clearTokens();
      } else if (state.isAuthenticated) {
        if (state.currentOrganization) {
          setOrganizationHeader(state.currentOrganization.id);
        }
        if (state.currentEnvironment) {
          setEnvironmentHeader(state.currentEnvironment.id);
        }
      }

      setReady(true);
      await ExpoSplashScreen.hideAsync().catch(() => {});
    }

    void restore();
  }, []);

  useEffect(() => {
    void setupNotificationChannel();
  }, []);

  const syncRemoteConfig = useCallback(async () => {
    try {
      setConfigLoading(true);
      const config = await fetchMobileRemoteConfig();
      const minimumSupportedVersion = config?.minimumSupportedVersion ?? null;
      setRemoteConfig(config);
      if (minimumSupportedVersion) {
        setUpdateRequired(isVersionBelowMinimum(appVersion, minimumSupportedVersion));
      } else {
        setUpdateRequired(false);
      }
    } catch (error) {
      logger.warn('[RootLayout] Failed to load remote config:', (error as Error)?.message);
      setConfigLoading(false);
    }
  }, [appVersion, setConfigLoading, setRemoteConfig, setUpdateRequired]);

  const syncAlertHistory = useCallback(async () => {
    if (!isAuthenticated || !userId || remoteConfig?.alertSyncEnabled === false) {
      return;
    }

    try {
      const events = await fetchAlertHistory(150);
      replaceNotificationsForActiveUser(events.map(mapBackendAlertToNotification));
    } catch (error) {
      logger.warn('[RootLayout] Failed to reconcile alert history:', (error as Error)?.message);
    }
  }, [isAuthenticated, remoteConfig?.alertSyncEnabled, replaceNotificationsForActiveUser, userId]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    void syncRemoteConfig();
  }, [ready, syncRemoteConfig]);

  useEffect(() => {
    if (!ready) {
      return;
    }
    void syncAlertHistory();
  }, [ready, syncAlertHistory]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState === 'active') {
        void syncRemoteConfig();
        void syncAlertHistory();
      }
    });

    return () => {
      subscription.remove();
    };
  }, [syncAlertHistory, syncRemoteConfig]);

  const handleSplashFinish = useCallback(() => {
    setSplashDone(true);
  }, []);

  if (!ready) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryProvider>
          <PaperProvider theme={theme}>
            <StatusBar style={isDark ? 'light' : 'dark'} />
            <AppErrorDialog />
            <ErrorBoundary>
              <View style={{ flex: 1 }}>
                {updateRequired && remoteConfig?.minimumSupportedVersion ? (
                  <UpdateRequiredScreen
                    currentVersion={appVersion}
                    minimumVersion={remoteConfig.minimumSupportedVersion}
                    onRetry={() => {
                      void syncRemoteConfig();
                    }}
                  />
                ) : (
                  <Slot />
                )}
                {!splashDone && <SplashScreen onFinish={handleSplashFinish} />}
              </View>
            </ErrorBoundary>
          </PaperProvider>
        </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
