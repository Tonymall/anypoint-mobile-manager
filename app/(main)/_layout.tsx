import React, { useCallback, useEffect, useMemo } from 'react';
import { PanResponder, View } from 'react-native';
import { Tabs, Redirect, useRouter, useSegments } from 'expo-router';
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
const SWIPE_TAB_ORDER = ['index', 'runtime', 'apis', 'alerts', 'monitoring', 'settings'] as const;
const HIDDEN_TAB_PARENTS: Record<string, (typeof SWIPE_TAB_ORDER)[number]> = {
  admin: 'settings',
  'report-bug': 'settings',
  terms: 'settings',
  workers: 'runtime',
};

export default function MainLayout() {
  const theme = useTheme();
  const router = useRouter();
  const segments = useSegments();
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

  const activeTabName = useMemo<(typeof SWIPE_TAB_ORDER)[number]>(() => {
    const currentSegment = segments[1] ?? 'index';
    if ((SWIPE_TAB_ORDER as readonly string[]).includes(currentSegment)) {
      return currentSegment as (typeof SWIPE_TAB_ORDER)[number];
    }
    return HIDDEN_TAB_PARENTS[currentSegment] ?? 'index';
  }, [segments]);

  const handleTabSwipe = useCallback((direction: 'next' | 'previous') => {
    const currentIndex = SWIPE_TAB_ORDER.indexOf(activeTabName);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'next' ? currentIndex + 1 : currentIndex - 1;
    if (targetIndex < 0 || targetIndex >= SWIPE_TAB_ORDER.length) return;

    const targetRoute = SWIPE_TAB_ORDER[targetIndex];
    const targetHref = targetRoute === 'index' ? '/(main)' : `/(main)/${targetRoute}`;
    router.navigate(targetHref as any);
  }, [activeTabName, router]);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) =>
          Math.abs(gestureState.dx) > Math.abs(gestureState.dy) * 1.25
          && Math.abs(gestureState.dx) > 18,
        onPanResponderRelease: (_, gestureState) => {
          const { dx, dy, vx } = gestureState;
          const isHorizontal = Math.abs(dx) > Math.abs(dy) * 1.25;
          const crossedThreshold = Math.abs(dx) > 72 || Math.abs(vx) > 0.75;
          if (!isHorizontal || !crossedThreshold) return;
          if (dx < 0) {
            handleTabSwipe('next');
          } else {
            handleTabSwipe('previous');
          }
        },
      }),
    [handleTabSwipe],
  );

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <View style={{ flex: 1 }} collapsable={false} {...panResponder.panHandlers}>
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
    </View>
  );
}
