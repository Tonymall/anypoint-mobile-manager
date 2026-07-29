import React, { memo, useEffect, useMemo } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { Tabs } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Text, useTheme, type MD3Theme } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hapticSelection } from '../../utils/haptics';
import { useNotificationStore } from '../../stores/notificationStore';
import type { IconName } from '../../types/icons';

const ACTIVE_COLOR = '#31C1FF';

const TAB_ITEMS: Record<string, { title: string; icon: IconName; iconFocused?: IconName }> = {
  index: { title: 'Home', icon: 'home-variant-outline', iconFocused: 'home-variant' },
  runtime: { title: 'Runtime', icon: 'application-cog-outline', iconFocused: 'application-cog' },
  apis: { title: 'APIs', icon: 'api' },
  alerts: { title: 'Alerts', icon: 'bell-outline', iconFocused: 'bell' },
  monitoring: { title: 'Monitor', icon: 'chart-line-variant', iconFocused: 'chart-line' },
  settings: { title: 'Settings', icon: 'cog-outline', iconFocused: 'cog' },
};

const HIDDEN_TAB_PARENTS: Record<string, keyof typeof TAB_ITEMS> = {
  admin: 'settings',
  'report-bug': 'settings',
  terms: 'settings',
  workers: 'runtime',
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const FloatingTabItem = memo(function FloatingTabItem({
  route,
  isFocused,
  onPress,
  unreadCount,
  theme,
}: {
  route: any;
  isFocused: boolean;
  onPress: () => void;
  unreadCount: number;
  theme: MD3Theme;
}) {
  const scale = useSharedValue(isFocused ? 1 : 0.94);
  const glow = useSharedValue(isFocused ? 1 : 0);
  const tabDef = TAB_ITEMS[route.name];

  useEffect(() => {
    scale.value = withTiming(isFocused ? 1 : 0.94, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
    glow.value = withTiming(isFocused ? 1 : 0, {
      duration: 220,
      easing: Easing.out(Easing.cubic),
    });
  }, [glow, isFocused, scale]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  const glowStyle = useAnimatedStyle(() => ({
    opacity: glow.value,
    transform: [{ scaleX: interpolate(glow.value, [0, 1], [0.5, 1]) }],
  }));

  const iconName = isFocused
    ? (tabDef?.iconFocused ?? tabDef?.icon ?? 'circle')
    : (tabDef?.icon ?? 'circle');
  const inactiveColor = theme.dark ? 'rgba(255,255,255,0.56)' : 'rgba(17,24,39,0.48)';
  const haloColor = theme.dark ? 'rgba(49,193,255,0.12)' : 'rgba(49,193,255,0.16)';

  return (
    <AnimatedPressable
      onPress={onPress}
      style={[styles.tabButton, animatedStyle]}
      accessibilityLabel={`${tabDef?.title ?? route.name} tab`}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
    >
      <View style={styles.iconWrap}>
        <Animated.View style={[styles.activeHalo, { backgroundColor: haloColor }, glowStyle]} />
        <MaterialCommunityIcons
          name={iconName}
          size={22}
          color={isFocused ? ACTIVE_COLOR : inactiveColor}
        />
        {route.name === 'alerts' && unreadCount > 0 && (
          <View style={styles.badgeDot} />
        )}
      </View>
      <Text
        numberOfLines={1}
        style={[
          styles.tabLabel,
          {
            color: isFocused ? ACTIVE_COLOR : inactiveColor,
            fontWeight: isFocused ? '700' : '500',
          },
        ]}
      >
        {tabDef?.title ?? route.name}
      </Text>
      <Animated.View style={[styles.activeUnderline, glowStyle]} />
    </AnimatedPressable>
  );
});

type TabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

export default function FloatingTabBar({ state, navigation }: TabBarProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const unreadCount = useNotificationStore((s) => s.unreadCount);

  const visibleRoutes = useMemo(
    () => state.routes.filter((route) => TAB_ITEMS[route.name] !== undefined),
    [state.routes],
  );

  const activeRoute = state.routes[state.index];
  const activeTabName = TAB_ITEMS[activeRoute?.name]
    ? activeRoute.name
    : (HIDDEN_TAB_PARENTS[activeRoute?.name] ?? 'index');

  const barWidth = Math.min(screenWidth * 0.9, 760);
  const bottomOffset = Math.max(insets.bottom, 10);
  const shellGradient: [string, string] = theme.dark
    ? ['rgba(5,8,22,0.96)', 'rgba(10,23,48,0.98)']
    : ['rgba(248,251,255,0.96)', 'rgba(234,242,252,0.98)'];
  const borderColor = theme.dark ? 'rgba(94,168,255,0.12)' : 'rgba(49,193,255,0.16)';
  const glassColor = theme.dark ? 'rgba(255,255,255,0.015)' : 'rgba(255,255,255,0.42)';

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: bottomOffset }]}>
      <LinearGradient
        colors={shellGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[
          styles.gradientShell,
          {
            width: barWidth,
            borderColor,
            shadowColor: theme.dark ? '#02101f' : '#03162c',
          },
        ]}
      >
        <View style={[styles.innerGlass, { backgroundColor: glassColor }]}>
          {visibleRoutes.map((route) => {
            const isFocused = route.name === activeTabName;

            const handlePress = () => {
              const event = navigation.emit({
                type: 'tabPress',
                target: route.key,
                canPreventDefault: true,
              });

              if (!isFocused && !event.defaultPrevented) {
                const jumpTo = (navigation as TabBarProps['navigation'] & { jumpTo?: (name: string) => void }).jumpTo;
                if (jumpTo) {
                  jumpTo(route.name);
                } else {
                  navigation.navigate(route.name);
                }
                hapticSelection();
              }
            };

            return (
              <FloatingTabItem
                key={route.key}
                route={route}
                isFocused={isFocused}
                onPress={handlePress}
                unreadCount={unreadCount}
                theme={theme}
              />
            );
          })}
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  gradientShell: {
    height: 72,
    borderRadius: 34,
    borderWidth: 1,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.28,
    shadowRadius: 26,
    elevation: 18,
  },
  innerGlass: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    backgroundColor: 'rgba(255,255,255,0.015)',
  },
  tabButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
    paddingVertical: 10,
    borderRadius: 26,
  },
  iconWrap: {
    minHeight: 28,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 4,
  },
  activeHalo: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(49,193,255,0.12)',
    shadowColor: ACTIVE_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.28,
    shadowRadius: 12,
  },
  activeUnderline: {
    width: 24,
    height: 3,
    borderRadius: 999,
    backgroundColor: ACTIVE_COLOR,
    marginTop: 2,
    shadowColor: ACTIVE_COLOR,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 10,
  },
  tabLabel: {
    fontSize: 10.5,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  badgeDot: {
    position: 'absolute',
    top: 0,
    right: -2,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FF5C7A',
  },
});
