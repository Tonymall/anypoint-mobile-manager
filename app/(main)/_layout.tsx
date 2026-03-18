import React, { useEffect } from 'react';
import { Tabs, Redirect } from 'expo-router';
import { useTheme } from 'react-native-paper';

import FloatingTabBar from '../../src/components/navigation/FloatingTabBar';
import { useAuthStore } from '../../src/stores/authStore';
import {
  getStoredAccessToken,
  isSessionAuthEnabled,
  setAuthHeader,
  setEnvironmentHeader,
  setOrganizationHeader,
} from '../../src/services/api';
import logger from '../../src/utils/logger';

const FLOATING_TAB_SCENE_PADDING = 110;

export default function MainLayout() {
  const theme = useTheme();
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const currentOrg = useAuthStore((s) => s.currentOrganization);
  const currentEnv = useAuthStore((s) => s.currentEnvironment);
  const tokens = useAuthStore((s) => s.tokens);

  useEffect(() => {
    if (!isAuthenticated) return;

    async function syncHeaders() {
      if (tokens?.accessToken) {
        setAuthHeader(tokens.accessToken);
      } else {
        const storedToken = await getStoredAccessToken();
        if (storedToken) {
          setAuthHeader(storedToken);
        } else if (!isSessionAuthEnabled()) {
          logger.warn('[MainLayout] No token available to set auth header!');
        }
      }

      if (currentOrg?.id) setOrganizationHeader(currentOrg.id);
      if (currentEnv?.id) setEnvironmentHeader(currentEnv.id);
    }

    syncHeaders();
  }, [isAuthenticated, currentEnv?.id, currentOrg?.id, tokens?.accessToken]);

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      tabBar={(props) => <FloatingTabBar {...props} />}
      detachInactiveScreens
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
        animation: 'none',
        sceneStyle: {
          backgroundColor: theme.colors.background,
          paddingBottom: FLOATING_TAB_SCENE_PADDING,
        },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home' }} />
      <Tabs.Screen name="runtime" options={{ title: 'Runtime' }} />
      <Tabs.Screen name="apis" options={{ title: 'APIs' }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts' }} />
      <Tabs.Screen name="monitoring" options={{ title: 'Monitoring' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      <Tabs.Screen name="workers" options={{ href: null, title: 'Workers' }} />
      <Tabs.Screen name="admin" options={{ href: null, title: 'Admin' }} />
      <Tabs.Screen name="report-bug" options={{ href: null, title: 'Report a Bug' }} />
      <Tabs.Screen name="terms" options={{ href: null, title: 'Terms' }} />
    </Tabs>
  );
}
