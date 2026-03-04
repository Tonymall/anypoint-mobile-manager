// ============================================================
// Root Layout - App Entry Point
// Provides theme, navigation, and data layer
// ============================================================

import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Slot } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

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

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const themeSetting = useAppStore((s) => s.settings.theme);
  const [ready, setReady] = useState(false);

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
      } else if (!state.isAuthenticated) {
        // Token exists but user is not authenticated (previous session expired)
        // Clear stale tokens so they don't get attached to login requests
        await clearTokens();
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
    }
    restore();
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <QueryProvider>
        <PaperProvider theme={theme}>
          <StatusBar style={isDark ? 'light' : 'dark'} />
          <Slot />
        </PaperProvider>
      </QueryProvider>
    </SafeAreaProvider>
  );
}
