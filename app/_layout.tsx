import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, Platform, useColorScheme, View } from 'react-native';
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
  setAuthHeader,
  setOrganizationHeader,
  setEnvironmentHeader,
  getStoredAccessToken,
  clearTokens,
} from '../src/services/api';
import * as authService from '../src/services/authService';
import {
  fetchAlertHistory,
  fetchMobileRemoteConfig,
  getAppVersion,
  mapBackendAlertToNotification,
  registerPushDevice,
  unregisterPushDevice,
} from '../src/services/backendService';
import { QueryProvider } from '../src/providers/QueryProvider';
import SplashScreen from '../src/components/common/SplashScreen';
import ErrorBoundary from '../src/components/common/ErrorBoundary';
import AppErrorDialog from '../src/components/common/AppErrorDialog';
import UpdateRequiredScreen from '../src/components/common/UpdateRequiredScreen';
import {
  getRemotePushRegistration,
  setupNotificationChannel,
} from '../src/services/notificationService';
import { isVersionBelowMinimum } from '../src/utils/version';
import logger from '../src/utils/logger';

ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const themeSetting = useAppStore((s) => s.settings.theme);
  const pushNotificationsEnabled = useAppStore((s) => s.settings.pushNotificationsEnabled);
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
  const pushRegistrationRef = useRef<{ userId: string; installationId: string } | null>(null);

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

      if (!state.rememberSession) {
        if (token) {
          await clearTokens();
        }
        if (state.isAuthenticated || state.user) {
          state.logout();
        }
      } else if (!token) {
        if (state.isAuthenticated || state.user) {
          state.logout();
        }
      } else if (!state.isAuthenticated || !state.user) {
        await clearTokens();
        state.logout();
      } else {
        try {
          setAuthHeader(token);
          const restoredUser = await authService.getCurrentUser(token);
          state.setUser(restoredUser);

          if (state.currentOrganization) {
            setOrganizationHeader(state.currentOrganization.id);
          }
          if (state.currentEnvironment) {
            setEnvironmentHeader(state.currentEnvironment.id);
          }
        } catch (error: any) {
          logger.warn('[RootLayout] Stored session restore failed:', error?.message);
          await clearTokens();
          state.logout();
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

  useEffect(() => {
    if (!ready) {
      return;
    }

    let cancelled = false;

    async function syncPushRegistration() {
      const previous = pushRegistrationRef.current;

      if (!isAuthenticated || !userId || !pushNotificationsEnabled) {
        if (previous) {
          pushRegistrationRef.current = null;
          try {
            await unregisterPushDevice(previous.userId, previous.installationId);
          } catch (error) {
            logger.warn('[RootLayout] Failed to unregister push device:', (error as Error)?.message);
          }
        }
        return;
      }

      const registration = await getRemotePushRegistration();
      if (cancelled) {
        return;
      }

      if (!registration) {
        if (previous?.userId === userId) {
          pushRegistrationRef.current = null;
          try {
            await unregisterPushDevice(previous.userId, previous.installationId);
          } catch (error) {
            logger.warn('[RootLayout] Failed to unregister push device after token loss:', (error as Error)?.message);
          }
        }
        return;
      }

      if (
        previous &&
        (previous.userId !== userId || previous.installationId !== registration.installationId)
      ) {
        try {
          await unregisterPushDevice(previous.userId, previous.installationId);
        } catch (error) {
          logger.warn('[RootLayout] Failed to unregister previous push device:', (error as Error)?.message);
        }
      }

      try {
        await registerPushDevice({
          userId,
          installationId: registration.installationId,
          expoPushToken: registration.expoPushToken,
          platform: Platform.OS,
          appVersion,
        });
        pushRegistrationRef.current = {
          userId,
          installationId: registration.installationId,
        };
      } catch (error) {
        logger.warn('[RootLayout] Failed to register push device:', (error as Error)?.message);
      }
    }

    void syncPushRegistration();

    return () => {
      cancelled = true;
    };
  }, [appVersion, isAuthenticated, pushNotificationsEnabled, ready, userId]);

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
