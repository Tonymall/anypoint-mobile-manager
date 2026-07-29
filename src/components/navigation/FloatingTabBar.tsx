// ═══════════════════════════════════════════════════════════════════
// Floating tab bar
// ═══════════════════════════════════════════════════════════════════
// A single sliding pill marks the active tab, rather than the halo +
// underline pair that previously signalled it twice. The pill is the
// only moving part: it springs between tabs while the icon and label
// crossfade, which reads as one gesture instead of several.
//
// Colours come from the design tokens, so the bar follows the scheme
// instead of pinning itself to a dark background. The shell uses the
// translucent `surface.overlay` role rather than a real blur: expo-blur
// is a native module and adding it would require rebuilding the dev
// client, so that upgrade is deliberately deferred.
// ═══════════════════════════════════════════════════════════════════

import React, { memo, useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import type { Tabs } from 'expo-router';
import { Text } from 'react-native-paper';
import MaterialCommunityIcons from '@expo/vector-icons/MaterialCommunityIcons';
import Animated, {
  interpolate,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { hapticSelection } from '../../utils/haptics';
import { useNotificationStore } from '../../stores/notificationStore';
import { radii, spacing, typeScale, useTokens, withAlpha, type Tokens } from '../../theme';
import type { IconName } from '../../types/icons';

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

const BAR_HEIGHT = 64;
const PILL_INSET = 4;

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const TabItem = memo(function TabItem({
  routeName,
  isFocused,
  onPress,
  unreadCount,
  t,
}: {
  routeName: string;
  isFocused: boolean;
  onPress: () => void;
  unreadCount: number;
  t: Tokens;
}) {
  const tabDef = TAB_ITEMS[routeName];
  const focus = useSharedValue(isFocused ? 1 : 0);

  useEffect(() => {
    focus.value = withTiming(isFocused ? 1 : 0, { duration: t.motion.duration.quick });
  }, [focus, isFocused, t.motion.duration.quick]);

  const iconStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: interpolate(focus.value, [0, 1], [0, -1]) }],
  }));

  const iconName = isFocused
    ? (tabDef?.iconFocused ?? tabDef?.icon ?? 'circle')
    : (tabDef?.icon ?? 'circle');

  const color = isFocused ? t.color.text.accent : t.color.text.tertiary;

  return (
    <AnimatedPressable
      onPress={onPress}
      style={styles.tab}
      accessibilityLabel={`${tabDef?.title ?? routeName} tab`}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
    >
      <Animated.View style={[styles.iconWrap, iconStyle]}>
        <MaterialCommunityIcons name={iconName} size={22} color={color} />
        {routeName === 'alerts' && unreadCount > 0 ? (
          <View
            style={[
              styles.badge,
              {
                backgroundColor: t.color.status.danger.base,
                borderColor: t.color.surface.canvas,
              },
            ]}
          />
        ) : null}
      </Animated.View>
      <Text
        numberOfLines={1}
        style={[
          typeScale.micro,
          styles.label,
          { color, fontWeight: isFocused ? '700' : '500' },
        ]}
      >
        {tabDef?.title ?? routeName}
      </Text>
    </AnimatedPressable>
  );
});

type TabBarProps = Parameters<
  NonNullable<React.ComponentProps<typeof Tabs>['tabBar']>
>[0];

export default function FloatingTabBar({ state, navigation }: TabBarProps) {
  const t = useTokens();
  const insets = useSafeAreaInsets();
  const { width: screenWidth } = useWindowDimensions();
  const unreadCount = useNotificationStore((s) => s.unreadCount);
  const [barWidth, setBarWidth] = useState(0);

  const visibleRoutes = useMemo(
    () => state.routes.filter((route) => TAB_ITEMS[route.name] !== undefined),
    [state.routes],
  );

  const activeRoute = state.routes[state.index];
  const activeTabName = TAB_ITEMS[activeRoute?.name]
    ? activeRoute.name
    : (HIDDEN_TAB_PARENTS[activeRoute?.name] ?? 'index');

  const activeIndex = Math.max(
    0,
    visibleRoutes.findIndex((route) => route.name === activeTabName),
  );

  const shellWidth = Math.min(screenWidth - spacing.lg * 2, 560);
  const bottomOffset = Math.max(insets.bottom, spacing.md);

  // The pill tracks the active tab. Springing a single indicator reads as
  // one continuous motion; the previous halo-plus-underline pair signalled
  // the same thing twice and neither moved.
  const slot = useDerivedValue(() => {
    const inner = barWidth - PILL_INSET * 2;
    const width = visibleRoutes.length > 0 ? inner / visibleRoutes.length : 0;
    return { width, x: PILL_INSET + width * activeIndex };
  }, [barWidth, visibleRoutes.length, activeIndex]);

  const pillStyle = useAnimatedStyle(() => ({
    width: slot.value.width,
    transform: [{ translateX: withSpring(slot.value.x, t.motion.spring) }],
    opacity: slot.value.width > 0 ? 1 : 0,
  }));

  const handlePress = useCallback(
    (routeName: string, routeKey: string, isFocused: boolean) => {
      const event = navigation.emit({
        type: 'tabPress',
        target: routeKey,
        canPreventDefault: true,
      });

      if (!isFocused && !event.defaultPrevented) {
        const jumpTo = (
          navigation as TabBarProps['navigation'] & { jumpTo?: (name: string) => void }
        ).jumpTo;
        if (jumpTo) {
          jumpTo(routeName);
        } else {
          navigation.navigate(routeName);
        }
        hapticSelection();
      }
    },
    [navigation],
  );

  return (
    <View pointerEvents="box-none" style={[styles.wrapper, { bottom: bottomOffset }]}>
      <View
        onLayout={(e) => setBarWidth(e.nativeEvent.layout.width)}
        style={[
          styles.shell,
          {
            width: shellWidth,
            borderColor: t.color.border.subtle,
            shadowColor: t.color.shadow,
            backgroundColor: t.color.surface.overlay,
          },
        ]}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pill,
            pillStyle,
            {
              backgroundColor: withAlpha(t.color.text.accent, 'subtle'),
              borderColor: withAlpha(t.color.text.accent, 'border'),
            },
          ]}
        />

        <View style={styles.row}>
          {visibleRoutes.map((route) => (
            <TabItem
              key={route.key}
              routeName={route.name}
              isFocused={route.name === activeTabName}
              unreadCount={unreadCount}
              t={t}
              onPress={() =>
                handlePress(route.name, route.key, route.name === activeTabName)
              }
            />
          ))}
        </View>
      </View>
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
  shell: {
    height: BAR_HEIGHT,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.24,
    shadowRadius: 20,
    elevation: 14,
    justifyContent: 'center',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    height: '100%',
    paddingHorizontal: PILL_INSET,
  },
  pill: {
    position: 'absolute',
    top: PILL_INSET,
    bottom: PILL_INSET,
    left: 0,
    borderRadius: radii.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    height: '100%',
  },
  iconWrap: {
    minHeight: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  label: {
    marginTop: 2,
  },
  badge: {
    position: 'absolute',
    top: -2,
    right: -6,
    width: 9,
    height: 9,
    borderRadius: radii.pill,
    borderWidth: 1.5,
  },
});
