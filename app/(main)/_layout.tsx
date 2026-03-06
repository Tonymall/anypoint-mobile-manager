import React, { useEffect } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import { Tabs, Redirect } from 'expo-router';
import { useTheme, Text } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hapticLight } from '../../src/utils/haptics';
import { useAuthStore } from '../../src/stores/authStore';
import { useNotificationStore } from '../../src/stores/notificationStore';
import { anypointColors } from '../../src/theme';
import {
  setAuthHeader,
  setOrganizationHeader,
  setEnvironmentHeader,
  getStoredAccessToken,
} from '../../src/services/api';
import logger from '../../src/utils/logger';

// ── Tab definitions (order matters — matches Tabs.Screen order) ──
const TAB_ITEMS: Record<string, { title: string; icon: string; iconFocused?: string }> = {
  index: { title: 'Dashboard', icon: 'view-dashboard-outline', iconFocused: 'view-dashboard' },
  runtime: { title: 'Runtime', icon: 'application-cog-outline', iconFocused: 'application-cog' },
  apis: { title: 'APIs', icon: 'api' },
  alerts: { title: 'Alerts', icon: 'bell-outline', iconFocused: 'bell' },
  monitoring: { title: 'Monitor', icon: 'chart-line-variant', iconFocused: 'chart-line' },
  settings: { title: 'Settings', icon: 'cog-outline', iconFocused: 'cog' },
};

// ── Custom Animated Tab Bar — 2026 Minimal Design ──
function AnimatedTabBar({ state, _descriptors, navigation }: any) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const isPhoneLandscape = screenWidth > screenHeight && Math.min(screenWidth, screenHeight) < 768;
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const visibleRoutes = state.routes.filter(
    (route: any) => TAB_ITEMS[route.name] !== undefined,
  );
  const visibleCount = visibleRoutes.length;
  const tabWidth = screenWidth / visibleCount;

  const activeRoute = state.routes[state.index];
  const activeVisibleIndex = visibleRoutes.findIndex(
    (route: any) => route.key === activeRoute?.key,
  );
  const safeIndex = activeVisibleIndex >= 0 ? activeVisibleIndex : 0;

  const indicatorX = useSharedValue(safeIndex * tabWidth);

  useEffect(() => {
    indicatorX.value = withTiming(safeIndex * tabWidth, {
      duration: 300,
      easing: Easing.bezier(0.33, 0, 0, 1), // iOS-like spring curve
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps -- indicatorX is a Reanimated SharedValue (stable ref)
  }, [safeIndex, tabWidth]);

  const indicatorStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: indicatorX.value }],
    width: tabWidth,
  }));

  const bottomPad = Math.max(insets.bottom, 8);
  const barHeight = isPhoneLandscape ? (40 + bottomPad) : (60 + bottomPad);

  return (
    <View
      style={[
        styles.tabBar,
        {
          height: barHeight,
          paddingBottom: bottomPad,
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.outlineVariant,
        },
      ]}
    >
      {/* Sliding pill indicator */}
      <Animated.View style={[styles.indicator, indicatorStyle]}>
        <View style={[styles.indicatorPill, { backgroundColor: theme.colors.primary + '12' }]} />
      </Animated.View>
      {/* Accent line at top of active tab */}
      <Animated.View style={[styles.topLine, indicatorStyle]}>
        <View style={[styles.topLineDot, { backgroundColor: theme.colors.primary }]} />
      </Animated.View>

      {/* Tab buttons */}
      {visibleRoutes.map((route: any, index: number) => {
        const isFocused = safeIndex === index;
        const tabDef = TAB_ITEMS[route.name];
        const iconName = isFocused
          ? (tabDef?.iconFocused ?? tabDef?.icon ?? 'circle')
          : (tabDef?.icon ?? 'circle');

        const onPress = () => {
          hapticLight();
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            activeOpacity={0.65}
            style={[styles.tabButton, isPhoneLandscape && { paddingTop: 4 }]}
            accessibilityLabel={`${tabDef?.title ?? route.name} tab`}
            accessibilityRole="tab"
            accessibilityState={{ selected: isFocused }}
          >
            <Icon
              name={iconName}
              size={isPhoneLandscape ? 20 : 21}
              color={isFocused ? theme.colors.primary : theme.colors.onSurfaceVariant}
            />
            {route.name === 'alerts' && unreadCount > 0 && (
              <View style={{
                position: 'absolute',
                top: 6,
                right: tabWidth / 2 - 18,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: anypointColors.error,
              }} />
            )}
            {!isPhoneLandscape && (
              <Text
                style={[
                  styles.tabLabel,
                  {
                    color: isFocused ? theme.colors.primary : theme.colors.onSurfaceVariant,
                    fontWeight: isFocused ? '700' : '500',
                    opacity: isFocused ? 1 : 0.7,
                  },
                ]}
                numberOfLines={1}
              >
                {tabDef?.title ?? route.name}
              </Text>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

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
        } else {
          logger.warn('[MainLayout] No token available to set auth header!');
        }
      }
      if (currentOrg?.id) setOrganizationHeader(currentOrg.id);
      if (currentEnv?.id) setEnvironmentHeader(currentEnv.id);
    }

    syncHeaders();
  }, [isAuthenticated, currentOrg?.id, currentEnv?.id, tokens?.accessToken]);

  if (!isAuthenticated) {
    return <Redirect href="/(auth)/login" />;
  }

  return (
    <Tabs
      tabBar={(props) => <AnimatedTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        lazy: true,
        freezeOnBlur: true,
        sceneStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Dashboard' }} />
      <Tabs.Screen name="runtime" options={{ title: 'Runtime' }} />
      <Tabs.Screen name="apis" options={{ title: 'APIs' }} />
      <Tabs.Screen name="alerts" options={{ title: 'Alerts' }} />
      <Tabs.Screen name="monitoring" options={{ title: 'Monitoring' }} />
      <Tabs.Screen name="settings" options={{ title: 'Settings' }} />
      {/* Workers: hidden from tab bar — only accessible via router.push */}
      <Tabs.Screen name="workers" options={{ href: null, title: 'Workers' }} />
      {/* Admin: hidden from tab bar — accessible from Settings screen */}
      <Tabs.Screen name="admin" options={{ href: null, title: 'Admin' }} />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    flexDirection: 'row',
    position: 'relative',
    borderTopWidth: 1,
    elevation: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
  },
  indicator: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    justifyContent: 'center',
    alignItems: 'center',
  },
  indicatorPill: {
    width: '85%',
    height: '100%',
    borderRadius: 16,
  },
  topLine: {
    position: 'absolute',
    top: 0,
    height: 2.5,
    alignItems: 'center',
  },
  topLineDot: {
    width: 20,
    height: 2.5,
    borderBottomLeftRadius: 2,
    borderBottomRightRadius: 2,
  },
  tabButton: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 10,
    minHeight: 44,
  },
  tabLabel: {
    fontSize: 11,
    marginTop: 4,
    letterSpacing: 0.2,
  },
});
