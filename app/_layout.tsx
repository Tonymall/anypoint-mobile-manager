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
      } else if (!state.isAuthenticated && !state.user) {
        // Token exists but NO user in state — truly stale session from a
        // previous app launch. Clear the token so it doesn't get attached
        // to a new login request.
        //
        // IMPORTANT: If state.user IS set but isAuthenticated is false, this
        // is the "pending" login state (loginPending was called during the
        // current org/env selection flow). Do NOT clear the fresh token!
        await clearTokens();
      } else if (!state.isAuthenticated && state.user) {
        // "Pending" login state — user just logged in and is selecting
        // org/env. Token is fresh and valid. Don't touch it.
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
