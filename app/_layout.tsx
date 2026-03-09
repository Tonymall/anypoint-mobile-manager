// ============================================================
// Root Layout - App Entry Point
// Provides theme, navigation, data layer, and splash screen
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { useColorScheme, View } from 'react-native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import * as ExpoSplashScreen from 'expo-splash-screen';

import { lightTheme, darkTheme } from '../src/theme';
import { useAppStore } from '../src/stores/appStore';
import { useAuthStore } from '../src/stores/authStore';
import {
  restoreRegion,
  setOrganizationHeader,
  setEnvironmentHeader,
  getStoredAccessToken,
  clearTokens,
} from '../src/services/api';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryProvider } from '../src/providers/QueryProvider';
import SplashScreen from '../src/components/common/SplashScreen';
import ErrorBoundary from '../src/components/common/ErrorBoundary';
import AppErrorDialog from '../src/components/common/AppErrorDialog';
import { setupNotificationChannel } from '../src/services/notificationService';

// Keep the native splash screen visible while we load
ExpoSplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const themeSetting = useAppStore((s) => s.settings.theme);
  const [ready, setReady] = useState(false);
  const [splashDone, setSplashDone] = useState(false);

  // Determine active theme
  const isDark =
    themeSetting === 'dark' || (themeSetting === 'system' && systemScheme === 'dark');
  const theme = isDark ? darkTheme : lightTheme;

  // Wait for Zustand hydration + validate token on startup
  useEffect(() => {
    async function restore() {
      // Wait for Zustand persist to finish rehydrating
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

      // Remove old stale storage keys
      await AsyncStorage.multiRemove([
        'anypoint-auth-storage',
        'anypoint-auth-v2',
      ]).catch(() => {});

      await restoreRegion();
      const token = await getStoredAccessToken();
      const state = useAuthStore.getState();

      if (!token) {
        // No token stored — ensure clean state
        if (state.isAuthenticated) {
          state.logout();
        }
      } else if (!state.isAuthenticated && !state.user) {
        await clearTokens();
      } else if (!state.isAuthenticated && state.user) {
        // "Pending" login state — don't touch token
      } else {
        // Authenticated with valid token — restore headers
        if (state.currentOrganization) {
          setOrganizationHeader(state.currentOrganization.id);
        }
        if (state.currentEnvironment) {
          setEnvironmentHeader(state.currentEnvironment.id);
        }
      }
      setReady(true);
      // Hide the native splash once app data is ready
      await ExpoSplashScreen.hideAsync().catch(() => {});
    }
    restore();
  }, []);

  // Set up Android notification channel on startup (no permission prompt).
  // Permission is requested later from Settings when user enables push notifications.
  useEffect(() => {
    setupNotificationChannel();
  }, []);

  const handleSplashFinish = useCallback(() => {
    setSplashDone(true);
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
      <QueryProvider>
        <PaperProvider theme={theme}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <AppErrorDialog />
          <ErrorBoundary>
            <View style={{ flex: 1 }}>
              <Slot />
              {/* Custom animated splash overlay — fades out after 1.5s */}
              {!splashDone && <SplashScreen onFinish={handleSplashFinish} />}
            </View>
          </ErrorBoundary>
        </PaperProvider>
      </QueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
