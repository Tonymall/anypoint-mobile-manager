// ============================================================
// Root Layout - App Entry Point
// Provides theme, navigation, and auth-gated routing
// ============================================================

import React, { useEffect, useState } from 'react';
import { useColorScheme } from 'react-native';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { lightTheme, darkTheme } from '../src/theme';
import { useAppStore } from '../src/stores/appStore';
import { useAuthStore } from '../src/stores/authStore';
import { restoreRegion } from '../src/services/api';

export default function RootLayout() {
  const systemScheme = useColorScheme();
  const themeSetting = useAppStore((s) => s.settings.theme);
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const [ready, setReady] = useState(false);

  // Determine active theme
  const isDark =
    themeSetting === 'dark' || (themeSetting === 'system' && systemScheme === 'dark');
  const theme = isDark ? darkTheme : lightTheme;

  // Restore persisted region on startup
  useEffect(() => {
    restoreRegion().finally(() => setReady(true));
  }, []);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <Stack screenOptions={{ headerShown: false }}>
          {isAuthenticated ? (
            <Stack.Screen name="(main)" />
          ) : (
            <Stack.Screen name="(auth)" />
          )}
        </Stack>
      </PaperProvider>
    </SafeAreaProvider>
  );
}
